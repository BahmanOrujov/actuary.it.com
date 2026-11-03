"""Client API. Responses never include diagnostics, test statistics, p-values or model parameters."""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.admin_settings import effective, feature_enabled
from app.config import get_settings
from app.db import get_db, retry_locked
from app.i18n import L, bilingual, cfg_text, resolve
from app.mailer import mail_enabled, send_mail
from app import twofactor
from app.models import (
    Alert, AnalysisRun, Instrument, LoginChallenge, Notification, PasswordReset, Portfolio, PositionTarget, RunResult, Transaction,
    User, UserSession,
)
from app.security import (
    LOCKED_MESSAGE, SESSION_COOKIE, create_session, current_user, destroy_session, hash_password, is_locked,
    owned_portfolio, rate_limiter, record_failed_login, record_successful_login, record_unknown_failure,
    token_digest, unknown_email_locked, validate_new_password, verify_password,
)

_DUMMY_HASH = hash_password("timing-equalizer-not-a-real-password")
from app.services import (
    add_transaction, audit, bump, check_sells, client_run_view, enqueue_generate, set_sell_plan, upsert_target,
)
from data.csv_investing import CsvFormatError, parse_price_csv
from data.provider import ProviderError
from data.service import MarketData

router = APIRouter(prefix="/api")
CURRENCIES = ("USD", "EUR", "GBP", "AZN")
PROFILES = ("conservative", "moderate", "aggressive")


def commit(db: Session) -> None:
    retry_locked(db.commit)


# ------------------------------------------------------------------ auth
class Credentials(BaseModel):
    email: EmailStr
    # strength is checked by the password policy on register/change/reset; login accepts older passwords
    password: str = Field(min_length=1, max_length=128)


@router.post("/auth/register")
def register(body: Credentials, request: Request, response: Response, db: Session = Depends(get_db)):
    if not rate_limiter.allow(f"auth:{request.client.host if request.client else '-'}",
                              get_settings()["security"]["login_rate_limit_per_minute"]):
        raise HTTPException(429, L("Çox cəhd. Bir dəqiqə sonra yenidən yoxlayın.", "Too many attempts. Try again in a minute."))
    first = db.scalar(select(func.count(User.id))) == 0
    if not first and not get_settings().open_registration:
        raise HTTPException(403, L("Qeydiyyat bağlıdır. Hesabı administrator açır.", "Registration is closed. The administrator creates accounts."))
    email = body.email.lower()
    validate_new_password(body.password, email)
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, L("Bu e-poçt artıq qeydiyyatdan keçib.", "This e-mail is already registered."))
    user = User(email=email, password_hash=hash_password(body.password), role="admin" if first else "client")
    db.add(user)
    db.flush()
    csrf = create_session(db, user, response, secure=request.url.scheme == "https")
    audit(db, user.id, "register", {"role": user.role})
    commit(db)
    return {"id": user.id, "email": user.email, "role": user.role, "two_factor": False, "csrf": csrf}


@router.post("/auth/login")
def login(body: Credentials, request: Request, response: Response, db: Session = Depends(get_db)):
    if not rate_limiter.allow(f"auth:{request.client.host if request.client else '-'}",
                              get_settings()["security"]["login_rate_limit_per_minute"]):
        raise HTTPException(429, L("Çox cəhd. Bir dəqiqə sonra yenidən yoxlayın.", "Too many attempts. Try again in a minute."))
    email = body.email.lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        verify_password(_DUMMY_HASH, body.password)  # same work as a real check: no timing difference
        if unknown_email_locked(email):
            raise HTTPException(429, LOCKED_MESSAGE)
        record_unknown_failure(email)
        raise HTTPException(401, L("E-poçt və ya parol yanlışdır.", "Wrong e-mail or password."))
    if is_locked(user):
        raise HTTPException(429, LOCKED_MESSAGE)
    if not verify_password(user.password_hash, body.password):
        if record_failed_login(user):
            audit(db, user.id, "account_locked", {"until": user.locked_until.isoformat()})
            db.add(Alert(level="warning", kind="auth", user_id=user.id,
                         message=L(f"{user.email}: {get_settings()['security']['max_failed_logins']} uğursuz giriş "
                                   "cəhdi, hesab müvəqqəti bağlandı.",
                                   f"{user.email}: {get_settings()['security']['max_failed_logins']} failed sign-in "
                                   "attempts, the account was locked temporarily.")))
        else:
            audit(db, user.id, "login_failed")
        commit(db)
        raise HTTPException(401, L("E-poçt və ya parol yanlışdır.", "Wrong e-mail or password."))
    if user.is_blocked:
        raise HTTPException(403, L("Hesab bloklanıb.", "The account is blocked."))
    if user.totp_enabled:
        # the password was right; the session waits for the authenticator code
        ticket = secrets.token_urlsafe(32)
        db.add(LoginChallenge(token_hash=token_digest(ticket), user_id=user.id,
                              expires_at=datetime.now(timezone.utc).replace(tzinfo=None)
                              + timedelta(minutes=get_settings()["security"]["two_factor_minutes"])))
        audit(db, user.id, "login_password_ok")
        commit(db)
        return {"two_factor": True, "ticket": ticket}
    record_successful_login(user)
    csrf = create_session(db, user, response, secure=request.url.scheme == "https")
    audit(db, user.id, "login")
    commit(db)
    return {"id": user.id, "email": user.email, "role": user.role, "two_factor": False, "csrf": csrf}


class TwoFactorLogin(BaseModel):
    ticket: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=40)


