"""DCC(1,1) with Ledoit-Wolf target, CCC fallback (PROMPT.md 5.2-5.3, 6.3)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
from scipy import optimize


@dataclass
class CorrModel:
    kind: str                 # DCC | CCC | UNIVARIATE
    Qbar: np.ndarray
    A: float = 0.0
    B: float = 0.0
    Q_last: np.ndarray | None = None
    Q_next: np.ndarray | None = None
    R_hist: np.ndarray | None = None     # T x N x N
    shrinkage: float | None = None
    se: dict[str, float] = field(default_factory=dict)
    loglik: float | None = None
    diagnostics: dict[str, Any] = field(default_factory=dict)


def ledoit_wolf_corr(z: np.ndarray) -> tuple[np.ndarray, float]:
    from sklearn.covariance import LedoitWolf

    lw = LedoitWolf().fit(z)
    C = lw.covariance_
    d = np.sqrt(np.diag(C))
    R = C / np.outer(d, d)
    np.fill_diagonal(R, 1.0)
    return R, float(lw.shrinkage_)


def _q_to_r(Q: np.ndarray) -> np.ndarray:
    d = np.sqrt(np.einsum("...ii->...i", Q))
    return Q / (d[..., :, None] * d[..., None, :])


def dcc_filter(z: np.ndarray, Qbar: np.ndarray, A: float, B: float) -> tuple[np.ndarray, np.ndarray]:
    """Return (Q[0..T] incl. one-step-ahead Q[T], R[0..T-1])."""
    T, N = z.shape
    Q = np.empty((T + 1, N, N))
    Q[0] = Qbar
    c = (1 - A - B) * Qbar
    for t in range(1, T + 1):
        zt = z[t - 1][:, None]
        Q[t] = c + A * (zt @ zt.T) + B * Q[t - 1]
    return Q, _q_to_r(Q[:T])


def _negll(theta: np.ndarray, z: np.ndarray, Qbar: np.ndarray) -> float:
    A, B = theta
    if A < 0 or B < 0 or A + B >= 0.9999:
        return 1e12
    _, R = dcc_filter(z, Qbar, A, B)
    sign, logdet = np.linalg.slogdet(R)
    if np.any(sign <= 0):
        return 1e12
    sol = np.linalg.solve(R, z[:, :, None])[:, :, 0]
    quad = np.einsum("ti,ti->t", z, sol)
    return 0.5 * float(np.sum(logdet + quad - np.einsum("ti,ti->t", z, z)))


def fit_dcc(z: np.ndarray) -> CorrModel:
    Qbar, shrink = ledoit_wolf_corr(z)
    best = None
    for x0 in ([0.02, 0.95], [0.05, 0.90], [0.01, 0.98]):
        res = optimize.minimize(_negll, np.array(x0), args=(z, Qbar), method="Nelder-Mead",
                                options={"xatol": 1e-5, "fatol": 1e-4, "maxiter": 400})
        if best is None or res.fun < best.fun:
            best = res
    A, B = (float(v) for v in best.x)
    Q, R = dcc_filter(z, Qbar, A, B)
    se = _numerical_se(np.array([A, B]), z, Qbar)
    return CorrModel("DCC", Qbar, A, B, Q[-2], Q[-1], R, shrink, se, -float(best.fun))


def _numerical_se(theta: np.ndarray, z: np.ndarray, Qbar: np.ndarray, h: float = 1e-4) -> dict[str, float]:
    try:
        H = np.zeros((2, 2))
        f0 = _negll(theta, z, Qbar)
        for i in range(2):
            for j in range(2):
                ei, ej = np.eye(2)[i] * h, np.eye(2)[j] * h
                H[i, j] = (_negll(theta + ei + ej, z, Qbar) - _negll(theta + ei - ej, z, Qbar)
                           - _negll(theta - ei + ej, z, Qbar) + _negll(theta - ei - ej, z, Qbar)) / (4 * h * h)
        _ = f0
        cov = np.linalg.inv(H)
        return {"A": float(np.sqrt(max(cov[0, 0], 0))), "B": float(np.sqrt(max(cov[1, 1], 0)))}
    except Exception:
        return {}


def fit_ccc(z: np.ndarray) -> CorrModel:
    Qbar, shrink = ledoit_wolf_corr(z)
    T = len(z)
    R = np.broadcast_to(Qbar, (T,) + Qbar.shape).copy()
    return CorrModel("CCC", Qbar, 0.0, 0.0, Qbar, Qbar, R, shrink)


def sym_sqrt(R: np.ndarray, inverse: bool = False) -> np.ndarray:
    """Symmetric (spectral) square root for a batch of correlation matrices (...,N,N)."""
    w, V = np.linalg.eigh(R)
    w = np.clip(w, 1e-10, None)
    d = w ** (-0.5 if inverse else 0.5)
    return (V * d[..., None, :]) @ np.swapaxes(V, -1, -2)


def decorrelate(z: np.ndarray, R: np.ndarray) -> np.ndarray:
    """u[t] = R[t]^(-1/2) z[t]."""
    Rm = sym_sqrt(R, inverse=True)
    return np.einsum("tij,tj->ti", Rm, z)
