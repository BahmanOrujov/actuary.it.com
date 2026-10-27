"""Statistical tests for forecast evaluation and model diagnostics (PROMPT.md 6).

Every test returns a TestResult with H0, statistic, p-value, decision and an interpretation note.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Sequence

import numpy as np
from scipy import stats


@dataclass
class TestResult:
    name: str
    h0: str
    statistic: float | None
    p_value: float | None
    reject: bool | None = None
    q_value: float | None = None
    p_holm: float | None = None
    effect: dict = field(default_factory=dict)
    note: str = ""
    n: int | None = None

    def decide(self, alpha: float) -> "TestResult":
        if self.p_value is not None and np.isfinite(self.p_value):
            self.reject = bool(self.p_value < alpha)
        return self

    def to_dict(self) -> dict:
        d = asdict(self)
        for k, v in list(d.items()):
            if isinstance(v, float) and not np.isfinite(v):
                d[k] = None
        return d


def _f(x) -> float | None:
    try:
        x = float(x)
        return x if np.isfinite(x) else None
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- multiple testing
def holm(pvals: Sequence[float | None]) -> list[float | None]:
    idx = [i for i, p in enumerate(pvals) if p is not None]
    m = len(idx)
    out: list[float | None] = [None] * len(pvals)
    order = sorted(idx, key=lambda i: pvals[i])  # type: ignore[arg-type,return-value]
    running = 0.0
    for rank, i in enumerate(order):
        adj = min(1.0, (m - rank) * float(pvals[i]))  # type: ignore[arg-type]
        running = max(running, adj)
        out[i] = running
    return out


def benjamini_hochberg(pvals: Sequence[float | None]) -> list[float | None]:
    idx = [i for i, p in enumerate(pvals) if p is not None]
    m = len(idx)
    out: list[float | None] = [None] * len(pvals)
    if m == 0:
        return out
    order = sorted(idx, key=lambda i: pvals[i], reverse=True)  # type: ignore[arg-type,return-value]
    running = 1.0
    for k, i in enumerate(order):
        rank = m - k
        running = min(running, float(pvals[i]) * m / rank)  # type: ignore[arg-type]
        out[i] = running
    return out


# ---------------------------------------------------------------- VaR tests
def kupiec_pof(hits: np.ndarray, p: float) -> TestResult:
    """hits: 1 if loss exceeded VaR. p: expected exceedance rate (e.g. 0.01 for 99% VaR)."""
    n, x = len(hits), int(np.sum(hits))
    phat = x / n if n else np.nan
    def ll(q: float) -> float:
        q = min(max(q, 1e-12), 1 - 1e-12)
        return (n - x) * np.log(1 - q) + x * np.log(q)
    lr = -2 * (ll(p) - ll(phat)) if n else np.nan
    pv = 1 - stats.chi2.cdf(lr, 1)
    return TestResult(
        "Kupiec POF", f"Aşım tezliyi = {p:.3f} (şərtsiz əhatə düzgündür)", _f(lr), _f(pv), n=n,
        effect={"exceedances": x, "expected": n * p, "rate": _f(phat), "nominal": p},
    )


def christoffersen(hits: np.ndarray, p: float) -> tuple[TestResult, TestResult]:
    h = np.asarray(hits, dtype=int)
    n00 = int(np.sum((h[:-1] == 0) & (h[1:] == 0)))
    n01 = int(np.sum((h[:-1] == 0) & (h[1:] == 1)))
    n10 = int(np.sum((h[:-1] == 1) & (h[1:] == 0)))
    n11 = int(np.sum((h[:-1] == 1) & (h[1:] == 1)))
    pi0 = n01 / max(n00 + n01, 1)
    pi1 = n11 / max(n10 + n11, 1)
    pi = (n01 + n11) / max(n00 + n01 + n10 + n11, 1)

    def lg(a: float, k: int) -> float:
        a = min(max(a, 1e-12), 1 - 1e-12)
        return k * np.log(a)

    l_ind = lg(1 - pi, n00 + n10) + lg(pi, n01 + n11)
    l_markov = lg(1 - pi0, n00) + lg(pi0, n01) + lg(1 - pi1, n10) + lg(pi1, n11)
    lr_ind = -2 * (l_ind - l_markov)
    pv_ind = 1 - stats.chi2.cdf(lr_ind, 1)
    kp = kupiec_pof(h, p)
    lr_cc = (kp.statistic or 0.0) + lr_ind
    pv_cc = 1 - stats.chi2.cdf(lr_cc, 2)
    ind = TestResult("Christoffersen müstəqillik", "Aşımlar bir-birindən asılı deyil (klasterləşmir)",
                     _f(lr_ind), _f(pv_ind), n=len(h), effect={"pi0": pi0, "pi1": pi1})
    cc = TestResult("Christoffersen şərti əhatə", "Əhatə düzgündür və aşımlar müstəqildir",
                    _f(lr_cc), _f(pv_cc), n=len(h))
    return ind, cc


def dq_test(hits: np.ndarray, var: np.ndarray, p: float, lags: int = 4) -> TestResult:
    """Engle-Manganelli Dynamic Quantile test."""
    hit = np.asarray(hits, float) - p
    T = len(hit)
    if T <= lags + 10:
        return TestResult("Engle-Manganelli DQ", "Aşımlar proqnozlaşdırıla bilməz", None, None, n=T,
                          note="Müşahidə azdır")
    X = [np.ones(T - lags)]
    for k in range(1, lags + 1):
        X.append(hit[lags - k:T - k])
    X.append(np.asarray(var, float)[lags:])
    X = np.column_stack(X)
    y = hit[lags:]
    try:
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
        stat = float(beta @ X.T @ X @ beta / (p * (1 - p)))
        pv = 1 - stats.chi2.cdf(stat, X.shape[1])
    except np.linalg.LinAlgError:
        stat, pv = np.nan, np.nan
    return TestResult("Engle-Manganelli DQ", "Aşımlar keçmiş məlumatla proqnozlaşdırıla bilməz",
                      _f(stat), _f(pv), n=T)


def basel_traffic_light(hits99: np.ndarray) -> dict:
    last = np.asarray(hits99)[-250:]
    x = int(last.sum())
    zone = "green" if x <= 4 else ("yellow" if x <= 9 else "red")
    return {"exceedances": x, "days": int(len(last)), "zone": zone}


# ---------------------------------------------------------------- ES tests
def mcneil_frey(returns: np.ndarray, var: np.ndarray, es: np.ndarray, sigma: np.ndarray,
                reps: int = 1000, seed: int = 0) -> TestResult:
    """Exceedance residuals (loss - ES)/sigma on VaR breaches should have zero mean (one-sided bootstrap)."""
    loss = -np.asarray(returns)
    breach = loss > var
    r = (loss[breach] - es[breach]) / sigma[breach]
    n = len(r)
    if n < 5:
        return TestResult("McNeil-Frey ES", "ES düzgündür (aşım qalıqlarının ortası 0)", None, None, n=n,
                          note="Aşım sayı azdır, test gücsüzdür")
    rng = np.random.default_rng(seed)
    stat = r.mean() / (r.std(ddof=1) / np.sqrt(n))
    centred = r - r.mean()
    boot = np.array([
        (b := rng.choice(centred, n)).mean() / (b.std(ddof=1) / np.sqrt(n) + 1e-12) for _ in range(reps)
    ])
    pv = float(np.mean(boot >= stat))
    return TestResult("McNeil-Frey ES", "ES düzgündür (aşım qalıqlarının ortası 0)", _f(stat), pv, n=n,
                      effect={"mean_residual": float(r.mean())})


def acerbi_szekely_z2(returns: np.ndarray, var: np.ndarray, es: np.ndarray, alpha_tail: float,
                      sims: np.ndarray | None = None, reps: int = 1000, seed: int = 0) -> TestResult:
    """Z2 = sum(X_t I_t / (T * a * ES_t)) + 1, X = return. Expected 0 under H0; negative => ES underestimated.

    p-value from simulating under H0 using the forecast distribution approximated by sampling returns
    from each day's predictive sample (if given) or a scaled Student-t surrogate."""
    x = np.asarray(returns)
    T = len(x)
    I = (-x > var).astype(float)
    z2 = float(np.sum(x * I / (T * alpha_tail * es)) + 1)
    rng = np.random.default_rng(seed)
    if sims is None:
        # surrogate: Student-t(5) scaled to match VaR at the tail level
        q = stats.t.ppf(alpha_tail, 5)
        scale = var / -q
        sim_stats = []
        for _ in range(reps):
            xs = stats.t.rvs(5, size=T, random_state=rng) * scale
            Is = (-xs > var).astype(float)
            sim_stats.append(np.sum(xs * Is / (T * alpha_tail * es)) + 1)
        sim_stats = np.asarray(sim_stats)
    else:
        sim_stats = []
        for _ in range(reps):
            pick = sims[np.arange(T), rng.integers(0, sims.shape[1], T)]
            Is = (-pick > var).astype(float)
            sim_stats.append(np.sum(pick * Is / (T * alpha_tail * es)) + 1)
        sim_stats = np.asarray(sim_stats)
    pv = float(np.mean(sim_stats <= z2))
    return TestResult("Acerbi-Szekely Z2", "ES düzgündür (Z2 = 0)", z2, pv, n=T)


