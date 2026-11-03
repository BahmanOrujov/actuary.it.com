"""Generate fast path: data -> diagnostics -> model selection -> simulation -> measures (PROMPT.md 4)."""
from __future__ import annotations

import logging
import os
import zlib
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Callable

import numpy as np
import pandas as pd

from app.i18n import L
from data.calendars import future_sessions, month_end_checkpoints
from data.quality import check_bars
from data.service import MarketData, to_base_currency
from portfolio.snapshot import PortfolioData, current_pnl
from risk.dcc import CorrModel, fit_ccc, fit_dcc
from risk.diagnostics import return_diagnostics
from risk.factors import capm_beta, clusters, hhi, multifactor
from risk.garch import AssetModel, fit_ewma, garch_break_test, select_garch
from risk.insights import collect as collect_insights
from risk.measures import actual_measures, compute_measures, var_cvar
from risk.simulate import SimOutput, build_pool, simulate_paths
from risk.stress_names import stress_group, stress_name
from validation.stat_tests import engle_sheppard, hosking_portmanteau

log = logging.getLogger(__name__)
_POOL: ProcessPoolExecutor | None = None


class AnalysisError(Exception):
    """Client-safe error message."""


def _pool() -> ProcessPoolExecutor | None:
    global _POOL
    if os.getenv("PA_NO_PARALLEL"):
        return None
    if _POOL is None:
        from app.config import get_settings

        # each worker process holds numpy/pandas/arch (~200 MB): the cap keeps two pools (API-triggered
        # generate + background validation) inside the memory of a small laptop
        cap = int(get_settings()["jobs"]["max_workers"])
        try:
            _POOL = ProcessPoolExecutor(max_workers=max(1, min(cap, (os.cpu_count() or 2) - 1)))
        except Exception:
            return None
    return _POOL


def _fit_asset_job(args: tuple) -> AssetModel:
    sym, r, cfg, use_garch, full = args
    if use_garch:
        return select_garch(sym, r, cfg, full)
    return fit_ewma(sym, r, cfg["model"]["ewma_lambda"], float(cfg["model"]["garch"]["scale"]))


def _break_job(args: tuple) -> tuple[dict[str, Any], int | None]:
    m, trim, spec = args
    t, k = garch_break_test(m, trim, spec)
    return t.to_dict(), k


def _warm_job(_: int) -> bool:
    import arch.univariate  # noqa: F401  the heavy import of a model fit, done before the first Generate
    return True


def warm_pool() -> None:
    """Start the process pool and import the model libraries in every worker process now, so the first
    Generate after a restart does not pay ~15-30 s of process start-up."""
    pool = _pool()
    if pool is not None:
        try:
            list(pool.map(_warm_job, range(pool._max_workers)))  # noqa: SLF001
        except Exception as exc:  # noqa: BLE001
            log.warning("pool warm-up failed: %s", exc)


def _map(fn, jobs: list, parallel: bool) -> list:
    pool = _pool() if parallel and len(jobs) > 1 else None
    if pool is not None:
        try:
            return list(pool.map(fn, jobs))
        except Exception as exc:  # broken pool -> serial
            log.warning("parallel map failed, serial fallback: %s", exc)
    return [fn(j) for j in jobs]


def apply_break_policy(models: list[AssetModel], series: dict[str, pd.Series], cfg: dict[str, Any],
                       full: bool, parallel: bool) -> tuple[list[AssetModel], list[dict[str, Any]]]:
    """PROMPT.md 6.1: a variance break changes the estimation window. Each GARCH instrument is tested
    (garch_break_test), Holm-corrected across instruments; a significant break with at least
    min_estimation_years after it makes that instrument's model be re-estimated on the post-break data only.
    Uses data inside the window only, so it is look-ahead free at backtest origins."""
    from validation.stat_tests import holm

    bp = cfg["model"]["break_policy"]
    if not bp["enabled"]:
        return models, []
    alpha = cfg["validation"]["alpha"]
    min_years = cfg["data"]["min_estimation_years"]
    # GARCH models, and EWMA models that are a fallback for non-stationary fits (not short histories)
    idx = [i for i, m in enumerate(models)
           if _years(m.index) >= 2 * min_years and (m.kind != "EWMA" or "fallback_reason" in m.diagnostics)]
    spec = tuple(bp["test_spec"])
    results = _map(_break_job, [(models[i], bp["trim"], spec) for i in idx], parallel)
    adj = holm([r[0]["p_value"] for r in results])
    out = []
    refits = []
    for i, (t, k), ph in zip(idx, results, adj):
        rec = {"symbol": models[i].symbol, **t, "name": f"{models[i].symbol}: {t['name']}", "p_holm": ph,
               "applied": False}
        if ph is not None and ph < alpha and k is not None:
            post = series[models[i].symbol].iloc[k + 1:]
            rec["years_after"] = round(_years(post.index), 2)
            if _years(post.index) >= min_years:
                refits.append((i, post))
                rec["applied"] = True
        out.append(rec)
    if refits:
        new = _map(_fit_asset_job, [(models[i].symbol, post, cfg, True, full) for i, post in refits], parallel)
        for (i, _), m in zip(refits, new):
            models[i] = m
    return models, out


