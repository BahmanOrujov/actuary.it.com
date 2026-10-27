"""Univariate volatility models: GARCH-family specification search and EWMA fallback (PROMPT.md 5.2, 6.2)."""
from __future__ import annotations

import functools
import math
import warnings
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from validation.stat_tests import TestResult, ljung_box, pit_gof, sign_bias

SQRT_2_PI = math.sqrt(2 / math.pi)


@dataclass
class AssetModel:
    symbol: str
    kind: str                     # GARCH | GJR | EGARCH | EWMA
    dist: str                     # normal | t | skewt | empirical
    scale: float                  # returns were multiplied by this before fitting
    mu: float                     # constant mean (scaled units)
    params: dict[str, float]      # omega, alpha, gamma, beta (+ lambda for EWMA)
    cov: np.ndarray | None        # robust covariance of [omega, alpha, gamma, beta] (vol params only)
    sigma2: np.ndarray            # in-sample conditional variances (scaled^2)
    z: np.ndarray                 # standardized residuals
    resid: np.ndarray             # e = r - mu (scaled)
    index: pd.DatetimeIndex
    next_sigma2: float
    long_run_var: float
    bic: float | None = None
    aic: float | None = None
    loglik: float | None = None
    diagnostics: dict[str, Any] = field(default_factory=dict)
    candidates: list[dict[str, Any]] = field(default_factory=list)

    @property
    def persistence(self) -> float:
        p = self.params
        if self.kind == "EGARCH":
            return abs(p["beta"])
        if self.kind == "EWMA":
            return 1.0
        return p["alpha"] + p["beta"] + 0.5 * p.get("gamma", 0.0)

    @property
    def half_life(self) -> float | None:
        ph = self.persistence
        return math.log(0.5) / math.log(ph) if 0 < ph < 1 else None


VOL_KEYS = ["omega", "alpha", "gamma", "beta"]


def _extract(res, kind: str) -> tuple[dict[str, float], np.ndarray | None]:
    p = res.params
    names = list(p.index)
    vol = {
        "omega": float(p["omega"]),
        "alpha": float(p.get("alpha[1]", 0.0)),
        "gamma": float(p.get("gamma[1]", 0.0)),
        "beta": float(p.get("beta[1]", 0.0)),
    }
    try:
        cov_full = np.asarray(res.param_cov)
        idx = [names.index(n) if n in names else None for n in ("omega", "alpha[1]", "gamma[1]", "beta[1]")]
        cov = np.zeros((4, 4))
        for i, a in enumerate(idx):
            for j, b in enumerate(idx):
                if a is not None and b is not None:
                    cov[i, j] = cov_full[a, b]
    except Exception:
        cov = None
    return vol, cov


def valid_params(kind: str, p: dict[str, float] | np.ndarray) -> bool:
    if isinstance(p, np.ndarray):
        w, a, g, b = p
    else:
        w, a, g, b = (p[k] for k in VOL_KEYS)
    if kind == "EGARCH":
        return abs(b) < 0.9999
    if w <= 0 or a < 0 or b < 0 or a + g < 0:
        return False
    return a + b + 0.5 * g < 0.9999


def next_variance(kind: str, p: dict[str, float], e_last: float, s2_last: float) -> float:
    if kind == "EGARCH":
        z = e_last / math.sqrt(s2_last)
        return math.exp(p["omega"] + p["alpha"] * (abs(z) - SQRT_2_PI) + p["gamma"] * z + p["beta"] * math.log(s2_last))
    if kind == "EWMA":
        lam = p["lambda"]
        return lam * s2_last + (1 - lam) * e_last ** 2
    return p["omega"] + (p["alpha"] + p["gamma"] * (e_last < 0)) * e_last ** 2 + p["beta"] * s2_last


def long_run_variance(kind: str, p: dict[str, float], sample_var: float) -> float:
    """Unconditional variance used for the drift's variance correction.

    GARCH/GJR: omega / (1 - persistence) when the process is clearly stationary. Near-integrated fits make
    that ratio unstable, so the sample variance is used instead. EGARCH: exp(omega / (1 - beta)) is the
    long-run level of ln(sigma^2) and, by Jensen's inequality, understates E[sigma^2] (badly when beta ~ 1),
    so the sample variance of the residuals is used."""
    if kind in ("GARCH", "GJR"):
        denom = 1 - p["alpha"] - p["beta"] - 0.5 * p["gamma"]
        return p["omega"] / denom if denom > 5e-3 else sample_var
    return sample_var


