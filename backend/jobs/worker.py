"""Background worker: database-backed job queue (generate -> validate). Run: python -m jobs.worker"""
from __future__ import annotations

import copy
import hashlib
import json
import logging
import time
import traceback
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sqlalchemy import select, update

from app.admin_settings import effective_cfg
from app.config import get_settings
from app.db import SessionLocal, init_db, retry_locked
from app.models import Alert, AnalysisRun, Job, Portfolio, Recommendation, RunDiagnostics, RunResult
from app.services import risk_limit_for, thaw_composition
from data.service import MarketData
from portfolio.snapshot import build_portfolio_data
from recommend.monitor import monitor_all
from recommend.risk_based import build_recommendations
from risk.engine import AnalysisError, prepare_returns, run_generate
from validation.backtest import evaluate, run_backtest
from validation.report import _clean, write_report

log = logging.getLogger("worker")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def claim_job() -> int | None:
    def _claim() -> int | None:
        with SessionLocal() as db:
            job = db.scalar(select(Job).where(Job.status == "queued").order_by(Job.id).limit(1))
            if job is None:
                return None
            res = db.execute(update(Job).where(Job.id == job.id, Job.status == "queued")
                             .values(status="running", started_at=_now(), attempts=Job.attempts + 1))
            db.commit()
            return job.id if res.rowcount == 1 else None
    return retry_locked(_claim)


def _set_run(run_id: int, **values) -> None:
    def _do() -> None:
        with SessionLocal() as db:
            db.execute(update(AnalysisRun).where(AnalysisRun.id == run_id).values(**values))
            db.commit()
    retry_locked(_do)


def _finish_job(job_id: int, status: str, error: str | None = None) -> None:
    def _do() -> None:
        with SessionLocal() as db:
            db.execute(update(Job).where(Job.id == job_id).values(status=status, error=error, finished_at=_now()))
            db.commit()
    retry_locked(_do)


def _load(db, run_id: int):
    run = db.get(AnalysisRun, run_id)
    portfolio = db.get(Portfolio, run.portfolio_id)
    frozen = thaw_composition(db, portfolio.id, portfolio.owner_id, run.snapshot["composition"])
    return run, portfolio, frozen


RELIABILITY_ORDER = {"low": 0, "medium": 1, "high": 2}


def _capped(level: str, cap: str | None) -> str:
    if cap is None or level not in RELIABILITY_ORDER:
        return level
    return cap if RELIABILITY_ORDER[cap] < RELIABILITY_ORDER[level] else level


def _run_cfg(run: AnalysisRun) -> dict:
    """config.yaml with the run's frozen model/validation sections (admin overrides at Generate time)."""
    raw = copy.deepcopy(get_settings().raw)
    raw.update(copy.deepcopy(run.snapshot.get("config") or {}))
    return raw


def _generate_alerts(db, run: AnalysisRun, admin: dict, client: dict, md: MarketData) -> None:
    """Admin alerts: data-quality problems, provider errors and risk-limit breaches (PROMPT.md 9)."""
    if admin.get("quality_issues"):
        db.add(Alert(level="warning", kind="data", run_id=run.id, portfolio_id=run.portfolio_id,
                     message="Məlumat keyfiyyəti: " + "; ".join(admin["quality_issues"])[:1800]))
    provider_msgs = [m for m in md.messages if "cavab vermədi" in m]
    if provider_msgs:
        db.add(Alert(level="warning", kind="provider", run_id=run.id, portfolio_id=run.portfolio_id,
                     message="Provayder xətası, keş istifadə olundu: " + "; ".join(provider_msgs)[:1800]))
    cvar = client["risk"]["0.95"]["cvar_pct"]
    if cvar > client["risk_limit"]:
        db.add(Alert(level="info", kind="limit", run_id=run.id, portfolio_id=run.portfolio_id,
                     message=f"Portfel {run.portfolio_id}: 3 aylıq CVaR 95% {cvar * 100:.1f}% ".replace(".", ",") +
                             f"limiti {client['risk_limit']:.0%} keçir."))


