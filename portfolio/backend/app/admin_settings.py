"""Runtime overrides edited from the admin panel, layered on top of config.yaml."""
from __future__ import annotations

import copy
from typing import Any

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AdminSetting

CURRENCIES = ("USD", "EUR", "GBP", "AZN")
EDITABLE_KEYS = {
    *(f"rf.{c}" for c in CURRENCIES), *(f"mrp.{c}" for c in CURRENCIES),
    "profile.conservative", "profile.moderate", "profile.aggressive",
    "gate.alpha", "feature.csv_import", "feature.signal_model",
}


def get_override(db: Session, key: str) -> Any | None:
    row = db.get(AdminSetting, key)
    return None if row is None else row.value


def set_override(db: Session, key: str, value: Any) -> None:
    if key not in EDITABLE_KEYS:
        raise KeyError(key)
    row = db.get(AdminSetting, key)
    if row is None:
        db.add(AdminSetting(key=key, value=value))
    else:
        row.value = value


def mrp_for(db: Session | None, currency: str, cfg: dict[str, Any] | None = None) -> float:
    """Market risk premium for a currency: admin override > config per-currency value > config default."""
    cfg = cfg or get_settings().raw
    drift = cfg["model"]["drift"]
    if db is not None:
        ov = get_override(db, f"mrp.{currency}")
        if ov is not None:
            return float(ov)
    per = drift.get("mrp_by_currency", {})
    return float(per.get(currency, drift["mrp"]))


def effective(db: Session) -> dict[str, Any]:
    cfg = get_settings()
    # rf.USD empty = live ^IRX (config value as fallback); other currencies show their config value
    rf_cfg = cfg["model"]["drift"]["rf"]
    out: dict[str, Any] = {f"rf.{c}": (None if c in cfg["model"]["drift"].get("rf_ticker", {}) else rf_cfg.get(c))
                           for c in CURRENCIES}
    for c in CURRENCIES:
        out[f"mrp.{c}"] = mrp_for(None, c)
    out.update({
        "gate.alpha": cfg["validation"]["alpha"],
        "feature.csv_import": cfg.feature("csv_import"),
        "feature.signal_model": cfg.feature("signal_model"),
    })
    for name, val in cfg["portfolio"]["risk_profiles"].items():
        out[f"profile.{name}"] = val
    for k in EDITABLE_KEYS:
        ov = get_override(db, k)
        if ov is not None:
            out[k] = ov
    if not cfg.is_personal:
        out["feature.csv_import"] = False
    return out


def effective_cfg(db: Session) -> dict[str, Any]:
    """config.yaml with the admin overrides that change model/validation results applied.

    The result is frozen into each run's snapshot, so a run stays reproducible after later edits."""
    raw = copy.deepcopy(get_settings().raw)
    alpha = get_override(db, "gate.alpha")
    if alpha is not None:
        raw["validation"]["alpha"] = float(alpha)
    mrp = raw["model"]["drift"].setdefault("mrp_by_currency", {})
    for c in CURRENCIES:
        mrp[c] = mrp_for(db, c, raw)
    for name in raw["portfolio"]["risk_profiles"]:
        ov = get_override(db, f"profile.{name}")
        if ov is not None:
            raw["portfolio"]["risk_profiles"][name] = float(ov)
    return raw


def feature_enabled(db: Session, name: str) -> bool:
    cfg = get_settings()
    if name == "csv_import" and not cfg.is_personal:
        return False
    ov = get_override(db, f"feature.{name}")
    return bool(cfg.feature(name) if ov is None else ov)


def profile_limit(db: Session, profile: str) -> float:
    ov = get_override(db, f"profile.{profile}")
    return float(ov if ov is not None else get_settings()["portfolio"]["risk_profiles"][profile])