def _fit_one(y: np.ndarray, kind: str, dist: str):
    from arch import arch_model

    o = 1 if kind in ("GJR", "EGARCH") else 0
    vol = "EGARCH" if kind == "EGARCH" else "GARCH"
    dist_name = {"normal": "normal", "t": "t", "skewt": "skewt"}[dist]
    am = arch_model(y, mean="Constant", vol=vol, p=1, o=o, q=1, dist=dist_name, rescale=False)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        res = am.fit(disp="off", cov_type="robust", options={"maxiter": 500})
    return am, res


def _pit(res) -> np.ndarray | None:
    try:
        dist = res.model.distribution
        k = dist.num_params
        dparams = np.asarray(res.params[-k:]) if k else None
        z = np.asarray(res.std_resid)
        z = z[np.isfinite(z)]
        return np.asarray(dist.cdf(z, dparams))
    except Exception:
        return None


def fit_ewma(symbol: str, r: pd.Series, lam: float, scale: float) -> AssetModel:
    y = r.to_numpy() * scale
    mu = float(np.mean(y))
    e = y - mu
    s2 = np.empty_like(e)
    s2[0] = np.var(e[: min(len(e), 30)]) if len(e) > 1 else max(e[0] ** 2, 1e-6)
    for t in range(1, len(e)):
        s2[t] = lam * s2[t - 1] + (1 - lam) * e[t - 1] ** 2
    s2 = np.maximum(s2, 1e-10)
    z = e / np.sqrt(s2)
    p = {"omega": 0.0, "alpha": 1 - lam, "gamma": 0.0, "beta": lam, "lambda": lam}
    return AssetModel(
        symbol, "EWMA", "empirical", scale, mu, p, None, s2, z, e, r.index,
        next_variance("EWMA", p, e[-1], s2[-1]), float(np.var(e)),
    )


def select_garch(symbol: str, r: pd.Series, cfg: dict[str, Any], full_diagnostics: bool = True) -> AssetModel:
    """Fit {GARCH, GJR, EGARCH}(1,1) x {normal, t, skewt}; choose by BIC among specs passing diagnostics."""
    gcfg = cfg["model"]["garch"]
    scale = float(gcfg["scale"])
    y = r.to_numpy() * scale
    fits: list[tuple[str, str, Any]] = []
    cand_rows: list[dict[str, Any]] = []
    for kind in gcfg["vol_models"]:
        for dist in gcfg["dists"]:
            try:
                _, res = _fit_one(y, kind, dist)
            except Exception as exc:  # noqa: BLE001
                cand_rows.append({"spec": f"{kind}-{dist}", "error": str(exc)[:120]})
                continue
            vol, _ = _extract(res, kind)
            ok = res.convergence_flag == 0 and valid_params(kind, vol)
            z = np.asarray(res.std_resid)
            z = z[np.isfinite(z)]
            lb2 = ljung_box(z ** 2, 10, df_adjust=2).p_value if len(z) > 30 else None
            lb1 = ljung_box(z, 10).p_value if len(z) > 30 else None
            cand_rows.append({
                "spec": f"{kind}-{dist}", "bic": float(res.bic), "aic": float(res.aic),
                "loglik": float(res.loglikelihood), "converged": res.convergence_flag == 0,
                "valid": ok, "lb_z_p": lb1, "lb_z2_p": lb2,
            })
            if ok:
                fits.append((kind, dist, res))
    if not fits:
        model = fit_ewma(symbol, r, cfg["model"]["ewma_lambda"], scale)
        model.candidates = cand_rows
        model.diagnostics["fallback_reason"] = "Heç bir GARCH spesifikasiyası yığılmadı və ya stasionar deyil"
        return model
    alpha = cfg["validation"]["alpha"]
    row_of = {row["spec"]: row for row in cand_rows if "bic" in row}
    passing = [f for f in fits if (row_of[f"{f[0]}-{f[1]}"]["lb_z2_p"] or 1) >= alpha]
    pool = passing or fits
    kind, dist, res = min(pool, key=lambda f: f[2].bic)
    vol, cov = _extract(res, kind)
    mu = float(res.params["mu"])
    s2 = np.asarray(res.conditional_volatility) ** 2
    e = y - mu
    z = e / np.sqrt(s2)
    model = AssetModel(
        symbol, kind, dist, scale, mu, vol, cov, s2, z, e, r.index,
        next_variance(kind, vol, e[-1], s2[-1]), long_run_variance(kind, vol, float(np.var(e))),
        float(res.bic), float(res.aic), float(res.loglikelihood), candidates=cand_rows,
    )
    model.diagnostics["selection"] = "BIC, diaqnostikadan keçənlər arasında" if passing else "BIC (heç biri LB z² testindən keçmədi)"
    if full_diagnostics:
        model.diagnostics.update(_diagnostics(model, res, fits, cfg))
    return model