def _compute(db, run: AnalysisRun, frozen, cfg: dict, md: MarketData, progress, as_of=None):
    """Fast path for one run: snapshot data -> client payload, admin diagnostics, recommendations."""
    pdata = build_portfolio_data(db, frozen, md, seed=run.seed, as_of=as_of, cfg=cfg)
    retry_locked(db.commit)  # persist refreshed market data cache
    client, admin, rec_ctx = run_generate(pdata, md, cfg, progress, db)
    rec_ctx["limit"] = risk_limit_for(db, frozen)
    recs = build_recommendations(rec_ctx, cfg, "checking")
    client["risk_limit"] = rec_ctx["limit"]
    admin.update({"as_of": client["as_of"], "model_version": run.model_version, "seed": run.seed,
                  "fingerprint": pdata.snapshot["fingerprint"]})
    return pdata, client, admin, recs


def _store(db, run: AnalysisRun, client: dict, admin: dict, recs: list[dict]) -> None:
    """Write (or replace) the run's client payload, admin diagnostics and recommendations."""
    for model in (RunResult, RunDiagnostics):
        old = db.get(model, run.id)
        if old is not None:
            db.delete(old)
    for r in db.scalars(select(Recommendation).where(Recommendation.run_id == run.id)).all():
        db.delete(r)
    db.flush()
    db.add(RunResult(run_id=run.id, payload=_clean(client)))
    db.add(RunDiagnostics(run_id=run.id, payload=_clean(admin)))
    for r in recs:
        db.add(Recommendation(run_id=run.id, kind=r["kind"], action=r["action"], payload=_clean(r)))


def process_generate(job: Job) -> None:
    run_id = job.run_id

    _set_run(run_id, status="running", step="data", progress=0.05)
    with SessionLocal() as db:
        run, portfolio, frozen = _load(db, run_id)
        cfg = effective_cfg(db)

        def progress(step: str, frac: float) -> None:
            # same session as the market-data writes, so SQLite never sees two concurrent writers here
            run.step, run.progress = step, frac
            retry_locked(db.commit)

        md = MarketData(db)
        pdata, client, admin, recs = _compute(db, run, frozen, cfg, md, progress)
        _store(db, run, client, admin, recs)
        snap = {**run.snapshot, **{k: v for k, v in pdata.snapshot.items() if k != "config"},
                "config": pdata.snapshot["config"]}
        run.snapshot = _clean(snap)
        run.status, run.step, run.progress = "done", "done", 1.0
        run.finished_at = _now()
        run.data_as_of = pdata.snapshot["data_as_of"] and datetime.fromisoformat(pdata.snapshot["data_as_of"]).date()
        run.validation_status = "pending"
        run.reliability = "checking"
        _generate_alerts(db, run, admin, client, md)
        # validation cache: same instruments, quantities, data date and config
        key = _validation_key(pdata.snapshot)
        cached = _cached_validation(db, key, run_id)
        if cached is not None:
            _apply_validation(db, run, cached, admin)
        else:
            db.add(Job(kind="validate", run_id=run_id))
        run.snapshot = {**run.snapshot, "validation_key": key}
        retry_locked(db.commit)
        write_report(portfolio.id, run_id, admin, cached)


def _validation_key(snap: dict) -> str:
    body = {"pos": sorted((p["symbol"], round(p["quantity"], 4)) for p in snap["positions"]),
            "as_of": snap["data_as_of"], "cfg": snap["config"], "base": snap["base_currency"]}
    return hashlib.sha256(json.dumps(body, sort_keys=True, default=str).encode()).hexdigest()[:20]


def _cached_validation(db, key: str, run_id: int) -> dict | None:
    rows = db.scalars(select(AnalysisRun).where(AnalysisRun.validation_status == "done",
                                                AnalysisRun.id != run_id).order_by(AnalysisRun.id.desc()).limit(50)).all()
    for r in rows:
        if r.snapshot.get("validation_key") == key:
            d = db.get(RunDiagnostics, r.id)
            if d and d.validation:
                return d.validation
    return None