# ---------------------------------------------------------------- density tests
def berkowitz(pit: np.ndarray) -> TestResult:
    """LR test of N(0,1) iid for z = Phi^-1(PIT) against AR(1) with free mean/variance."""
    u = np.clip(np.asarray(pit, float), 1e-6, 1 - 1e-6)
    z = stats.norm.ppf(u)
    if len(z) < 20:
        return TestResult("Berkowitz LR", "PIT-lər iid U(0,1)", None, None, n=len(z), note="Müşahidə azdır")
    y, x = z[1:], z[:-1]
    X = np.column_stack([np.ones_like(x), x])
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ beta
    s2 = resid.var()
    ll1 = np.sum(stats.norm.logpdf(resid, scale=np.sqrt(s2)))
    ll0 = np.sum(stats.norm.logpdf(y))
    lr = -2 * (ll0 - ll1)
    pv = 1 - stats.chi2.cdf(lr, 3)
    return TestResult("Berkowitz LR", "PIT-lər iid U(0,1) (sıxlıq proqnozu düzgündür)", _f(lr), _f(pv),
                      n=len(z), effect={"mean": float(beta[0]), "rho": float(beta[1]), "var": float(s2)})


def pit_uniformity(pit: np.ndarray) -> list[TestResult]:
    u = np.asarray(pit, float)
    ks = stats.kstest(u, "uniform")
    note = "PIT-lər asılı ola bilər; p-dəyəri ehtiyatla şərh edilməlidir."
    out = [TestResult("PIT KS", "PIT ~ U(0,1)", _f(ks.statistic), _f(ks.pvalue), n=len(u), note=note)]
    try:
        ad = stats.anderson_ksamp([u, np.linspace(0.0005, 0.9995, 2000)])
        out.append(TestResult("PIT Anderson-Darling (k-sample)", "PIT ~ U(0,1)", _f(ad.statistic),
                              _f(getattr(ad, "pvalue", getattr(ad, "significance_level", np.nan))),
                              n=len(u), note=note + " p-dəyəri [0.001, 0.25] aralığında kəsilir."))
    except Exception:
        pass
    return out