@dataclass
class FittedSystem:
    models: list[AssetModel]
    corr: CorrModel
    pool_u: np.ndarray
    info: dict[str, Any] = field(default_factory=dict)


def _years(idx: pd.Index) -> float:
    return (idx[-1] - idx[0]).days / 365.25 if len(idx) > 1 else 0.0


def fit_system(R: pd.DataFrame, cfg: dict[str, Any], full: bool, parallel: bool = True) -> FittedSystem:
    """Fit univariate models and the correlation model on a returns window (log, base currency).

    Each instrument's volatility model uses all of its own data in the window (a young listing does not
    shorten the others); instruments with < short_history_years of data get EWMA. The correlation model and
    the shock pool use the common dates on which every instrument has data."""
    short = cfg["model"]["short_history_years"]
    series = {c: R[c].dropna() for c in R.columns}
    # share of days with an exactly unchanged price: ~1% for a traded stock, most days for an illiquid listing
    zero_share = {c: float((s == 0).mean()) if len(s) else 0.0 for c, s in series.items()}
    illiquid = [c for c, z in zero_share.items() if z > cfg["model"]["max_zero_return_share"]]
    use_garch = {c: _years(s.index) >= short and c not in illiquid for c, s in series.items()}
    jobs = [(c, series[c], cfg, use_garch[c], full) for c in R.columns]
    models = _map(_fit_asset_job, jobs, parallel)
    models, breaks = apply_break_policy(models, series, cfg, full, parallel)
    # common dates: every instrument has data and a (possibly post-break) fitted residual
    common = R.dropna().index
    for m in models:
        common = common.intersection(m.index)
    if len(common) < 60:
        raise AnalysisError(L("Bütün səhmlərin birlikdə məlumatı olan dövr çox qısadır (ən azı 3 ay lazımdır).", "The period with data for all the stocks together is too short (at least 3 months are needed)."))
    common_years = _years(common)
    info: dict[str, Any] = {
        "window_years": round(_years(R.index), 2), "common_years": round(common_years, 2),
        "use_garch": use_garch,
        "short_history_assets": [c for c, g in use_garch.items() if not g and c not in illiquid],
        "illiquid_assets": {c: round(zero_share[c], 3) for c in illiquid},
        "breaks": breaks,
    }
    Z = np.column_stack([pd.Series(m.z, index=m.index).reindex(common).to_numpy() for m in models])
    alpha = cfg["validation"]["alpha"]
    if Z.shape[1] == 1:
        corr = CorrModel("UNIVARIATE", np.eye(1))
    else:
        es = engle_sheppard(Z, cfg["model"]["dcc"]["es_lags"]).decide(alpha)
        info["engle_sheppard"] = es.to_dict()
        if common_years < short:
            corr = fit_ccc(Z)
            info["corr_reason"] = "Ortaq məlumat 2 ildən azdır → CCC"
        elif es.reject:
            corr = fit_dcc(Z)
            if corr.A + corr.B >= 0.999 or not np.isfinite(corr.loglik or np.nan):
                corr = fit_ccc(Z)
                info["corr_reason"] = "DCC qiymətləndirilməsi sərhəddə → CCC"
            else:
                info["corr_reason"] = "Engle-Sheppard sabit korrelyasiyanı rədd edir → DCC"
        else:
            corr = fit_ccc(Z)
            info["corr_reason"] = "Engle-Sheppard sabit korrelyasiyanı rədd etmir → CCC"
    pool_u = build_pool(models, corr, Z)
    return FittedSystem(models, corr, pool_u, info)


