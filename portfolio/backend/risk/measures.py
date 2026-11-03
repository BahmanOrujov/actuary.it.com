"""Risk measures from simulated paths (PROMPT.md 3.4, 5.4)."""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def var_cvar(ret: np.ndarray, level: float) -> tuple[float, float]:
    """VaR(a) = -q_{1-a}(return); CVaR = mean loss of scenarios at least as bad as the VaR boundary."""
    q = np.quantile(ret, 1 - level)
    tail = ret[ret <= q]
    return float(-q), float(-tail.mean()) if len(tail) else float(-q)


def mc_standard_error(ret: np.ndarray, level: float, batches: int = 20) -> dict[str, float]:
    """Batch-means Monte Carlo standard errors for VaR and CVaR."""
    n = len(ret) // batches
    if n < 50:
        return {"var_se": float("nan"), "cvar_se": float("nan"), "var_rel": float("nan"), "cvar_rel": float("nan")}
    vs, cs = [], []
    for b in range(batches):
        v, c = var_cvar(ret[b * n:(b + 1) * n], level)
        vs.append(v)
        cs.append(c)
    v_full, c_full = var_cvar(ret, level)
    v_se = float(np.std(vs, ddof=1) / np.sqrt(batches))
    c_se = float(np.std(cs, ddof=1) / np.sqrt(batches))
    return {
        "var": v_full, "cvar": c_full, "var_se": v_se, "cvar_se": c_se,
        "var_rel": v_se / abs(v_full) if v_full else float("inf"),
        "cvar_rel": c_se / abs(c_full) if c_full else float("inf"),
    }


def max_drawdown(paths: np.ndarray, v0: float) -> np.ndarray:
    full = np.concatenate([np.full((paths.shape[0], 1), v0), paths], axis=1)
    peak = np.maximum.accumulate(full, axis=1)
    return ((full - peak) / peak).min(axis=1)  # negative numbers


def euler_cvar(pnl_assets: np.ndarray, pnl_port: np.ndarray, level: float) -> np.ndarray:
    """Component CVaR_i = -E[PnL_i | PnL_port <= -VaR]. Components sum to portfolio CVaR (money)."""
    q = np.quantile(pnl_port, 1 - level)
    mask = pnl_port <= q
    return -pnl_assets[mask].mean(axis=0)