def _apply_validation(db, run: AnalysisRun, val: dict, admin: dict) -> None:
    run.validation_status = "done"
    run.gate_verdict = val.get("verdict")
    run.reliability = _capped(val.get("reliability", "low"), admin.get("reliability_cap"))
    d = db.get(RunDiagnostics, run.id)
    if d is not None:
        d.validation = val
    for r in db.scalars(select(Recommendation).where(Recommendation.run_id == run.id)).all():
        r.payload = {**r.payload, "reliability": run.reliability}
    if run.gate_verdict != "pass":
        failed = val.get("failed_gates") or val.get("undetermined_gates") or []
        db.add(Alert(level="warning" if run.gate_verdict == "conditional" else "error", kind="gate",
                     message=f"Run {run.id}: model gate-lərdən tam keçmədi ({run.gate_verdict}); gate-lər: {failed}",
                     run_id=run.id, portfolio_id=run.portfolio_id))


VERDICT_RANK = {"fail": 0, "conditional": 1, "pass": 2}


def _mc_rel(admin: dict) -> float:
    e = admin["mc"]["errors"]["0.95"]
    return max(e.get("var_rel") or 1, e.get("cvar_rel") or 1)


def process_validate(job: Job) -> None:
    run_id = job.run_id
    _set_run(run_id, validation_status="running")
    with SessionLocal() as db:
        run, portfolio, frozen = _load(db, run_id)
        cfg = _run_cfg(run)
        # cache only and cut at the run's data date: the validation must describe exactly this snapshot
        md = MarketData(db, refresh=False)
        pdata = build_portfolio_data(db, frozen, md, seed=run.seed, as_of=run.data_as_of, cfg=cfg)
        symbols = [p["symbol"] for p in pdata.snapshot["positions"]]
        admin_tmp: dict = {}
        R_full, _ = prepare_returns(pdata, md, cfg, symbols, pdata.snapshot["base_currency"], admin_tmp, truncate=False)
        years = cfg["data"]["estimation_window_years"] + cfg["validation"]["backtest_months"] / 12 + 0.5
        R_full = R_full.loc[R_full.index[-1] - pd.DateOffset(days=int(years * 365.25)):].dropna()
        qty = np.array([p["quantity"] for p in pdata.snapshot["positions"]])
        price_last = pd.Series({p["symbol"]: p["market_value_base"] / p["quantity"] for p in pdata.snapshot["positions"]})
        diag = db.get(RunDiagnostics, run_id)
        admin = diag.payload
        retry_locked(db.commit)
        bt = run_backtest(R_full, qty, price_last, cfg, run.seed)
        val = _clean(evaluate(bt, cfg, _mc_rel(admin)))

        # PROMPT.md 6.8, step 1 of the gate-failure sequence: try the next specification. If it validates
        # better, this run is recomputed with it, so a model that failed the gates is never shown as reliable.
        fb = cfg["validation"].get("fallback_spec")
        garch_cfg = cfg["model"]["garch"]
        already_fallback = bool(fb) and garch_cfg["vol_models"] == [fb["vol"]] and garch_cfg["dists"] == [fb["dist"]]
        if val["verdict"] == "fail" and fb and not already_fallback:
            cfg_fb = copy.deepcopy(cfg)
            cfg_fb["model"]["garch"]["vol_models"] = [fb["vol"]]
            cfg_fb["model"]["garch"]["dists"] = [fb["dist"]]
            # a second specification attempt doubles the chance of passing by luck: Bonferroni over the two
            # attempts, i.e. the fallback must pass its gates at alpha / 2
            cfg_fb["validation"]["alpha"] = cfg["validation"]["alpha"] / 2
            bt_fb = run_backtest(R_full, qty, price_last, cfg_fb, run.seed)
            val_fb = _clean(evaluate(bt_fb, cfg_fb, _mc_rel(admin)))
            val["fallback_tried"] = {"spec": fb, "verdict": val_fb["verdict"], "failed_gates": val_fb.get("failed_gates")}
            if VERDICT_RANK[val_fb["verdict"]] > VERDICT_RANK[val["verdict"]]:
                pdata, client, admin, recs = _compute(db, run, frozen, cfg_fb, md, lambda *_: None,
                                                      as_of=run.data_as_of)
                admin["fallback_applied"] = {"spec": fb, "reason": "BIC ilə seçilmiş spesifikasiya gate-lərdən keçmədi"}
                _store(db, run, client, admin, recs)
                # the run now reproduces with the fallback specification
                run.snapshot = {**run.snapshot, "config": _clean(pdata.snapshot["config"]), "fallback_spec": fb,
                                "validation_key": None}  # not shareable: other runs used the BIC selection
                val_fb = _clean(evaluate(bt_fb, cfg_fb, _mc_rel(admin)))
                val_fb["fallback_applied"] = {"spec": fb, "previous_verdict": val["verdict"],
                                              "previous_failed_gates": val.get("failed_gates"),
                                              "alpha": cfg_fb["validation"]["alpha"]}
                val = val_fb
        _apply_validation(db, run, val, admin)
        retry_locked(db.commit)
        write_report(portfolio.id, run_id, admin, val)