def multivariate_diagnostics(fs: FittedSystem, alpha: float) -> dict[str, Any]:
    if fs.corr.kind == "UNIVARIATE":
        return {"kind": "UNIVARIATE"}
    u = fs.pool_u
    tests = [
        hosking_portmanteau(u, 5, "Hosking u").decide(alpha).to_dict(),
        hosking_portmanteau(u ** 2 - 1, 5, "Hosking u²").decide(alpha).to_dict(),
    ]
    C = np.corrcoef(u.T)
    off = C[~np.eye(len(C), dtype=bool)]
    pd_ok = True
    if fs.corr.R_hist is not None:
        mins = np.linalg.eigvalsh(fs.corr.R_hist[:: max(1, len(fs.corr.R_hist) // 200)]).min(axis=1)
        pd_ok = bool((mins > 0).all())
    return {
        "kind": fs.corr.kind,
        "A": fs.corr.A, "B": fs.corr.B, "A_plus_B": fs.corr.A + fs.corr.B, "se": fs.corr.se,
        "shrinkage": fs.corr.shrinkage,
        "u_corr_max_abs_offdiag": float(np.max(np.abs(off))) if len(off) else 0.0,
        "u_corr_frobenius_from_identity": float(np.linalg.norm(C - np.eye(len(C)))),
        "all_pd": pd_ok,
        "tests": tests,
        **fs.info,
    }


def compare_sources_for(db, md: MarketData, symbols: list[str], as_of: pd.Timestamp) -> list[dict[str, Any]]:
    """PROMPT.md 2.2 p.3: when the same instrument exists from Yahoo and from a CSV import, compare closes on
    overlapping days (admin report only). Different listings of one ticker (other currency) are skipped."""
    from sqlalchemy import select

    from app.models import Instrument
    from data.quality import compare_sources

    out = []
    for s in symbols:
        inst = db.scalar(select(Instrument).where(Instrument.provider_symbol == s))
        if inst is None:
            continue
        others = db.scalars(select(Instrument).where(Instrument.investing_symbol == inst.investing_symbol,
                                                     Instrument.provider_symbol != s)).all()
        for o in others:
            if (inst.source == "csv") == (o.source == "csv") or inst.currency != o.currency:
                continue
            a, b = md._load_cached(s).loc[:as_of], md._load_cached(o.provider_symbol).loc[:as_of]
            if a.empty or b.empty:
                continue
            res = compare_sources(a, b)
            if res["overlap_days"]:
                out.append({"symbol": s, "other": o.provider_symbol, **res})
    return out


def _market_returns(md: MarketData, ticker: str, ccy_fx: pd.Series | float) -> pd.Series | None:
    try:
        b = md.bars(ticker)
        px = to_base_currency(b["adj_close"].fillna(b["close"]).astype(float), ccy_fx)
        return np.log(px / px.shift(1)).dropna()
    except Exception as exc:
        md.messages_admin(f"İndeks {ticker} alınmadı: {exc}")
        return None


def _avg_volume(md: MarketData, symbol: str, days: int) -> float | None:
    """Average daily traded shares over the last `days` sessions (None if the provider has no volume)."""
    try:
        v = md.bars(symbol)["volume"].astype(float).dropna()
        v = v[v > 0].tail(days)
        return float(v.mean()) if len(v) else None
    except Exception:
        return None


def drift_index(cfg: dict[str, Any], positions: list[dict[str, Any]]) -> tuple[str, str]:
    """Main exchange by market value and its market index ticker (the CAPM market)."""
    weights_ex: dict[str, float] = {}
    for p in positions:
        weights_ex[p["exchange"]] = weights_ex.get(p["exchange"], 0) + p["market_value_base"]
    main_ex = max(weights_ex, key=weights_ex.get)
    return main_ex, cfg["data"]["market_index"].get(main_ex, "^GSPC")


def capm_drift(R: pd.DataFrame, mret: pd.Series | None, rf: float, mrp: float,
               models: list[AssetModel]) -> tuple[np.ndarray, list[float]]:
    """Daily log-return drift per instrument: (rf + beta * MRP) / 252 - sigma_bar^2 / 2.

    Used by Generate and by the backtest, so the validation tests the drift the client actually sees.
    Betas are estimated on R (the estimation window only, in the backtest)."""
    betas = [capm_beta(R[m.symbol], mret)[0] if mret is not None else 1.0 for m in models]
    s2bar = np.array([m.long_run_var / m.scale ** 2 for m in models])
    return (rf + np.array(betas) * mrp) / 252 - 0.5 * s2bar, betas


def prepare_returns(pdata: PortfolioData, md: MarketData, cfg: dict[str, Any], symbols: list[str],
                    base: str, admin: dict[str, Any], truncate: bool = True) -> tuple[pd.DataFrame, dict[str, pd.Series]]:
    """Aligned daily log-returns in base currency; union calendar with forward-filled prices.

    Instruments with < proxy_history_months of history are extended with beta x index + bootstrapped residuals."""
    px = pdata.prices_base[symbols].copy()
    as_of = min(px[s].dropna().index.max() for s in symbols)
    px = px.loc[:as_of].ffill()
    idx_by_ex = cfg["data"]["market_index"]
    market: dict[str, pd.Series] = {}
    proxies = []
    for s in symbols:
        first = px[s].first_valid_index()
        months = (as_of - first).days / 30.44
        if months < cfg["model"]["proxy_history_months"]:
            ex = pdata.exchange_of.get(s, "NYSE")
            tk = idx_by_ex.get(ex, "^GSPC")
            if tk not in market:
                m = _market_returns(md, tk, 1.0)
                if m is not None:
                    market[tk] = m
            if tk in market:
                r_own = np.log(px[s] / px[s].shift(1)).dropna()
                beta, _ = capm_beta(r_own, market[tk])
                resid = (r_own - beta * market[tk].reindex(r_own.index).fillna(0)).to_numpy()
                rng = np.random.default_rng(zlib.crc32(s.encode()))
                hist_idx = market[tk].loc[:first].index[1:]
                synth = beta * market[tk].loc[hist_idx].to_numpy() + rng.choice(resid, len(hist_idx))
                # rebuild a price path ending at the first real price
                p_first = float(px[s].loc[first])
                back = p_first * np.exp(-np.cumsum(synth[::-1]))[::-1]
                proxy_px = pd.Series(back, index=hist_idx)
                px[s] = px[s].combine_first(proxy_px.reindex(px.index))
                proxies.append({"symbol": s, "months": round(months, 1), "beta": beta, "index": tk})
    if proxies:
        admin.setdefault("warnings", []).append(
            "Qısa tarixçə (<6 ay) üçün bazar indeksi əsaslı proksi istifadə olundu: " +
            ", ".join(p["symbol"] for p in proxies))
        admin["proxies"] = proxies
    # Returns on the union calendar; an instrument is NaN before its first price (prices are forward-filled
    # afterwards, so a closed market gives a zero return). Rows where no instrument has data are dropped.
    R = np.log(px / px.shift(1)).iloc[1:]
    R = R.loc[R.notna().any(axis=1)]
    if truncate:
        est_years = cfg["data"]["estimation_window_years"]
        R = R.loc[R.index[-1] - pd.DateOffset(years=est_years):]
    return R, market


def planned_sell_index(snap: dict[str, Any], positions: list[dict[str, Any]], sessions: list, H: int) -> np.ndarray:
    """Session index of each position's planned sale (H: not sold within the horizon). A plan whose date has
    already passed is executed on the first session."""
    plans = planned_sells(snap)
    idx = np.full(len(positions), H, dtype=int)
    for i, p in enumerate(positions):
        d = plans.get(p["instrument_id"])
        if d is not None:
            idx[i] = int(np.searchsorted(np.array(sessions, dtype="datetime64[D]"), np.datetime64(d)))
    return idx


def planned_sells(snap: dict[str, Any]) -> dict[int, date]:
    return {t["instrument_id"]: date.fromisoformat(t["sell_on"]) for t in snap.get("targets", []) if t.get("sell_on")}


def run_generate(pdata: PortfolioData, md: MarketData, cfg: dict[str, Any],
                 progress: Callable[[str, float], None], db=None) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Returns (client_payload, admin_diagnostics, recommendation_context)."""
    snap = pdata.snapshot
    positions = snap["positions"]
    if not positions:
        raise AnalysisError(L("Portfeldə açıq mövqe yoxdur (yalnız nağd pul). Təhlil üçün səhm əlavə edin.", "The portfolio has no open positions (cash only). Add a stock to analyse it."))
    alpha = cfg["validation"]["alpha"]
    base = snap["base_currency"]
    symbols = [p["symbol"] for p in positions]
    names = [p["name"] for p in positions]
    admin: dict[str, Any] = {"warnings": [], "notes": []}
    client_warnings: list[str] = []

    progress("checking", 0.15)
    quality = {}
    issues: list[str] = []
    window_start = pd.Timestamp(snap["data_as_of"]) - pd.DateOffset(years=cfg["data"]["estimation_window_years"])
    stale_days = cfg["data"]["quality"]["stale_run_days"]
    for s in symbols:
        b = md.bars(s, refresh=False).loc[: pd.Timestamp(snap["data_as_of"])]
        qr = check_bars(s, b)
        quality[s] = qr.to_dict()
        client_warnings.extend(f"{s}: {w}" for w in qr.client_warnings())
        if s.startswith("CSV:"):
            admin["notes"].append(f"{s}: CSV məlumatıdır; dividend düzəlişinin olub-olmadığı bəlli deyil.")
        recent_out = [d for d in qr.outlier_returns if pd.Timestamp(d) >= window_start]
        recent_split = [d for d in qr.suspected_unadjusted_splits if pd.Timestamp(d) >= window_start]
        if recent_out or recent_split or qr.non_positive_prices or qr.duplicate_dates or qr.longest_stale_run >= stale_days:
            issues.append(f"{s}: kənar gəlirlər {recent_out[:5]}, şübhəli split {recent_split[:5]}, "
                          f"sıfır/mənfi {qr.non_positive_prices}, dublikat {qr.duplicate_dates}, "
                          f"ən uzun dəyişməz {qr.longest_stale_run} gün")
    admin["data_quality"] = quality
    admin["quality_issues"] = issues
    if db is not None:
        admin["source_comparison"] = compare_sources_for(db, md, symbols, pd.Timestamp(snap["data_as_of"]))

    R, market = prepare_returns(pdata, md, cfg, symbols, base, admin)
    if len(R.dropna()) < 60:
        raise AnalysisError(L("Təhlil üçün kifayət qədər qiymət tarixçəsi yoxdur (ən azı 3 ay lazımdır).", "There is not enough price history for the analysis (at least 3 months are needed)."))
    lb_lags = tuple(cfg["validation"]["ljung_box_lags"])
    admin["returns_diagnostics"] = {s: return_diagnostics(R[s], alpha, lb_lags) for s in symbols}
    exchanges = {pdata.exchange_of.get(s) for s in symbols}
    if len(exchanges) > 1 and len(symbols) > 1:
        wk = np.log(pdata.prices_base[symbols].ffill().resample("W-FRI").last()).diff().dropna()
        Rc = R.dropna()
        admin["async_close_check"] = {
            "daily_corr_mean": float(np.mean(np.corrcoef(Rc.T.to_numpy())[np.triu_indices(len(symbols), 1)])),
            "weekly_corr_mean": float(np.mean(np.corrcoef(wk.T.to_numpy())[np.triu_indices(len(symbols), 1)])),
            "note": "Fərqli birjaların bağlanış saatları günlük korrelyasiyanı azalda bilər.",
        }

    progress("modeling", 0.35)
    fs = fit_system(R, cfg, full=True)
    models = fs.models
    # PROMPT.md 4.5: short history (EWMA) or an index proxy -> client reliability at most "low"
    cap_reasons = [f"{s}: tarixçə {cfg['model']['short_history_years']:g} ildən qısadır (EWMA)"
                   for s in fs.info["short_history_assets"]]
    cap_reasons += [f"{p['symbol']}: tarixçə 6 aydan qısadır (indeks proksisi)" for p in admin.get("proxies", [])]
    cap_reasons += [f"{s}: günlərin {z:.0%}-ində qiymət dəyişməyib (az ticarət) → EWMA"
                    for s, z in fs.info["illiquid_assets"].items()]
    admin["reliability_cap"] = "low" if cap_reasons else None
    admin["reliability_cap_reasons"] = cap_reasons
    admin["assets"] = {
        m.symbol: {"kind": m.kind, "dist": m.dist, "bic": m.bic, "aic": m.aic, "loglik": m.loglik,
                   "persistence": m.persistence, "half_life_days": m.half_life,
                   "long_run_ann_vol": float(np.sqrt(m.long_run_var * 252) / m.scale),
                   "candidates": m.candidates, **m.diagnostics}
        for m in models
    }
    admin["multivariate"] = multivariate_diagnostics(fs, alpha)

    # drift (CAPM) and zero-drift sensitivity
    mv0 = np.array([p["market_value_base"] for p in positions])
    main_ex, idx_ticker = drift_index(cfg, positions)
    mret = market.get(idx_ticker) if idx_ticker in market else _market_returns(md, idx_ticker, 1.0)
    rf = md.risk_free(base)
    from app.admin_settings import mrp_for

    mrp = mrp_for(None, base, cfg)  # cfg already carries the admin overrides frozen into the snapshot
    mu_daily, betas = capm_drift(R, mret, rf, mrp, models)
    admin["drift"] = {"rf": rf, "mrp": mrp, "index": idx_ticker, "betas": dict(zip(symbols, betas)),
                      "mu_daily": dict(zip(symbols, mu_daily.tolist()))}

    progress("simulation", 0.55)
    H = cfg["model"]["horizon_days"]
    as_of = R.index[-1].date()
    sessions = future_sessions(main_ex, as_of, H)
    cps = month_end_checkpoints(sessions)
    sell_idx = planned_sell_index(snap, positions, sessions, H)
    planned = planned_sells(snap)
    S = int(cfg["model"]["scenarios"])
    rng = np.random.default_rng(int(snap["seed"]))
    sim = simulate_paths(models, fs.corr, fs.pool_u, mu_daily, H, S, cfg["model"]["param_sets"], rng)
    qty = np.array([p["quantity"] for p in positions])
    cost = np.array([p["cost_base"] for p in positions])
    meas = compute_measures(sim.log_returns, mv0, cost, qty, snap["cash"], cps, cfg, cfg["model"]["sample_paths"], sell_idx)
    # adaptive S: relative MC error of VaR95/CVaR95 below target (PROMPT.md 6.7)
    target = cfg["model"]["mc_rel_error_target"]
    S_max = int(cfg["model"]["scenarios_max"])
    # ~4 float32 arrays of S x H x N live at once (returns, cumulative, position values, temporaries)
    mem_cap = int(float(cfg["model"].get("memory_budget_bytes", 1.2e9)) / (H * len(symbols) * 16))
    S_cap = min(S_max, mem_cap)
    # The batch-means SE is itself noisy (~16% relative with 20 batches), hence the safety margin and the loop.
    for k in range(3):
        e95 = meas["mc_error"]["0.95"]
        rel = max(e95.get("var_rel", 1), e95.get("cvar_rel", 1))
        if rel <= target or S >= S_cap:
            break
        S_new = int(min(S_cap, S * (rel / target) ** 2 * 1.25))
        if S_new <= S:
            break
        progress("simulation", 0.65)
        # only the missing scenarios are simulated (independent draws, own reproducible stream) and appended:
        # re-simulating all S_new paths repeated most of the work and made Generate 2-3x slower
        rng = np.random.default_rng([int(snap["seed"]), k + 1])
        extra = simulate_paths(models, fs.corr, fs.pool_u, mu_daily, H, S_new - S, cfg["model"]["param_sets"], rng)
        sim = SimOutput(np.concatenate([sim.log_returns, extra.log_returns]), np.concatenate([sim.param_set, extra.param_set]))
        del extra
        meas = compute_measures(sim.log_returns, mv0, cost, qty, snap["cash"], cps, cfg, cfg["model"]["sample_paths"], sell_idx)
        S = S_new
    # last line of defence: the bounds in simulate_paths should make this impossible; if it happens, name the
    # instrument instead of failing later with an opaque error
    bad = [names[i] for i in range(len(symbols)) if not np.isfinite(meas["_pnl_assets_end"][:, i]).all()]
    if bad or not np.isfinite(meas["_ret_H"]).all():
        raise AnalysisError(L(f"{', '.join(bad) or 'Portfel'}: model bu alətin qiymət tarixçəsi ilə sabit nəticə vermədi "
                              "(çox az ticarət və ya xətalı məlumat ola bilər). Alətin əsas birjadakı səhmini seçin və ya onu çıxarın.",
                              f"{', '.join(bad) or 'Portfolio'}: the model gave no stable result with this instrument's price "
                              "history (it may trade very rarely or have faulty data). Choose the listing on its main exchange "
                              "or remove it."))
    admin["mc"] = {"scenarios": S, "errors": meas["mc_error"], "target_rel": target,
                   "euler_sum": meas["euler_sum"], "cvar95_money": meas["risk"]["0.95"]["cvar_money"]}

    # parameter-uncertainty spread of VaR/CVaR (groups of parameter sets)
    groups = 10
    ret_H = meas["_ret_H"]
    gid = sim.param_set * groups // max(1, cfg["model"]["param_sets"])
    spread = {"var95": [], "cvar95": []}
    for g in range(groups):
        r_g = ret_H[gid == g]
        if len(r_g) > 200:
            v, c = var_cvar(r_g, 0.95)
            spread["var95"].append(v)
            spread["cvar95"].append(c)
    admin["param_uncertainty"] = {
        k: {"p05": float(np.quantile(v, 0.05)), "p95": float(np.quantile(v, 0.95))} for k, v in spread.items() if v
    }

    # zero-drift sensitivity (drift is additive in log space)
    steps = np.minimum(sell_idx + 1, H)  # days each position is held within the horizon
    ret0 = np.stack([sim.log_returns[:, :steps[i], i].sum(axis=1, dtype=np.float64) for i in range(len(symbols))], axis=1)         - steps[None, :] * mu_daily[None, :]
    V_end0 = (np.exp(ret0) * mv0).sum(axis=1) + snap["cash"]
    V0 = meas["V0"]
    v95_0, c95_0 = var_cvar(V_end0 / V0 - 1, 0.95)
    sensitivity = {
        "median_value": float(np.median(V_end0)),
        "prob_profit": float(np.mean(V_end0 > meas["cost_total"])),
        "var95_pct": v95_0, "cvar95_pct": c95_0,
    }

    # correlation & structure
    if len(symbols) > 1:
        Q =fs.corr.Q_next if fs.corr.kind == "DCC" else fs.corr.Qbar
        d = np.sqrt(np.diag(Q))
        Cnow = Q / np.outer(d, d)
        labels, order = clusters(Cnow, cfg["recommend"]["cluster_corr_threshold"])
    else:
        Cnow, labels, order = np.eye(1), [1], [0]
    weights = mv0 / mv0.sum()

    progress("stress", 0.8)
    stress = run_stress(pdata, md, cfg, symbols, names, mv0, R, mret, admin)

    # assemble client payload (no test statistics, p-values or model parameters)
    pnl_now = current_pnl(snap)
    # forecast P&L of every open purchase lot at the horizon: same scenarios, the lot's own cost basis
    pnl_end_assets = meas["_pnl_assets_end"]
    for i, row in enumerate(pnl_now["positions"]):
        if not qty[i]:
            continue
        end_px = (pnl_end_assets[:, i] + mv0[i]) / qty[i]  # base currency per share at the horizon
        for lot, src in zip(row["lots"], positions[i].get("lots", [])):
            lp = lot["quantity"] * (end_px - src["unit_cost_base"])
            q05, q50, q95 = (float(x) for x in np.quantile(lp, [0.05, 0.5, 0.95]))
            lot["forecast"] = {"median": q50, "p05": q05, "p95": q95, "prob_profit": float(np.mean(lp > 0))}
    assets_out = []
    for i, s in enumerate(symbols):
        a = meas["assets"][i]
        assets_out.append({
            "symbol": s, "investing_symbol": positions[i]["investing_symbol"], "name": names[i],
            "exchange": positions[i]["exchange"], "currency": positions[i]["currency"],
            "quantity": positions[i]["quantity"], "price0": a["price0"],
            "fx_to_base": positions[i]["fx_to_base"],
            "weight": a["weight"], "fan": a["fan"], "end": a["end"], "end_q": a["end_q"], "prob_up": a["prob_up"],
            "prob_profit": a["prob_profit"], "pnl_end": a["pnl_end"],
            "prob_break_even": a.get("prob_break_even"),
            "cvar_contribution": a["component_cvar95"],
            "cvar_share": a["component_cvar95"] / meas["euler_sum"] if meas["euler_sum"] else 0.0,
            "cluster": labels[i],
        })
    # past value of the current holdings (total-return prices); starts when every holding has a price
    hist_px = pdata.prices_base[symbols].ffill().loc[:as_of].dropna()
    hist_val = (hist_px.iloc[-cfg["model"]["history_days"]:] * pd.Series(qty, index=symbols)).sum(axis=1) + snap["cash"]
    ac = cfg["model"]["actual"]
    actual, P_hist = actual_measures(hist_px.iloc[-(max(ac["tail_days"], ac["vol_days"]) + H + 1):], qty, snap["cash"], H, ac)
    client = {
        "as_of": as_of.isoformat(),
        "horizon_end": sessions[-1].isoformat(),
        "horizon_days": H,
        "dates": [d.isoformat() for d in sessions],
        "checkpoint_dates": [sessions[i].isoformat() for i in cps],
        "base_currency": base,
        "current": pnl_now,
        "V0": V0,
        "cost_total": meas["cost_total"],
        "fan": meas["fan"],
        "percentiles": meas["percentiles"],
        "history": {"dates": [d.date().isoformat() for d in hist_val.index], "values": hist_val.round(2).tolist()},
        "sample_paths": meas["sample_paths"],
        "checkpoints": meas["checkpoints"],
        "risk": meas["risk"],
        "pnl_end": meas["pnl_end"],
        "histogram": meas["histogram"],
        "drawdown": meas["drawdown"],
        "actual": actual,
        "assets": assets_out,
        "correlation": {"symbols": [symbols[i] for i in order], "names": [names[i] for i in order],
                        "matrix": Cnow[np.ix_(order, order)].round(3).tolist()} if len(symbols) > 1 else None,
        "concentration": {"hhi": hhi(weights), "effective_n": 1 / hhi(weights)},
        "stress": [{k: v for k, v in sc.items()} for sc in stress],
        "sensitivity_zero_drift": sensitivity,
        "planned_sells": [
            {"symbol": symbols[i], "investing_symbol": positions[i]["investing_symbol"],
             "sell_on": sessions[int(sell_idx[i])].isoformat(),
             "overdue": planned[positions[i]["instrument_id"]] <= as_of,
             # median proceeds in base currency on the sale day
             "proceeds_median": float(np.median(np.exp(sim.log_returns[:, :int(sell_idx[i]) + 1, i].sum(axis=1)) * mv0[i]))}
            for i in range(len(symbols)) if sell_idx[i] < H
        ],
        "warnings": list(dict.fromkeys(client_warnings + md.messages)),
        "scenarios": S,
    }
    admin["notes"].extend(md.admin_notes)
    rec_ctx = {
        "symbols": symbols, "names": names, "qty": qty.tolist(), "mv": mv0.tolist(),
        "price": (mv0 / qty).tolist(), "pnl_assets": meas["_pnl_assets_end"], "V": V0,
        "clusters": labels, "stress": stress, "asset_end": [a["end"] for a in meas["assets"]],
        "sim_cum_end": None,
        "pnl_assets_hist": P_hist,  # today's holdings through the past 3-month periods (None: too little history)
    }
    # CIO / CRO views: finished in the worker once the portfolio's risk limit is known
    if len(symbols) > 1:
        d_l = np.sqrt(np.diag(fs.corr.Qbar))
        C_long = fs.corr.Qbar / np.outer(d_l, d_l)
    else:
        C_long = np.eye(1)
    rec_ctx["insight"] = collect_insights(
        models=models, R=R, mret=mret, corr_now=Cnow, corr_long=C_long, meas=meas, mv0=mv0, cash=snap["cash"],
        positions=positions, names=names, base=base, rf=rf, betas=betas, H=H, stress=stress,
        adv=[_avg_volume(md, s, cfg["insights"]["liquidity_adv_days"]) for s in symbols],
        effective_n=1 / hhi(weights))
    # target / stop-loss probabilities
    targets = []
    inst_ids = [p["instrument_id"] for p in positions]
    cum = np.exp(np.cumsum(sim.log_returns, axis=1, dtype=np.float32)) if snap.get("targets") else None
    for t in snap.get("targets", []):
        if t["instrument_id"] not in inst_ids:
            continue
        i = inst_ids.index(t["instrument_id"])
        fx = positions[i]["fx_to_base"]
        paths = cum[:, :, i] * meas["assets"][i]["price0"]
        item: dict[str, Any] = {"index": i, "target_price": t.get("target_price"), "stop_loss": t.get("stop_loss")}
        if t.get("target_price"):
            tb = t["target_price"] * fx
            item["prob_target"] = float(np.mean(paths[:, -1] >= tb))
            item["prob_touch_target"] = float(np.mean(paths.max(axis=1) >= tb))
        if t.get("stop_loss"):
            sb = t["stop_loss"] * fx
            item["stop_loss_base"] = sb
            item["prob_touch_stop"] = float(np.mean(paths.min(axis=1) <= sb))
        targets.append(item)
    rec_ctx["targets"] = targets
    client["targets"] = [{**{k: v for k, v in t.items() if k != "index"}, "symbol": symbols[t["index"]]} for t in targets]
    progress("recommendations", 0.9)
    return client, admin, rec_ctx


def run_stress(pdata: PortfolioData, md: MarketData, cfg: dict[str, Any], symbols: list[str], names: list[str],
               mv0: np.ndarray, R: pd.DataFrame, mret: pd.Series | None, admin: dict[str, Any]) -> list[dict[str, Any]]:
    """Historical episodes and hypothetical factor shocks (PROMPT.md 5.5). Scenarios, not probabilities."""
    out = []
    V0 = float(mv0.sum() + pdata.snapshot["cash"])
    px_all = pdata.prices_base
    betas_mkt = {s: capm_beta(R[s], mret)[0] for s in symbols} if mret is not None else {}
    skipped = []

    def result(sc: dict[str, Any], kind: str, by: list[dict[str, Any]], **extra: Any) -> dict[str, Any]:
        tot = sum(-b["loss_money"] for b in by)
        return {"name": stress_name(sc["name"]), "type": kind, "group": stress_group(sc.get("group", "")),
                "pnl_money": tot, "loss_money": -tot,
                "loss_pct": -tot / V0, "by_asset": by, **extra}

    # historical episodes: actual returns where the holding existed, else beta x the index move (compounded)
    for sc in cfg["stress"]["historical"]:
        start, end = pd.Timestamp(sc["start"]), pd.Timestamp(sc["end"])
        mkt_move = None
        if mret is not None and len(mret) and mret.index[0] <= start:
            mkt_move = float(mret[(mret.index > start) & (mret.index <= end)].sum())  # log move after the start close
        by, method, actual_mv = [], [], 0.0
        for i, s in enumerate(symbols):
            ser = px_all[s].dropna()
            if len(ser) and ser.index[0] <= start and ser.index[-1] >= end:
                r = float(ser.loc[:end].iloc[-1] / ser.loc[:start].iloc[-1] - 1)
                method.append("actual")
                actual_mv += mv0[i]
            elif mkt_move is not None and s in betas_mkt:
                r = float(np.exp(betas_mkt[s] * mkt_move) - 1)
                method.append("beta")
            else:
                r = float("nan")
                method.append("n/a")
            by.append({"symbol": s, "name": names[i], "return": r, "loss_money": -r * mv0[i] if np.isfinite(r) else 0.0})
        if all(m == "n/a" for m in method):
            skipped.append(sc["name"])
            continue
        out.append(result(sc, "historical", by, method=method, period=f"{sc['start']} – {sc['end']}",
                          coverage=actual_mv / mv0.sum() if mv0.sum() else 0.0,
                          incomplete=any(m == "n/a" for m in method)))

    # hypothetical factor shocks: multi-factor betas on the estimation window
    level = set(cfg["data"].get("level_factors", []))
    factors: dict[str, pd.Series] = {}
    if mret is not None:
        factors["market"] = mret
    for name, tk in cfg["data"]["factor_tickers"].items():
        try:
            c = md.bars(tk)["close"].astype(float)
            c = c[c > 0] if name not in level else c
            factors[name] = c.diff().dropna() if name in level else np.log(c / c.shift(1)).dropna()
        except Exception as exc:  # noqa: BLE001
            md.messages_admin(f"Faktor {tk} alınmadı: {exc}")
    if factors:
        F = pd.DataFrame(factors)
        fits = {s: multifactor(R[s], F) for s in symbols}
        admin["stress_factor_models"] = fits
        for sc in cfg["stress"]["hypothetical"]:
            shocks = sc.get("shocks") or {sc["factor"]: sc["shock"]}
            if any(f not in factors for f in shocks):
                skipped.append(sc["name"])
                continue
            # factor move in model units: level factors as given, return factors as log(1 + shock)
            move = {f: (v if f in level else float(np.log1p(v))) for f, v in shocks.items()}
            by = []
            for i, s in enumerate(symbols):
                b = fits[s]["betas"]
                if not b:
                    r = float("nan")
                else:
                    r = float(np.expm1(sum(b.get(f, 0.0) * x for f, x in move.items())))
                by.append({"symbol": s, "name": names[i], "return": r,
                           "loss_money": -r * mv0[i] if np.isfinite(r) else 0.0})
            out.append(result(sc, "hypothetical", by, shocks=shocks))
    if skipped:
        admin["notes"].append(f"Stress: məlumat çatmadığı üçün buraxılan ssenarilər: {', '.join(skipped)}")
    out.sort(key=lambda x: -x["loss_money"])
    return out
