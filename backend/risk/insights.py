"""Investment (CIO) and risk (CRO) views of one run: decision metrics, key risk indicators and a short memo.

Everything comes from the same simulation as the rest of the client payload. Only client-safe quantities are
produced: no test statistics, p-values or model parameters (CLAUDE.md rule 7). Status thresholds live in
config.yaml (insights, recommend)."""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from risk.factors import capm_beta
from risk.garch import AssetModel
from risk.measures import var_cvar

TRADING_DAYS = 252
QUANTILE_GRID = np.arange(1, 1000) / 1000


def _pct(x: float, sign: bool = False) -> str:
    if x is None or not np.isfinite(x):
        return "—"
    s = f"{abs(x) * 100:.1f}%".replace(".", ",")
    return ("−" if x < 0 else "+" if sign and x > 0 else "") + s


def _money(x: float, ccy: str) -> str:
    """Rounded to 3 significant digits like the UI: 1 017 000 $ (no false precision)."""
    sym = {"USD": "$", "EUR": "€", "GBP": "£", "AZN": "₼"}.get(ccy, ccy)
    if x is None or not np.isfinite(x):
        return "—"
    if abs(x) >= 1000:
        mag = 10 ** (int(np.floor(np.log10(abs(x)))) - 2)
        x = round(x / mag) * mag
    body = f"{abs(x):,.0f}".replace(",", " ")
    return f"{'−' if x < 0 else ''}{body} {sym}"


def _ratio(x: float, digits: int = 2) -> str:
    return f"{x:.{digits}f}".replace(".", ",")


def _status(v: float | None, amber: float, red: float | None = None) -> str:
    if v is None or not np.isfinite(v):
        return "none"
    if red is not None and v > red:
        return "red"
    return "amber" if v > amber else "green"


def _avg_offdiag(C: np.ndarray) -> float | None:
    n = len(C)
    if n < 2:
        return None
    return float((C.sum() - np.trace(C)) / (n * (n - 1)))


def collect(*, models: list[AssetModel], R: pd.DataFrame, mret: pd.Series | None, corr_now: np.ndarray,
            corr_long: np.ndarray, meas: dict[str, Any], mv0: np.ndarray, cash: float, positions: list[dict[str, Any]],
            names: list[str], base: str, rf: float, betas: list[float], H: int, stress: list[dict[str, Any]],
            adv: list[float | None], effective_n: float) -> dict[str, Any]:
    """Everything build_insights needs that only exists inside run_generate (simulation arrays, model state)."""
    V0 = float(mv0.sum() + cash)
    w = mv0 / V0
    sd_now = np.array([np.sqrt(m.next_sigma2) / m.scale for m in models])
    sd_long = np.array([np.sqrt(m.long_run_var) / m.scale for m in models])
    cov_now = np.outer(sd_now, sd_now) * corr_now
    cov_long = np.outer(sd_long, sd_long) * corr_long
    r2 = [capm_beta(R[m.symbol], mret)[1] if mret is not None else 0.0 for m in models]
    # how much of the portfolio's own historical variance the market explains (estimation window, today's weights)
    inv = mv0 / mv0.sum()
    port_hist = np.log(np.exp(R[[m.symbol for m in models]].dropna()) @ inv)
    port_r2 = capm_beta(port_hist, mret)[1] if mret is not None else 0.0
    return {
        "ret_H": meas["_ret_H"], "pnl_assets": meas["_pnl_assets_end"], "V0": V0, "cash": cash, "mv0": mv0, "H": H,
        "base": base, "rf": rf, "names": names, "betas": np.array(betas), "r2": np.array(r2), "port_r2": port_r2,
        "labels": [p["investing_symbol"] for p in positions], "currencies": [p["currency"] for p in positions],
        "exchanges": [p["exchange"] for p in positions], "qty": np.array([p["quantity"] for p in positions]),
        "vol_now": sd_now * np.sqrt(TRADING_DAYS), "vol_long": sd_long * np.sqrt(TRADING_DAYS),
        "port_vol_now": float(np.sqrt(w @ cov_now @ w) * np.sqrt(TRADING_DAYS)),
        "port_vol_long": float(np.sqrt(w @ cov_long @ w) * np.sqrt(TRADING_DAYS)),
        "corr_now": corr_now, "corr_long": corr_long, "risk": meas["risk"], "drawdown": meas["drawdown"],
        "comp_cvar": np.array([a["component_cvar95"] for a in meas["assets"]]), "euler_sum": meas["euler_sum"],
        "stress": stress, "adv": adv, "effective_n": effective_n,
    }