@router.post("/auth/login/2fa")
def login_two_factor(body: TwoFactorLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    if not rate_limiter.allow(f"auth:{request.client.host if request.client else '-'}",
                              get_settings()["security"]["login_rate_limit_per_minute"]):
        raise HTTPException(429, L("Çox cəhd. Bir dəqiqə sonra yenidən yoxlayın.", "Too many attempts. Try again in a minute."))
    ch = db.get(LoginChallenge, token_digest(body.ticket))
    again = L("Vaxt bitdi. E-poçt və parolu yenidən daxil edin.", "Time is up. Enter your e-mail and password again.")
    if ch is None or ch.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(400, again)
    user = db.get(User, ch.user_id)
    if user is None or user.is_blocked or is_locked(user):
        db.delete(ch)
        commit(db)
        raise HTTPException(403, LOCKED_MESSAGE if user is not None and is_locked(user) else again)
    kind = twofactor.check(user, body.code)
    if kind is None:
        ch.attempts += 1
        locked = record_failed_login(user)  # wrong codes count towards the account lock like wrong passwords
        audit(db, user.id, "login_2fa_failed")
        if locked or ch.attempts >= get_settings()["security"]["two_factor_max_attempts"]:
            db.delete(ch)
            commit(db)
            raise HTTPException(400, again)
        commit(db)
        raise HTTPException(401, L("Kod yanlışdır.", "Wrong code."))
    db.delete(ch)
    record_successful_login(user)
    csrf = create_session(db, user, response, secure=request.url.scheme == "https")
    audit(db, user.id, "login", {"second_factor": kind})
    commit(db)
    return {"id": user.id, "email": user.email, "role": user.role, "two_factor": True, "csrf": csrf,
            "recovery_codes_left": len(user.recovery_codes or [])}


@router.post("/auth/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db), user: User = Depends(current_user)):
    destroy_session(db, request, response)
    commit(db)
    return {"ok": True}


def support_access_active(user: User) -> bool:
    return user.support_access_until is not None and user.support_access_until > datetime.now(timezone.utc).replace(tzinfo=None)


@router.get("/auth/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email, "role": user.role, "two_factor": user.totp_enabled,
            "support_access_until": user.support_access_until.isoformat() if support_access_active(user) else None}


class PasswordConfirm(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class CodeIn(BaseModel):
    code: str = Field(min_length=1, max_length=40)


class DisableTwoFactor(BaseModel):
    password: str = Field(min_length=1, max_length=128)
    code: str = Field(min_length=1, max_length=40)


@router.get("/auth/2fa")
def two_factor_status(user: User = Depends(current_user)):
    return {"enabled": user.totp_enabled, "recovery_codes_left": len(user.recovery_codes or []),
            "required": user.role == "admin" and get_settings()["security"]["admin_requires_2fa"]}


@router.post("/auth/2fa/setup")
def two_factor_setup(body: PasswordConfirm, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Step 1: a new secret as a QR code for the authenticator app. Asks for the password again, so an open
    session alone cannot attach someone else's phone to the account."""
    if user.totp_enabled:
        raise HTTPException(409, L("İki mərhələli giriş artıq aktivdir.", "Two-factor sign-in is already on."))
    if not verify_password(user.password_hash, body.password):
        raise HTTPException(401, L("Parol yanlışdır.", "Wrong password."))
    user.totp_secret = twofactor.new_secret()
    commit(db)
    uri = twofactor.otpauth_uri(user.email, user.totp_secret)
    return {"secret": user.totp_secret, "uri": uri, "qr_svg": twofactor.qr_svg(uri)}


@router.post("/auth/2fa/enable")
def two_factor_enable(body: CodeIn, request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Step 2: the first code from the app proves it is set up; the recovery codes are shown once."""
    if user.totp_enabled or not user.totp_secret:
        raise HTTPException(409, L("Əvvəlcə QR kodu yaradın.", "Create the QR code first."))
    step = twofactor.match_step(user.totp_secret, body.code)
    if step is None:
        raise HTTPException(401, L("Kod yanlışdır. Telefonun saatının dəqiq olduğunu yoxlayın.", "Wrong code. Check that the phone's clock is right."))
    codes, digests = twofactor.new_recovery_codes()
    user.totp_enabled, user.totp_last_step, user.recovery_codes = True, step, digests
    # sessions opened with the password alone end; this one stays
    current = token_digest(request.cookies.get(SESSION_COOKIE, ""))
    for s in db.scalars(select(UserSession).where(UserSession.user_id == user.id, UserSession.token != current)).all():
        db.delete(s)
    audit(db, user.id, "2fa_enabled")
    commit(db)
    return {"recovery_codes": codes}


@router.post("/auth/2fa/recovery-codes")
def two_factor_new_codes(body: CodeIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if twofactor.check(user, body.code) != "totp":
        raise HTTPException(401, L("Tətbiqdəki kod yanlışdır.", "The code from the app is wrong."))
    codes, user.recovery_codes = twofactor.new_recovery_codes()
    audit(db, user.id, "2fa_recovery_codes_renewed")
    commit(db)
    return {"recovery_codes": codes}


@router.post("/auth/2fa/disable")
def two_factor_disable(body: DisableTwoFactor, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role == "admin" and get_settings()["security"]["admin_requires_2fa"]:
        raise HTTPException(403, L("Admin hesabında iki mərhələli giriş məcburidir.", "Two-factor sign-in is required on admin accounts."))
    if not verify_password(user.password_hash, body.password) or twofactor.check(user, body.code) is None:
        raise HTTPException(401, L("Parol və ya kod yanlışdır.", "Wrong password or code."))
    twofactor.clear(user)
    audit(db, user.id, "2fa_disabled")
    commit(db)
    return {"ok": True}


@router.post("/auth/support-access")
def grant_support_access(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """The user lets admins see their portfolios (read-only) for a limited time; they can end it any time."""
    hours = get_settings()["security"]["support_access_hours"]
    user.support_access_until = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=hours)
    audit(db, user.id, "support_access_granted", {"hours": hours})
    commit(db)
    return {"support_access_until": user.support_access_until.isoformat()}


@router.delete("/auth/support-access")
def revoke_support_access(db: Session = Depends(get_db), user: User = Depends(current_user)):
    user.support_access_until = None
    audit(db, user.id, "support_access_revoked", {})
    commit(db)
    return {"ok": True}


class PasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(min_length=1, max_length=128)


@router.post("/auth/password")
def change_password(body: PasswordChange, request: Request, db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
    if not verify_password(user.password_hash, body.old_password):
        raise HTTPException(401, L("Köhnə parol yanlışdır.", "The current password is wrong."))
    validate_new_password(body.new_password, user.email)
    u = db.get(User, user.id)
    u.password_hash = hash_password(body.new_password)
    # sign out every other device; the current session stays
    current = token_digest(request.cookies.get(SESSION_COOKIE, ""))
    for other in db.scalars(select(UserSession).where(UserSession.user_id == u.id, UserSession.token != current)).all():
        db.delete(other)
    audit(db, user.id, "password_change")
    commit(db)
    return {"ok": True}


class ResetRequest(BaseModel):
    email: EmailStr


class ResetConfirm(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(min_length=1, max_length=128)


def issue_reset_link(db: Session, user: User, request: Request, lifetime: timedelta, query: str = "") -> str:
    """Stores a one-time token (only its hash) and returns the link that sets the user's password with it."""
    token = secrets.token_urlsafe(32)
    db.add(PasswordReset(user_id=user.id, token_hash=hashlib.sha256(token.encode()).hexdigest(),
                         expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + lifetime))
    base = request.headers.get("origin") or str(request.base_url).rstrip("/")  # dev: Vite origin
    base += request.headers.get("x-forwarded-prefix", "").rstrip("/")  # served under /portfolio by Caddy
    return f"{base}/reset?token={token}{query}"


@router.post("/auth/password-reset/request")
def password_reset_request(body: ResetRequest, request: Request, background: BackgroundTasks,
                           db: Session = Depends(get_db)):
    """Always answers the same way (no account enumeration). With SMTP configured the one-time link is e-mailed
    (after the response, so timing does not reveal accounts either); otherwise it is printed to the server
    console, which only the local owner can see."""
    if not rate_limiter.allow(f"auth:{request.client.host if request.client else '-'}",
                              get_settings()["security"]["login_rate_limit_per_minute"]):
        raise HTTPException(429, L("Çox cəhd. Bir dəqiqə sonra yenidən yoxlayın.", "Too many attempts. Try again in a minute."))
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is not None and not user.is_blocked:
        minutes = get_settings()["security"]["password_reset_minutes"]
        link = issue_reset_link(db, user, request, timedelta(minutes=minutes))
        if mail_enabled():
            background.add_task(send_mail, user.email, L("Portfel Analizi: parolun bərpası", "Portfel Analizi: password reset"),
                                L(f"Parolu yeniləmək üçün bu linki açın ({minutes} dəqiqə etibarlıdır):\n\n{link}\n\n"
                                  "Bərpanı siz istəməmisinizsə, bu məktubu nəzərə almayın.",
                                  f"Open this link to set a new password (valid for {minutes} minutes):\n\n{link}\n\n"
                                  "If you did not ask for a reset, ignore this e-mail."))
        else:
            logging.getLogger("password-reset").warning(
                "PAROL BƏRPASI %s üçün link (%s dəqiqə etibarlıdır): %s", user.email, minutes, link)
        db.add(Alert(level="info", kind="auth", message=L(f"Parol bərpası istəndi: {user.email}",
                                                          f"Password reset requested: {user.email}"), user_id=user.id))
        audit(db, user.id, "password_reset_requested")
        commit(db)
    if mail_enabled():
        return {"ok": True, "message": L("Bu e-poçt qeydiyyatdadırsa, bərpa linki ora göndərildi. "
                                         "Gələnlər qutusunu (və Spam qovluğunu) yoxlayın.",
                                         "If this e-mail is registered, a reset link has been sent to it. "
                                         "Check the inbox (and the Spam folder).")}
    return {"ok": True, "message": L("Bu e-poçt qeydiyyatdadırsa, bərpa linki server konsoluna yazıldı "
                                     "(lokal rejimdə e-poçt göndərilmir).",
                                     "If this e-mail is registered, a reset link was written to the server console "
                                     "(no e-mail is sent in local mode).")}


@router.post("/auth/password-reset/confirm")
def password_reset_confirm(body: ResetConfirm, db: Session = Depends(get_db)):
    row = db.scalar(select(PasswordReset).where(
        PasswordReset.token_hash == hashlib.sha256(body.token.encode()).hexdigest()))
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if row is None or row.used or row.expires_at < now:
        raise HTTPException(400, L("Link etibarsızdır və ya vaxtı bitib. Yenidən bərpa istəyin.", "The link is invalid or has expired. Request a new reset."))
    user = db.get(User, row.user_id)
    validate_new_password(body.new_password, user.email)
    user.password_hash = hash_password(body.new_password)
    record_successful_login(user)  # a completed reset also lifts a temporary lock
    row.used = True
    for s in db.scalars(select(UserSession).where(UserSession.user_id == user.id)).all():
        db.delete(s)
    audit(db, user.id, "password_reset_done")
    commit(db)
    return {"ok": True}


@router.delete("/auth/account")
def delete_account(request: Request, response: Response, db: Session = Depends(get_db), user: User = Depends(current_user)):
    u = db.get(User, user.id)
    destroy_session(db, request, response)
    audit(db, None, "account_deleted", {"user_id": user.id})
    db.delete(u)
    commit(db)
    return {"ok": True}


@router.get("/config/public")
def public_config(db: Session = Depends(get_db)):
    cfg = get_settings()
    eff = effective(db)
    return {
        "mode": cfg.mode, "brand": cfg["app"]["brand"], "currencies": list(CURRENCIES),
        "default_currency": cfg["app"]["default_base_currency"],
        "csv_import": feature_enabled(db, "csv_import"),
        "risk_profiles": {p: eff[f"profile.{p}"] for p in PROFILES},
        "disclaimer": cfg_text(cfg["recommend"], "disclaimer"),
        "horizon_days": cfg["model"]["horizon_days"],
        "fractional_decimals": cfg["portfolio"]["fractional_decimals"],
        "csv_notice": L("investing.com məlumatından yalnız şəxsi və qeyri-kommersiya məqsədilə istifadə etmək olar. "
                        "Faylı özünüz endirib yükləyirsiniz; proqram investing.com-a sorğu göndərmir.",
                        "investing.com data may be used for personal, non-commercial purposes only. "
                        "You download and upload the file yourself; the app sends no requests to investing.com."),
    }


# ------------------------------------------------------------------ portfolios
class PortfolioIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    base_currency: Literal["USD", "EUR", "GBP", "AZN"] = "USD"
    risk_profile: Literal["conservative", "moderate", "aggressive"] = "moderate"
    risk_limit: float | None = Field(default=None, gt=0, lt=1)
    cash: float = Field(default=0.0, ge=0)


class PortfolioPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    base_currency: Literal["USD", "EUR", "GBP", "AZN"] | None = None
    risk_profile: Literal["conservative", "moderate", "aggressive"] | None = None
    risk_limit: float | None = Field(default=None, gt=0, lt=1)
    clear_risk_limit: bool = False
    cash: float | None = Field(default=None, ge=0)


def _latest_run(db: Session, pid: int) -> AnalysisRun | None:
    return db.scalar(select(AnalysisRun).where(AnalysisRun.portfolio_id == pid).order_by(AnalysisRun.id.desc()).limit(1))


def _headline(db: Session, pid: int) -> dict | None:
    """The few numbers the overview card shows, from the latest finished run (client-safe fields only)."""
    run = db.scalar(select(AnalysisRun).where(AnalysisRun.portfolio_id == pid, AnalysisRun.status == "done")
                    .order_by(AnalysisRun.id.desc()).limit(1))
    rr = db.get(RunResult, run.id) if run else None
    if rr is None:
        return None
    r = rr.payload
    total = (r.get("current") or {}).get("total") or {}
    inv = ((r.get("insights") or {}).get("investment") or {}).get("metrics") or {}
    cvar = (r.get("risk") or {}).get("0.95", {}).get("cvar_pct")
    return {"run_id": run.id, "value": r.get("V0"), "unrealized": total.get("unrealized"),
            "unrealized_pct": total.get("unrealized_pct"), "cvar95": cvar, "risk_limit": r.get("risk_limit"),
            "expected_return": inv.get("expected_return"), "range90": inv.get("range90"),
            "prob_profit": (r.get("pnl_end") or {}).get("prob_profit"), "horizon_end": r.get("horizon_end"),
            "actual": {k: v for k, v in (r.get("actual") or {}).items() if k != "assets"} or None}


def _portfolio_summary(db: Session, p: Portfolio) -> dict:
    run = _latest_run(db, p.id)
    return {
        "id": p.id, "name": p.name, "base_currency": p.base_currency, "risk_profile": p.risk_profile,
        "risk_limit": p.risk_limit, "cash": p.cash, "version": p.version,
        "n_transactions": len(p.transactions),
        "n_instruments": len({t.instrument_id for t in p.transactions}),
        "last_run": None if run is None else {
            "id": run.id, "status": run.status, "created_at": run.created_at.isoformat(),
            "stale": run.portfolio_version != p.version, "reliability": run.reliability,
        },
        "headline": _headline(db, p.id),
        "shared": p.share_token_hash is not None,
    }


@router.get("/portfolios")
def list_portfolios(db: Session = Depends(get_db), user: User = Depends(current_user)):
    ps = db.scalars(select(Portfolio).where(Portfolio.owner_id == user.id, Portfolio.scenario_of.is_(None))
                    .order_by(Portfolio.id)).all()
    return [_portfolio_summary(db, p) for p in ps]


@router.post("/portfolios")
def create_portfolio(body: PortfolioIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = Portfolio(owner_id=user.id, **body.model_dump())
    db.add(p)
    commit(db)
    return _portfolio_summary(db, p)


@router.patch("/portfolios/{pid}")
def update_portfolio(pid: int, body: PortfolioPatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = owned_portfolio(db, user, pid)
    data = body.model_dump(exclude_unset=True)
    changed = False
    for k in ("name", "base_currency", "risk_profile", "risk_limit", "cash"):
        if k in data and data[k] is not None and getattr(p, k) != data[k]:
            setattr(p, k, data[k])
            changed = changed or k != "name"
    if data.get("clear_risk_limit"):
        p.risk_limit = None
        changed = True
    if changed:
        bump(p)
    commit(db)
    return _portfolio_summary(db, p)


def _clone(db: Session, p: Portfolio, name: str, **extra) -> Portfolio:
    """A new portfolio of the same owner with the same settings, transactions and targets."""
    q = Portfolio(owner_id=p.owner_id, name=name[:120], base_currency=p.base_currency,
                  risk_profile=p.risk_profile, risk_limit=p.risk_limit, cash=p.cash, **extra)
    db.add(q)
    db.flush()
    for t in p.transactions:
        db.add(Transaction(portfolio_id=q.id, instrument_id=t.instrument_id, side=t.side, quantity=t.quantity,
                           trade_date=t.trade_date, price=t.price, fees=t.fees, currency=t.currency,
                           input_flags=dict(t.input_flags or {})))
    for tg in p.targets:
        db.add(PositionTarget(portfolio_id=q.id, instrument_id=tg.instrument_id, target_price=tg.target_price,
                              stop_loss=tg.stop_loss, sell_on=tg.sell_on))
    db.flush()
    db.refresh(q)
    return q


def _regular_portfolio(db: Session, user: User, pid: int) -> Portfolio:
    p = owned_portfolio(db, user, pid)
    if p.scenario_of is not None:
        raise HTTPException(422, L("Bu, ssenari portfelidir.", "This is a scenario portfolio."))
    return p


@router.post("/portfolios/{pid}/copy")
def copy_portfolio(pid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = _regular_portfolio(db, user, pid)
    q = _clone(db, p, f"{p.name} (kopya)")
    commit(db)
    return _portfolio_summary(db, q)


@router.delete("/portfolios/{pid}")
def delete_portfolio(pid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = owned_portfolio(db, user, pid)
    db.delete(p)
    commit(db)
    return {"ok": True}


@router.get("/portfolios/{pid}")
def get_portfolio(pid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return portfolio_detail(db, owned_portfolio(db, user, pid))


def portfolio_detail(db: Session, p: Portfolio) -> dict:
    txs = []
    holdings: dict[int, float] = {}
    for t in sorted(p.transactions, key=lambda x: (x.trade_date, x.id)):
        holdings[t.instrument_id] = holdings.get(t.instrument_id, 0) + (t.quantity if t.side == "BUY" else -t.quantity)
        txs.append({
            "id": t.id, "side": t.side, "quantity": t.quantity, "trade_date": t.trade_date.isoformat(),
            "price": t.price, "fees": t.fees, "currency": t.currency, "flags": t.input_flags or {},
            "instrument": {"id": t.instrument.id, "investing_symbol": t.instrument.investing_symbol,
                           "provider_symbol": t.instrument.provider_symbol, "name": t.instrument.name,
                           "exchange": t.instrument.exchange, "currency": t.instrument.currency},
        })
    insts = {t.instrument_id: t.instrument for t in p.transactions}
    targets = {tg.instrument_id: tg for tg in p.targets}
    positions = [
        {"instrument_id": iid, "investing_symbol": insts[iid].investing_symbol, "name": insts[iid].name,
         "exchange": insts[iid].exchange, "currency": insts[iid].currency, "quantity": round(q, 6),
         "target_price": targets[iid].target_price if iid in targets else None,
         "stop_loss": targets[iid].stop_loss if iid in targets else None,
         "sell_on": targets[iid].sell_on.isoformat() if iid in targets and targets[iid].sell_on else None}
        for iid, q in holdings.items() if abs(q) > 1e-9
    ]
    return {**_portfolio_summary(db, p), "transactions": txs, "positions": positions}


# ------------------------------------------------------------------ symbols and transactions
@router.get("/symbols/search")
def search_symbols(q: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    q = q.strip()
    if not q or len(q) > 32:
        raise HTTPException(422, L("Simvol 1–32 simvol olmalıdır.", "The symbol must be 1–32 characters."))
    md = MarketData(db)
    try:
        cands = md.search(q)
    except ProviderError as exc:
        raise HTTPException(502, L(f"Simvol axtarışı alınmadı: {exc}", f"Symbol search failed: {exc}")) from exc
    # currency shown in the list is inferred from the exchange; it is confirmed from the provider
    # (fast_info / info) when the candidate is chosen (PROMPT.md 2.2)
    ccy_by_ex = get_settings()["data"]["exchange_currency"]
    for c in cands:
        if not c.get("currency") and c.get("exchange") in ccy_by_ex:
            c["currency"] = ccy_by_ex[c["exchange"]]
            c["currency_inferred"] = True
    local = db.scalars(select(Instrument).where(Instrument.investing_symbol == q.upper())).all()
    known = {c["provider_symbol"] for c in cands}
    for i in local:
        if i.provider_symbol not in known:
            cands.append({"provider_symbol": i.provider_symbol, "name": i.name, "exchange": i.exchange,
                          "country": None, "currency": i.currency, "type": i.type, "isin": i.isin,
                          "source": i.source})
    msg = None
    if not cands:
        msg = L("Simvol tapılmadı.", "Symbol not found.")
        if feature_enabled(db, "csv_import"):
            msg += L(" investing.com-dan endirdiyiniz CSV faylını yükləyə bilərsiniz.", " You can upload a CSV file downloaded from investing.com.")
    return {"candidates": cands, "auto_select": len(cands) == 1, "message": msg}


@router.get("/instruments/suggest")
def suggest_instruments(q: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Instant autocomplete from instruments already known locally (no provider request, so typing never
    triggers Yahoo traffic; the provider is searched only on an explicit search)."""
    q = q.strip().upper()
    if not q or len(q) > 32:
        return []
    rows = db.scalars(select(Instrument).where(
        (Instrument.investing_symbol.startswith(q)) | (Instrument.name.ilike(f"%{q}%"))
    ).order_by(Instrument.investing_symbol).limit(10)).all()
    return [{"investing_symbol": i.investing_symbol, "provider_symbol": i.provider_symbol, "name": i.name,
             "exchange": i.exchange, "currency": i.currency} for i in rows]


class TxIn(BaseModel):
    provider_symbol: str = Field(min_length=1, max_length=40)
    investing_symbol: str | None = Field(default=None, max_length=32)
    side: Literal["BUY", "SELL"] = "BUY"
    quantity: float = Field(gt=0)
    trade_date: date | None = None
    price: float | None = Field(default=None, gt=0)
    fees: float = Field(default=0.0, ge=0)

    @field_validator("provider_symbol")
    @classmethod
    def _sym(cls, v: str) -> str:
        v = v.strip().upper()
        if not all(c.isalnum() or c in ".-=^:" for c in v):
            raise ValueError(L("Simvolda icazəsiz işarə var", "The symbol contains a character that is not allowed"))
        return v


@router.post("/portfolios/{pid}/transactions")
def create_transaction(pid: int, body: TxIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = owned_portfolio(db, user, pid)
    md = MarketData(db)
    tx, warnings = add_transaction(db, md, p, provider_symbol=body.provider_symbol,
                                   investing_symbol=body.investing_symbol, side=body.side, quantity=body.quantity,
                                   trade_date=body.trade_date, price=body.price, fees=body.fees)
    commit(db)
    return {"id": tx.id, "trade_date": tx.trade_date.isoformat(), "price": tx.price, "flags": tx.input_flags,
            "warnings": warnings}


@router.delete("/portfolios/{pid}/transactions/{tx_id}")
def delete_transaction(pid: int, tx_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = owned_portfolio(db, user, pid)
    tx = db.get(Transaction, tx_id)
    if tx is None or tx.portfolio_id != p.id:
        raise HTTPException(404, L("Əməliyyat tapılmadı.", "Transaction not found."))
    check_sells(p, exclude_id=tx.id, instrument=tx.instrument)
    db.delete(tx)
    bump(p)
    commit(db)
    return {"ok": True}


class TargetIn(BaseModel):
    instrument_id: int
    target_price: float | None = Field(default=None, gt=0)
    stop_loss: float | None = Field(default=None, gt=0)


@router.put("/portfolios/{pid}/targets")
def set_target(pid: int, body: TargetIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = owned_portfolio(db, user, pid)
    if body.instrument_id not in {t.instrument_id for t in p.transactions}:
        raise HTTPException(422, L("Bu səhm portfeldə yoxdur.", "This stock is not in the portfolio."))
    upsert_target(db, p, body.instrument_id, body.target_price, body.stop_loss)
    commit(db)
    return {"ok": True}


class SellPlanIn(BaseModel):
    instrument_id: int
    sell_on: date | None = None  # None cancels the plan


@router.put("/portfolios/{pid}/sell-plan")
def put_sell_plan(pid: int, body: SellPlanIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Sell the whole position on a future date; Generate holds it until then and keeps the proceeds as cash."""
    p = owned_portfolio(db, user, pid)
    held = sum(t.quantity if t.side == "BUY" else -t.quantity for t in p.transactions if t.instrument_id == body.instrument_id)
    if held <= 1e-9:
        raise HTTPException(422, L("Bu səhm portfeldə yoxdur.", "This stock is not in the portfolio."))
    if body.sell_on is not None and body.sell_on <= date.today():
        raise HTTPException(422, L("Satış tarixi gələcəkdə olmalıdır. Bu gün satmaq üçün satış əməliyyatı əlavə edin.",
                                   "The sale date must be in the future. To sell today, add a sell transaction."))
    set_sell_plan(db, p, body.instrument_id, body.sell_on)
    audit(db, user.id, "sell_plan", {"portfolio_id": pid, "instrument_id": body.instrument_id,
                                     "sell_on": body.sell_on.isoformat() if body.sell_on else None})
    commit(db)
    return {"ok": True}


@router.post("/portfolios/{pid}/csv-import")
async def csv_import(pid: int, file: UploadFile = File(...), symbol: str = Form(...), name: str = Form(""),
                     exchange: str = Form("NYSE"), currency: str = Form("USD"),
                     source: Literal["investing", "user"] = Form("investing"),
                     db: Session = Depends(get_db), user: User = Depends(current_user)):
    owned_portfolio(db, user, pid)
    if not feature_enabled(db, "csv_import"):
        raise HTTPException(403, L("CSV idxalı bu rejimdə söndürülüb.", "CSV import is disabled in this mode."))
    source_tag = "csv:investing" if source == "investing" else "csv:user"
    if currency.upper() not in CURRENCIES:
        raise HTTPException(422, L("Dəstəklənməyən valyuta.", "Unsupported currency."))
    if exchange not in get_settings()["data"]["exchange_calendars"]:
        raise HTTPException(422, L("Dəstəklənməyən birja.", "Unsupported exchange."))
    sym = symbol.strip().upper()
    if not sym or not all(c.isalnum() or c in ".-" for c in sym) or len(sym) > 20:
        raise HTTPException(422, L("Simvol düzgün deyil.", "The symbol is not valid."))
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(413, L("Fayl çox böyükdür (maks. 10 MB).", "The file is too large (max. 10 MB)."))
    try:
        bars = parse_price_csv(content)
    except CsvFormatError as exc:
        raise HTTPException(422, L(f"CSV oxunmadı: {exc}", f"The CSV could not be read: {exc}")) from exc
    md = MarketData(db)
    inst = md.create_csv_instrument(sym, name, exchange, currency)
    n = md.store_bars(inst.provider_symbol, bars, source_tag)
    audit(db, user.id, "csv_import", {"symbol": inst.provider_symbol, "rows": n, "source": source_tag})
    commit(db)
    return {"provider_symbol": inst.provider_symbol, "rows": n, "first": str(bars.index.min().date()),
            "last": str(bars.index.max().date()),
            "note": L("CSV qiymətlərinin dividendə görə düzəldilib-düzəldilmədiyi bəlli deyil.", "It is not known whether the CSV prices are adjusted for dividends.")}


# ------------------------------------------------------------------ runs
@router.post("/portfolios/{pid}/generate")
def generate(pid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = owned_portfolio(db, user, pid)
    run = enqueue_generate(db, p)
    audit(db, user.id, "generate", {"portfolio_id": p.id, "run_id": run.id})
    commit(db)
    return client_run_view(db, run, p)


@router.get("/portfolios/{pid}/runs/latest")
def latest_run(pid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = owned_portfolio(db, user, pid)
    run = _latest_run(db, pid)
    if run is None:
        return None
    view = client_run_view(db, run, p, audit_user=user.id)
    commit(db)
    return view


@router.get("/runs/{run_id}")
def get_run(run_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    run = db.get(AnalysisRun, run_id)
    if run is None:
        raise HTTPException(404, L("Tapılmadı.", "Not found."))
    p = owned_portfolio(db, user, run.portfolio_id)
    view = client_run_view(db, run, p, audit_user=user.id)
    commit(db)
    return view


@router.get("/portfolios/{pid}/report.pdf")
def report_pdf(pid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """PDF of the latest finished run: the same client-safe content as the Investment and Risk views."""
    from urllib.parse import quote

    from app.report_pdf import build_pdf

    p = owned_portfolio(db, user, pid)
    run = db.scalar(select(AnalysisRun).where(AnalysisRun.portfolio_id == pid, AnalysisRun.status == "done")
                    .order_by(AnalysisRun.id.desc()).limit(1))
    if run is None:
        raise HTTPException(404, L("Hesabat üçün hələ hazır nəticə yoxdur. Əvvəlcə Generate basın.", "There is no finished result for a report yet. Run Generate first."))
    view = resolve(client_run_view(db, run, p))
    try:
        with bilingual(False):  # the PDF is drawn directly in the request's language
            data = build_pdf(view, p.name)
    except RuntimeError as exc:  # missing font etc.
        raise HTTPException(500, str(exc)) from exc
    audit(db, user.id, "report_pdf", {"portfolio_id": pid, "run_id": run.id})
    commit(db)
    name = f"Portfel_{p.name}_{view['result']['as_of']}.pdf"
    ascii_name = "".join(c if c.isascii() and (c.isalnum() or c in "._-") else "_" for c in name)
    return Response(data, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}"})


# daily bar columns the price export offers, in sheet order; close is the default
PRICE_FIELDS = {
    "close": ("Close", "Close"), "adj_close": ("Adj Close", "Adj Close"), "open": ("Open", "Open"),
    "high": ("High", "High"), "low": ("Low", "Low"), "volume": ("Həcm", "Volume"),
}


@router.get("/portfolios/{pid}/prices.xlsx")
def prices_xlsx(pid: int, start: date, end: date, instruments: str = "", fields: str = "close",
                db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Daily prices of the portfolio's stocks as an Excel file: one sheet per field, a Date column and one column
    per stock. `instruments` and `fields` are comma-separated (instrument ids; keys of PRICE_FIELDS)."""
    from collections import Counter
    from io import BytesIO
    from urllib.parse import quote

    import pandas as pd
    from openpyxl.styles import Font
    from openpyxl.utils import get_column_letter

    p = _regular_portfolio(db, user, pid)
    if start > end:
        raise HTTPException(422, L("Başlanğıc tarixi son tarixdən sonra ola bilməz.", "The start date cannot be after the end date."))
    insts = {t.instrument_id: t.instrument for t in p.transactions}
    if instruments.strip():
        try:
            wanted = [int(x) for x in instruments.split(",") if x.strip()]
        except ValueError as exc:
            raise HTTPException(422, L("Səhm siyahısı düzgün deyil.", "The stock list is not valid.")) from exc
        insts = {i: insts[i] for i in wanted if i in insts}
    if not insts:
        raise HTTPException(422, L("Ən azı bir səhm seçin.", "Select at least one stock."))
    keys = [f for f in PRICE_FIELDS if f in {x.strip() for x in fields.split(",")}]
    if not keys:
        raise HTTPException(422, L("Ən azı bir sütun seçin.", "Select at least one column."))

    md = MarketData(db)
    lo, hi = pd.Timestamp(start), pd.Timestamp(end)
    frames: dict[str, pd.DataFrame] = {}
    missing: list[str] = []
    counts = Counter(i.investing_symbol for i in insts.values())
    for inst in sorted(insts.values(), key=lambda i: (i.investing_symbol, i.exchange)):
        # the same ticker on two exchanges gets the exchange in its column header
        label = inst.investing_symbol if counts[inst.investing_symbol] == 1 else f"{inst.investing_symbol} ({inst.exchange})"
        try:
            bars = md.bars(inst.provider_symbol)
        except ProviderError:
            missing.append(label)
            continue
        frames[label] = bars.loc[lo:hi]
    commit(db)  # keep freshly fetched bars in the cache
    if not frames:
        raise HTTPException(404, L("Seçilən səhmlər üçün qiymət tarixçəsi tapılmadı.", "No price history was found for the selected stocks."))

    buf = BytesIO()
    with bilingual(False), pd.ExcelWriter(buf, engine="openpyxl") as xw:  # sheet names in the request's language
        for k in keys:
            table = pd.DataFrame({sym: df[k] for sym, df in frames.items()}).sort_index()
            table = table.dropna(how="all")
            table.index = table.index.date
            table.index.name = L("Tarix", "Date")
            sheet = L(*PRICE_FIELDS[k])
            table.to_excel(xw, sheet_name=sheet)
            ws = xw.sheets[sheet]
            ws.freeze_panes = "B2"
            ws.column_dimensions["A"].width = 12
            for c in range(2, table.shape[1] + 2):
                ws.column_dimensions[get_column_letter(c)].width = 12
            for row in ws.iter_rows(min_row=2):
                row[0].number_format = "yyyy-mm-dd"
                for cell in row[1:]:  # display only: the cell keeps the full value
                    cell.number_format = "#,##0" if k == "volume" else "#,##0.00##"
            for cell in ws[1]:
                cell.font = Font(bold=True)
        if missing:
            pd.DataFrame({L("Tarixçəsi tapılmayan səhmlər", "Stocks without price history"): missing}).to_excel(
                xw, sheet_name=L("Qeyd", "Note"), index=False)
    audit(db, user.id, "prices_xlsx", {"portfolio_id": pid, "instruments": len(frames), "fields": keys})
    commit(db)
    name = f"Qiymetler_{p.name}_{start}_{end}.xlsx"
    ascii_name = "".join(c if c.isascii() and (c.isalnum() or c in "._-") else "_" for c in name)
    return Response(buf.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}"})


# ------------------------------------------------------------------ read-only share link
def _public_base(request: Request) -> str:
    base = request.headers.get("origin") or str(request.base_url).rstrip("/")
    return base + request.headers.get("x-forwarded-prefix", "").rstrip("/")


@router.post("/portfolios/{pid}/share")
def share_portfolio(pid: int, request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """A new secret link (the previous one stops working). Anyone with it sees the results, nothing else."""
    p = _regular_portfolio(db, user, pid)
    token = secrets.token_urlsafe(24)
    p.share_token_hash = token_digest(token)
    audit(db, user.id, "portfolio_shared", {"portfolio_id": p.id})
    commit(db)
    return {"url": f"{_public_base(request)}/shared/{token}"}


@router.delete("/portfolios/{pid}/share")
def unshare_portfolio(pid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = _regular_portfolio(db, user, pid)
    p.share_token_hash = None
    audit(db, user.id, "portfolio_unshared", {"portfolio_id": p.id})
    commit(db)
    return {"ok": True}


@router.get("/shared/{token}")
def shared_portfolio(token: str, request: Request, db: Session = Depends(get_db)):
    """No login: the latest finished result of a shared portfolio (the same client-safe view its owner sees)."""
    if not rate_limiter.allow(f"shared:{request.client.host if request.client else '-'}",
                              get_settings()["security"]["rate_limit_per_minute"]):
        raise HTTPException(429, L("Çox sorğu. Bir dəqiqə sonra yenidən yoxlayın.", "Too many requests. Try again in a minute."))
    p = db.scalar(select(Portfolio).where(Portfolio.share_token_hash == token_digest(token))) if token else None
    if p is None:
        raise HTTPException(404, L("Link etibarsızdır və ya paylaşım dayandırılıb.", "The link is invalid or sharing has been stopped."))
    run = db.scalar(select(AnalysisRun).where(AnalysisRun.portfolio_id == p.id, AnalysisRun.status == "done")
                    .order_by(AnalysisRun.id.desc()).limit(1))
    return {"name": p.name, "base_currency": p.base_currency, "risk_profile": p.risk_profile,
            "run": client_run_view(db, run, p) if run else None}


# ------------------------------------------------------------------ what-if scenario
class WhatIfTrade(BaseModel):
    provider_symbol: str = Field(min_length=1, max_length=32)
    investing_symbol: str | None = Field(default=None, max_length=32)
    side: Literal["BUY", "SELL"]
    quantity: float = Field(gt=0)


class WhatIfIn(BaseModel):
    trades: list[WhatIfTrade] = Field(min_length=1)


def _scenario_of(db: Session, p: Portfolio) -> Portfolio | None:
    return db.scalar(select(Portfolio).where(Portfolio.scenario_of == p.id).order_by(Portfolio.id.desc()).limit(1))


def _whatif_view(db: Session, p: Portfolio, s: Portfolio | None) -> dict | None:
    if s is None:
        return None
    run = _latest_run(db, s.id)
    return {"trades": s.scenario_trades or [], "created_at": s.created_at.isoformat(),
            "outdated": s.created_at < p.updated_at,  # the portfolio changed after the scenario was made
            "base": _headline(db, p.id), "scenario": _headline(db, s.id),
            "run": client_run_view(db, run, s) if run else None}


@router.get("/portfolios/{pid}/whatif")
def get_whatif(pid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = _regular_portfolio(db, user, pid)
    return _whatif_view(db, p, _scenario_of(db, p))


@router.post("/portfolios/{pid}/whatif")
def create_whatif(pid: int, body: WhatIfIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Hidden copy of the portfolio plus the hypothetical trades at today's price, analysed by the same Generate
    pipeline, so the two results compare like for like. Replaces the previous scenario of this portfolio."""
    p = _regular_portfolio(db, user, pid)
    if len(body.trades) > get_settings()["portfolio"]["whatif_max_trades"]:
        raise HTTPException(422, L("Ssenaridə əməliyyat çox çoxdur.", "The scenario has too many trades."))
    old = _scenario_of(db, p)
    if old is not None:
        db.delete(old)
        db.flush()
    s = _clone(db, p, f"{p.name} · ssenari", scenario_of=p.id,
               scenario_trades=[t.model_dump() for t in body.trades])
    md = MarketData(db)
    warnings: list[str] = []
    for t in body.trades:
        tx, w = add_transaction(db, md, s, provider_symbol=t.provider_symbol, investing_symbol=t.investing_symbol,
                                side=t.side, quantity=t.quantity, trade_date=None, price=None, fees=0.0)
        warnings += w
    db.flush()
    db.refresh(s)
    enqueue_generate(db, s)
    audit(db, user.id, "whatif", {"portfolio_id": p.id, "trades": len(body.trades)})
    commit(db)
    return {**_whatif_view(db, p, s), "warnings": warnings}


@router.delete("/portfolios/{pid}/whatif")
def delete_whatif(pid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = _regular_portfolio(db, user, pid)
    s = _scenario_of(db, p)
    if s is not None:
        db.delete(s)
        commit(db)
    return {"ok": True}


# ------------------------------------------------------------------ notifications (monitoring)
@router.get("/notifications")
def list_notifications(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.scalars(select(Notification).where(Notification.user_id == user.id)
                      .order_by(Notification.id.desc()).limit(50)).all()
    unread = db.scalar(select(func.count(Notification.id)).where(Notification.user_id == user.id,
                                                                 Notification.read.is_(False)))
    return {"unread": unread, "items": [
        {"id": n.id, "kind": n.kind, "message": n.message, "portfolio_id": n.portfolio_id,
         "created_at": n.created_at.isoformat(), "read": n.read} for n in rows]}


@router.post("/notifications/{nid}/read")
def read_notification(nid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    n = db.get(Notification, nid)
    if n is None or n.user_id != user.id:
        raise HTTPException(404, L("Tapılmadı.", "Not found."))
    n.read = True
    commit(db)
    return {"ok": True}


@router.post("/notifications/read-all")
def read_all_notifications(db: Session = Depends(get_db), user: User = Depends(current_user)):
    for n in db.scalars(select(Notification).where(Notification.user_id == user.id,
                                                   Notification.read.is_(False))).all():
        n.read = True
    commit(db)
    return {"ok": True}
