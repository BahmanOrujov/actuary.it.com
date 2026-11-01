"""Application services: portfolios, transactions, runs, client-safe results, audit."""
from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.admin_settings import profile_limit
from app.config import get_settings
from app.i18n import B, L, cfg_text
from app.models import (
    AnalysisRun, AuditLog, Instrument, Job, Portfolio, PositionTarget, Recommendation, RunDiagnostics, RunResult,
    Transaction,
)
from data.calendars import previous_session
from data.quality import check_bars
from data.provider import ProviderError
from data.service import MarketData
from portfolio.inputs import InputError, resolve_input
from portfolio.lots import LotError, Tx, apply_transactions
from portfolio.snapshot import MODEL_VERSION


def audit(db: Session, user_id: int | None, action: str, detail: dict[str, Any] | None = None) -> None:
    db.add(AuditLog(user_id=user_id, action=action, detail=detail or {}))


def bump(portfolio: Portfolio) -> None:
    portfolio.version = (portfolio.version or 0) + 1


# ------------------------------------------------------------------ transactions
def add_transaction(db: Session, md: MarketData, portfolio: Portfolio, *, provider_symbol: str,
                    investing_symbol: str | None, side: str, quantity: float, trade_date: date | None,
                    price: float | None, fees: float) -> tuple[Transaction, list[str]]:
    side = side.upper()
    if side not in ("BUY", "SELL"):
        raise HTTPException(422, L("Əməliyyat növü BUY və ya SELL olmalıdır.", "The transaction type must be BUY or SELL."))
    if fees is not None and fees < 0:
        raise HTTPException(422, L("Komissiya mənfi ola bilməz.", "Fees cannot be negative."))
    try:
        inst = md.ensure_instrument(provider_symbol, investing_symbol)
        bars = md.bars(inst.provider_symbol)
    except ProviderError as exc:
        raise HTTPException(502, L(f"Məlumat mənbəyi xətası: {exc}", f"Data source error: {exc}")) from exc
    today = date.today()
    first = bars.index.min().date() if len(bars) else None

    def close_on(d: date):
        return md.close_on(inst.provider_symbol, previous_session(inst.exchange, d), inst.exchange)

    try:
        resolved = resolve_input(
            quantity=quantity, trade_date=trade_date, price=price, today=today,
            close_on=close_on, latest_close=lambda: md.latest_close(inst.provider_symbol),
            first_history_date=first,
        )
    except (InputError, ValueError) as exc:
        raise HTTPException(422, str(exc)) from exc
    # tell the client at once when the chosen listing is rarely traded or too young (e.g. a small ETP on
    # another exchange picked instead of the company's main listing)
    warnings = resolved.warnings + [w for w in check_bars(inst.provider_symbol, bars).client_warnings()
                                    if w not in resolved.warnings]

    tx = Transaction(
        portfolio_id=portfolio.id, instrument_id=inst.id, side=side, quantity=quantity,
        trade_date=resolved.trade_date, price=resolved.price, fees=fees or 0.0, currency=inst.currency,
        input_flags={**resolved.flags, "warnings": warnings},
    )
    check_sells(portfolio, extra=tx, instrument=inst)
    db.add(tx)
    bump(portfolio)
    db.flush()
    return tx, warnings


def check_sells(portfolio: Portfolio, extra: Transaction | None = None, instrument: Instrument | None = None,
                exclude_id: int | None = None) -> None:
    """Validate that no sale exceeds holdings at its date (prices irrelevant; quantities only)."""
    txs = [
        Tx(str(t.instrument_id), t.side, t.quantity, t.trade_date, 1.0, 0.0, True, 1.0, t.id)
        for t in portfolio.transactions if t.id != exclude_id
    ]
    if extra is not None:
        txs.append(Tx(str(extra.instrument_id), extra.side, extra.quantity, extra.trade_date, 1.0, 0.0, True, 1.0, 10**9))
    try:
        apply_transactions(txs)
    except LotError as exc:
        name = instrument.investing_symbol if instrument else ""
        msg = str(exc).split(":", 1)[-1].strip()
        raise HTTPException(422, f"{name}: {msg}".strip(": ")) from exc


# ------------------------------------------------------------------ runs
def frozen_composition(portfolio: Portfolio) -> dict[str, Any]:
    return {
        "name": portfolio.name, "base_currency": portfolio.base_currency, "risk_profile": portfolio.risk_profile,
        "risk_limit": portfolio.risk_limit, "cash": portfolio.cash, "version": portfolio.version,
        "transactions": [
            {"id": t.id, "instrument_id": t.instrument_id, "side": t.side, "quantity": t.quantity,
             "trade_date": t.trade_date.isoformat(), "price": t.price, "fees": t.fees, "input_flags": t.input_flags}
            for t in portfolio.transactions
        ],
        "targets": [{"instrument_id": t.instrument_id, "target_price": t.target_price, "stop_loss": t.stop_loss}
                    for t in portfolio.targets],
    }