def _diagnostics(model: AssetModel, res, fits, cfg) -> dict[str, Any]:
    from scipy import stats

    out: dict[str, Any] = {}
    se = {}
    try:
        se = {k: float(v) for k, v in res.std_err.items()}
    except Exception:
        pass
    out["params"] = {k: float(v) for k, v in res.params.items()}
    out["robust_se"] = se
    out["persistence"] = model.persistence
    out["half_life_days"] = model.half_life
    out["stationary"] = valid_params(model.kind, model.params)
    tests: list[TestResult] = []
    z = model.z[np.isfinite(model.z)]
    tests.append(ljung_box(z, 10, name="Ljung-Box z"))
    tests.append(ljung_box(z ** 2, 10, df_adjust=2, name="Ljung-Box z²"))
    tests.extend(sign_bias(z))
    pit = _pit(res)
    if pit is not None:
        tests.extend(pit_gof(pit))
        out["qq"] = _qq(pit)
    # LR test gamma = 0 (GJR vs GARCH with the same distribution)
    if model.kind == "GJR":
        for kind, dist, r2 in fits:
            if kind == "GARCH" and dist == model.dist:
                lr = 2 * (res.loglikelihood - r2.loglikelihood)
                pv = 1 - stats.chi2.cdf(max(lr, 0), 1)
                tests.append(TestResult("LR: GJR γ = 0", "Asimmetriya yoxdur (γ = 0)", float(lr), float(pv), n=len(z)))
    # parameter stability: re-estimate on halves
    try:
        y = model.resid + model.mu
        h = len(y) // 2
        if h > 250:
            _, r1 = _fit_one(y[:h], model.kind, model.dist)
            _, r2 = _fit_one(y[h:], model.kind, model.dist)
            diffs = {}
            for name in ("alpha[1]", "gamma[1]", "beta[1]"):
                if name in r1.params and name in r2.params:
                    d = r1.params[name] - r2.params[name]
                    s = math.sqrt(max(r1.std_err[name] ** 2 + r2.std_err[name] ** 2, 1e-12))
                    zstat = d / s
                    diffs[name] = {"first": float(r1.params[name]), "second": float(r2.params[name]),
                                   "z": float(zstat), "p": float(2 * (1 - stats.norm.cdf(abs(zstat))))}
            out["stability_halves"] = diffs
    except Exception:
        pass
    alpha = cfg["validation"]["alpha"]
    out["tests"] = [t.decide(alpha).to_dict() for t in tests]
    return out


def _qq(pit: np.ndarray, points: int = 41) -> list[list[float]]:
    q = np.linspace(0.01, 0.99, points)
    emp = np.quantile(pit, q)
    return [[float(a), float(b)] for a, b in zip(q, emp)]


def draw_param_sets(model: AssetModel, k: int, rng: np.random.Generator) -> np.ndarray:
    """K x 4 [omega, alpha, gamma, beta] draws from the asymptotic normal with robust covariance.

    Invalid draws (non-stationary / negative) are rejected. Falls back to point estimates."""
    theta = np.array([model.params[kk] for kk in VOL_KEYS])
    if model.kind == "EWMA" or model.cov is None or not np.all(np.isfinite(model.cov)):
        return np.tile(theta, (k, 1))
    cov = (model.cov + model.cov.T) / 2
    w, V = np.linalg.eigh(cov)
    L = V @ np.diag(np.sqrt(np.clip(w, 0, None)))
    if model.kind == "GARCH":
        L[2, :] = 0.0
    out = []
    tries = 0
    while len(out) < k and tries < 50 * k:
        tries += 1
        cand = theta + L @ rng.standard_normal(4)
        if model.kind == "GARCH":
            cand[2] = 0.0
        if valid_params(model.kind, cand):
            out.append(cand)
    while len(out) < k:
        out.append(theta)
    return np.array(out)