def calibration_curve(pit: np.ndarray, levels: Sequence[float] | None = None) -> list[dict]:
    u = np.asarray(pit, float)
    n = len(u)
    levels = levels or [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]
    out = []
    for lv in levels:
        obs = float(np.mean(u <= lv)) if n else np.nan
        se = np.sqrt(lv * (1 - lv) / max(n, 1))
        out.append({"nominal": lv, "observed": obs, "lo": lv - 1.96 * se, "hi": lv + 1.96 * se})
    return out


# ---------------------------------------------------------------- coverage with HAC / block bootstrap
def newey_west_var(x: np.ndarray, lags: int) -> float:
    x = np.asarray(x, float) - np.mean(x)
    n = len(x)
    v = np.dot(x, x) / n
    for k in range(1, min(lags, n - 1) + 1):
        w = 1 - k / (lags + 1)
        v += 2 * w * np.dot(x[k:], x[:-k]) / n
    return max(v, 1e-12) / n


def coverage_test(inside: np.ndarray, nominal: float, hac_lags: int) -> TestResult:
    x = np.asarray(inside, float)
    n = len(x)
    if n < 5:
        return TestResult(f"{int(nominal*100)}% aralıq əhatəsi", f"Faktiki əhatə = {nominal:.0%}", None, None,
                          n=n, note="Müşahidə azdır")
    cov = x.mean()
    se = np.sqrt(newey_west_var(x, hac_lags))
    if se < 1e-9:
        se = np.sqrt(max(cov * (1 - cov), 1e-4) / n)
    z = (cov - nominal) / se
    pv = 2 * (1 - stats.norm.cdf(abs(z)))
    lo, hi = cov - 1.96 * se, cov + 1.96 * se
    return TestResult(
        f"{int(nominal*100)}% aralıq əhatəsi (HAC)", f"Faktiki əhatə = {nominal:.0%}", _f(z), _f(pv), n=n,
        effect={"coverage": float(cov), "ci_lo": float(lo), "ci_hi": float(hi), "nominal": nominal,
                "nominal_in_ci": bool(lo <= nominal <= hi)},
        note=f"Newey-West, lag={hac_lags}; üst-üstə düşən pəncərələr.",
    )


