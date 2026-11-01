"""Monitoring (PROMPT.md 7.1): notify when the actual price leaves the run's 90% band. Never an automatic sale."""
from __future__ import annotations

import logging
from datetime import date

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.i18n import L
from app.models import AnalysisRun, Notification, Portfolio, RunResult
from data.provider import ProviderError
from data.service import MarketData

log = logging.getLogger(__name__)


def _band_at(dates: list[str], fan: list[list[float]], d: date) -> tuple[float, float] | None:
    """(p05, p95) of the run's band on date d, or None when d is outside the horizon."""
    iso = d.isoformat()
    if iso not in dates:
        return None
    row = fan[dates.index(iso)]
    return row[0], row[4]


def check_portfolio(db: Session, md: MarketData, portfolio: Portfolio) -> int:
    """Create notifications for the portfolio's latest current (non-stale) run. Returns the number created."""
    run = db.scalar(select(AnalysisRun).where(AnalysisRun.portfolio_id == portfolio.id, AnalysisRun.status == "done")
                    .order_by(AnalysisRun.id.desc()).limit(1))
    if run is None or run.portfolio_version != portfolio.version:
        return 0
    res = db.get(RunResult, run.id)
    if res is None:
        return 0
    p = res.payload
    dates: list[str] = p["dates"]
    base = p["base_currency"]
    created = 0
    for a in p["assets"]:
        try:
            bars = md.bars(a["symbol"])
            fx = md.fx_series(a["currency"], base)
        except ProviderError as exc:
            log.warning("monitor: %s: %s", a["symbol"], exc)
            continue
        after = bars.loc[pd.Timestamp(p["as_of"]) + pd.Timedelta(days=1):]
        if after.empty:
            continue
        d = after.index[-1].date()
        band = _band_at(dates, a["fan"], d)
        if band is None:
            continue
        fx_d = fx if isinstance(fx, float) else float(fx.loc[: pd.Timestamp(d)].iloc[-1])
        px = float(after["close"].iloc[-1]) * fx_d
        lo, hi = band
        if lo <= px <= hi:
            continue
        below = px < lo
        key = f"band:{run.id}:{a['symbol']}:{d.isoformat()}"
        if db.scalar(select(Notification).where(Notification.dedup_key == key)):
            continue
        db.add(Notification(
            user_id=portfolio.owner_id, portfolio_id=portfolio.id, run_id=run.id, kind="band", dedup_key=key,
            message=L(f"{portfolio.name}: {a['name']} ({a['investing_symbol']}) qiyməti {d:%d.%m.%Y} tarixində "
                      f"gözlənilən 90% aralıqdan {'aşağı' if below else 'yuxarı'} çıxıb. Mövqeyə yenidən baxın. "
                      "Bu, avtomatik satış deyil.",
                      f"{portfolio.name}: the price of {a['name']} ({a['investing_symbol']}) moved "
                      f"{'below' if below else 'above'} its expected 90% range on {d:%d.%m.%Y}. Review the position. "
                      "This is not an automatic sale."),
        ))
        created += 1
    return created


def monitor_all(db: Session, md: MarketData | None = None) -> int:
    md = md or MarketData(db)
    total = 0
    for portfolio in db.scalars(select(Portfolio).where(Portfolio.scenario_of.is_(None))).all():
        total += check_portfolio(db, md, portfolio)
    return total
