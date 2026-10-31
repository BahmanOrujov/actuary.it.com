"""CAPM drift, multifactor stress betas, clustering and concentration (PROMPT.md 5.2, 5.5)."""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def capm_beta(asset: pd.Series, market: pd.Series) -> tuple[float, float]:
    """OLS beta of daily log returns. Returns (beta, r2)."""
    df = pd.concat([asset, market], axis=1, join="inner").dropna()
    if len(df) < 60:
        return 1.0, 0.0
    x = df.iloc[:, 1].to_numpy()
    y = df.iloc[:, 0].to_numpy()
    vx = np.var(x)
    if vx <= 0:
        return 1.0, 0.0
    beta = float(np.cov(y, x, ddof=0)[0, 1] / vx)
    r2 = float(np.corrcoef(y, x)[0, 1] ** 2)
    return beta, r2


def multifactor(asset: pd.Series, factors: pd.DataFrame, hac_lags: int = 5) -> dict[str, Any]:
    import statsmodels.api as sm

    df = pd.concat([asset.rename("y"), factors], axis=1, join="inner").dropna()
    if len(df) < 120:
        return {"betas": {}, "n": len(df)}
    X = sm.add_constant(df[factors.columns])
    res = sm.OLS(df["y"], X).fit(cov_type="HAC", cov_kwds={"maxlags": hac_lags})
    return {
        "betas": {k: float(res.params[k]) for k in factors.columns},
        "se": {k: float(res.bse[k]) for k in factors.columns},
        "pvalues": {k: float(res.pvalues[k]) for k in factors.columns},
        "r2": float(res.rsquared), "n": int(res.nobs),
    }


def clusters(corr: np.ndarray, threshold: float) -> tuple[list[int], list[int]]:
    """Hierarchical clustering on distance sqrt(0.5(1-rho)); returns (labels, leaf order)."""
    from scipy.cluster.hierarchy import fcluster, leaves_list, linkage
    from scipy.spatial.distance import squareform

    n = corr.shape[0]
    if n < 2:
        return [1] * n, list(range(n))
    D = np.sqrt(np.clip(0.5 * (1 - corr), 0, None))
    np.fill_diagonal(D, 0)
    Z = linkage(squareform(D, checks=False), method="average")
    cut = float(np.sqrt(0.5 * (1 - threshold)))
    labels = fcluster(Z, t=cut, criterion="distance").tolist()
    return labels, leaves_list(Z).tolist()


def hhi(weights: np.ndarray) -> float:
    w = np.asarray(weights)
    w = w / w.sum() if w.sum() else w
    return float(np.sum(w ** 2))