def block_bootstrap_mean_ci(x: np.ndarray, block: int, reps: int = 1000, seed: int = 0) -> tuple[float, float]:
    x = np.asarray(x, float)
    n = len(x)
    if n == 0:
        return (np.nan, np.nan)
    rng = np.random.default_rng(seed)
    nb = int(np.ceil(n / block))
    means = []
    for _ in range(reps):
        starts = rng.integers(0, max(n - block + 1, 1), nb)
        sample = np.concatenate([x[s:s + block] for s in starts])[:n]
        means.append(sample.mean())
    return float(np.quantile(means, 0.025)), float(np.quantile(means, 0.975))


# ---------------------------------------------------------------- scoring rules
def crps_ensemble(sample: np.ndarray, y: float) -> float:
    s = np.sort(np.asarray(sample, float))
    m = len(s)
    term1 = np.mean(np.abs(s - y))
    # E|X-X'| via sorted formula
    i = np.arange(1, m + 1)
    term2 = 2 * np.sum((2 * i - m - 1) * s) / (m * m)
    return float(term1 - 0.5 * term2)


def pinball(q: float, y: float, tau: float) -> float:
    return float((tau - (y < q)) * (y - q))


def fz0_loss(y: np.ndarray, var: np.ndarray, es: np.ndarray, alpha: float) -> np.ndarray:
    """Fissler-Ziegel FZ0 loss (Patton-Ziegel-Chen 2019). var, es are *returns* quantile/ES (negative)."""
    y, v, e = np.asarray(y), np.asarray(var), np.asarray(es)
    e = np.minimum(e, -1e-8)
    hit = (y <= v).astype(float)
    return -1.0 / (alpha * e) * hit * (v - y) + v / e + np.log(-e) - 1


def qlike(realized_var: np.ndarray, forecast_var: np.ndarray) -> np.ndarray:
    f = np.maximum(np.asarray(forecast_var), 1e-12)
    r = np.asarray(realized_var)
    return r / f - np.log(np.maximum(r, 1e-12) / f) - 1


def mincer_zarnowitz(realized: np.ndarray, forecast: np.ndarray, hac_lags: int = 5) -> TestResult:
    import statsmodels.api as sm

    X = sm.add_constant(np.asarray(forecast))
    res = sm.OLS(np.asarray(realized), X).fit(cov_type="HAC", cov_kwds={"maxlags": hac_lags})
    # H0: intercept=0, slope=1
    R = np.eye(2)
    q = np.array([0.0, 1.0])
    diff = R @ res.params - q
    stat = float(diff @ np.linalg.inv(R @ res.cov_params() @ R.T) @ diff)
    pv = 1 - stats.chi2.cdf(stat, 2)
    return TestResult("Mincer-Zarnowitz", "kəsişmə = 0, meyl = 1 (volatillik proqnozu qərəzsizdir)",
                      stat, _f(pv), n=len(realized),
                      effect={"intercept": float(res.params[0]), "slope": float(res.params[1])})


