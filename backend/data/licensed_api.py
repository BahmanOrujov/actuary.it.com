"""Licensed market-data provider for commercial mode (PROMPT.md 2.2 p.2) - interface placeholder.

Not built yet by design: commercial mode needs a contract (e.g. EODHD B2B or Twelve Data Business). The class
documents what an adapter must provide; the API key is read only from .env and never stored in code.
"""
from __future__ import annotations

import os
from datetime import date

import pandas as pd

from data.provider import CorporateActions, InstrumentCandidate, InstrumentMeta, PriceQuote, ProviderError


class LicensedApiProvider:
    """Skeleton of a licensed provider. Every method must return the same shapes as YahooProvider:
    daily bars with BAR_COLUMNS, split/dividend-adjusted adj_close, split-adjusted close."""

    name = "api:licensed"

    def __init__(self, env_key: str = "EODHD_API_KEY") -> None:
        self.api_key = os.getenv(env_key)
        if not self.api_key:
            raise ProviderError(f"Lisenziyalı provayder üçün {env_key} .env faylında təyin edilməyib.")

    def _todo(self) -> ProviderError:
        return ProviderError("Lisenziyalı provayder adapteri hələ qurulmayıb (kommersiya rejimi, PROMPT.md 2.2).")

    def search_symbols(self, query: str) -> list[InstrumentCandidate]:
        raise self._todo()

    def get_instrument(self, provider_symbol: str) -> InstrumentMeta:
        raise self._todo()

    def get_daily_bars(self, provider_symbol: str, start: date | None, end: date | None) -> pd.DataFrame:
        raise self._todo()

    def get_latest_price(self, provider_symbol: str) -> PriceQuote:
        raise self._todo()

    def get_fx_daily(self, base: str, quote: str, start: date | None, end: date | None) -> pd.DataFrame:
        raise self._todo()

    def get_corporate_actions(self, provider_symbol: str) -> CorporateActions:
        raise self._todo()