def process(job_id: int) -> None:
    with SessionLocal() as db:
        job = db.get(Job, job_id)
        db.expunge(job)
    try:
        if job.kind == "generate":
            process_generate(job)
        elif job.kind == "validate":
            process_validate(job)
        _finish_job(job_id, "done")
    except AnalysisError as exc:
        _set_run(job.run_id, status="failed", error=str(exc), step="failed")
        _finish_job(job_id, "failed", str(exc))
    except Exception as exc:  # noqa: BLE001
        tb = traceback.format_exc()
        log.error("job %s failed: %s", job_id, tb)
        msg = "Təhlil zamanı xəta baş verdi. Admin xəbərdar edildi."
        if "Məlumat" in str(exc) or "məlumat" in str(exc) or "Yahoo" in str(exc):
            msg = f"Məlumat mənbəyi xətası: {exc}"
        if job.kind == "generate":
            _set_run(job.run_id, status="failed", error=msg, step="failed")
        else:
            _set_run(job.run_id, validation_status="failed")
        _finish_job(job_id, "failed", tb[-2000:])
        with SessionLocal() as db:
            db.add(Alert(level="error", kind="job", message=f"Job {job_id} ({job.kind}) xəta: {exc}"[:2000],
                         run_id=job.run_id))
            retry_locked(db.commit)


def reset_stuck() -> None:
    """Jobs left 'running' by a crashed worker go back to the queue."""
    with SessionLocal() as db:
        db.execute(update(Job).where(Job.status == "running").values(status="queued"))
        db.commit()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    init_db()
    reset_stuck()
    interval = get_settings()["jobs"]["poll_interval_seconds"]
    monitor_every = 60 * get_settings()["jobs"]["monitor_interval_minutes"]
    last_monitor = 0.0
    log.info("worker started (mode=%s)", get_settings().mode)
    while True:
        job_id = claim_job()
        if job_id is not None:
            log.info("processing job %s", job_id)
            process(job_id)
            continue
        if time.monotonic() - last_monitor > monitor_every:
            last_monitor = time.monotonic()
            run_monitor()
        time.sleep(interval)


def run_monitor() -> None:
    """Band monitoring for all portfolios (PROMPT.md 7.1); errors never stop the worker."""
    try:
        with SessionLocal() as db:
            n = monitor_all(db)
            retry_locked(db.commit)
        if n:
            log.info("monitor: %s notification(s)", n)
    except Exception:  # noqa: BLE001
        log.exception("monitor failed")


if __name__ == "__main__":
    main()
