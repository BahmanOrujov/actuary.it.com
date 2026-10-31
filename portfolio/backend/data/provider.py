"""MarketDataProvider interface (PROMPT.md 2.2)."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from typing import Protocol

import pandas as pd


class ProviderError(Exception):
    """Raised when a provider fails (network, rate limit, changed format)."""


class SymbolNotFound(ProviderError):
    pass


@dataclass
class InstrumentCandidate:
    provider_symbol: str
    name: str
    exchange: str
    country: str | None
    currency: str | None
    type: str
    isin: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class InstrumentMeta:
    provider_symbol: str
    name: str
    exchange: str
    currency: str
    type: str
    isin: str | None = None


@dataclass
class PriceQuote:
    symbol: str
    price: float
    as_of: datetime
    source: str
    delayed: bool = True


@dataclass
class CorporateActions:
    splits: pd.Series = field(default_factory=lambda: pd.Series(dtype=float))
    dividends: pd.Series = field(default_factory=lambda: pd.Series(dtype=float))


# Daily bars frame: index = DatetimeIndex (naive dates), columns =
# open, high, low, close (split-adjusted), adj_close (split+dividend adjusted), volume, dividends, splits
BAR_COLUMNS = ["open", "high", "low", "close", "adj_close", "volume", "dividends", "splits"]


class MarketDataProvider(Protocol):
    name: str

    def search_symbols(self, query: str) -> list[InstrumentCandidate]: ...
    def get_instrument(self, provider_symbol: str) -> InstrumentMeta: ...
    def get_daily_bars(self, provider_symbol: str, start: date | None, end: date | None) -> pd.DataFrame: ...
    def get_latest_price(self, provider_symbol: str) -> PriceQuote: ...
    def get_fx_daily(self, base: str, quote: str, start: date | None, end: date | None) -> pd.DataFrame: ...
    def get_corporate_actions(self, provider_symbol: str) -> CorporateActions: ...