def thaw_composition(db: Session, portfolio_id: int, owner_id: int, frozen: dict[str, Any]) -> SimpleNamespace:
    """Rebuild a read-only portfolio object from a frozen composition (snapshot immutability)."""
    insts = {i.id: i for i in db.scalars(select(Instrument).where(
        Instrument.id.in_({t["instrument_id"] for t in frozen["transactions"]} or {0}))).all()}
    txs = [
        SimpleNamespace(id=t["id"], instrument_id=t["instrument_id"], instrument=insts[t["instrument_id"]],
                        side=t["side"], quantity=t["quantity"], trade_date=date.fromisoformat(t["trade_date"]),
                        price=t["price"], fees=t["fees"], input_flags=t["input_flags"])
        for t in frozen["transactions"]
    ]
    return SimpleNamespace(
        id=portfolio_id, owner_id=owner_id, name=frozen["name"], base_currency=frozen["base_currency"],
        risk_profile=frozen["risk_profile"], risk_limit=frozen["risk_limit"], cash=frozen["cash"],
        version=frozen["version"], transactions=txs,
        targets=[SimpleNamespace(**t) for t in frozen["targets"]],
    )


def enqueue_generate(db: Session, portfolio: Portfolio) -> AnalysisRun:
    if not portfolio.transactions:
        raise HTTPException(422, L("Portfeldə səhm yoxdur. Əvvəlcə səhm əlavə edin.", "The portfolio has no stocks. Add a stock first."))
    active = db.scalar(select(AnalysisRun).where(
        AnalysisRun.portfolio_id == portfolio.id, AnalysisRun.status.in_(("queued", "running")),
        AnalysisRun.portfolio_version == portfolio.version))
    if active:
        return active
    cfg = get_settings()
    run = AnalysisRun(
        portfolio_id=portfolio.id, portfolio_version=portfolio.version, status="queued", step="queued",
        snapshot={"composition": frozen_composition(portfolio)}, seed=int(cfg["model"]["seed"]),
        model_version=MODEL_VERSION,
    )
    db.add(run)
    db.flush()
    db.add(Job(kind="generate", run_id=run.id))
    return run


def risk_limit_for(db: Session, portfolio) -> float:
    if portfolio.risk_limit:
        return float(portfolio.risk_limit)
    return profile_limit(db, portfolio.risk_profile)


RELIABILITY_TEXT = {
    "high": B("Model statistik yoxlamalardan keçib. Aralıqlar keçmiş məlumatda gözlənildiyi kimi işləyib.",
              "The model passed the statistical checks. Its ranges behaved as expected on past data."),
    "medium": B("Model əsas yoxlamaların çoxundan keçib, bəzi məhdudiyyətlər var. Nəticələri ehtiyatla şərh edin.",
                "The model passed most of the main checks, with some limitations. Interpret the results with care."),
    "low": B("Model bəzi statistik yoxlamalardan keçməyib. Nəticələr daha az etibarlıdır; ekstremal göstəricilər gizlədilib.",
             "The model failed some statistical checks. The results are less reliable; extreme measures are hidden."),
    "checking": B("Modelin statistik yoxlaması davam edir. Bitəndə etiket yenilənəcək.",
                  "The model's statistical check is still running. The label will update when it finishes."),
}
SECTION_RELIABILITY = [
    {"item": B("Aralığın eni və portfel üzrə nəticələr", "Width of the range and portfolio-level results"), "label": "high"},
    {"item": B("Ayrı səhmlər üzrə nəticələr", "Results for individual stocks"), "label": "medium"},
    {"item": B("Ekstremal hallar (99%)", "Extreme cases (99%)"), "label": "medium-low"},
    {"item": B("Median (istiqamət)", "Median (direction)"), "label": "low"},
]

FORBIDDEN_CLIENT_KEYS = {"p_value", "statistic", "q_value", "p_holm", "params", "robust_se", "bic", "aic",
                         "loglik", "tests", "candidates", "omega", "alpha", "beta", "gamma", "diagnostics", "gates"}


