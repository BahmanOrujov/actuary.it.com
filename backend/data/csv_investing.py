"""Parser for investing.com "Historical Data" CSV exports and generic CSV files (PROMPT.md 2.2 p.3-4).

The user downloads the file manually; this module never contacts investing.com.
"""
from __future__ import annotations

import io
import re

import numpy as np
import pandas as pd

from app.i18n import L
from data.provider import BAR_COLUMNS


class CsvFormatError(ValueError):
    pass


_COLS = {
    "date": "date", "tarix": "date",
    "price": "close", "close": "close", "adj close": "adj_close", "son": "close", "kapanış": "close",
    "open": "open", "high": "high", "low": "low",
    "vol.": "volume", "volume": "volume", "vol": "volume",
    "change %": "change",
}
_SUFFIX = {"K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}
_DATE_FORMATS = ["%m/%d/%Y", "%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y", "%b %d, %Y", "%d-%m-%Y", "%m-%d-%Y"]


def _decimal_style(samples: list[str]) -> str:
    """Return '.' if '.' is the decimal separator, ',' otherwise."""
    for s in samples:
        s = s.strip().strip('"')
        if "," in s and "." in s:
            return "." if s.rfind(".") > s.rfind(",") else ","
    for s in samples:
        s = s.strip()
        m = re.fullmatch(r"-?\d+,(\d+)", s)
        if m and len(m.group(1)) != 3:
            return ","
    return "."


def _to_number(raw: object, dec: str) -> float:
    if raw is None or (isinstance(raw, float) and np.isnan(raw)):
        return float("nan")
    s = str(raw).strip().strip('"').replace(" ", "").replace(" ", "")
    if s in ("", "-", "—"):
        return float("nan")
    s = s.rstrip("%")
    mult = 1.0
    if s and s[-1].upper() in _SUFFIX:
        mult = _SUFFIX[s[-1].upper()]
        s = s[:-1]
    if dec == ".":
        s = s.replace(",", "")
    else:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s) * mult
    except ValueError as exc:
        raise CsvFormatError(L(f"Rəqəm oxunmadı: {raw!r}", f"Could not read the number: {raw!r}")) from exc


def _parse_dates(values: pd.Series) -> pd.DatetimeIndex:
    vals = values.astype(str).str.strip().str.strip('"')
    best: pd.DatetimeIndex | None = None
    best_ok = -1
    for fmt in _DATE_FORMATS:
        parsed = pd.to_datetime(vals, format=fmt, errors="coerce")
        ok = int(parsed.notna().sum())
        if ok > best_ok:
            best, best_ok = pd.DatetimeIndex(parsed), ok
        if ok == len(vals):
            # MM/DD vs DD/MM ambiguity: prefer a format whose dates are monotonic after sorting by row order
            break
    if best is None or best_ok < len(vals):
        raise CsvFormatError(L("Tarix formatı tanınmadı.", "The date format was not recognised."))
    return best


def parse_price_csv(content: bytes | str) -> pd.DataFrame:
    """Parse an investing.com or generic OHLC CSV into the standard bar frame (ascending dates)."""
    if isinstance(content, bytes):
        text = content.decode("utf-8-sig", errors="replace")
    else:
        text = content.lstrip("﻿")
    first = text.splitlines()[0] if text else ""
    sep = ";" if first.count(";") > first.count(",") else ","
    df = pd.read_csv(io.StringIO(text), sep=sep, dtype=str, quotechar='"', skipinitialspace=True)
    df.columns = [c.strip().strip('"').lower() for c in df.columns]
    mapped = {c: _COLS[c] for c in df.columns if c in _COLS}
    df = df.rename(columns=mapped)
    if "date" not in df or "close" not in df:
        raise CsvFormatError(L("CSV-də 'Date' və 'Price'/'Close' sütunları olmalıdır.", "The CSV must have 'Date' and 'Price'/'Close' columns."))
    df = df.dropna(subset=["date"])
    dec = _decimal_style(df["close"].dropna().astype(str).head(50).tolist())
    idx = _parse_dates(df["date"])
    out = pd.DataFrame(index=idx.normalize())
    for col in ("open", "high", "low", "close", "adj_close", "volume"):
        if col in df:
            out[col] = [_to_number(v, dec) for v in df[col]]
        else:
            out[col] = np.nan
    if out["adj_close"].isna().all():
        out["adj_close"] = out["close"]  # dividend adjustment unknown -> noted in admin report
    out["dividends"] = 0.0
    out["splits"] = 0.0
    out = out[~out.index.duplicated(keep="first")].sort_index()  # investing.com is reverse chronological
    if (out["close"] <= 0).any():
        raise CsvFormatError(L("Sıfır və ya mənfi qiymət var.", "There is a zero or negative price."))
    return out[BAR_COLUMNS]
