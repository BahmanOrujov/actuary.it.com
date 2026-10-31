"""Reinforcement-learning rebalancing policy - stage C, optional (PROMPT.md 7.3).

Only a challenger to classical optimization: it would be used solely if, after costs and on data the model has
not seen, it beats the classical optimizer with statistical significance. Not implemented; the feature flag
`rl` stays off.
"""
from __future__ import annotations

from typing import Any


def rl_policy(*_: Any, enabled: bool = False, **__: Any) -> None:
    if enabled:
        raise RuntimeError("RL siyasəti (Mərhələ C) qurulmayıb; klassik optimallaşdırmadan yaxşı olduğu sübut edilməyib.")
    return None
