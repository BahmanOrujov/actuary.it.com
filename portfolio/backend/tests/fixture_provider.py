"""Deterministic offline provider used by tests (no live API calls)."""
from __future__ import annotations

import zlib
from datetime import date, datetime, timezone

import numpy as np
import pandas as pd

from data.provider import (
    BAR_COLUMNS, CorporateActions, InstrumentCandidate, InstrumentMeta, PriceQuote, ProviderError, SymbolNotFound,
)

UNIVERSE = {
    "AAPL": ("Apple Inc.", "NASDAQ", "USD", 0.018, 180.0),
    "MSFT": ("Microsoft Corporation", "NASDAQ", "USD", 0.016, 400.0),
    "XOM": ("Exxon Mobil", "NYSE", "USD", 0.017, 110.0),
    "SAP.DE": ("SAP SE", "XETRA", "EUR", 0.017, 200.0),
    "AAPL.DE": ("Apple Inc. (Xetra)", "XETRA", "EUR", 0.019, 170.0),
    "NEWCO": ("New Listing Co", "NYSE", "USD", 0.03, 20.0),
    "^GSPC": ("S&P 500", "NYSE", "USD", 0.011, 5000.0),
    "^GDAXI": ("DAX", "XETRA", "EUR", 0.012, 18000.0),
    "^TNX": ("10Y yield", "NYSE", "USD", 0.02, 4.2),
    "^IRX": ("13W T-bill", "NYSE", "USD", 0.005, 4.5),
    "BZ=F": ("Brent", "NYSE", "USD", 0.022, 80.0),
    "EURUSD=X": ("EURUSD", "NYSE", "USD", 0.005, 1.08),
    "USDEUR=X": ("USDEUR", "NYSE", "EUR", 0.005, 0.925),
}
END = pd.Timestamp("2026-10-23")


def _series(symbol: str, years: float = 12.0) -> pd.DataFrame:
    name, ex, cur, vol, last = UNIVERSE[symbol]
    rng = np.random.default_rng(zlib.crc32(symbol.encode()))
    start = END - pd.DateOffset(days=int(years * 365.25))
    if symbol == "NEWCO":
        start = END - pd.DateOffset(days=120)
    idx = pd.bdate_range(start, END)
    n = len(idx)
    mkt_rng = np.random.default_rng(1234)
    common = mkt_rng.standard_t(6, size=len(pd.bdate_range(END - pd.DateOffset(days=int(12 * 365.25)), END)))[-n:]
    w, a, g, b = (vol ** 2) * 0.03, 0.04, 0.08, 0.9
    s2 = vol ** 2
    r = np.empty(n)
    for t in range(n):
        z = 0.6 * common[t] / np.sqrt(1.5) + 0.8 * rng.standard_t(6) / np.sqrt(1.5)
        e = np.sqrt(s2) * z
        r[t] = 0.0003 + e
        s2 = w + (a + g * (e < 0)) * e ** 2 + b * s2
    px = last * np.exp(np.cumsum(r) - np.sum(r))
    df = pd.DataFrame(index=idx)
    df["close"] = px
    df["adj_close"] = px * np.exp(-0.00005 * np.arange(n)[::-1])  # small dividend effect
    df["open"] = px * (1 + rng.normal(0, 0.002, n))
    df["high"] = np.maximum(df["open"], px) * 1.006
    df["low"] = np.minimum(df["open"], px) * 0.994
    df["volume"] = 1e6
    df["dividends"] = 0.0
    df["splits"] = 0.0
    if symbol == "AAPL":
        sd = idx[n // 2]
        df.loc[sd, "splits"] = 4.0  # 4:1 split; Yahoo-style close is already split-adjusted
    return df[BAR_COLUMNS]


class FixtureProvider:
    name = "yahoo"

    def __init__(self, fail: bool = False):
        self.fail = fail
        self.request_count = 0

    def _check(self):
        self.request_count += 1
        if self.fail:
            raise ProviderError("simulated outage")

    def search_symbols(self, query: str) -> list[InstrumentCandidate]:
        self._check()
        q = query.upper()
        out = []
        for s, (name, ex, cur, *_r) in UNIVERSE.items():
            if s.split(".")[0] == q and not s.startswith("^"):
                out.append(InstrumentCandidate(s, name, ex, None, cur, "EQUITY"))
        return out

    def get_instrument(self, provider_symbol: str) -> InstrumentMeta:
        self._check()
        if provider_symbol not in UNIVERSE:
            raise SymbolNotFound(provider_symbol)
        name, ex, cur, *_r = UNIVERSE[provider_symbol]
        return InstrumentMeta(provider_symbol, name, ex, cur, "EQUITY")

    def get_daily_bars(self, provider_symbol: str, start: date | None, end: date | None) -> pd.DataFrame:
        self._check()
        if provider_symbol not in UNIVERSE:
            raise ProviderError(f"no data for {provider_symbol}")
        df = _series(provider_symbol)
        if start is not None:
            df = df.loc[pd.Timestamp(start):]
        return df

    def get_latest_price(self, provider_symbol: str) -> PriceQuote:
        df = self.get_daily_bars(provider_symbol, None, None)
        return PriceQuote(provider_symbol, float(df["close"].iloc[-1]), datetime.now(timezone.utc), "fixture")

    def get_fx_daily(self, base, quote, start, end):
        return self.get_daily_bars(f"{base}{quote}=X", start, end)[["close"]].rename(columns={"close": "rate"})

    def get_corporate_actions(self, provider_symbol: str) -> CorporateActions:
        df = self.get_daily_bars(provider_symbol, None, None)
        return CorporateActions(df["splits"][df["splits"] > 0], df["dividends"][df["dividends"] > 0])