def build_insights(ctx: dict[str, Any], limit: float, cfg: dict[str, Any]) -> dict[str, Any]:
    ic, rc = cfg["insights"], cfg["recommend"]
    ret, pnl = ctx["ret_H"], ctx["pnl_assets"]
    V0, H, ccy = ctx["V0"], ctx["H"], ctx["base"]
    labels, names = ctx["labels"], ctx["names"]
    N = len(labels)
    w = ctx["mv0"] / V0
    ann = np.sqrt(TRADING_DAYS / H)
    rf_H = ctx["rf"] * H / TRADING_DAYS

    # ------------------------------------------------------------------ investment (CIO)
    exp_ret = float(np.mean(ret))
    p05, med, p95 = (float(x) for x in np.quantile(ret, [0.05, 0.5, 0.95]))
    vol_H = float(np.std(ret))
    down = float(np.sqrt(np.mean(np.minimum(ret - rf_H, 0) ** 2)))
    var95, cvar95 = var_cvar(ret, 0.95)
    gains, losses = float(np.mean(np.maximum(ret, 0))), float(np.mean(np.maximum(-ret, 0)))
    contrib = pnl.mean(axis=0)  # expected P&L per position (money)
    standalone = np.array([var_cvar(pnl[:, i] / ctx["mv0"][i], 0.95)[1] * ctx["mv0"][i] if ctx["mv0"][i] else 0.0
                           for i in range(N)])
    risk_share = ctx["comp_cvar"] / ctx["euler_sum"] if ctx["euler_sum"] else np.zeros(N)
    ret_share = contrib / contrib.sum() if contrib.sum() > 0 else np.full(N, np.nan)
    efficiency = np.where(risk_share > 0, ret_share / np.where(risk_share > 0, risk_share, 1), np.nan)
    systematic = float(ctx["port_r2"])
    div_benefit = 1 - cvar95 * V0 / standalone.sum() if standalone.sum() > 0 else 0.0

    positions = []
    for i in range(N):
        e = efficiency[i]
        positions.append({
            "symbol": labels[i], "name": names[i], "weight": float(w[i]),
            "expected_return": float(contrib[i] / ctx["mv0"][i]) if ctx["mv0"][i] else 0.0,
            "return_share": None if np.isnan(ret_share[i]) else float(ret_share[i]),
            "risk_share": float(risk_share[i]), "efficiency": None if np.isnan(e) else float(e),
            # a near-zero risk share is no hedge (and makes the efficiency ratio meaningless)
            "class": "hedge" if risk_share[i] <= -ic["hedge_min_share"]
            else "balanced" if risk_share[i] < ic["hedge_min_share"]
            else "efficient" if e >= ic["efficiency_high"] else "costly" if e <= ic["efficiency_low"] else "balanced",
            "market_sensitivity": float(ctx["betas"][i]), "specific_risk_share": float(1 - ctx["r2"][i]),
            "vol_now": float(ctx["vol_now"][i]), "standalone_cvar_pct": float(standalone[i] / ctx["mv0"][i]) if ctx["mv0"][i] else 0.0,
        })

    def exposure(keys: list[str]) -> list[dict[str, Any]]:
        agg: dict[str, float] = {}
        for k, x in zip(keys, w):
            agg[k] = agg.get(k, 0.0) + float(x)
        if ctx["cash"]:
            agg["nağd"] = agg.get("nağd", 0.0) + ctx["cash"] / V0
        return [{"key": k, "weight": v} for k, v in sorted(agg.items(), key=lambda kv: -kv[1])]

    tail_n = max(1, int(round(len(ret) * 0.05)))
    mdd_med = float(ctx["drawdown"]["mdd_percentiles"]["50"])
    invest_metrics = {
        "expected_return": exp_ret, "expected_money": exp_ret * V0, "median_return": med,
        "range90": [p05, p95], "prob_gain": float(np.mean(ret > 0)),
        "excess_return": exp_ret - rf_H, "rf_period": rf_H,
        "sharpe": (exp_ret - rf_H) / vol_H * ann if vol_H > 0 else None,
        "sortino": (exp_ret - rf_H) / down * ann if down > 0 else None,
        "return_to_cvar": exp_ret / cvar95 if cvar95 > 0 else None,
        "gain_loss_ratio": gains / losses if losses > 0 else None,
        "upside_downside": (p95 - med) / (med - p05) if med - p05 > 0 else None,
        "vol_annual": vol_H * ann, "market_sensitivity": float(w @ ctx["betas"]),
        "systematic_share": systematic, "specific_share": 1 - systematic,
        "diversification_benefit": div_benefit, "standalone_cvar_sum": float(standalone.sum()),
        "effective_n": ctx["effective_n"], "top_weight": float(w.max()) if N else 0.0,
        "cash_share": ctx["cash"] / V0,
        # tail-aware and benchmark-free extras
        "treynor": (exp_ret - rf_H) * TRADING_DAYS / H / float(w @ ctx["betas"]) if float(w @ ctx["betas"]) > 0 else None,
        "rachev": float(np.mean(np.sort(ret)[-tail_n:])) / cvar95 if cvar95 > 0 else None,
        "prob_beat_rf": float(np.mean(ret > rf_H)),
        "calmar": exp_ret / abs(mdd_med) if mdd_med < 0 else None,
        "best_case": p95, "best_case_money": p95 * V0,
    }

    memo_inv = [{
        "tone": "info",
        "text": f"{H} ticarət günündə gözlənilən gəlir {_pct(exp_ret, True)} ({_money(exp_ret * V0, ccy)}). Bu, "
                f"daşıdığınız bazar riskinin mükafatıdır, səhmlər barədə xüsusi proqnoz deyil. Ssenarilərin 90%-i "
                f"{_pct(p05, True)} ilə {_pct(p95, True)} arasındadır.",
    }]
    if invest_metrics["return_to_cvar"] is not None:
        memo_inv.append({"tone": "info",
                         "text": f"Risk-gəlir balansı: pis ssenaridəki hər 1 {ccy} itki (CVaR 95%) qarşılığında "
                                 f"{_ratio(invest_metrics['return_to_cvar'])} {ccy} gözlənilən gəlir"
                                 + (f"; illik Sharpe ≈ {_ratio(invest_metrics['sharpe'])}" if invest_metrics["sharpe"] is not None else "")
                                 + "."})
    spec_status = _status(1 - systematic, ic["idio_share_amber"], ic["idio_share_red"])
    memo_inv.append({"tone": {"green": "good", "amber": "warn", "red": "bad"}.get(spec_status, "info"),
                     "text": f"Riskin {_pct(systematic)}-i bazar riskidir və mükafatlandırılır. Qalan {_pct(1 - systematic)}-i "
                             f"şirkətlərə xas riskdir: bazar bunun üçün əlavə gəlir ödəmir, onu yalnız diversifikasiya azaldır."})
    if N > 1:
        memo_inv.append({"tone": "good" if div_benefit > 0 else "info",
                         "text": f"Diversifikasiya pis ssenari itkisini {_pct(div_benefit)} azaldır: mövqelər ayrılıqda "
                                 f"{_money(standalone.sum(), ccy)} itirərdi, birlikdə {_money(cvar95 * V0, ccy)}. "
                                 f"Effektiv səhm sayı ≈ {_ratio(ctx['effective_n'], 1)}."})
        costly = [p for p in positions if p["class"] == "costly"]
        if costly:
            c = max(costly, key=lambda p: p["risk_share"])
            memo_inv.append({"tone": "warn",
                             "text": f"{c['symbol']} riskin {_pct(c['risk_share'])}-ni daşıyır, gözlənilən gəlirin isə yalnız "
                                     f"{_pct(c['return_share'] or 0)}-ni verir — portfeldə ən baha başa gələn riskdir."})
        best = [p for p in positions if p["class"] == "efficient"]
        if best:
            b = max(best, key=lambda p: p["efficiency"] or 0)
            memo_inv.append({"tone": "good",
                             "text": f"{b['symbol']} ən səmərəli mövqedir: gəlirin {_pct(b['return_share'] or 0)}-ni "
                                     f"riskin {_pct(b['risk_share'])}-i ilə verir."})
        hedges = [p for p in positions if p["class"] == "hedge"]
        if hedges:
            memo_inv.append({"tone": "good",
                             "text": f"{', '.join(h['symbol'] for h in hedges)} portfeli sığortalayır: pis ssenarilərdə adətən "
                                     f"digərləri ilə birgə düşmür və ümumi quyruq itkisini azaldır "
                                     f"(töhfə {', '.join(_pct(h['risk_share']) for h in hedges)})."})

    # ------------------------------------------------------------------ risk (CRO)
    # 99% measures stay in result.risk only: the run view hides them when the model is unreliable
    use = cvar95 / limit if limit else None
    beyond = float(np.mean(ret < -limit)) if limit else None
    regime = ctx["port_vol_now"] / ctx["port_vol_long"] if ctx["port_vol_long"] > 0 else None
    c_now, c_long = _avg_offdiag(ctx["corr_now"]), _avg_offdiag(ctx["corr_long"])
    pair = None
    if N > 1:
        C = ctx["corr_now"].copy()
        np.fill_diagonal(C, -np.inf)
        i, j = np.unravel_index(int(np.argmax(C)), C.shape)
        pair = {"a": labels[i], "b": labels[j], "value": float(ctx["corr_now"][i, j])}
    order = np.argsort(-risk_share)
    top3 = float(risk_share[order[:3]].sum()) if N else 0.0
    lvl = ic["drawdown_level"]
    ex = min(ctx["drawdown"]["exceedance"], key=lambda e: abs(e["x"] - lvl))
    worst = max(ctx["stress"], key=lambda s: s["loss_pct"]) if ctx["stress"] else None
    stress_x = worst["loss_pct"] / limit if worst and limit else None
    part = ic["liquidity_participation"]
    liq = [float(ctx["qty"][i] / (part * a)) if a else None for i, a in enumerate(ctx["adv"])]
    liq_known = [x for x in liq if x is not None]
    liq_max = max(liq_known) if liq_known else None

    kri = [
        {"key": "limit_use", "label": "Risk limitindən istifadə (CVaR 95% / limit)", "value": use, "kind": "pct",
         "status": _status(use, ic["limit_use_amber"], 1.0),
         "hint": (f"Limit {_pct(limit)}; " + (f"ehtiyat {_money((limit - cvar95) * V0, ccy)}." if cvar95 <= limit
                                                else f"aşım {_money((cvar95 - limit) * V0, ccy)}.")) if limit else ""},
        {"key": "beyond_limit", "label": "Dövrün sonunda limitdən çox itki ehtimalı", "value": beyond, "kind": "prob",
         "status": "none", "hint": "Limit CVaR ilə qoyulur; bu, limitin özünün aşılma ehtimalıdır."},
        {"key": "stress", "label": "Ən pis stress ssenarisi / limit", "value": stress_x, "kind": "times",
         "status": _status(stress_x, 1.0, ic["stress_limit_red"]),
         "hint": f"{worst['name']}: {_pct(-worst['loss_pct'], True)}" if worst else ""},
        {"key": "vol_regime", "label": "Volatillik rejimi (indi / uzunmüddətli norma)", "value": regime, "kind": "times",
         "status": _status(regime, ic["vol_regime_amber"], ic["vol_regime_red"]),
         "hint": f"İllik {_pct(ctx['port_vol_now'])}, norma {_pct(ctx['port_vol_long'])}."},
        {"key": "drawdown", "label": f"Dövr ərzində −{_pct(lvl)}-ə toxunma ehtimalı", "value": ex["p_touch"], "kind": "prob",
         "status": _status(ex["p_touch"], ic["drawdown_touch_amber"], ic["drawdown_touch_red"]),
         "hint": f"Maksimal drawdown medianı {_pct(ctx['drawdown']['mdd_percentiles']['50'])}."},
        {"key": "top_weight", "label": "Ən böyük mövqenin çəkisi", "value": float(w.max()) if N else None, "kind": "pct",
         "status": _status(float(w.max()) if N else None, rc["max_position_weight"], rc["max_cluster_weight"]),
         "hint": labels[int(np.argmax(w))] if N else ""},
        {"key": "top3_risk", "label": "Üç ən riskli mövqenin CVaR payı", "value": top3, "kind": "pct",
         "status": _status(top3, ic["top3_risk_amber"], ic["top3_risk_red"]) if N > 3 else "none",
         "hint": ", ".join(labels[k] for k in order[:3])},
        {"key": "corr", "label": "Orta korrelyasiya (indi)", "value": c_now, "kind": "ratio",
         "status": _status(c_now, ic["corr_amber"], ic["corr_red"]),
         "hint": (f"Uzunmüddətli {_ratio(c_long)}" if c_long is not None else "")
                 + (f"; ən güclü cüt {pair['a']}–{pair['b']} {_ratio(pair['value'])}" if pair else "")},
        {"key": "specific", "label": "Şirkətə xas (mükafatsız) risk payı", "value": 1 - systematic, "kind": "pct",
         "status": spec_status, "hint": "Bazarın izah etmədiyi dəyişkənlik."},
        {"key": "liquidity", "label": "Ən uzun satış müddəti (gün)", "value": liq_max, "kind": "days",
         "status": _status(liq_max, ic["liquidity_days_amber"], ic["liquidity_days_red"]),
         "hint": f"Gündəlik həcmin {_pct(part)}-i ilə satmaq şərtilə."},
        {"key": "tail", "label": "Quyruq dərinliyi (CVaR 95% / VaR 95%)", "value": cvar95 / var95 if var95 > 0 else None,
         "kind": "times", "status": "none", "hint": "Normal paylanmada ≈ 1,25; böyük dəyər — dərin quyruq."},
    ]

    kri_by = {k["key"]: k for k in kri}
    memo_risk = []
    if use is not None:
        memo_risk.append({"tone": {"green": "good", "amber": "warn", "red": "bad"}[_status(use, ic["limit_use_amber"], 1.0)],
                          "text": (f"Risk iştahı: CVaR 95% {_money(cvar95 * V0, ccy)} ({_pct(cvar95)}) — limitin {_pct(use)}-i. "
                                   + (f"Ehtiyat {_money((limit - cvar95) * V0, ccy)}." if use <= 1
                                      else f"Limit {_money((cvar95 - limit) * V0, ccy)} aşılıb."))})
    if regime is not None:
        st = _status(regime, ic["vol_regime_amber"], ic["vol_regime_red"])
        memo_risk.append({"tone": {"green": "info", "amber": "warn", "red": "bad"}[st],
                          "text": f"Volatillik indi uzunmüddətli normanın {_ratio(regime)}×-idir (illik {_pct(ctx['port_vol_now'])}, "
                                  f"norma {_pct(ctx['port_vol_long'])}). "
                                  + ("Bazar sakitdir: risk ölçüləri normadan aşağıdır və sakitlik pozularsa sürətlə arta bilər."
                                     if regime < 1 else "Risk normadan yüksək rejimdədir." if st != "green" else "")})
    if N > 1:
        memo_risk.append({"tone": {"green": "info", "amber": "warn", "red": "bad"}.get(kri_by["top3_risk"]["status"], "info"),
                          "text": f"Riskin {_pct(top3)}-i {', '.join(labels[k] for k in order[:min(3, N)])} mövqelərindədir; "
                                  f"ən böyük töhfə {labels[order[0]]} ({_pct(risk_share[order[0]])}, çəkisi {_pct(w[order[0]])})."})
    if worst:
        memo_risk.append({"tone": {"green": "info", "amber": "warn", "red": "bad"}[_status(stress_x, 1.0, ic["stress_limit_red"])],
                          "text": f"Ən pis stress ssenarisi — {worst['name']}: {_money(-worst['loss_money'], ccy)} "
                                  f"({_pct(-worst['loss_pct'], True)}), limitin {_ratio(stress_x or 0)}×-i. Bu ehtimal deyil, ssenaridir."})
    memo_risk.append({"tone": {"green": "info", "amber": "warn", "red": "bad"}[kri_by["drawdown"]["status"]],
                      "text": f"Dövr ərzində portfelin ən azı bir dəfə −{_pct(lvl)}-ə düşmə ehtimalı {_pct(ex['p_touch'])}; "
                              f"dövrün sonunda bu səviyyədən aşağı qalma ehtimalı {_pct(ex['p_end'])}."})

    vol_rows = [{"symbol": labels[i], "now": float(ctx["vol_now"][i]), "long": float(ctx["vol_long"][i]),
                 "ratio": float(ctx["vol_now"][i] / ctx["vol_long"][i]) if ctx["vol_long"][i] > 0 else None,
                 "liquidity_days": liq[i]} for i in range(N)]
    return {
        "investment": {"memo": memo_inv, "metrics": invest_metrics, "positions": positions,
                       "exposure": {"currency": exposure(ctx["currencies"]), "exchange": exposure(ctx["exchanges"])}},
        "risk": {"memo": memo_risk, "kri": kri,
                 "metrics": {"cvar95": cvar95, "var95": var95, "limit": limit, "limit_use": use,
                             "headroom_money": (limit - cvar95) * V0 if limit else None, "beyond_limit": beyond,
                             "vol_now": ctx["port_vol_now"], "vol_long": ctx["port_vol_long"], "vol_regime": regime,
                             "corr_now": c_now, "corr_long": c_long, "corr_pair": pair, "top3_risk": top3,
                             "skewness": float(((ret - ret.mean()) ** 3).mean() / ret.std() ** 3) if ret.std() > 0 else None,
                             "excess_kurtosis": float(((ret - ret.mean()) ** 4).mean() / ret.std() ** 4 - 3) if ret.std() > 0 else None,
                             "semidev_annual": float(np.sqrt(np.mean(np.minimum(ret, 0) ** 2)) * ann),
                             "prob_loss": float(np.mean(ret < 0)), "worst_case": float(np.quantile(ret, 0.001))},
                 # horizon-return quantiles at p = 0.001 ... 0.999: the UI computes VaR/CVaR at any confidence level and
                 # the probability of any loss threshold from these (no re-run needed)
                 "quantiles": np.round(np.quantile(ret, QUANTILE_GRID), 6).tolist(),
                 "assets": vol_rows},
    }
