"""Portfolio snapshot: frozen composition, cost basis, market data as-of, config and seed (PROMPT.md 4.2)."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date
from typing import Any

import numpy as np
import pandas as pd

from app.config import get_settings, model_config_snapshot
from app.models import Portfolio
from data.service import MarketData, to_base_currency
from portfolio.lots import PositionState, Tx, apply_transactions, split_factor_after

MODEL_VERSION = "1.1.0"


@dataclass
class PortfolioData:
    """Everything the risk engine needs, aligned in base currency and cut at the snapshot date."""
    snapshot: dict[str, Any]
    prices_base: pd.DataFrame        # adj-close (total return) in base currency, columns = symbols
    close_local: dict[str, pd.Series]
    states: dict[str, PositionState]
    exchange_of: dict[str, str]


def _fx_at(fx: pd.Series | float, d: date) -> float:
    if isinstance(fx, float):
        return fx
    sub = fx.loc[: pd.Timestamp(d)]
    if sub.empty:
        return float(fx.iloc[0])
    return float(sub.iloc[-1])


def dividends_received(txs: list[Tx], dividends: pd.Series, splits: pd.Series | None, fx: pd.Series | float,
                       as_of: date) -> float:
    """Cash dividends (base currency) on the shares held before each ex-date up to as_of.

    Shares bought on the ex-date are not entitled; shares sold on the ex-date still are. Quantities are
    split-adjusted to today's share basis, matching the provider's split-adjusted dividend amounts."""
    if dividends is None or dividends.empty:
        return 0.0
    total = 0.0
    for ex, amount in dividends.items():
        exd = ex.date()
        if amount <= 0 or exd > as_of:
            continue
        held = 0.0
        for t in txs:
            if t.trade_date < exd:
                q = t.quantity * split_factor_after(splits, t.trade_date)
                held += q if t.side == "BUY" else -q
        if held > 1e-9:
            total += held * float(amount) * _fx_at(fx, exd)
    return total


def build_portfolio_data(db, portfolio: Portfolio, md: MarketData, seed: int | None = None,
                         as_of: date | None = None, cfg: dict[str, Any] | None = None) -> PortfolioData:
    """Build the frozen inputs for a run.

    All market data are cut at one common date (the earliest last bar among open positions, or `as_of`),
    so the current value and the first simulated day never overlap for instruments whose market has
    already closed later (e.g. Xetra vs NYSE)."""
    settings = get_settings()
    cfg = cfg or settings.raw
    base = portfolio.base_currency
    method = cfg["portfolio"]["cost_method"]
    txs: list[Tx] = []
    splits: dict[str, pd.Series] = {}
    bars_by: dict[str, pd.DataFrame] = {}
    fx_by: dict[str, pd.Series | float] = {}
    meta: dict[str, dict[str, Any]] = {}
    wanted = [t.instrument.provider_symbol for t in portfolio.transactions]
    wanted += [fx for t in portfolio.transactions if (fx := md.fx_ticker(t.instrument.currency, base))]
    md.prefetch(wanted)
    for t in portfolio.transactions:
        inst = t.instrument
        sym = inst.provider_symbol
        if sym not in bars_by:
            bars_by[sym] = md.bars(sym)
            splits[sym] = bars_by[sym]["splits"].astype(float).replace(0, np.nan).dropna()
            fx_by[sym] = md.fx_series(inst.currency, base)
            meta[sym] = {
                "symbol": sym, "investing_symbol": inst.investing_symbol, "name": inst.name,
                "exchange": inst.exchange, "currency": inst.currency, "instrument_id": inst.id,
                "source": inst.source,
            }
        flags = t.input_flags or {}
        price, adjusted = t.price, False
        if flags.get("price_source") in ("close", "latest"):
            # re-read the same session's close from the current split-adjusted series so later splits stay
            # consistent, while the cost basis remains the price that was shown to the user
            used = flags.get("price_date_used") or t.trade_date.isoformat()
            b = bars_by[sym]["close"].loc[: pd.Timestamp(used)]
            if not b.empty:
                price, adjusted = float(b.iloc[-1]), True
        txs.append(
            Tx(sym, t.side, t.quantity, t.trade_date, price, t.fees or 0.0, adjusted,
               _fx_at(fx_by[sym], t.trade_date), t.id)
        )
    states = apply_transactions(txs, splits, method)
    open_syms = [s for s, st in states.items() if st.quantity > 1e-9]

    if as_of is None and open_syms:
        as_of = min(bars_by[s].index.max() for s in open_syms).date()
    if as_of is not None:
        cut = pd.Timestamp(as_of)
        bars_by = {s: b.loc[:cut] for s, b in bars_by.items()}
        fx_by = {s: (f if isinstance(f, float) else f.loc[:cut]) for s, f in fx_by.items()}

    prices_base = {}
    close_local = {}
    for s in bars_by:
        b = bars_by[s]
        adj = b["adj_close"].astype(float).fillna(b["close"].astype(float))
        prices_base[s] = to_base_currency(adj, fx_by[s])
        close_local[s] = b["close"].astype(float)
    prices_df = pd.DataFrame(prices_base).sort_index()

    div_by: dict[str, float] = {}
    for s in bars_by:
        own = [t for t in txs if t.key == s]
        div_by[s] = dividends_received(own, bars_by[s]["dividends"].astype(float).replace(0, np.nan).dropna(),
                                       splits.get(s), fx_by[s], as_of) if as_of else 0.0

    positions = []
    for s in open_syms:
        st = states[s]
        last_close = float(close_local[s].iloc[-1])
        fx_now = _fx_at(fx_by[s], close_local[s].index[-1].date())
        positions.append({
            **meta[s],
            "quantity": round(st.quantity, 6),
            "cost_local": st.cost,
            "cost_base": st.cost_base,
            "last_close_local": last_close,
            "last_close_date": close_local[s].index[-1].date().isoformat(),
            "fx_to_base": fx_now,
            "market_value_base": st.quantity * last_close * fx_now,
            "realized_base": st.realized_base,
            "dividends_base": div_by.get(s, 0.0),
            "first_open_date": st.first_open_date.isoformat() if st.first_open_date else None,
            # open purchase lots (FIFO remainder), for P&L by purchase date
            "lots": [{"trade_date": lot.trade_date.isoformat(), "quantity": round(lot.quantity, 6),
                      "unit_cost_local": lot.unit_cost, "unit_cost_base": lot.unit_cost_base} for lot in st.lots],
        })
    closed = [
        {**meta[s], "realized_base": st.realized_base, "dividends_base": div_by.get(s, 0.0)}
        for s, st in states.items()
        if st.quantity <= 1e-9 and (abs(st.realized_base) > 0 or div_by.get(s, 0.0) > 0)
    ]
    seed = seed if seed is not None else cfg["model"]["seed"]
    snap: dict[str, Any] = {
        "portfolio_id": portfolio.id,
        "portfolio_version": portfolio.version,
        "name": portfolio.name,
        "base_currency": base,
        "risk_profile": portfolio.risk_profile,
        "risk_limit": portfolio.risk_limit,
        "cash": portfolio.cash,
        "positions": positions,
        "closed_positions": closed,
        "transactions": [
            {"id": t.tx_id, "symbol": t.key, "side": t.side, "quantity": t.quantity,
             "date": t.trade_date.isoformat(), "price": t.price, "fees": t.fees}
            for t in txs
        ],
        "targets": [
            {"instrument_id": tg.instrument_id, "target_price": tg.target_price, "stop_loss": tg.stop_loss,
             "sell_on": tg.sell_on.isoformat() if getattr(tg, "sell_on", None) else None}
            for tg in portfolio.targets
        ],
        "data_as_of": as_of.isoformat() if as_of else None,
        "config": model_config_snapshot(cfg),
        "model_version": MODEL_VERSION,
        "seed": seed,
        "mode": settings.mode,
    }
    snap["fingerprint"] = hashlib.sha256(
        json.dumps({k: snap[k] for k in ("positions", "data_as_of", "config", "seed", "cash")},
                   sort_keys=True, default=str).encode()
    ).hexdigest()[:16]
    return PortfolioData(snap, prices_df, close_local, states, {s: meta[s]["exchange"] for s in meta})


def _lot_now(lot: dict[str, Any], p: dict[str, Any], today: date) -> dict[str, Any]:
    """Current P&L of one open purchase lot, valued at the position's last close (base currency)."""
    q = lot["quantity"]
    cost = q * lot["unit_cost_base"]
    value = q * p["last_close_local"] * p["fx_to_base"]
    days = max((today - date.fromisoformat(lot["trade_date"])).days, 0)
    ret = value / cost - 1 if cost else 0.0
    # annualised only after a minimum holding: shorter periods would extrapolate noise
    min_days = get_settings()["portfolio"]["annualize_min_days"]
    annual = (1 + ret) ** (365.25 / days) - 1 if days >= min_days and ret > -1 else None
    return {"trade_date": lot["trade_date"], "quantity": q, "unit_cost_local": lot["unit_cost_local"],
            "cost_base": cost, "market_value_base": value, "unrealized": value - cost, "unrealized_pct": ret,
            "holding_days": days, "annualized_return": annual}


