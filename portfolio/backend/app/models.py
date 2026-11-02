"""ORM models (PROMPT.md 3.1)."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16), default="client")  # client | admin
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    lockout_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # until then the user lets admins see their portfolios (support); None or past = no access
    support_access_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    portfolios: Mapped[list["Portfolio"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class UserSession(Base):
    __tablename__ = "user_sessions"
    # SHA-256 of the cookie token: a copied database file does not contain usable session cookies
    token: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    csrf_token: Mapped[str] = mapped_column(String(128))
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class Portfolio(Base):
    __tablename__ = "portfolios"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    base_currency: Mapped[str] = mapped_column(String(3), default="USD")
    risk_profile: Mapped[str] = mapped_column(String(16), default="moderate")
    risk_limit: Mapped[float | None] = mapped_column(Float, nullable=True)  # 3m CVaR95 as fraction
    cash: Mapped[float] = mapped_column(Float, default=0.0)
    version: Mapped[int] = mapped_column(Integer, default=1)  # bumped on every change -> stale detection
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    # read-only share link: only the token's hash is stored; a new link replaces the old one
    share_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    # a what-if scenario is a hidden copy of its portfolio plus hypothetical trades (never listed or monitored)
    scenario_of: Mapped[int | None] = mapped_column(
        ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=True, index=True)
    scenario_trades: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    owner: Mapped[User] = relationship(back_populates="portfolios")
    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="portfolio", cascade="all, delete-orphan", order_by="Transaction.trade_date"
    )
    targets: Mapped[list["PositionTarget"]] = relationship(cascade="all, delete-orphan")


class Instrument(Base):
    __tablename__ = "instruments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    investing_symbol: Mapped[str] = mapped_column(String(32), index=True)
    provider_symbol: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    exchange: Mapped[str] = mapped_column(String(16))
    exchange_mic: Mapped[str | None] = mapped_column(String(8), nullable=True)
    currency: Mapped[str] = mapped_column(String(3))
    isin: Mapped[str | None] = mapped_column(String(16), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(32), default="EQUITY")
    source: Mapped[str] = mapped_column(String(32), default="yahoo")


class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"), index=True)
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id"))
    side: Mapped[str] = mapped_column(String(4))  # BUY | SELL
    quantity: Mapped[float] = mapped_column(Float)
    trade_date: Mapped[date] = mapped_column(Date)
    price: Mapped[float] = mapped_column(Float)
    fees: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(3))
    input_flags: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    portfolio: Mapped[Portfolio] = relationship(back_populates="transactions")
    instrument: Mapped[Instrument] = relationship()


class PositionTarget(Base):
    __tablename__ = "position_targets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"), index=True)
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id"))
    target_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    stop_loss: Mapped[float | None] = mapped_column(Float, nullable=True)
    sell_on: Mapped[date | None] = mapped_column(Date, nullable=True)  # planned sale of the whole position
    __table_args__ = (UniqueConstraint("portfolio_id", "instrument_id"),)


class PriceBar(Base):
    __tablename__ = "price_bars"
    symbol: Mapped[str] = mapped_column(String(32), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    source: Mapped[str] = mapped_column(String(32), primary_key=True)  # yahoo | csv:investing | csv:user | api:<p>
    open: Mapped[float | None] = mapped_column(Float, nullable=True)
    high: Mapped[float | None] = mapped_column(Float, nullable=True)
    low: Mapped[float | None] = mapped_column(Float, nullable=True)
    close: Mapped[float] = mapped_column(Float)
    adj_close: Mapped[float | None] = mapped_column(Float, nullable=True)
    volume: Mapped[float | None] = mapped_column(Float, nullable=True)
    dividends: Mapped[float] = mapped_column(Float, default=0.0)
    splits: Mapped[float] = mapped_column(Float, default=0.0)


class SymbolFetchLog(Base):
    __tablename__ = "symbol_fetch_log"
    symbol: Mapped[str] = mapped_column(String(32), primary_key=True)
    last_fetch_at: Mapped[datetime] = mapped_column(DateTime)
    last_status: Mapped[str] = mapped_column(String(255), default="ok")
    request_count: Mapped[int] = mapped_column(Integer, default=0)


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"), index=True)
    portfolio_version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="queued")  # queued|running|done|failed
    step: Mapped[str] = mapped_column(String(32), default="queued")
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    seed: Mapped[int] = mapped_column(Integer)
    model_version: Mapped[str] = mapped_column(String(32))
    data_as_of: Mapped[date | None] = mapped_column(Date, nullable=True)
    validation_status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|running|done|failed
    gate_verdict: Mapped[str | None] = mapped_column(String(16), nullable=True)  # pass|conditional|fail
    reliability: Mapped[str] = mapped_column(String(16), default="checking")  # high|medium|low|checking
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class RunResult(Base):
    """Client-facing results. Must never contain test statistics, p-values or model parameters."""
    __tablename__ = "run_results"
    run_id: Mapped[int] = mapped_column(ForeignKey("analysis_runs.id", ondelete="CASCADE"), primary_key=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class RunDiagnostics(Base):
    """Admin-only diagnostics."""
    __tablename__ = "run_diagnostics"
    run_id: Mapped[int] = mapped_column(ForeignKey("analysis_runs.id", ondelete="CASCADE"), primary_key=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    validation: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)


class Recommendation(Base):
    __tablename__ = "recommendations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("analysis_runs.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    action: Mapped[str] = mapped_column(String(16))  # increase|reduce|hold|attention
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(64))
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(32))  # generate | validate
    run_id: Mapped[int] = mapped_column(Integer, index=True)
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AdminSetting(Base):
    """Runtime overrides edited from the admin panel (rf, MRP, gate thresholds, flags, profile limits)."""
    __tablename__ = "admin_settings"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)


class Notification(Base):
    """Client-facing notices, e.g. a price leaving the 90% band (PROMPT.md 7.1 monitoring). Never automatic trades."""
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    portfolio_id: Mapped[int | None] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=True)
    run_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kind: Mapped[str] = mapped_column(String(32))
    message: Mapped[str] = mapped_column(Text)
    dedup_key: Mapped[str] = mapped_column(String(128), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    read: Mapped[bool] = mapped_column(Boolean, default=False)


class PasswordReset(Base):
    __tablename__ = "password_resets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    level: Mapped[str] = mapped_column(String(16))  # info|warning|error
    kind: Mapped[str] = mapped_column(String(32))
    message: Mapped[str] = mapped_column(Text)
    run_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    portfolio_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
