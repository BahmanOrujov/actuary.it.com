"""Signal-based recommendations - stage B (PROMPT.md 7.2). Disabled until the validation gates are passed.

Planned design (not implemented): LightGBM ranking of 1-3 month relative returns trained on a broad universe of
the same market (momentum 12-1, short-term reversal, volatility, beta, drawdown; fundamentals if available),
benchmarked against a simple factor score by Spearman IC and its stability; purged/embargoed walk-forward
validation with costs and slippage, Deflated Sharpe Ratio, comparison with hold / equal weight / momentum, and
3-6 months of paper trading. Signals would enter Black-Litterman as views (confidence from IC) with the DCC
covariance and a CVaR-constrained optimizer. Never shown to clients before the gates pass.
"""
from __future__ import annotations

from typing import Any


class SignalModelDisabled(RuntimeError):
    pass


def build_signal_recommendations(*_: Any, enabled: bool = False, **__: Any) -> list[dict[str, Any]]:
    if not enabled:
        return []
    raise SignalModelDisabled("Siqnal modeli (Mərhələ B) hələ qurulmayıb və validasiyadan keçməyib.")