# ---------------------------------------------------------------- model comparison
def diebold_mariano(loss_a: np.ndarray, loss_b: np.ndarray, h: int = 1) -> TestResult:
    """DM with HAC variance and Harvey-Leybourne-Newbold small-sample correction. d = a - b."""
    d = np.asarray(loss_a) - np.asarray(loss_b)
    d = d[np.isfinite(d)]
    n = len(d)
    if n < 10:
        return TestResult("Diebold-Mariano", "Gözlənilən itkilər bərabərdir", None, None, n=n)
    var = newey_west_var(d, max(h - 1, 0))
    dm = d.mean() / np.sqrt(var)
    hln = np.sqrt((n + 1 - 2 * h + h * (h - 1) / n) / n)
    stat = dm * hln
    pv = 2 * (1 - stats.t.cdf(abs(stat), n - 1))
    return TestResult("Diebold-Mariano (HLN)", "Gözlənilən itkilər bərabərdir", _f(stat), _f(pv), n=n,
                      effect={"mean_loss_diff": float(d.mean())})


def spa_test(bench: np.ndarray, models: dict[str, np.ndarray], block: int, reps: int,
             seed: int = 0) -> TestResult | None:
    """Hansen (2005) Superior Predictive Ability: is any competitor better than the benchmark (lower loss)?"""
    import pandas as pd
    from arch.bootstrap import SPA

    df = pd.DataFrame(models)
    ok = np.isfinite(bench) & df.notna().all(axis=1).to_numpy()
    if ok.sum() < 30 or df.shape[1] == 0:
        return None
    spa = SPA(np.asarray(bench)[ok], df[ok], block_size=block, reps=reps, seed=seed)
    spa.compute()
    pv = spa.pvalues
    return TestResult("Hansen SPA", "Heç bir rəqib model əsas modeldən daha yaxşı deyil", None,
                      _f(pv["consistent"]), n=int(ok.sum()),
                      effect={"p_lower": _f(pv["lower"]), "p_upper": _f(pv["upper"])},
                      note="Rədd edilsə, ən azı bir rəqib model statistik olaraq daha kiçik itki verir.")


def model_confidence_set(losses: dict[str, np.ndarray], size: float = 0.10, block: int = 21,
                         reps: int = 500, seed: int = 0) -> dict:
    import pandas as pd
    from arch.bootstrap import MCS

    df = pd.DataFrame(losses).dropna()
    if len(df) < 30 or df.shape[1] < 2:
        return {"included": list(losses), "pvalues": {}, "note": "MCS üçün məlumat azdır"}
    mcs = MCS(df, size=size, reps=reps, block_size=block, method="R", seed=seed)
    mcs.compute()
    pv = mcs.pvalues.iloc[:, 0].to_dict()
    return {"included": list(mcs.included), "excluded": list(mcs.excluded), "pvalues": pv,
            "mean_loss": df.mean().to_dict()}


# ---------------------------------------------------------------- residual diagnostics
def ljung_box(x: np.ndarray, lags: int = 10, df_adjust: int = 0, name: str = "Ljung-Box") -> TestResult:
    from statsmodels.stats.diagnostic import acorr_ljungbox

    res = acorr_ljungbox(x, lags=[lags], model_df=df_adjust, return_df=True)
    return TestResult(f"{name} (lag {lags})", "Avtokorrelyasiya yoxdur",
                      _f(res["lb_stat"].iloc[0]), _f(res["lb_pvalue"].iloc[0]), n=len(x))


def arch_lm(x: np.ndarray, lags: int = 10) -> TestResult:
    from statsmodels.stats.diagnostic import het_arch

    lm, lmp, _, _ = het_arch(np.asarray(x), nlags=lags)
    return TestResult(f"Engle ARCH-LM (lag {lags})", "ARCH effekti yoxdur", _f(lm), _f(lmp), n=len(x))


def sign_bias(z: np.ndarray) -> list[TestResult]:
    """Engle-Ng sign bias, negative/positive size bias and joint test on standardized residuals."""
    import statsmodels.api as sm

    z = np.asarray(z)
    y = z[1:] ** 2
    zl = z[:-1]
    s_neg = (zl < 0).astype(float)
    s_pos = 1 - s_neg
    X = sm.add_constant(np.column_stack([s_neg, s_neg * zl, s_pos * zl]))
    res = sm.OLS(y, X).fit()
    names = ["Sign bias", "Negative size bias", "Positive size bias"]
    out = [
        TestResult(f"Engle-Ng {nm}", "Asimmetriya qalmayıb", _f(res.tvalues[i + 1]), _f(res.pvalues[i + 1]),
                   n=len(y))
        for i, nm in enumerate(names)
    ]
    f = res.f_test(np.eye(4)[1:])
    out.append(TestResult("Engle-Ng birgə", "Heç bir asimmetriya qalmayıb", _f(np.squeeze(f.fvalue)),
                          _f(np.squeeze(f.pvalue)), n=len(y)))
    return out


