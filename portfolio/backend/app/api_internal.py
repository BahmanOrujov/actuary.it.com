"""Server-to-server API for the Learning app on the same machine (actuary.it.com/learning), so both sites use one
password per e-mail. Portfel stays the only place passwords are stored; Learning asks here at sign-in and
registration.

Off unless PA_INTERNAL_TOKEN is set. Every call must carry that token in X-Internal-Token, and calls that came
through Caddy (it adds X-Forwarded-Prefix for /portfolio/*) are refused even with the token, so the endpoints are
not reachable from the internet. Failed checks count towards the same lockout as the Portfel sign-in form."""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db, retry_locked
from app.mailer import mail_enabled, send_mail
from app.models import PasswordReset, User, UserSession
from app.security import (
    hash_password, is_locked, record_failed_login, record_successful_login, validate_new_password, verify_password,
)
from app.services import audit

router = APIRouter(prefix="/api/internal")
_DUMMY_HASH = hash_password("timing-equalizer-not-a-real-password")


def _guard(request: Request) -> None:
    token = os.getenv("PA_INTERNAL_TOKEN", "")
    given = request.headers.get("x-internal-token", "")
    if (not token or request.headers.get("x-forwarded-prefix") is not None
            or not hmac.compare_digest(given.encode(), token.encode())):
        raise HTTPException(404, "Not found")


class Check(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


@router.post("/verify", dependencies=[Depends(_guard)])
def verify(body: Check, db: Session = Depends(get_db)):
    """status: ok | wrong | unknown | locked | blocked. Only "ok" means the password is right."""
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None:
        verify_password(_DUMMY_HASH, body.password)  # same work either way
        return {"status": "unknown"}
    if is_locked(user):
        return {"status": "locked"}
    if not verify_password(user.password_hash, body.password):
        if record_failed_login(user):
            audit(db, user.id, "account_locked", {"via": "learning"})
        else:
            audit(db, user.id, "login_failed", {"via": "learning"})
        retry_locked(db.commit)
        return {"status": "wrong"}
    if user.is_blocked:
        return {"status": "blocked"}
    record_successful_login(user)
    audit(db, user.id, "login_learning")
    retry_locked(db.commit)
    return {"status": "ok"}


@router.post("/register", dependencies=[Depends(_guard)])
def register(body: Check, db: Session = Depends(get_db)):
    """Creates a client account with this password (Learning registration). 409 when the e-mail exists."""
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "exists")
    validate_new_password(body.password, email)  # 422 with the reasons, shown to the user by Learning
    user = User(email=email, password_hash=hash_password(body.password), role="client")
    db.add(user)
    db.flush()
    audit(db, user.id, "register", {"role": "client", "via": "learning"})
    retry_locked(db.commit)
    return {"ok": True}


class Change(BaseModel):
    email: EmailStr
    old_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=1, max_length=200)


@router.post("/change-password", dependencies=[Depends(_guard)])
def change_password(body: Change, db: Session = Depends(get_db)):
    """Password change started on Learning; the old password is checked like a sign-in."""
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None:
        return {"status": "unknown"}
    if is_locked(user):
        return {"status": "locked"}
    if not verify_password(user.password_hash, body.old_password):
        record_failed_login(user)
        retry_locked(db.commit)
        return {"status": "wrong"}
    validate_new_password(body.new_password, user.email)  # 422 with the reasons
    user.password_hash = hash_password(body.new_password)
    for s in db.scalars(select(UserSession).where(UserSession.user_id == user.id)).all():
        db.delete(s)  # Portfel sessions end: the password they were opened with is gone
    audit(db, user.id, "password_change", {"via": "learning"})
    retry_locked(db.commit)
    return {"status": "ok"}


ALLOWED_LINK_BASES = ("https://www.actuary.it.com/", "https://actuary.it.com/", "http://127.0.0.1:", "http://localhost:")


class ResetAsk(BaseModel):
    email: EmailStr
    link_base: str = Field(min_length=10, max_length=200)  # the page that takes ?token=..., e.g. Learning's reset page


@router.post("/reset-request", dependencies=[Depends(_guard)])
def reset_request(body: ResetAsk, background: BackgroundTasks, db: Session = Depends(get_db)):
    """Same one-time token as the Portfel form; the e-mailed link opens the asking site's reset page.
    Always answers the same way, so it does not reveal which e-mails exist."""
    if not body.link_base.startswith(ALLOWED_LINK_BASES):
        raise HTTPException(400, "link_base")
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is not None and not user.is_blocked:
        minutes = get_settings()["security"]["password_reset_minutes"]
        token = secrets.token_urlsafe(32)
        db.add(PasswordReset(user_id=user.id, token_hash=hashlib.sha256(token.encode()).hexdigest(),
                             expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=minutes)))
        sep = "&" if "?" in body.link_base else "?"
        link = f"{body.link_base}{sep}token={token}"
        if mail_enabled():
            background.add_task(send_mail, user.email, "actuary.it.com: şifrənin bərpası",
                                f"Şifrəni yeniləmək üçün bu linki açın ({minutes} dəqiqə etibarlıdır):\n\n{link}\n\n"
                                "Yeni şifrə həm Portfel Analizi, həm də Learning üçün keçərli olacaq.\n"
                                "Bərpanı siz istəməmisinizsə, bu məktubu nəzərə almayın.")
        else:
            logging.getLogger("password-reset").warning("PAROL BƏRPASI %s üçün link (%s dəqiqə etibarlıdır): %s",
                                                        user.email, minutes, link)
        audit(db, user.id, "password_reset_requested", {"via": "learning"})
        retry_locked(db.commit)
    return {"ok": True, "mail": mail_enabled()}


class ResetDone(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(min_length=1, max_length=200)


@router.post("/reset-confirm", dependencies=[Depends(_guard)])
def reset_confirm(body: ResetDone, db: Session = Depends(get_db)):
    """Exactly the Portfel reset (one-time token, policy check, sessions end); returns the account's e-mail."""
    from app.api_client import ResetConfirm, password_reset_confirm

    row = db.scalar(select(PasswordReset).where(
        PasswordReset.token_hash == hashlib.sha256(body.token.encode()).hexdigest()))
    email = db.get(User, row.user_id).email if row is not None else None
    password_reset_confirm(ResetConfirm(token=body.token, new_password=body.new_password), db)  # 400 / 422 on failure
    return {"ok": True, "email": email}
