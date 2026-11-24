"""Server-to-server API for the Learning app on the same machine (actuary.it.com/learning), so both sites use one
password per e-mail. Portfel stays the only place passwords are stored; Learning asks here at sign-in and
registration.

Off unless PA_INTERNAL_TOKEN is set. Every call must carry that token in X-Internal-Token, and calls that came
through Caddy (it adds X-Forwarded-Prefix for /portfolio/*) are refused even with the token, so the endpoints are
not reachable from the internet. Failed checks count towards the same lockout as the Portfel sign-in form."""
from __future__ import annotations

import hmac
import os

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db, retry_locked
from app.models import User
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
