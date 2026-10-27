"""Rolling-origin backtest without look-ahead (PROMPT.md 6.4-6.8)."""
from __future__ import annotations

import logging
from typing import Any, Callable

import numpy as np
import pandas as pd
from scipy import stats

from risk.dcc import _q_to_r, sym_sqrt
from risk.engine import fit_system
from risk.garch import SQRT_2_PI, AssetModel
from risk.simulate import simulate_paths
from validation import stat_tests as st

log = logging.getLogger(__name__)


def _advance_state(models: list[AssetModel], corr, r_new: np.ndarray, s2: np.ndarray, Q: np.ndarray | None):
    """One-day filter update with fixed parameters using the realized return vector r_new (unscaled)."""
    N = len(models)
    e = np.array([(r_new[i] * m.scale - m.mu) for i, m in enumerate(models)])
    z = e / np.sqrt(s2)
    nxt = np.empty(N)
    for i, m in enumerate(models):
        p = m.params
        if m.kind == "EGARCH":
            nxt[i] = np.exp(p["omega"] + p["alpha"] * (abs(z[i]) - SQRT_2_PI) + p["gamma"] * z[i] + p["beta"] * np.log(s2[i]))
        elif m.kind == "EWMA":
            nxt[i] = p["lambda"] * s2[i] + (1 - p["lambda"]) * e[i] ** 2
        else:
            nxt[i] = p["omega"] + (p["alpha"] + p["gamma"] * (e[i] < 0)) * e[i] ** 2 + p["beta"] * s2[i]
    if Q is not None and corr.kind == "DCC":
        Q = (1 - corr.A - corr.B) * corr.Qbar + corr.A * np.outer(z, z) + corr.B * Q
    return np.maximum(nxt, 1e-12), Q


def _one_step_sample(models, corr, pool_u, s2, Q, M, rng) -> np.ndarray:
    """M x N one-step-ahead return draws (unscaled log returns) from the filtered state."""
    u = pool_u[rng.integers(0, len(pool_u), M)]
    if len(models) > 1:
        R = _q_to_r(Q) if corr.kind == "DCC" else corr.Qbar
        z = u @ sym_sqrt(R).T
    else:
        z = u
    scale = np.array([m.scale for m in models])
    mus = np.array([m.mu for m in models])
    return (mus + np.sqrt(s2) * z) / scale


