"""Risk-based recommendations (PROMPT.md 7.1). Based on forward-looking risk, never on cost basis."""
from __future__ import annotations

from typing import Any

import numpy as np

from app.i18n import L, cfg_text


def _pct(x: float) -> str:
    """Percentage with one decimal, decimal comma in Azerbaijani: 0.172 -> "17,2%" / "17.2%"."""
    s = f"{x * 100:.1f}%"
    return L(s.replace(".", ","), s)


def _num(x: float) -> str:
    """Azerbaijani number: 1234.5 -> "1 234,50"."""
    return f"{x:,.2f}".replace(",", " ").replace(".", ",")


def scenario_cvar(pnl_assets: np.ndarray, keep: np.ndarray, level: float = 0.95) -> float:
    """Portfolio CVaR (money) after scaling each position by keep[i] (sold value goes to cash, zero P&L)."""
    pnl = pnl_assets @ keep
    q = np.quantile(pnl, 1 - level)
    return float(-pnl[pnl <= q].mean())


def _reduce_to_ratio(pnl_assets: np.ndarray, mv: np.ndarray, V: float, i: int, ratio_max: float) -> float:
    """Fraction of position i to sell so that its CVaR share / weight <= ratio_max (bisection, exact scenarios)."""
    def ratio(f: float) -> float:
        keep = np.ones(len(mv))
        keep[i] = 1 - f
        pnl = pnl_assets @ keep
        q = np.quantile(pnl, 0.05)
        mask = pnl <= q
        comp_i = -pnl_assets[mask, i].mean() * keep[i]
        total = -pnl[mask].mean()
        w = mv[i] * keep[i] / V
        return (comp_i / total) / w if total > 0 and w > 0 else 0.0

    if ratio(0.0) <= ratio_max:
        return 0.0
    lo, hi = 0.0, 0.95
    if ratio(hi) > ratio_max:
        return hi
    for _ in range(25):
        mid = (lo + hi) / 2
        if ratio(mid) > ratio_max:
            lo = mid
        else:
            hi = mid
    return hi


