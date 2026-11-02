"""Authentication, sessions, CSRF, role checks and rate limiting (PROMPT.md 10)."""
from __future__ import annotations

import hashlib
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.i18n import B, L
from app.models import Portfolio, User, UserSession

SESSION_COOKIE = "pa_session"
CSRF_COOKIE = "pa_csrf"
CSRF_HEADER = "x-csrf-token"
_ph = PasswordHasher()


def hash_password(pw: str) -> str:
    return _ph.hash(pw)


def verify_password(pw_hash: str, pw: str) -> bool:
    try:
        return _ph.verify(pw_hash, pw)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def token_digest(token: str) -> str:
    """Sessions are stored as SHA-256 of the cookie value (256-bit random tokens need no slow hash)."""
    return hashlib.sha256(token.encode()).hexdigest()


def validate_new_password(pw: str, email: str | None) -> None:
    from app.password_policy import check_password

    problems = check_password(pw, email)
    if problems:
        raise HTTPException(422, " ".join(problems))


# ---------------------------------------------------------------- account lockout
LOCKED_MESSAGE = B("Çox uğursuz cəhd. Hesab müvəqqəti bağlanıb, bir az sonra yenidən yoxlayın.",
                   "Too many failed attempts. The account is locked for a while; try again later.")
_unknown_failures: dict[str, deque[float]] = defaultdict(deque)
_unknown_lock = threading.Lock()


def is_locked(user: User) -> bool:
    return user.locked_until is not None and user.locked_until > _now()


def record_failed_login(user: User) -> bool:
    """Count a failed attempt; returns True when this attempt locked the account (escalating lock time)."""
    sec = get_settings()["security"]
    user.failed_logins = (user.failed_logins or 0) + 1
    if user.failed_logins >= int(sec["max_failed_logins"]):
        user.lockout_count = (user.lockout_count or 0) + 1
        minutes = min(int(sec["lockout_minutes"]) * 2 ** (user.lockout_count - 1), int(sec["lockout_max_minutes"]))
        user.locked_until = _now() + timedelta(minutes=minutes)
        user.failed_logins = 0
        return True
    return False


def record_successful_login(user: User) -> None:
    user.failed_logins = 0
    user.lockout_count = 0
    user.locked_until = None


def unknown_email_locked(email: str) -> bool:
    """Same lockout behaviour for e-mails without an account, so responses do not reveal which exist."""
    sec = get_settings()["security"]
    window = 60.0 * int(sec["lockout_minutes"])
    now = time.monotonic()
    with _unknown_lock:
        q = _unknown_failures[email]
        while q and now - q[0] > window:
            q.popleft()
        return len(q) >= int(sec["max_failed_logins"])


def record_unknown_failure(email: str) -> None:
    with _unknown_lock:
        _unknown_failures[email].append(time.monotonic())


def create_session(db: Session, user: User, response: Response, secure: bool = False) -> str:
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    days = get_settings()["security"]["session_days"]
    db.add(UserSession(token=token_digest(token), user_id=user.id, csrf_token=csrf,
                       expires_at=_now() + timedelta(days=days)))
    max_age = days * 86400
    response.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="lax", secure=secure, max_age=max_age, path="/")
    response.set_cookie(CSRF_COOKIE, csrf, httponly=False, samesite="lax", secure=secure, max_age=max_age, path="/")
    return csrf


def destroy_session(db: Session, request: Request, response: Response) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        s = db.get(UserSession, token_digest(token))
        if s:
            db.delete(s)
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(401, "Daxil olun.")
    s = db.get(UserSession, token_digest(token))
    if s is None or s.expires_at < _now():
        raise HTTPException(401, L("Sessiyanın vaxtı bitib. Yenidən daxil olun.", "The session has expired. Sign in again."))
    user = db.get(User, s.user_id)
    if user is None or user.is_blocked:
        raise HTTPException(403, L("Hesab bloklanıb.", "The account is blocked."))
    # CSRF: double-submit token for state-changing requests
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        header = request.headers.get(CSRF_HEADER)
        if not header or not secrets.compare_digest(header, s.csrf_token):
            raise HTTPException(403, L("CSRF yoxlaması uğursuz oldu.", "The CSRF check failed."))
    request.state.user = user
    return user


ADMIN_NEEDS_2FA = B("Admin bölməsi üçün əvvəlcə iki mərhələli girişi (2FA) aktivləşdirin: Parametrlər səhifəsində.",
                    "Turn on two-factor sign-in (2FA) first to use the admin section: on the Settings page.")


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, L("Bu bölmə yalnız admin üçündür.", "This section is for administrators only."))
    if get_settings()["security"]["admin_requires_2fa"] and not user.totp_enabled:
        raise HTTPException(403, ADMIN_NEEDS_2FA)
    return user


def owned_portfolio(db: Session, user: User, portfolio_id: int) -> Portfolio:
    p = db.get(Portfolio, portfolio_id)
    if p is None or p.owner_id != user.id:
        # same response for "not found" and "not yours" to avoid leaking existence
        raise HTTPException(404, L("Portfel tapılmadı.", "Portfolio not found."))
    return p


class RateLimiter:
    """In-process sliding-window limiter keyed by client IP (+ path group)."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, window: float = 60.0) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > window:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True


rate_limiter = RateLimiter()