def hosking_portmanteau(u: np.ndarray, lags: int = 5, name: str = "Hosking") -> TestResult:
    """Multivariate portmanteau (Hosking 1980) on a T x N matrix."""
    u = np.asarray(u, float)
    u = u - u.mean(0)
    T, N = u.shape
    C0 = u.T @ u / T
    try:
        C0inv = np.linalg.inv(C0)
    except np.linalg.LinAlgError:
        return TestResult(f"{name} portmanteau", "Çoxölçülü avtokorrelyasiya yoxdur", None, None, n=T)
    q = 0.0
    for k in range(1, lags + 1):
        Ck = u[k:].T @ u[:-k] / T
        q += np.trace(Ck.T @ C0inv @ Ck @ C0inv) / (T - k)
    q *= T * T
    dfree = N * N * lags
    pv = 1 - stats.chi2.cdf(q, dfree)
    return TestResult(f"{name} portmanteau (lag {lags})", "Çoxölçülü avtokorrelyasiya yoxdur", _f(q), _f(pv), n=T)


def engle_sheppard(z: np.ndarray, lags: int = 5) -> TestResult:
    """Engle-Sheppard (2001) test of constant conditional correlation on standardized residuals T x N."""
    z = np.asarray(z, float)
    T, N = z.shape
    if N < 2:
        return TestResult("Engle-Sheppard", "Korrelyasiya sabitdir", None, None, n=T)
    R = np.corrcoef(z.T)
    w, V = np.linalg.eigh(R)
    Rm12 = V @ np.diag(1 / np.sqrt(np.maximum(w, 1e-10))) @ V.T
    u = z @ Rm12
    iu = np.triu_indices(N, 1)
    Y = np.stack([u[:, i] * u[:, j] for i, j in zip(*iu)], axis=1)  # T x P
    ys, xs = [], []
    for p in range(Y.shape[1]):
        y = Y[:, p]
        X = np.column_stack([np.ones(T - lags)] + [y[lags - k:T - k] for k in range(1, lags + 1)])
        ys.append(y[lags:])
        xs.append(X)
    yv = np.concatenate(ys)
    Xv = np.vstack(xs)
    beta, *_ = np.linalg.lstsq(Xv, yv, rcond=None)
    resid = yv - Xv @ beta
    s2 = resid.var()
    stat = float(beta @ Xv.T @ Xv @ beta / s2)
    pv = 1 - stats.chi2.cdf(stat, lags + 1)
    return TestResult("Engle-Sheppard", "Şərti korrelyasiya sabitdir (CCC kifayətdir)", stat, _f(pv), n=T)


def pit_gof(pit: np.ndarray, bins: int = 20) -> list[TestResult]:
    u = np.asarray(pit, float)
    n = len(u)
    counts, _ = np.histogram(u, bins=bins, range=(0, 1))
    chi = stats.chisquare(counts)
    ks = stats.kstest(u, "uniform")
    out = [
        TestResult("Pearson GoF (PIT)", "Qalıqlar seçilmiş paylanmaya uyğundur", _f(chi.statistic), _f(chi.pvalue), n=n),
        TestResult("Kolmogorov-Smirnov (PIT)", "Qalıqlar seçilmiş paylanmaya uyğundur", _f(ks.statistic), _f(ks.pvalue), n=n),
    ]
    try:
        ad = stats.anderson_ksamp([u, np.linspace(0.0005, 0.9995, 2000)])
        out.append(TestResult("Anderson-Darling (PIT)", "Qalıqlar seçilmiş paylanmaya uyğundur", _f(ad.statistic),
                              _f(getattr(ad, "pvalue", np.nan)), n=n, note="p-dəyəri [0.001, 0.25] aralığında kəsilir"))
    except Exception:
        pass
    return out