# ----------------------------------------------------------------------------- variance-break test
@functools.lru_cache(maxsize=32)
def _sup_lr_null(p: int, trim: float, reps: int = 20000, grid: int = 400, seed: int = 7) -> np.ndarray:
    """Simulated asymptotic null of Andrews' (1993) sup-LR statistic: sup over [trim, 1-trim] of
    ||B_p(r)||^2 / (r (1 - r)) for a p-dimensional Brownian bridge B_p. Sorted; cached in memory and on disk
    (deterministic seed), so worker processes load it instead of re-simulating."""
    from app.config import get_settings

    path = get_settings().cache_dir / f"suplr_p{p}_t{int(round(trim * 100))}_r{reps}_g{grid}_s{seed}.npy"
    try:
        return np.load(path)
    except (OSError, ValueError):
        pass
    rng = np.random.default_rng(seed)
    r = np.arange(1, grid + 1) / grid
    keep = (r >= trim) & (r <= 1 - trim)
    denom = r[keep] * (1 - r[keep])
    out = []
    batch = 500  # ~8 MB per array: safe on small machines and inside process pools
    for _ in range(reps // batch):
        W = np.cumsum(rng.standard_normal((batch, grid, p)), axis=1) / np.sqrt(grid)
        B = W - r[None, :, None] * W[:, -1:, :]
        out.append(((B[:, keep, :] ** 2).sum(axis=2) / denom).max(axis=1))
    null = np.sort(np.concatenate(out))
    try:
        np.save(path, null)
    except OSError:
        pass
    return null


def sup_lr_pvalue(stat: float, p: int, trim: float) -> float:
    null = _sup_lr_null(p, trim)
    return float((np.sum(null >= stat) + 1) / (len(null) + 1))


def _n_params(kind: str, dist: str) -> int:
    vol = {"GARCH": 3, "GJR": 4, "EGARCH": 4}[kind]
    return 1 + vol + {"normal": 0, "t": 1, "skewt": 2}[dist]


def garch_break_test(model: AssetModel, trim: float,
                     fallback_spec: tuple[str, str] = ("GJR", "t")) -> tuple[TestResult, int | None]:
    """Variance/parameter break test that stays valid under GARCH (PROMPT.md 6.1, 6.2).

    Candidate date: the centred cumulative-sum-of-squares (ICSS) maximum within [trim, 1 - trim]. Test: LR of
    the asset's own specification fitted separately before and after the date versus the full sample,
    referred to Andrews' sup-LR null (conservative, as the date is chosen by a different statistic).
    Raw ICSS / kappa-2 on returns are not used for decisions: under persistent GARCH they reject far above
    their nominal size, while residual-based versions have little power because a break inflates the
    estimated persistence (Lamoureux & Lastrapes, 1990). A large break can push every specification to
    non-stationarity, so an EWMA fallback is tested with `fallback_spec` (the LR needs no stationarity)."""
    y = model.resid + model.mu
    T = len(y)
    kind, dist = (model.kind, model.dist) if model.kind != "EWMA" else fallback_spec
    a = y - y.mean()
    C = np.cumsum(a ** 2)
    D = np.abs(C / C[-1] - np.arange(1, T + 1) / T)
    lo, hi = int(trim * T), int((1 - trim) * T)
    k = lo + int(np.argmax(D[lo:hi]))
    try:
        _, full = _fit_one(y, kind, dist)
        _, r1 = _fit_one(y[:k], kind, dist)
        _, r2 = _fit_one(y[k:], kind, dist)
        lr = max(0.0, 2 * (r1.loglikelihood + r2.loglikelihood - full.loglikelihood))
    except Exception:
        return TestResult("GARCH qırılma (sup-LR)", "Parametrlər sabitdir (qırılma yoxdur)", None, None, n=T), None
    p = _n_params(kind, dist)
    pv = sup_lr_pvalue(lr, p, trim)
    return (TestResult("GARCH qırılma (sup-LR, ICSS namizədi)", "Model parametrləri dövr boyu sabitdir",
                       float(lr), pv, n=T,
                       effect={"break_date": str(model.index[k].date()), "params": p},
                       note="Andrews (1993) sup-LR null paylanması; namizəd tarix ICSS ilə seçildiyi üçün konservativdir."),
            k)