def build_recommendations(ctx: dict[str, Any], cfg: dict[str, Any], reliability: str) -> list[dict[str, Any]]:
    """ctx: symbols, names, qty, mv, price, pnl_assets (S x N end P&L), V, limit, clusters, stress, targets,
    asset_end (per-asset end percentiles), cvar95 (money)."""
    rc = cfg["recommend"]
    syms: list[str] = ctx["symbols"]
    names: list[str] = ctx["names"]
    qty = np.asarray(ctx["qty"], float)
    mv = np.asarray(ctx["mv"], float)
    price = np.asarray(ctx["price"], float)
    P = np.asarray(ctx["pnl_assets"], float)
    V = float(ctx["V"])
    N = len(syms)
    base_keep = np.ones(N)
    cvar_now = scenario_cvar(P, base_keep)
    limit_money = ctx["limit"] * V
    recs: list[dict[str, Any]] = []
    disclaimer = cfg_text(rc, "disclaimer")
    history = ctx.get("basis") == "history"
    bad = (L("keçmişin ən pis 3 aylıq dövrlərindəki", "the worst past 3-month periods'") if history
           else L("pis ssenarilərdəki", "bad scenarios'"))

    def rec(kind: str, action: str, i: int | None, frac: float, reason: str, extra: dict | None = None) -> None:
        keep = base_keep.copy()
        if i is not None:
            keep[i] = 1 - frac
        after = scenario_cvar(P, keep) if i is not None and frac > 0 else cvar_now
        shares = float(qty[i] * frac) if i is not None else 0.0
        recs.append({
            "kind": kind, "action": action,
            "symbol": syms[i] if i is not None else None,
            "name": names[i] if i is not None else None,
            "shares": round(shares, 4), "money": float(shares * price[i]) if i is not None else 0.0,
            "reason": reason,
            "cvar_before": cvar_now, "cvar_after": after,
            "cvar_before_pct": cvar_now / V, "cvar_after_pct": after / V,
            "reliability": reliability, "disclaimer": disclaimer, **(extra or {}),
        })

    # component CVaR shares
    q = np.quantile(P.sum(axis=1), 0.05)
    mask = P.sum(axis=1) <= q
    comp = -P[mask].mean(axis=0)
    w = mv / V
    total = comp.sum()
    flagged: set[int] = set()
    if N > 1 and total > 0:
        for i in range(N):
            share = comp[i] / total
            if w[i] > 0 and share / w[i] > rc["risk_share_ratio"]:
                frac = _reduce_to_ratio(P, mv, V, i, rc["risk_share_ratio"])
                if frac > 0.005:
                    flagged.add(i)
                    rec("risk_share", "reduce", i, frac,
                        L(f"{names[i]} portfelin {w[i]:.0%} hissəsidir, amma {bad} itkinin "
                          f"{share:.0%}-ni verir. Mövqeni azaltmaq riski payına uyğunlaşdırar.",
                          f"{names[i]} is {w[i]:.0%} of the portfolio but causes {share:.0%} of {bad} loss. "
                          "Reducing the position would bring its risk in line with its weight."))

    # limit breach: greedy sells by marginal CVaR per money unit
    if cvar_now > limit_money and N >= 1:
        marginal = comp / np.maximum(mv, 1e-9)
        keep = base_keep.copy()
        order = np.argsort(-marginal)
        steps = []
        for i in order:
            if scenario_cvar(P, keep) <= limit_money:
                break
            lo, hi = 0.0, 1.0
            keep_hi = keep.copy()
            keep_hi[i] = 0.0
            if scenario_cvar(P, keep_hi) > limit_money:
                keep = keep_hi
                steps.append((i, 1.0))
                continue
            for _ in range(25):
                mid = (lo + hi) / 2
                k2 = keep.copy()
                k2[i] = 1 - mid
                if scenario_cvar(P, k2) > limit_money:
                    lo = mid
                else:
                    hi = mid
            keep[i] = 1 - hi
            steps.append((i, hi))
        for i, frac in steps:
            if i in flagged:
                continue
            rec("limit", "reduce", i, frac,
                L(f"Portfelin {'keçmişdəki ' if history else ''}3 aylıq CVaR 95%-i ({_pct(cvar_now / V)}) seçdiyiniz limiti ({ctx['limit']:.0%}) keçir. "
                  f"{names[i]} satılan hər pul vahidi üçün riski ən çox azaldan mövqelərdəndir.",
                  f"The portfolio's {'past ' if history else ''}3-month CVaR 95% ({_pct(cvar_now / V)}) exceeds your limit ({ctx['limit']:.0%}). "
                  f"Per unit of money sold, {names[i]} is among the positions that reduce the risk the most."))
            flagged.add(i)

    # concentration
    for i in range(N):
        if w[i] > rc["max_position_weight"]:
            rec("concentration", "attention", i, 0.0,
                L(f"{names[i]} portfelin {w[i]:.0%}-ni təşkil edir (hədd {rc['max_position_weight']:.0%}). "
                  "Diversifikasiyanı nəzərdən keçirin.",
                  f"{names[i]} is {w[i]:.0%} of the portfolio (threshold {rc['max_position_weight']:.0%}). "
                  "Consider diversifying."))
    labels = ctx.get("clusters") or []
    if labels and N > 2:
        for lab in set(labels):
            members = [i for i in range(N) if labels[i] == lab]
            cw = float(w[members].sum())
            if len(members) > 1 and cw > rc["max_cluster_weight"]:
                recs.append({
                    "kind": "cluster", "action": "attention", "symbol": None,
                    "name": ", ".join(names[i] for i in members), "shares": 0.0, "money": 0.0,
                    "reason": L(f"Bir-biri ilə sıx əlaqəli səhmlər ({', '.join(names[i] for i in members)}) "
                                f"portfelin {cw:.0%}-ni təşkil edir (hədd {rc['max_cluster_weight']:.0%}). "
                                "Onlar adətən birlikdə düşür.",
                                f"Closely related stocks ({', '.join(names[i] for i in members)}) make up "
                                f"{cw:.0%} of the portfolio (threshold {rc['max_cluster_weight']:.0%}). "
                                "They usually fall together."),
                    "cvar_before": cvar_now, "cvar_after": cvar_now, "cvar_before_pct": cvar_now / V,
                    "cvar_after_pct": cvar_now / V, "reliability": reliability, "disclaimer": disclaimer,
                })

    # stress sensitivity
    for sc in ctx.get("stress", []):
        if sc.get("loss_money", 0) > limit_money:
            top = sorted(sc["by_asset"], key=lambda a: a["loss_money"], reverse=True)[:3]
            recs.append({
                "kind": "stress", "action": "attention", "symbol": None, "name": sc["name"],
                "shares": 0.0, "money": 0.0,
                "reason": L(f"“{sc['name']}” ssenarisində itki ({_pct(sc['loss_pct'])}) risk limitini keçir. "
                            f"Əsas səbəb: {', '.join(a['name'] for a in top)}. Bu, ehtimal deyil, ssenaridir.",
                            f"In the “{sc['name']}” scenario the loss ({_pct(sc['loss_pct'])}) exceeds the risk limit. "
                            f"Main drivers: {', '.join(a['name'] for a in top)}. This is a scenario, not a probability."),
                "cvar_before": cvar_now, "cvar_after": cvar_now, "cvar_before_pct": cvar_now / V,
                "cvar_after_pct": cvar_now / V, "reliability": reliability, "disclaimer": disclaimer,
            })

    # targets and stop-loss
    for t in ctx.get("targets", []):
        i = t["index"]
        end = ctx["asset_end"][i]
        msg = []
        extra: dict[str, Any] = {}
        if t.get("target_price"):
            extra["prob_target"] = t.get("prob_target")
            extra["prob_touch_target"] = t.get("prob_touch_target")
            msg.append(L(f"Hədəf qiymətə ({_num(t['target_price'])}) dövrün sonunda çatma ehtimalı "
                         f"təxminən {t.get('prob_target', 0):.0%}, dövr ərzində toxunma ehtimalı {t.get('prob_touch_target', 0):.0%}.",
                         f"Probability of being at the target price ({_num(t['target_price'])}) at the end of the period is "
                         f"about {t.get('prob_target', 0):.0%}; probability of touching it during the period {t.get('prob_touch_target', 0):.0%}."))
        if t.get("stop_loss"):
            if end["p25"] <= t["stop_loss_base"] <= end["p75"]:
                msg.append(L("Stop-loss səviyyəsi gözlənilən 50% aralığın içindədir: adi dalğalanmada tez-tez işə düşə bilər.",
                             "The stop-loss is inside the expected 50% range: ordinary swings may trigger it often."))
            extra["prob_touch_stop"] = t.get("prob_touch_stop")
        if msg:
            rec("target", "attention", i, 0.0, " ".join(msg), extra)

    # hold for the rest
    mentioned = {r["symbol"] for r in recs if r.get("symbol")}
    for i in range(N):
        if syms[i] not in mentioned:
            rec("hold", "hold", i, 0.0, L(f"{names[i]} üçün risk göstəriciləri həddlər daxilindədir; dəyişiklik tələb olunmur.",
                                          f"{names[i]}'s risk measures are within the thresholds; no change is needed."))
    for r in recs:
        r["basis"] = "history" if history else "model"
    return recs