def current_pnl(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Current P&L per position and in total (PROMPT.md 3.4, current state)."""
    pos = snapshot["positions"]
    total_mv = sum(p["market_value_base"] for p in pos) + snapshot["cash"]
    rows = []
    today = date.fromisoformat(snapshot["data_as_of"]) if snapshot["data_as_of"] else date.today()
    for p in pos:
        unreal = p["market_value_base"] - p["cost_base"]
        held = (today - date.fromisoformat(p["first_open_date"])).days if p["first_open_date"] else 0
        div = p.get("dividends_base", 0.0)
        rows.append({
            "symbol": p["symbol"], "investing_symbol": p["investing_symbol"], "name": p["name"],
            "quantity": p["quantity"],
            "avg_cost_local": p["cost_local"] / p["quantity"] if p["quantity"] else 0.0,
            "cost_base": p["cost_base"], "market_value_base": p["market_value_base"],
            "unrealized": unreal, "unrealized_pct": unreal / p["cost_base"] if p["cost_base"] else 0.0,
            "realized": p["realized_base"], "dividends": div,
            "total_return": unreal + p["realized_base"] + div,
            "holding_days": max(held, 0), "weight": p["market_value_base"] / total_mv if total_mv else 0.0,
            "currency": p["currency"], "last_close_local": p["last_close_local"],
            "lots": [_lot_now(lot, p, today) for lot in p.get("lots", [])],
        })
    closed = snapshot.get("closed_positions", [])
    realized_closed = sum(c["realized_base"] for c in closed)
    div_closed = sum(c.get("dividends_base", 0.0) for c in closed)
    cost = sum(p["cost_base"] for p in pos)
    mv = sum(p["market_value_base"] for p in pos)
    realized = sum(r["realized"] for r in rows) + realized_closed
    dividends = sum(r["dividends"] for r in rows) + div_closed
    return {
        "positions": rows,
        "closed": [{"symbol": c["symbol"], "name": c["name"], "realized": c["realized_base"],
                    "dividends": c.get("dividends_base", 0.0)} for c in closed],
        "total": {
            "market_value": mv + snapshot["cash"],
            "cost": cost,
            "cash": snapshot["cash"],
            "unrealized": mv - cost,
            "unrealized_pct": (mv - cost) / cost if cost else 0.0,
            "realized": realized,
            "dividends": dividends,
            "total_return": (mv - cost) + realized + dividends,
        },
    }
