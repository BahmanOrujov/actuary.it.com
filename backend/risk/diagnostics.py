"""Return diagnostics (PROMPT.md 6.1)."""
from __future__ import annotations

import warnings
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

from validation.stat_tests import TestResult, arch_lm, ljung_box


def inclan_tiao(r: np.ndarray) -> tuple[TestResult, int | None]:
    """Inclán-Tiao centred cumulative sum of squares test for a variance break.

    Assumes iid (mesokurtic) data; under GARCH it over-rejects badly, so it is reported for reference only."""
    a = np.asarray(r, float) - np.mean(r)
    T = len(a)
    C = np.cumsum(a ** 2)
    D = C / C[-1] - np.arange(1, T + 1) / T
    k = int(np.argmax(np.abs(D)))
    stat = float(np.sqrt(T / 2) * np.abs(D[k]))
    pv = float(1 - stats.kstwobign.cdf(stat))
    return (TestResult("Inclán-Tiao (ICSS, iid)", "Dispersiyada struktur qırılma yoxdur", stat, pv, n=T,
                       note="iid fərziyyəsinə əsaslanır; şərti heteroskedastiklikdə həddən artıq rədd edir."),
            k if pv < 0.05 else None)


def kappa2(r: np.ndarray, bandwidth: int | None = None) -> tuple[TestResult, int]:
    """Sansó, Aragó & Carrion-i-Silvestre (2004) kappa-2 variance-break test.

    Robust to fat tails and conditional heteroskedasticity: the CUSUM of squares is scaled by a Bartlett
    (Newey-West) long-run variance of e_t^2 - sigma^2. Asymptotic null: sup of a Brownian bridge."""
    a = np.asarray(r, float) - np.mean(r)
    T = len(a)
    e2 = a ** 2
    x = e2 - e2.mean()
    m = bandwidth if bandwidth is not None else int(np.floor(4 * (T / 100) ** (2 / 9)))
    lrv = float(np.dot(x, x) / T)
    for j in range(1, m + 1):
        lrv += 2 * (1 - j / (m + 1)) * float(np.dot(x[j:], x[:-j]) / T)
    C = np.cumsum(e2)
    G = (C - np.arange(1, T + 1) / T * C[-1]) / np.sqrt(T)
    k = int(np.argmax(np.abs(G)))
    stat = float(np.abs(G[k]) / np.sqrt(max(lrv, 1e-300)))
    pv = float(1 - stats.kstwobign.cdf(stat))
    return (TestResult("Sansó-Aragó-Carrion κ2", "Dispersiyada struktur qırılma yoxdur", stat, pv, n=T,
                       note=f"Bartlett uzunmüddətli dispersiya, bandwidth={m}. Davamlı GARCH-da yenə də həddən artıq rədd edir; qərar üçün GARCH sup-LR testi istifadə olunur (aktivlərin diaqnostikası)."),
            k)


def return_diagnostics(r: pd.Series, alpha: float, lb_lags: tuple[int, ...] = (5, 10, 20)) -> dict[str, Any]:
    from statsmodels.tsa.stattools import adfuller, kpss

    x = r.dropna().to_numpy()
    desc = {
        "n": int(len(x)), "mean": float(np.mean(x)), "std": float(np.std(x, ddof=1)),
        "skew": float(stats.skew(x)), "excess_kurtosis": float(stats.kurtosis(x)),
        "min": float(np.min(x)), "max": float(np.max(x)),
        "ann_vol": float(np.std(x, ddof=1) * np.sqrt(252)),
    }
    tests: list[TestResult] = []
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        adf = adfuller(x, autolag="AIC")
        tests.append(TestResult("ADF", "Vahid kök var (qeyri-stasionar)", float(adf[0]), float(adf[1]), n=len(x)))
        kp = kpss(x, regression="c", nlags="auto")
        tests.append(TestResult("KPSS", "Sıra stasionardır", float(kp[0]), float(kp[1]), n=len(x),
                                note="p-dəyəri cədvəldən interpolyasiya olunur, [0.01, 0.1] aralığında kəsilir"))
    jb = stats.jarque_bera(x)
    tests.append(TestResult("Jarque-Bera", "Normal paylanma", float(jb.statistic), float(jb.pvalue), n=len(x)))
    try:
        ad = stats.anderson(x, dist="norm", method="interpolate")
        ad_p = float(ad.pvalue)
    except TypeError:
        ad = stats.anderson(x, dist="norm")
        ad_p = 0.001 if ad.statistic > ad.critical_values[-1] else (0.05 if ad.statistic > ad.critical_values[2] else 0.5)
    tests.append(TestResult("Anderson-Darling", "Normal paylanma", float(ad.statistic), ad_p, n=len(x)))
    for lag in lb_lags:
        tests.append(ljung_box(x, lag, name="Ljung-Box r"))
        tests.append(ljung_box(x ** 2, lag, name="Ljung-Box r²"))
    tests.append(arch_lm(x, 10))
    icss, _ = inclan_tiao(x)
    tests.append(icss)
    k2, k2_idx = kappa2(x)
    tests.append(k2)
    brk = k2_idx if (k2.p_value is not None and k2.p_value < alpha) else None
    adf_rej = tests[0].p_value is not None and tests[0].p_value < alpha
    kpss_rej = tests[1].p_value is not None and tests[1].p_value < alpha
    joint = (
        "Stasionar (ADF rədd edir, KPSS rədd etmir)" if adf_rej and not kpss_rej else
        "Qeyri-stasionar" if not adf_rej and kpss_rej else
        "Ziddiyyətli nəticə (hər ikisi rədd edir: struktur qırılma və ya uzun yaddaş ola bilər)" if adf_rej and kpss_rej else
        "Qeyri-müəyyən (heç biri rədd etmir: testlərin gücü aşağıdır)"
    )
    return {
        "descriptive": desc,
        "tests": [t.decide(alpha).to_dict() for t in tests],
        "stationarity_joint": joint,
        "variance_break_date": str(r.dropna().index[brk].date()) if brk is not None else None,
    }
