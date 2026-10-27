"""Method checks on synthetic data with known parameters (PROMPT.md 6.9).

Run the full study:  python -m validation.synthetic  (cwd = backend)
"""
from __future__ import annotations

import json
import sys
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

from risk.dcc import fit_dcc
from risk.garch import select_garch
from risk.simulate import build_pool, simulate_paths
from validation import stat_tests as st

TRUE_GJR = {"omega": 0.02, "alpha": 0.04, "gamma": 0.10, "beta": 0.88}  # in percent^2 units


def simulate_gjr(T: int, rng: np.random.Generator, p: dict[str, float] = TRUE_GJR, nu: float = 7.0,
                 burn: int = 500) -> np.ndarray:
    """Daily log returns (unscaled) from GJR-GARCH(1,1) with standardized Student-t shocks."""
    w, a, g, b = p["omega"], p["alpha"], p["gamma"], p["beta"]
    s2 = w / (1 - a - b - g / 2)
    out = np.empty(T + burn)
    zs = rng.standard_t(nu, T + burn) / np.sqrt(nu / (nu - 2))
    for t in range(T + burn):
        e = np.sqrt(s2) * zs[t]
        out[t] = e
        s2 = w + (a + g * (e < 0)) * e * e + b * s2
    return out[burn:] / 100.0


def simulate_dcc(T: int, N: int, A: float, B: float, rng: np.random.Generator, rho: float = 0.5) -> np.ndarray:
    Qbar = np.full((N, N), rho) + (1 - rho) * np.eye(N)
    Q = Qbar.copy()
    out = np.empty((T, N))
    for t in range(T):
        d = np.sqrt(np.diag(Q))
        R = Q / np.outer(d, d)
        z = np.linalg.cholesky(R) @ rng.standard_normal(N)
        out[t] = z
        Q = (1 - A - B) * Qbar + A * np.outer(z, z) + B * Q
    return out


def _cfg(dists=("t",), vols=("GJR",)) -> dict[str, Any]:
    from app.config import get_settings

    c = json.loads(json.dumps(get_settings().raw))
    c["model"]["garch"]["vol_models"] = list(vols)
    c["model"]["garch"]["dists"] = list(dists)
    return c


def parameter_recovery(reps: int, T: int, seed: int = 1) -> dict[str, Any]:
    rng = np.random.default_rng(seed)
    cfg = _cfg()
    est = {k: [] for k in TRUE_GJR}
    for _ in range(reps):
        r = pd.Series(simulate_gjr(T, rng), index=pd.bdate_range("2000-01-03", periods=T))
        m = select_garch("SYN", r, cfg, full_diagnostics=False)
        if m.kind != "GJR":
            continue
        for k in TRUE_GJR:
            est[k].append(m.params[k])
    out = {}
    for k, v in est.items():
        v = np.asarray(v)
        out[k] = {"true": TRUE_GJR[k], "mean": float(v.mean()), "bias": float(v.mean() - TRUE_GJR[k]),
                  "rmse": float(np.sqrt(np.mean((v - TRUE_GJR[k]) ** 2))), "n": int(len(v))}
    return out


def coverage_study(reps: int, T: int = 1260, H: int = 63, S: int = 1000, K: int = 200, seed: int = 21) -> dict[str, Any]:
    """Fit on T days (default: the 5-year production window), simulate the H-day distribution with FHS and
    parameter uncertainty, and compare with a fresh realization of the true process."""
    rng = np.random.default_rng(seed)
    cfg = _cfg()
    inside = {0.5: [], 0.9: []}
    pits = []
    for _ in range(reps):
        full = simulate_gjr(T + H, rng)
        r = pd.Series(full[:T], index=pd.bdate_range("2000-01-03", periods=T))
        m = select_garch("SYN", r, cfg, full_diagnostics=False)
        from risk.dcc import CorrModel

        corr = CorrModel("UNIVARIATE", np.eye(1))
        pool = build_pool([m], corr)
        sim = simulate_paths([m], corr, pool, np.array([m.mu / m.scale]), H, S, K, rng)
        end = sim.log_returns[:, :, 0].sum(axis=1)
        realized = full[T:].sum()
        pits.append(float(np.mean(end <= realized)))
        for lv in inside:
            lo, hi = np.quantile(end, [(1 - lv) / 2, (1 + lv) / 2])
            inside[lv].append(int(lo <= realized <= hi))
    out: dict[str, Any] = {}
    for lv, v in inside.items():
        n = len(v)
        k = int(sum(v))
        ci = stats.binomtest(k, n).proportion_ci(0.95)
        out[str(lv)] = {"coverage": k / n, "n": n, "ci": [ci.low, ci.high], "nominal_in_ci": ci.low <= lv <= ci.high}
    out["pit_ks_p"] = float(stats.kstest(pits, "uniform").pvalue)
    return out


def size_and_power(n: int = 500, reps: int = 2000, seed: int = 3) -> dict[str, Any]:
    rng = np.random.default_rng(seed)
    res = {}
    for name, p_true in (("size_99", 0.01), ("power_99_vs_2pct", 0.02), ("size_95", 0.05), ("power_95_vs_8pct", 0.08)):
        p0 = 0.01 if "99" in name else 0.05
        rej_k = rej_c = 0
        for _ in range(reps):
            h = (rng.random(n) < p_true).astype(int)
            rej_k += (st.kupiec_pof(h, p0).p_value or 1) < 0.05
            rej_c += (st.christoffersen(h, p0)[1].p_value or 1) < 0.05
        res[name] = {"kupiec": rej_k / reps, "christoffersen_cc": rej_c / reps}
    bk = 0
    for _ in range(500):
        bk += (st.berkowitz(rng.random(250)).p_value or 1) < 0.05
    res["size_berkowitz"] = bk / 500
    return res


def dcc_recovery(T: int = 2000, seed: int = 4) -> dict[str, float]:
    z = simulate_dcc(T, 3, 0.05, 0.90, np.random.default_rng(seed))
    m = fit_dcc(z)
    return {"A_true": 0.05, "B_true": 0.90, "A_hat": m.A, "B_hat": m.B,
            "es_p": st.engle_sheppard(z, 5).p_value}


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    full = "--full" in sys.argv
    report = {
        "parameter_recovery": parameter_recovery(50 if full else 10, 2500),
        "dcc_recovery": dcc_recovery(),
        "size_and_power": size_and_power(reps=2000 if full else 500),
        "coverage": coverage_study(300 if full else 60),
    }
    print(json.dumps(report, indent=1))
