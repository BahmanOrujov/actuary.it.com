"""Data-quality checks (PROMPT.md 2.4). Results go to the admin report; clients see simple warnings only."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np
import pandas as pd

from app.config import get_settings


@dataclass
class QualityReport:
    symbol: str
    n_obs: int
    first_date: str | None
    last_date: str | None
    years: float
    missing_business_days: int
    duplicate_dates: int
    non_positive_prices: int
    outlier_returns: list[str] = field(default_factory=list)
    suspected_unadjusted_splits: list[str] = field(default_factory=list)
    longest_stale_run: int = 0
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    def client_warnings(self) -> list[str]:
        cfg = get_settings()
        out = []
        if self.years < cfg["data"]["min_estimation_years"]:
            out.append("Bu səhmin tarixçəsi qısadır, nəticələr daha az etibarlıdır.")
        if self.longest_stale_run >= cfg["data"]["quality"]["stale_run_days"]:
            out.append("Bu səhmin qiyməti uzun müddət dəyişməyib (aşağı likvidlik ola bilər).")
        return out


def robust_z(x: np.ndarray) -> np.ndarray:
    med = np.nanmedian(x)
    mad = np.nanmedian(np.abs(x - med)) * 1.4826
    if mad == 0 or not np.isfinite(mad):
        return np.zeros_like(x)
    return (x - med) / mad


def check_bars(symbol: str, bars: pd.DataFrame) -> QualityReport:
    q = get_settings()["data"]["quality"]
    if bars.empty:
        return QualityReport(symbol, 0, None, None, 0.0, 0, 0, 0, notes=["Məlumat yoxdur"])
    idx = bars.index
    dup = int(idx.duplicated().sum())
    bdays = pd.bdate_range(idx.min(), idx.max())
    missing = int(len(bdays.difference(idx)))
    close = bars["close"].astype(float)
    nonpos = int((close <= 0).sum())
    px = bars["adj_close"].fillna(bars["close"]).astype(float)
    r = np.log(px / px.shift(1)).dropna()
    z = robust_z(r.to_numpy())
    outliers = [d.strftime("%Y-%m-%d") for d, v in zip(r.index, z) if abs(v) > q["mad_z_threshold"]]
    # unadjusted splits: big one-day jumps close to common split ratios, without a recorded split
    ratio = (close / close.shift(1)).dropna()
    recorded = set(bars.index[bars["splits"].fillna(0) > 0])
    splits = []
    for d, v in ratio.items():
        if d in recorded:
            continue
        for k in (2, 3, 4, 5, 10, 20):
            if abs(v - 1 / k) < 0.05 / k or abs(v - k) < 0.05 * k:
                if abs(np.log(v)) > -np.log(1 - q["split_jump_ratio"]):
                    splits.append(d.strftime("%Y-%m-%d"))
                    break
    # stale prices
    same = (close.diff() == 0).astype(int).to_numpy()
    longest = cur = 0
    for s in same:
        cur = cur + 1 if s else 0
        longest = max(longest, cur)
    years = (idx.max() - idx.min()).days / 365.25
    return QualityReport(
        symbol=symbol,
        n_obs=len(bars),
        first_date=idx.min().strftime("%Y-%m-%d"),
        last_date=idx.max().strftime("%Y-%m-%d"),
        years=round(years, 2),
        missing_business_days=missing,
        duplicate_dates=dup,
        non_positive_prices=nonpos,
        outlier_returns=outliers[:50],
        suspected_unadjusted_splits=splits[:20],
        longest_stale_run=longest,
    )


def compare_sources(a: pd.DataFrame, b: pd.DataFrame, tol: float = 0.01) -> dict:
    """Compare close prices of two sources on overlapping days."""
    common = a.index.intersection(b.index)
    if len(common) == 0:
        return {"overlap_days": 0}
    rel = (a.loc[common, "close"] / b.loc[common, "close"] - 1).abs()
    return {
        "overlap_days": int(len(common)),
        "max_rel_diff": float(rel.max()),
        "days_over_tolerance": int((rel > tol).sum()),
    }