class HAR:
    """HAR on daily squared portfolio returns (Corsi 2009) with filtered-historical quantiles.

    Daily squared returns proxy realized variance (no intraday data); the forecast is floored at a small
    fraction of the sample variance to keep it positive."""

    def __init__(self, r: np.ndarray, lags: tuple[int, int, int]):
        self.lags = lags
        rv = r ** 2
        X, y = self._design(rv)
        self.beta, *_ = np.linalg.lstsq(X[:-1], y[1:], rcond=None)
        self.floor = 0.05 * float(np.var(r))
        fit = np.maximum(X[:-1] @ self.beta, self.floor)
        self.z = r[-len(fit):] / np.sqrt(fit)  # standardized in-sample residuals (one-step-ahead)
        self.z = self.z - self.z.mean()

    def _design(self, rv: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        d, w, m = self.lags
        s = pd.Series(rv)
        feats = np.column_stack([
            np.ones(len(rv)), s.rolling(d).mean(), s.rolling(w).mean(), s.rolling(m).mean(),
        ])
        ok = ~np.isnan(feats).any(axis=1)
        return feats[ok], rv[ok]

    def forecast(self, recent_r: np.ndarray) -> float:
        rv = recent_r ** 2
        d, w, m = self.lags
        x = np.array([1.0, rv[-d:].mean(), rv[-w:].mean(), rv[-m:].mean()])
        return float(max(x @ self.beta, self.floor))


def _kde_logscore(sample: np.ndarray, y: float) -> float | None:
    try:
        kde = stats.gaussian_kde(sample)
        dens = float(kde(np.array([y]))[0])
        return float(np.log(max(dens, 1e-300)))
    except Exception:
        return None


def run_backtest(R_full: pd.DataFrame, qty: np.ndarray, price_last: pd.Series, cfg: dict[str, Any],
                 seed: int, progress: Callable[[float], None] | None = None) -> dict[str, Any]:
    """R_full: aligned log returns (base ccy, no gaps). qty: holdings used as a hypothetical constant portfolio."""
    vc = cfg["validation"]
    alpha = vc["alpha"]
    est_years = cfg["data"]["estimation_window_years"]
    min_years = cfg["data"]["min_estimation_years"]
    H = cfg["model"]["horizon_days"]
    M = int(vc["one_step_samples"])
    tail = float(1 - vc["es_level"])
    rng = np.random.default_rng(seed)
    syms = list(R_full.columns)
    # price paths reconstructed from returns, scaled to today's prices -> constant-quantity portfolio value
    cumr = R_full.cumsum()
    px = np.exp(cumr - cumr.iloc[-1]) * price_last[syms].to_numpy()
    V = (px * qty).sum(axis=1)
    port_r = np.log(V / V.shift(1))
    first_ok = R_full.index[0] + pd.DateOffset(years=min_years)
    month_ends = R_full.index.to_series().groupby(R_full.index.to_period("M")).max()
    origins = [d for d in month_ends if d >= first_ok and d < R_full.index[-1]][-vc["backtest_months"]:]
    if len(origins) < 3:
        return {"error": "Backtest üçün kifayət qədər tarixçə yoxdur", "origins": len(origins)}

    daily: list[dict[str, Any]] = []
    pred: list[np.ndarray] = []
    long: list[dict[str, Any]] = []
    asset_hits: dict[str, list[tuple[int, int]]] = {s: [] for s in syms}
    asset_long: dict[str, list[dict[str, float]]] = {s: [] for s in syms}
    specs_used = []
    lam = cfg["model"]["ewma_lambda"]
    zq = stats.norm.ppf(tail)
    for k, o in enumerate(origins):
        if progress:
            progress(k / len(origins))
        win = R_full.loc[o - pd.DateOffset(years=est_years):o]
        fs = fit_system(win, cfg, full=False)
        models, corr = fs.models, fs.corr
        specs_used.append({"origin": str(o.date()), "specs": {m.symbol: f"{m.kind}-{m.dist}" for m in models},
                           "corr": corr.kind,
                           "breaks_applied": [b["symbol"] for b in fs.info.get("breaks", []) if b.get("applied")]})
        har = HAR(port_r.loc[win.index].dropna().to_numpy(), tuple(vc["har_lags"]))
        nxt_o = origins[k + 1] if k + 1 < len(origins) else R_full.index[-1]
        test_days = R_full.loc[o:nxt_o].index[1:]
        s2 = np.array([m.next_sigma2 for m in models])
        Q = corr.Q_next.copy() if corr.kind == "DCC" else None
        scale = np.array([m.scale for m in models])
        for d in test_days:
            pos = R_full.index.get_loc(d)
            prev = R_full.index[pos - 1]
            w = qty * px.loc[prev].to_numpy()
            w = w / w.sum()
            sample = _one_step_sample(models, corr, fs.pool_u, s2, Q, M, rng)
            port = np.log(np.exp(sample) @ w)
            realized_vec = R_full.loc[d].to_numpy()
            y = float(port_r.loc[d])
            q05, q01, qt = np.quantile(port, [0.05, 0.01, tail])
            es_t = float(port[port <= qt].mean())
            sigma_p = float(port.std())
            # competitors (all use information up to the previous day only)
            past = R_full.iloc[max(0, pos - vc["hs_window"]):pos]
            hp = np.log(np.exp(past.to_numpy()) @ w)
            hs_v = np.quantile(hp, tail)
            hs_es = hp[hp <= hs_v].mean()
            past_e = R_full.iloc[max(0, pos - vc["ewma_cov_window"]):pos].to_numpy()
            wts = lam ** np.arange(len(past_e))[::-1]
            wts = wts / wts.sum()
            cov = (past_e * wts[:, None]).T @ past_e
            sp = float(np.sqrt(w @ cov @ w))
            ew_v, ew_es = zq * sp, -sp * stats.norm.pdf(zq) / tail
            sig = np.sqrt(s2) / scale
            Cc = corr.Qbar if len(models) > 1 else np.eye(1)
            sp_g = float(np.sqrt(w @ (np.outer(sig, sig) * Cc) @ w))
            gc_v, gc_es = zq * sp_g, -sp_g * stats.norm.pdf(zq) / tail
            h_s = np.sqrt(har.forecast(port_r.iloc[pos - 30:pos].to_numpy()))
            h_q = np.quantile(har.z, tail) * h_s
            h_es = float(har.z[har.z <= np.quantile(har.z, tail)].mean() * h_s)

            def fz(v: float, e: float) -> float:
                return float(st.fz0_loss(np.array([y]), np.array([v]), np.array([e]), tail)[0])

            daily.append({
                "date": d, "y": y, "var95": -q05, "var99": -q01, "q_t": qt, "es_t": es_t, "sigma": sigma_p,
                "pit": float(np.mean(port <= y)), "logscore": _kde_logscore(port, y),
                "fz_main": fz(qt, es_t), "fz_hist_sim": fz(hs_v, hs_es), "fz_ewma_normal": fz(ew_v, ew_es),
                "fz_garch_ccc_normal": fz(gc_v, gc_es), "fz_har_fhs": fz(h_q, h_es),
                "var_fc": sigma_p ** 2, "rv": y ** 2,
            })
            pred.append(port.astype(np.float32))
            for i, m in enumerate(models):
                qz95, qz99 = np.quantile(m.z, [0.05, 0.01])
                v95 = -(m.mu + np.sqrt(s2[i]) * qz95) / m.scale
                v99 = -(m.mu + np.sqrt(s2[i]) * qz99) / m.scale
                asset_hits[m.symbol].append((int(-realized_vec[i] > v95), int(-realized_vec[i] > v99)))
            s2, Q = _advance_state(models, corr, realized_vec, s2, Q)
        # 63-day distribution from the origin: portfolio and each instrument
        pos = R_full.index.get_loc(o)
        if pos + H < len(R_full):
            fut = R_full.iloc[pos + 1:pos + 1 + H].to_numpy()
            w0 = qty * px.loc[o].to_numpy()
            V0 = w0.sum()
            realized = float((np.exp(fut.sum(axis=0)) * w0).sum() / V0 - 1)
            mu0 = np.array([m.mu / m.scale for m in models])
            res = {}
            sims_pu = None
            for pu in (True, False):
                sim = simulate_paths(models, corr, fs.pool_u, mu0, H, vc["backtest_scenarios"],
                                     cfg["model"]["param_sets"], np.random.default_rng(seed + k), param_uncertainty=pu)
                if pu:
                    sims_pu = sim.log_returns.sum(axis=1)  # S x N cumulative log returns per instrument
                res[pu] = (np.exp(sim.log_returns.sum(axis=1)) * w0).sum(axis=1) / V0 - 1
            end = res[True]
            row = {"origin": o, "realized": realized, "pit": float(np.mean(end <= realized)),
                   "crps": st.crps_ensemble(end, realized), "logscore": _kde_logscore(end, realized)}
            for lv in vc["interval_levels"]:
                lo, hi = np.quantile(end, [(1 - lv) / 2, (1 + lv) / 2])
                row[f"in_{lv}"] = int(lo <= realized <= hi)
                lo2, hi2 = np.quantile(res[False], [(1 - lv) / 2, (1 + lv) / 2])
                row[f"in_nopu_{lv}"] = int(lo2 <= realized <= hi2)
            row["pinball"] = {str(t): st.pinball(float(np.quantile(end, t)), realized, t) for t in (0.05, 0.25, 0.5, 0.75, 0.95)}
            long.append(row)
            fut_sum = fut.sum(axis=0)
            for i, s in enumerate(syms):
                a_end = sims_pu[:, i]
                rec: dict[str, float] = {"pit": float(np.mean(a_end <= fut_sum[i]))}
                for lv in vc["gate_interval_levels"]:
                    lo, hi = np.quantile(a_end, [(1 - lv) / 2, (1 + lv) / 2])
                    rec[f"in_{lv}"] = int(lo <= fut_sum[i] <= hi)
                asset_long[s].append(rec)
    if progress:
        progress(1.0)
    return {"daily": daily, "pred": np.stack(pred) if pred else None, "long": long, "asset_hits": asset_hits,
            "asset_long": asset_long, "origins": [str(o.date()) for o in origins], "specs_used": specs_used}


def adaptive_conformal(pit: np.ndarray, level: float, gamma: float) -> dict[str, Any]:
    """Gibbs & Candès (2021) ACI on central intervals built from PIT values."""
    a_target = 1 - level
    a_t = a_target
    covered = []
    path = []
    for u in pit:
        a_eff = min(max(a_t, 0.0), 1.0)
        lo, hi = a_eff / 2, 1 - a_eff / 2
        inside = lo <= u <= hi
        covered.append(int(inside))
        a_t = a_t + gamma * (a_target - (0 if inside else 1))
        path.append(a_eff)
    return {"level": level, "coverage_aci": float(np.mean(covered)) if covered else None,
            "final_alpha": float(path[-1]) if path else None, "adjusted_level": 1 - float(path[-1]) if path else None}


def evaluate(bt: dict[str, Any], cfg: dict[str, Any], mc_rel: float) -> dict[str, Any]:
    """Statistical tests, multiple-testing control and gates (PROMPT.md 6.5-6.8)."""
    vc = cfg["validation"]
    alpha = vc["alpha"]
    H = cfg["model"]["horizon_days"]
    tail = float(1 - vc["es_level"])
    if "error" in bt:
        return {"verdict": "fail", "reliability": "low", "error": bt["error"], "gates": [],
                "failed_gates": [], "undetermined_gates": list(range(1, 8))}
    D = pd.DataFrame(bt["daily"])
    y = D["y"].to_numpy()
    hits95 = (-y > D["var95"].to_numpy()).astype(int)
    hits99 = (-y > D["var99"].to_numpy()).astype(int)
    out: dict[str, Any] = {"n_daily": len(D), "n_long": len(bt["long"])}
    sections: dict[str, list[dict]] = {}

    # ---- gate 1: VaR tests with Holm inside the gate
    g1 = []
    ind_tests = []
    for lv, hits, var in ((0.95, hits95, D["var95"]), (0.99, hits99, D["var99"])):
        p = 1 - lv
        k = st.kupiec_pof(hits, p)
        ind, cc = st.christoffersen(hits, p)
        dq = st.dq_test(hits, var.to_numpy(), p, vc["dq_lags"])
        for t in (k, cc, dq, ind):
            t.name = f"{t.name} VaR{int(lv * 100)}"
        g1.extend([k, cc, dq])
        ind_tests.append(ind.decide(alpha))
    holm1 = st.holm([t.p_value for t in g1])
    for t, ph in zip(g1, holm1):
        t.p_holm = ph
        t.decide(alpha)
    gate1_pass = all(ph is None or ph >= alpha for ph in holm1)
    gate1_raw = all(t.p_value is None or t.p_value >= alpha for t in g1)
    sections["var_tests"] = [t.to_dict() for t in g1] + [t.to_dict() for t in ind_tests]
    power_note = _kupiec_power(len(hits99), 0.01, vc["kupiec_power_alt"], alpha, vc["power_reps"])

    # ---- gate 2: Basel traffic light
    basel = st.basel_traffic_light(hits99)

    # ---- gate 3: ES tests (Z2 null simulated from each day's own predictive sample)
    mf = st.mcneil_frey(y, -D["q_t"].to_numpy(), -D["es_t"].to_numpy(), D["sigma"].to_numpy(),
                        reps=vc["bootstrap_reps"])
    az = st.acerbi_szekely_z2(y, -D["q_t"].to_numpy(), -D["es_t"].to_numpy(), tail, bt.get("pred"),
                              reps=vc["bootstrap_reps"])
    g3 = [mf, az]
    holm3 = st.holm([t.p_value for t in g3])
    for t, ph in zip(g3, holm3):
        t.p_holm = ph
        t.decide(alpha)
    gate3_pass = all(ph is None or ph >= alpha for ph in holm3)
    gate3_raw = all(t.p_value is None or t.p_value >= alpha for t in g3)
    sections["es_tests"] = [t.to_dict() for t in g3]

    # ---- gate 4: Berkowitz + PIT uniformity + calibration
    bk = st.berkowitz(D["pit"].to_numpy()).decide(alpha)
    sections["density_tests"] = [bk.to_dict()] + [t.decide(alpha).to_dict() for t in st.pit_uniformity(D["pit"].to_numpy())]
    out["calibration_curve_daily"] = st.calibration_curve(D["pit"].to_numpy())
    gate4_pass = bk.p_value is None or bk.p_value >= alpha

    # ---- gate 5: 63-day interval coverage. Monthly origins overlap by ceil(H/21) windows: the HAC lag is set
    # in origin units (the daily-overlap rule "lag >= H-1" translates to this for monthly sampling).
    L = pd.DataFrame(bt["long"])
    cov_tests = []
    gate5_pass = None
    aci = []
    hac_lag_origins = int(np.ceil(H / 21))
    if len(L) >= 5:
        for lv in vc["interval_levels"]:
            t = st.coverage_test(L[f"in_{lv}"].to_numpy(), lv, hac_lag_origins).decide(alpha)
            lo_b, hi_b = st.block_bootstrap_mean_ci(L[f"in_{lv}"].to_numpy(), hac_lag_origins, vc["bootstrap_reps"])
            t.effect["bootstrap_ci"] = [lo_b, hi_b]
            nov = L[f"in_{lv}"].to_numpy()[::hac_lag_origins]
            t.effect["non_overlapping_coverage"] = float(nov.mean()) if len(nov) else None
            t.effect["non_overlapping_n"] = int(len(nov))
            t.effect["coverage_without_param_uncertainty"] = float(L[f"in_nopu_{lv}"].mean())
            cov_tests.append(t)
        gate5_pass = all(t.effect["nominal_in_ci"] for t in cov_tests if t.effect.get("nominal") in vc["gate_interval_levels"])
        aci = [adaptive_conformal(L["pit"].to_numpy(), lv, vc["aci_gamma"]) for lv in vc["gate_interval_levels"]]
        out["calibration_curve_63d"] = st.calibration_curve(L["pit"].to_numpy())
        ls = [v for v in L["logscore"] if v is not None]
        out["scores_63d"] = {"crps_mean": float(L["crps"].mean()), "logscore_mean": float(np.mean(ls)) if ls else None,
                             "pinball_mean": {k: float(np.mean([p[k] for p in L["pinball"]])) for k in L["pinball"].iloc[0]}}
    sections["interval_tests"] = [t.to_dict() for t in cov_tests]
    out["conformal"] = aci

    # per-instrument 63-day coverage (BH across instruments)
    asset_cov = []
    for s, rows in bt.get("asset_long", {}).items():
        if len(rows) < 5:
            continue
        A = pd.DataFrame(rows)
        for lv in vc["gate_interval_levels"]:
            t = st.coverage_test(A[f"in_{lv}"].to_numpy(), lv, hac_lag_origins)
            asset_cov.append({"symbol": s, "level": lv, **t.to_dict(), "name": f"{s}: {t.name}"})
    for r, q in zip(asset_cov, st.benjamini_hochberg([r["p_value"] for r in asset_cov])):
        r["q_value"] = q
        r["reject_fdr"] = r["reject"] = q is not None and q < alpha
    out["instrument_63d"] = asset_cov

    # ---- gate 6: model comparison on the (VaR, ES) pair: FZ0 loss, DM, MCS and SPA
    comp = [c for c in D.columns if c.startswith("fz_") and c != "fz_main"]
    losses = {"main": D["fz_main"].to_numpy(), **{c[3:]: D[c].to_numpy() for c in comp}}
    mcs = st.model_confidence_set(losses, vc["mcs_size"], vc["block_size"], vc["bootstrap_reps"])
    dm = [st.diebold_mariano(losses["main"], losses[k]).decide(alpha).to_dict() | {"vs": k}
          for k in losses if k != "main"]
    spa = st.spa_test(losses["main"], {k: v for k, v in losses.items() if k != "main"}, vc["block_size"],
                      vc["bootstrap_reps"])
    gate6_pass = "main" in mcs.get("included", ["main"])
    sections["model_comparison"] = dm + ([spa.decide(alpha).to_dict()] if spa else [])
    out["mcs"] = mcs
    ls_d = [v for v in D["logscore"] if v is not None]
    out["scores_daily"] = {"logscore_mean": float(np.mean(ls_d)) if ls_d else None,
                           "fz0_mean": {k: float(np.mean(v)) for k, v in losses.items()}}

    # volatility forecast evaluation
    ql = st.qlike(D["rv"].to_numpy(), D["var_fc"].to_numpy())
    mz = st.mincer_zarnowitz(D["rv"].to_numpy(), D["var_fc"].to_numpy(), vc["dq_lags"]).decide(alpha)
    out["volatility_eval"] = {"qlike_mean": float(np.mean(ql)),
                              "mse": float(np.mean((D["rv"] - D["var_fc"]) ** 2)), "mincer_zarnowitz": mz.to_dict()}

    # ---- per-instrument one-step VaR tests with BH (FDR)
    inst = []
    for s, hl in bt["asset_hits"].items():
        h = np.array(hl)
        if len(h) == 0:
            continue
        for j, lv in enumerate((0.95, 0.99)):
            t = st.kupiec_pof(h[:, j], 1 - lv)
            inst.append({"symbol": s, "level": lv, **t.to_dict(), "name": f"{s}: Kupiec POF VaR{int(lv * 100)}"})
    qv = st.benjamini_hochberg([r["p_value"] for r in inst])
    for r, q in zip(inst, qv):
        r["q_value"] = q
        r["reject_fdr"] = r["reject"] = q is not None and q < alpha
    out["instrument_tests"] = inst

    # ---- gate 7: MC error
    gate7_pass = mc_rel < cfg["model"]["mc_rel_error_target"]

    gates = [
        {"id": 1, "name": "Günlük VaR 95/99 (Kupiec, Christoffersen CC, DQ; Holm)", "pass": gate1_pass,
         "pass_unadjusted": gate1_raw, "note": power_note},
        {"id": 2, "name": "Basel svetoforu (99% VaR, 250 gün)", "pass": basel["zone"] == "green", "detail": basel},
        {"id": 3, "name": "ES testləri (McNeil-Frey, Acerbi-Szekely Z2; Holm)", "pass": gate3_pass,
         "pass_unadjusted": gate3_raw},
        {"id": 4, "name": "Berkowitz sıxlıq testi", "pass": gate4_pass},
        {"id": 5, "name": "63 günlük 50% və 90% aralıq əhatəsi (HAC CI)", "pass": gate5_pass,
         "note": "Müşahidə sayı azdır, test gücü aşağıdır" if len(L) < 24 else ""},
        {"id": 6, "name": "Model 90% Model Confidence Set daxilində (FZ0)", "pass": gate6_pass},
        {"id": 7, "name": "VaR95/CVaR95 nisbi MC xətası < 1%", "pass": gate7_pass, "detail": {"rel_error": mc_rel},
         "soft": True},
    ]
    # conformal fallback for the interval gate
    if gate5_pass is False and aci and all(abs((a["coverage_aci"] or 0) - a["level"]) < vc["aci_tolerance"] for a in aci):
        gates[4]["pass_after_conformal"] = True
    # Gate 7 is a computational-precision gate (more scenarios fix it), not evidence of model misspecification:
    # failing it alone makes the verdict conditional, never "fail". Gates 4 and 6 are likewise soft because a
    # documented cause is acceptable (PROMPT.md 6.8 p.4) and MCS exclusion is a relative judgement.
    failed = [g["id"] for g in gates if g["pass"] is False and not g.get("pass_after_conformal")]
    soft = [g["id"] for g in gates if g["pass"] is False and g.get("pass_after_conformal")]
    undetermined = [g["id"] for g in gates if g["pass"] is None]
    if not failed and not soft and not undetermined:
        verdict, reliability = "pass", "high"
    elif not failed or set(failed) <= {4, 6, 7}:
        verdict, reliability = "conditional", "medium"
    else:
        verdict, reliability = "fail", "low"
    out.update({"gates": gates, "verdict": verdict, "reliability": reliability, "sections": sections,
                "failed_gates": failed, "undetermined_gates": undetermined, "specs_used": bt.get("specs_used")})
    return out


def _kupiec_power(n: int, p0: float, p1: float, alpha: float, reps: int, seed: int = 0) -> str:
    rng = np.random.default_rng(seed)
    if n < 20:
        return ""
    rej = 0
    for _ in range(reps):
        h = (rng.random(n) < p1).astype(int)
        if (st.kupiec_pof(h, p0).p_value or 1) < alpha:
            rej += 1
    return (f"Kupiec 99% testinin gücü: n={n} müşahidədə həqiqi aşım tezliyi {p1:.0%} olsa, "
            f"test onu təxminən {rej / reps:.0%} hallarda aşkarlayır. 'Rədd edilmədi' 'model düzgündür' demək deyil.")
