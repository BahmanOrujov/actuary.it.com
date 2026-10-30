"""Filtered Historical Simulation with DCC and parameter uncertainty (PROMPT.md 5.3)."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.config import get_settings
from risk.dcc import CorrModel, _q_to_r, sym_sqrt
from risk.garch import SQRT_2_PI, AssetModel, draw_param_sets


@dataclass
class SimOutput:
    log_returns: np.ndarray   # S x H x N  daily simulated log-returns (unscaled)
    param_set: np.ndarray     # S  index of parameter set used by each scenario


def simulate_paths(
    models: list[AssetModel],
    corr: CorrModel,
    pool_u: np.ndarray,       # T_pool x N  decorrelated shocks (or z for univariate/CCC)
    mu_daily: np.ndarray,     # N  drift per day (log-return units, unscaled)
    horizon: int,
    scenarios: int,
    param_sets: int,
    rng: np.random.Generator,
    param_uncertainty: bool = True,
) -> SimOutput:
    N = len(models)
    S, H, K = scenarios, horizon, max(1, min(param_sets, scenarios))
    # parameter draws per asset: K x 4
    draws = np.stack(
        [draw_param_sets(m, K, rng) if param_uncertainty else np.tile([m.params[k] for k in ("omega", "alpha", "gamma", "beta")], (K, 1))
         for m in models],
        axis=1,
    )  # K x N x 4
    set_idx = np.repeat(np.arange(K), int(np.ceil(S / K)))[:S]
    w = draws[set_idx, :, 0]
    a = draws[set_idx, :, 1]
    g = draws[set_idx, :, 2]
    b = draws[set_idx, :, 3]
    kinds = np.array([m.kind for m in models])
    is_eg = kinds == "EGARCH"
    is_ewma = kinds == "EWMA"
    lam = np.array([m.params.get("lambda", 0.0) for m in models])

    s2 = np.tile(np.array([m.next_sigma2 for m in models]), (S, 1))  # S x N  (scaled^2)
    scale = np.array([m.scale for m in models])
    cap = float(get_settings()["model"]["max_daily_log_return"])
    s2_cap = (cap * scale) ** 2  # daily volatility never above the one-day bound
    use_dcc = corr.kind == "DCC" and N > 1
    if use_dcc:
        Q = np.broadcast_to(corr.Q_next, (S, N, N)).copy()
        c = (1 - corr.A - corr.B) * corr.Qbar
    elif N > 1:
        Rhalf = sym_sqrt(corr.Qbar)
    out = np.empty((S, H, N), dtype=np.float32)  # daily log-returns; float32 halves memory for large S x N
    T_pool = len(pool_u)
    for h in range(H):
        tau = rng.integers(0, T_pool, S)
        u = pool_u[tau]  # S x N, whole cross-section from one historical date
        if use_dcc:
            R = _q_to_r(Q)
            z = np.einsum("sij,sj->si", sym_sqrt(R), u)
        elif N > 1:
            z = u @ Rhalf.T
        else:
            z = u
        # physical bound on a simulated day: a draw beyond it comes from a mis-specified fit, not from the
        # market, and unbounded it compounds to inf/NaN over 63 days
        e = np.clip(np.sqrt(s2) * z, -cap * scale, cap * scale)
        out[:, h, :] = mu_daily + e / scale
        # variance update
        nxt = w + (a + g * (e < 0)) * e ** 2 + b * s2
        if is_eg.any():
            lg = w + a * (np.abs(z) - SQRT_2_PI) + g * z + b * np.log(s2)
            nxt = np.where(is_eg, np.exp(np.clip(lg, -50, 50)), nxt)
        if is_ewma.any():
            nxt = np.where(is_ewma, lam * s2 + (1 - lam) * e ** 2, nxt)
        s2 = np.clip(nxt, 1e-12, s2_cap)
        if use_dcc:
            Q = c + corr.A * np.einsum("si,sj->sij", z, z) + corr.B * Q
    return SimOutput(out, set_idx)


def build_pool(models: list[AssetModel], corr: CorrModel, Z: np.ndarray | None = None) -> np.ndarray:
    """Decorrelated shock pool on dates where all instruments have data.

    The pool is centred: with a robust (e.g. Student-t) likelihood the fitted constant mean is a location
    estimate, so standardized residuals need not average zero, and resampling them would add an unintended
    drift of sigma * mean(z) per day. Centring leaves the drift entirely to mu_daily (CAPM / zero-drift).
    The scale is kept as is so the empirical distribution (including any variance misfit) is preserved.
    Z: standardized residuals on the common dates (T x N); defaults to the models' own (equal-length) z."""
    if Z is None:
        Z = np.column_stack([m.z for m in models])
    if corr.kind == "DCC" and Z.shape[1] > 1 and corr.R_hist is not None:
        from risk.dcc import decorrelate

        pool = decorrelate(Z, corr.R_hist)
    elif Z.shape[1] > 1:
        pool = Z @ sym_sqrt(corr.Qbar, inverse=True).T
    else:
        pool = Z
    return pool - pool.mean(axis=0)