def assert_client_safe(obj: Any, path: str = "") -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in FORBIDDEN_CLIENT_KEYS:
                raise AssertionError(f"forbidden key in client payload: {path}.{k}")
            assert_client_safe(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            assert_client_safe(v, f"{path}[{i}]")


def _effect(val: dict, section: str, name: str) -> dict:
    for t in (val.get("sections") or {}).get(section) or []:
        if t.get("name") == name:
            return t.get("effect") or {}
    return {}


def client_trust(db: Session, run: AnalysisRun) -> dict[str, Any] | None:
    """Plain-language track record for the client: how often the model's ranges held on past data.

    Only observed-vs-expected counts and frequencies are exposed; test statistics, p-values and model
    parameters stay admin-only (CLAUDE.md rule 7)."""
    diag = db.get(RunDiagnostics, run.id)
    val = diag.validation if diag else None
    if not val or run.validation_status != "done" or not val.get("n_daily"):
        return None
    admin = diag.payload or {}
    cfg = get_settings()
    snap_cfg = (run.snapshot or {}).get("config") or {}
    mc = (admin.get("mc") or {}).get("errors", {}).get("0.95", {})
    rel = [x for x in (mc.get("var_rel"), mc.get("cvar_rel")) if x is not None]

    def var_row(level: str) -> dict | None:
        e = _effect(val, "var_tests", f"Kupiec POF VaR{level}")
        if "exceedances" not in e:
            return None
        return {"observed": int(e["exceedances"]), "expected": round(float(e["expected"]), 1)}

    def cover(level: int) -> dict | None:
        e = _effect(val, "interval_tests", f"{level}% aralıq əhatəsi (HAC)")
        if "coverage" not in e:
            return None
        return {"nominal": float(e["nominal"]), "observed": float(e["coverage"]),
                "independent_windows": int(e.get("non_overlapping_n") or 0)}

    checks = [g.get("pass") for g in val.get("gates") or []]
    return {
        "backtest_days": int(val["n_daily"]),
        "backtest_months": int((snap_cfg.get("validation") or cfg["validation"])["backtest_months"]),
        "history_years": int(cfg["data"]["estimation_window_years"]),
        "windows_3m": int(val.get("n_long") or 0),
        "var95": var_row("95"),
        "var99": var_row("99"),
        "cover50": cover(50),
        "cover90": cover(90),
        "checks_passed": sum(1 for c in checks if c is True),
        "checks_total": len(checks),
        "fallback_model": bool(val.get("fallback_applied")),
        "mc_rel_error": max(rel) if rel else None,
        "scenarios": int((admin.get("mc") or {}).get("scenarios") or 0),
    }


def client_run_view(db: Session, run: AnalysisRun, portfolio: Portfolio, audit_user: int | None = None) -> dict[str, Any]:
    stale = run.portfolio_version != portfolio.version
    base = {
        "id": run.id, "status": run.status, "step": run.step, "progress": run.progress,
        "created_at": run.created_at.isoformat(), "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "stale": stale, "reliability": run.reliability, "reliability_text": RELIABILITY_TEXT.get(run.reliability, ""),
        "validation_status": run.validation_status, "error": run.error,
    }
    if run.status != "done":
        return base
    rr = db.get(RunResult, run.id)
    payload = dict(rr.payload) if rr else {}
    if run.reliability == "low" and "risk" in payload:
        payload = {**payload, "risk": {k: v for k, v in payload["risk"].items() if k != "0.99"}, "hidden_99": True}
        ins = payload.get("insights")
        q = (ins or {}).get("risk", {}).get("quantiles")
        if q:
            # the same rule for the quantile grid: nothing beyond the 98% level when the model is unreliable
            cut = int(len(q) * (1 - get_settings()["insights"]["hidden_tail_level"]))
            payload["insights"] = {**ins, "risk": {**ins["risk"], "quantiles": [None] * cut + q[cut:],
                                                   "metrics": {**ins["risk"]["metrics"], "worst_case": None}}}
    recs = db.scalars(select(Recommendation).where(Recommendation.run_id == run.id)).all()
    rec_list = []
    for r in recs:
        d = dict(r.payload)
        d["reliability"] = run.reliability
        rec_list.append(d)
    out = {**base, "result": payload, "recommendations": rec_list, "section_reliability": SECTION_RELIABILITY,
           "trust": client_trust(db, run), "disclaimer": cfg_text(get_settings()["recommend"], "disclaimer")}
    assert_client_safe(out)
    already = audit_user is not None and any(
        (a.detail or {}).get("run_id") == run.id and (a.detail or {}).get("reliability") == run.reliability
        for a in db.scalars(select(AuditLog).where(AuditLog.user_id == audit_user,
                                                   AuditLog.action == "recommendations_shown")
                            .order_by(AuditLog.id.desc()).limit(50)).all()
    )
    if audit_user is not None and rec_list and not already:
        audit(db, audit_user, "recommendations_shown",
              {"run_id": run.id, "model_version": run.model_version, "fingerprint": run.snapshot.get("fingerprint"),
               "reliability": run.reliability, "items": [{"kind": r["kind"], "action": r["action"], "symbol": r.get("symbol"),
                                                         "shares": r.get("shares")} for r in rec_list]})
    return out


def upsert_target(db: Session, portfolio: Portfolio, instrument_id: int, target: float | None, stop: float | None) -> None:
    row = db.scalar(select(PositionTarget).where(PositionTarget.portfolio_id == portfolio.id,
                                                 PositionTarget.instrument_id == instrument_id))
    if row is None:
        row = PositionTarget(portfolio_id=portfolio.id, instrument_id=instrument_id)
        db.add(row)
    row.target_price, row.stop_loss = target, stop
    bump(portfolio)