def compute_measures(
    log_ret: np.ndarray,           # S x H x N
    mv0: np.ndarray,               # N  market value today (base ccy)
    cost: np.ndarray,              # N  cost basis of open lots (base ccy)
    qty: np.ndarray,               # N
    cash: float,
    checkpoints: list[int],
    cfg: dict[str, Any],
    sample_paths: int,
    sell_idx: np.ndarray | None = None,  # N  planned sale session per position (>= H: held to the horizon)
) -> dict[str, Any]:
    S, H, N = log_ret.shape
    pct = cfg["model"]["percentiles"]
    cum = np.exp(np.cumsum(log_ret, axis=1, dtype=np.float32))  # S x H x N
    pos_val = cum * mv0[None, None, :].astype(np.float32)
    if sell_idx is not None:
        # a planned sale turns the position into cash at that session's close: its value stays put afterwards
        for i in np.flatnonzero(sell_idx < H - 1):
            k = int(sell_idx[i])
            pos_val[:, k + 1:, i] = pos_val[:, k:k + 1, i]
    V = pos_val.sum(axis=2, dtype=np.float64) + cash  # S x H
    V0 = float(mv0.sum() + cash)
    cost_total = float(cost.sum() + cash)
    ret_H = V[:, -1] / V0 - 1

    fan = np.percentile(V, pct, axis=0).T  # H x P
    out: dict[str, Any] = {"V0": V0, "cost_total": cost_total, "fan": fan.tolist(), "percentiles": pct}

    thresholds = cfg["model"]["loss_thresholds"]
    cps = []
    for i in checkpoints:
        v = V[:, i]
        pnl = v - cost_total
        cps.append({
            "h": i + 1,
            "median": float(np.median(v)),
            "p05": float(np.quantile(v, 0.05)), "p25": float(np.quantile(v, 0.25)),
            "p75": float(np.quantile(v, 0.75)), "p95": float(np.quantile(v, 0.95)),
            "pnl_median": float(np.median(pnl)),
            "pnl_p05": float(np.quantile(pnl, 0.05)), "pnl_p25": float(np.quantile(pnl, 0.25)),
            "pnl_p75": float(np.quantile(pnl, 0.75)), "pnl_p95": float(np.quantile(pnl, 0.95)),
            "prob_loss_vs_today": float(np.mean(v < V0)),
            "prob_profit_vs_cost": float(np.mean(v > cost_total)),
            "prob_loss_over": {str(t): float(np.mean(v / V0 - 1 < -t)) for t in thresholds},
        })
    out["checkpoints"] = cps

    risk = {}
    for lv in (0.95, 0.99):
        v, c = var_cvar(ret_H, lv)
        risk[str(lv)] = {"var_pct": v, "cvar_pct": c, "var_money": v * V0, "cvar_money": c * V0}
    out["risk"] = risk
    out["mc_error"] = {str(lv): mc_standard_error(ret_H, lv) for lv in (0.95, 0.99)}

    pnl_cost = V[:, -1] - cost_total
    rel_cost = V[:, -1] / cost_total - 1 if cost_total else ret_H
    out["pnl_end"] = {
        "median": float(np.median(pnl_cost)),
        "p05": float(np.quantile(pnl_cost, 0.05)), "p25": float(np.quantile(pnl_cost, 0.25)),
        "p75": float(np.quantile(pnl_cost, 0.75)), "p95": float(np.quantile(pnl_cost, 0.95)),
        "prob_profit": float(np.mean(pnl_cost > 0)),
        "prob_loss_over": {str(t): float(np.mean(rel_cost < -t)) for t in thresholds},
        "loss_cvar95_vs_cost": float(-np.mean(np.sort(pnl_cost)[: max(1, int(0.05 * S))])),
    }

    # end-of-horizon histogram of returns; the most extreme 0.1% on each side are counted, not clipped into
    # the edge bins (clipping piles tail mass into a misleading spike)
    lo, hi = np.quantile(ret_H, [0.001, 0.999])
    counts, edges = np.histogram(ret_H, bins=40, range=(lo, hi))
    out["histogram"] = {"edges": edges.tolist(), "counts": counts.tolist(),
                        "below": int(np.sum(ret_H < lo)), "above": int(np.sum(ret_H > hi))}

    # drawdown and first passage
    mdd = max_drawdown(V, V0)
    grid = np.round(np.arange(0.0, 0.51, 0.025), 3)
    path_min = V.min(axis=1) / V0 - 1
    out["drawdown"] = {
        "mdd_percentiles": {str(p): float(np.percentile(mdd, p)) for p in (5, 25, 50, 75, 95)},
        "exceedance": [{"x": float(x), "p_drawdown": float(np.mean(mdd <= -x)),
                        "p_touch": float(np.mean(path_min <= -x)),
                        "p_end": float(np.mean(ret_H <= -x))} for x in grid],
    }

    # per-asset
    pnl_assets = pos_val[:, -1, :] - mv0[None, :]
    comp = euler_cvar(pnl_assets.astype(np.float64), V[:, -1] - V0, 0.95)
    assets = []
    for i in range(N):
        px_paths = cum[:, :, i] * (mv0[i] / qty[i] if qty[i] else 0)
        end_px = px_paths[:, -1]
        end_val = pos_val[:, -1, i]  # differs from end_px * qty when the position is sold before the horizon
        unit_cost = cost[i] / qty[i] if qty[i] else 0.0
        a = {
            "fan": np.percentile(px_paths, pct, axis=0).T.tolist(),
            "end": {p: float(np.percentile(end_px, q)) for p, q in
                    (("p05", 5), ("p25", 25), ("median", 50), ("p75", 75), ("p95", 95))},
            "end_q": np.percentile(end_px, np.arange(1, 100)).round(6).tolist(),
            "price0": float(mv0[i] / qty[i]) if qty[i] else 0.0,
            "prob_up": float(np.mean(end_px > (mv0[i] / qty[i] if qty[i] else 0))),
            "prob_profit": float(np.mean(end_val > cost[i])),
            "pnl_end": {p: float(np.percentile(end_val - cost[i], q)) for p, q in
                        (("p05", 5), ("p25", 25), ("median", 50), ("p75", 75), ("p95", 95))},
            "component_cvar95": float(comp[i]),
            "weight": float(mv0[i] / V0) if V0 else 0.0,
        }
        if mv0[i] < cost[i]:
            a["prob_break_even"] = float(np.mean(px_paths.max(axis=1) >= unit_cost))
        assets.append(a)
    out["assets"] = assets
    out["euler_sum"] = float(comp.sum())

    # representative sample paths at spread terminal ranks
    order = np.argsort(V[:, -1])
    ranks = np.linspace(0.05, 0.95, sample_paths)
    out["sample_paths"] = [V[order[int(r * (S - 1))]].tolist() for r in ranks]
    out["_ret_H"] = ret_H
    out["_pnl_assets_end"] = pnl_assets
    out["_V_end"] = V[:, -1]
    return out


def prob_target(px_paths_end: np.ndarray, target: float) -> float:
    return float(np.mean(px_paths_end >= target))


def actual_measures(val: pd.Series, horizon: int, cfg: dict[str, Any], level: float = 0.95) -> dict[str, Any]:
    """What the current holdings actually did on past prices, measured the way the model measures the future:
    return over the last `horizon` sessions, realised annual volatility, maximum drawdown, and CVaR of rolling
    `horizon`-session returns. A measure without enough history is None."""
    val = val.dropna()
    year = val.iloc[-(cfg["vol_days"] + 1):]
    daily = year.pct_change().dropna()
    roll = (val / val.shift(horizon) - 1).dropna().iloc[-cfg["tail_days"]:]
    cvar = var_cvar(roll.to_numpy(), level)[1] if len(roll) >= cfg["min_windows"] else None
    return {
        "return_period": float(val.iloc[-1] / val.iloc[-1 - horizon] - 1) if len(val) > horizon else None,
        "vol_annual": float(daily.std(ddof=1) * np.sqrt(252)) if len(daily) > 1 else None,
        "max_drawdown": float((year / year.cummax() - 1).min()) if len(year) > 1 else None,
        "cvar95_pct": cvar,
        "windows": int(len(roll)),
        "since": val.index[0].date().isoformat() if len(val) else None,
    }
