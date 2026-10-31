"""Client API. Responses never include diagnostics, test statistics, p-values or model parameters."""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.admin_settings import effective, feature_enabled
from app.config import get_settings
from app.db import get_db, retry_locked
from app.models import (
    Alert, AnalysisRun, Instrument, Notification, PasswordReset, Portfolio, PositionTarget, RunResult, Transaction,
    User, UserSession,
)
from app.security import (
    LOCKED_MESSAGE, SESSION_COOKIE, create_session, current_user, destroy_session, hash_password, is_locked,
    owned_portfolio, rate_limiter, record_failed_login, record_successful_login, record_unknown_failure,
    token_digest, unknown_email_locked, validate_new_password, verify_password,
)

_DUMMY_HASH = hash_password("timing-equalizer-not-a-real-password")
from app.services import (
    add_transaction, audit, bump, check_sells, client_run_view, enqueue_generate, upsert_target,
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
        raise HTTPException(429, "Çox cəhd. Bir dəqiqə sonra yenidən yoxlayın.")
    first = db.scalar(select(func.count(User.id))) == 0
    if not first and not get_settings().open_registration:
        raise HTTPException(403, "Qeydiyyat bağlıdır. Hesabı administrator açır.")
    email = body.email.lower()
    validate_new_password(body.password, email)
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Bu e-poçt artıq qeydiyyatdan keçib.")
    user = User(email=email, password_hash=hash_password(body.password), role="admin" if first else "client")
    db.add(user)
    db.flush()
    csrf = create_session(db, user, response, secure=request.url.scheme == "https")
    audit(db, user.id, "register", {"role": user.role})
    commit(db)
    return {"id": user.id, "email": user.email, "role": user.role, "csrf": csrf}


@router.post("/auth/login")
def login(body: Credentials, request: Request, response: Response, db: Session = Depends(get_db)):
    if not rate_limiter.allow(f"auth:{request.client.host if request.client else '-'}",
                              get_settings()["security"]["login_rate_limit_per_minute"]):
        raise HTTPException(429, "Çox cəhd. Bir dəqiqə sonra yenidən yoxlayın.")
    email = body.email.lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        verify_password(_DUMMY_HASH, body.password)  # same work as a real check: no timing difference
        if unknown_email_locked(email):
            raise HTTPException(429, LOCKED_MESSAGE)
        record_unknown_failure(email)
        raise HTTPException(401, "E-poçt və ya parol yanlışdır.")
    if is_locked(user):
        raise HTTPException(429, LOCKED_MESSAGE)
    if not verify_password(user.password_hash, body.password):
        if record_failed_login(user):
            audit(db, user.id, "account_locked", {"until": user.locked_until.isoformat()})
            db.add(Alert(level="warning", kind="auth", user_id=user.id,
                         message=f"{user.email}: {get_settings()['security']['max_failed_logins']} uğursuz giriş "
                                 f"cəhdi, hesab müvəqqəti bağlandı."))
        else:
            audit(db, user.id, "login_failed")
        commit(db)
        raise HTTPException(401, "E-poçt və ya parol yanlışdır.")
    if user.is_blocked:
        raise HTTPException(403, "Hesab bloklanıb.")
    record_successful_login(user)
    csrf = create_session(db, user, response, secure=request.url.scheme == "https")
    audit(db, user.id, "login")
    commit(db)
    return {"id": user.id, "email": user.email, "role": user.role, "csrf": csrf}


@router.post("/auth/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db), user: User = Depends(current_user)):
    destroy_session(db, request, response)
    commit(db)
    return {"ok": True}


@router.get("/auth/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email, "role": user.role}


class PasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(min_length=1, max_length=128)


@router.post("/auth/password")
def change_password(body: PasswordChange, request: Request, db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
    if not verify_password(user.password_hash, body.old_password):
        raise HTTPException(401, "Köhnə parol yanlışdır.")
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


@router.post("/auth/password-reset/request")
def password_reset_request(body: ResetRequest, request: Request, db: Session = Depends(get_db)):
    """Always answers the same way (no account enumeration). Personal mode has no e-mail: the one-time link
    is printed to the server console, which only the local owner can see."""
    if not rate_limiter.allow(f"auth:{request.client.host if request.client else '-'}",
                              get_settings()["security"]["login_rate_limit_per_minute"]):
        raise HTTPException(429, "Çox cəhd. Bir dəqiqə sonra yenidən yoxlayın.")
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is not None and not user.is_blocked:
        token = secrets.token_urlsafe(32)
        minutes = get_settings()["security"]["password_reset_minutes"]
        db.add(PasswordReset(user_id=user.id, token_hash=hashlib.sha256(token.encode()).hexdigest(),
                             expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=minutes)))
        base = request.headers.get("origin") or str(request.base_url).rstrip("/")  # dev: Vite origin
        logging.getLogger("password-reset").warning(
            "PAROL BƏRPASI %s üçün link (%s dəqiqə etibarlıdır): %s/reset?token=%s", user.email, minutes, base, token)
        db.add(Alert(level="info", kind="auth", message=f"Parol bərpası istəndi: {user.email}", user_id=user.id))
        audit(db, user.id, "password_reset_requested")
        commit(db)
    return {"ok": True, "message": "Bu e-poçt qeydiyyatdadırsa, bərpa linki server konsoluna yazıldı "
                                   "(lokal rejimdə e-poçt göndərilmir)."}


@router.post("/auth/password-reset/confirm")
def password_reset_confirm(body: ResetConfirm, db: Session = Depends(get_db)):
    row = db.scalar(select(PasswordReset).where(
        PasswordReset.token_hash == hashlib.sha256(body.token.encode()).hexdigest()))
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if row is None or row.used or row.expires_at < now:
        raise HTTPException(400, "Link etibarsızdır və ya vaxtı bitib. Yenidən bərpa istəyin.")
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
        "disclaimer": cfg["recommend"]["disclaimer"],
        "horizon_days": cfg["model"]["horizon_days"],
        "fractional_decimals": cfg["portfolio"]["fractional_decimals"],
        "csv_notice": "investing.com məlumatından yalnız şəxsi və qeyri-kommersiya məqsədilə istifadə etmək olar. "
                      "Faylı özünüz endirib yükləyirsiniz; proqram investing.com-a sorğu göndərmir.",
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
            "prob_profit": (r.get("pnl_end") or {}).get("prob_profit"), "horizon_end": r.get("horizon_end")}


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
    }


@router.get("/portfolios")
def list_portfolios(db: Session = Depends(get_db), user: User = Depends(current_user)):
    ps = db.scalars(select(Portfolio).where(Portfolio.owner_id == user.id).order_by(Portfolio.id)).all()
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


@router.post("/portfolios/{pid}/copy")
def copy_portfolio(pid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = owned_portfolio(db, user, pid)
    q = Portfolio(owner_id=user.id, name=f"{p.name} (kopya)"[:120], base_currency=p.base_currency,
                  risk_profile=p.risk_profile, risk_limit=p.risk_limit, cash=p.cash)
    db.add(q)
    db.flush()
    for t in p.transactions:
        db.add(Transaction(portfolio_id=q.id, instrument_id=t.instrument_id, side=t.side, quantity=t.quantity,
                           trade_date=t.trade_date, price=t.price, fees=t.fees, currency=t.currency,
                           input_flags=dict(t.input_flags or {})))
    for tg in p.targets:
        db.add(PositionTarget(portfolio_id=q.id, instrument_id=tg.instrument_id, target_price=tg.target_price,
                              stop_loss=tg.stop_loss))
    commit(db)
    db.refresh(q)
    return _portfolio_summary(db, q)


@router.delete("/portfolios/{pid}")
def delete_portfolio(pid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = owned_portfolio(db, user, pid)
    db.delete(p)
    commit(db)
    return {"ok": True}


@router.get("/portfolios/{pid}")
def get_portfolio(pid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = owned_portfolio(db, user, pid)
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
         "stop_loss": targets[iid].stop_loss if iid in targets else None}
        for iid, q in holdings.items() if abs(q) > 1e-9
    ]
    return {**_portfolio_summary(db, p), "transactions": txs, "positions": positions}


# ------------------------------------------------------------------ symbols and transactions
@router.get("/symbols/search")
def search_symbols(q: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    q = q.strip()
    if not q or len(q) > 32:
        raise HTTPException(422, "Simvol 1–32 simvol olmalıdır.")
    md = MarketData(db)
    try:
        cands = md.search(q)
    except ProviderError as exc:
        raise HTTPException(502, f"Simvol axtarışı alınmadı: {exc}") from exc
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
        msg = "Simvol tapılmadı."
        if feature_enabled(db, "csv_import"):
            msg += " investing.com-dan endirdiyiniz CSV faylını yükləyə bilərsiniz."
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
            raise ValueError("Simvolda icazəsiz işarə var")
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
        raise HTTPException(404, "Əməliyyat tapılmadı.")
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
        raise HTTPException(422, "Bu səhm portfeldə yoxdur.")
    upsert_target(db, p, body.instrument_id, body.target_price, body.stop_loss)
    commit(db)
    return {"ok": True}


@router.post("/portfolios/{pid}/csv-import")
async def csv_import(pid: int, file: UploadFile = File(...), symbol: str = Form(...), name: str = Form(""),
                     exchange: str = Form("NYSE"), currency: str = Form("USD"),
                     source: Literal["investing", "user"] = Form("investing"),
                     db: Session = Depends(get_db), user: User = Depends(current_user)):
    owned_portfolio(db, user, pid)
    if not feature_enabled(db, "csv_import"):
        raise HTTPException(403, "CSV idxalı bu rejimdə söndürülüb.")
    source_tag = "csv:investing" if source == "investing" else "csv:user"
    if currency.upper() not in CURRENCIES:
        raise HTTPException(422, "Dəstəklənməyən valyuta.")
    if exchange not in get_settings()["data"]["exchange_calendars"]:
        raise HTTPException(422, "Dəstəklənməyən birja.")
    sym = symbol.strip().upper()
    if not sym or not all(c.isalnum() or c in ".-" for c in sym) or len(sym) > 20:
        raise HTTPException(422, "Simvol düzgün deyil.")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(413, "Fayl çox böyükdür (maks. 10 MB).")
    try:
        bars = parse_price_csv(content)
    except CsvFormatError as exc:
        raise HTTPException(422, f"CSV oxunmadı: {exc}") from exc
    md = MarketData(db)
    inst = md.create_csv_instrument(sym, name, exchange, currency)
    n = md.store_bars(inst.provider_symbol, bars, source_tag)
    audit(db, user.id, "csv_import", {"symbol": inst.provider_symbol, "rows": n, "source": source_tag})
    commit(db)
    return {"provider_symbol": inst.provider_symbol, "rows": n, "first": str(bars.index.min().date()),
            "last": str(bars.index.max().date()),
            "note": "CSV qiymətlərinin dividendə görə düzəldilib-düzəldilmədiyi bəlli deyil."}


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
        raise HTTPException(404, "Tapılmadı.")
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
        raise HTTPException(404, "Hesabat üçün hələ hazır nəticə yoxdur. Əvvəlcə Generate basın.")
    view = client_run_view(db, run, p)
    try:
        data = build_pdf(view, p.name)
    except RuntimeError as exc:  # missing font etc.
        raise HTTPException(500, str(exc)) from exc
    audit(db, user.id, "report_pdf", {"portfolio_id": pid, "run_id": run.id})
    commit(db)
    name = f"Portfel_{p.name}_{view['result']['as_of']}.pdf"
    ascii_name = "".join(c if c.isascii() and (c.isalnum() or c in "._-") else "_" for c in name)
    return Response(data, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}"})


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
        raise HTTPException(404, "Tapılmadı.")
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
