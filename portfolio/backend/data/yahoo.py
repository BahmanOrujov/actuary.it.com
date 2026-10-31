"""Yahoo Finance adapter via yfinance. Personal mode only (PROMPT.md 2.1, 2.2)."""
from __future__ import annotations

import logging
import os
import threading
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable, TypeVar

import pandas as pd

from app.config import get_settings
from data.provider import (
    BAR_COLUMNS,
    CorporateActions,
    InstrumentCandidate,
    InstrumentMeta,
    PriceQuote,
    ProviderError,
    SymbolNotFound,
)

log = logging.getLogger(__name__)
T = TypeVar("T")

_COUNTRY_BY_EXCHANGE = {
    "NASDAQ": "United States", "NYSE": "United States", "NYSEARCA": "United States", "AMEX": "United States",
    "LSE": "United Kingdom", "XETRA": "Germany", "EPA": "France",
}


class _InterProcessLock:
    """Exclusive file lock shared by the API server and the worker, so Yahoo never sees parallel requests
    from this machine; the last-request time is kept in the same file to enforce the minimum interval."""

    def __init__(self, path: Path):
        self.path = path
        self._thread_lock = threading.Lock()

    def __enter__(self) -> "_InterProcessLock":
        self._thread_lock.acquire()
        self.f = open(self.path, "a+b")
        self.f.seek(0)
        if os.name == "nt":
            import msvcrt

            while True:
                try:
                    msvcrt.locking(self.f.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError:
                    time.sleep(0.05)
        else:
            import fcntl

            fcntl.flock(self.f, fcntl.LOCK_EX)
        return self

    def last_call(self) -> float:
        try:
            return float(self.path.with_suffix(".last").read_text() or 0)
        except (OSError, ValueError):
            return 0.0

    def mark(self) -> None:
        try:
            self.path.with_suffix(".last").write_text(repr(time.time()))
        except OSError:
            pass

    def __exit__(self, *exc) -> None:
        try:
            self.f.seek(0)
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(self.f.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(self.f, fcntl.LOCK_UN)
        finally:
            self.f.close()
            self._thread_lock.release()


class YahooProvider:
    name = "yahoo"

    def __init__(self) -> None:
        settings = get_settings()
        if not settings.yahoo_allowed:
            raise ProviderError("Yahoo Finance mənbəyi yalnız şəxsi (personal) rejimdə istifadə oluna bilər.")
        rl = settings["data"]["rate_limit"]
        self._min_interval = float(rl["min_interval_seconds"])
        self._retries = int(rl["max_retries"])
        self._backoff = float(rl["backoff_base_seconds"])
        self._lock = _InterProcessLock(settings.cache_dir / "yahoo.lock")  # strictly sequential requests
        self.request_count = 0
        self._codes: dict[str, str] = settings["data"]["yahoo_exchange_codes"]
        self._pence: dict[str, bool] = {}

    # -- request discipline -------------------------------------------------
    def _call(self, fn: Callable[[], T]) -> T:
        import yfinance as yf  # noqa: F401  (import errors surface as ProviderError below)

        last_exc: Exception | None = None
        for attempt in range(self._retries):
            with self._lock as lock:
                wait = self._min_interval - (time.time() - lock.last_call())
                if wait > 0:
                    time.sleep(wait)
                try:
                    self.request_count += 1
                    return fn()
                except SymbolNotFound:
                    raise
                except Exception as exc:  # YFRateLimitError, network errors, format changes
                    last_exc = exc
                    log.warning("Yahoo request failed (attempt %s): %s", attempt + 1, exc)
                finally:
                    lock.mark()
            time.sleep(self._backoff * 2 ** attempt)
        raise ProviderError(f"Yahoo Finance cavab vermədi: {last_exc}")

    def _exchange(self, yahoo_code: str | None, symbol: str) -> str:
        if yahoo_code and yahoo_code in self._codes:
            return self._codes[yahoo_code]
        suffix = "." + symbol.split(".")[-1] if "." in symbol else ""
        for ex, suf in get_settings()["data"]["exchange_suffixes"].items():
            if suf and suf == suffix:
                return ex
        return yahoo_code or "UNKNOWN"

    # -- interface ----------------------------------------------------------
    def search_symbols(self, query: str) -> list[InstrumentCandidate]:
        import yfinance as yf

        def run() -> list[dict[str, Any]]:
            return list(yf.Search(query, max_results=15, news_count=0).quotes or [])

        quotes = self._call(run)
        allowed = set(self._codes)
        out: list[InstrumentCandidate] = []
        for q in quotes:
            qtype = (q.get("quoteType") or "").upper()
            if qtype not in ("EQUITY", "ETF"):
                continue
            code = q.get("exchange")
            if code not in allowed:
                continue
            ex = self._exchange(code, q["symbol"])
            out.append(
                InstrumentCandidate(
                    provider_symbol=q["symbol"],
                    name=q.get("longname") or q.get("shortname") or q["symbol"],
                    exchange=ex,
                    country=_COUNTRY_BY_EXCHANGE.get(ex),
                    currency=None,
                    type=qtype,
                )
            )
        return out

    def get_instrument(self, provider_symbol: str) -> InstrumentMeta:
        import yfinance as yf

        def run() -> InstrumentMeta:
            t = yf.Ticker(provider_symbol)
            fi = t.fast_info
            currency = fi.get("currency") if hasattr(fi, "get") else getattr(fi, "currency", None)
            if not currency:
                raise SymbolNotFound(provider_symbol)
            try:
                info = t.info or {}
            except Exception:
                info = {}
            exch = self._exchange(info.get("exchange") or getattr(fi, "exchange", None), provider_symbol)
            return InstrumentMeta(
                provider_symbol=provider_symbol,
                name=info.get("longName") or info.get("shortName") or provider_symbol,
                exchange=exch,
                currency=_normalize_currency(currency),
                type=(info.get("quoteType") or "EQUITY").upper(),
                isin=None,
            )

        return self._call(run)

    def get_daily_bars(self, provider_symbol: str, start: date | None, end: date | None) -> pd.DataFrame:
        import yfinance as yf

        def run() -> pd.DataFrame:
            t = yf.Ticker(provider_symbol)
            if start is None:
                df = t.history(period="max", auto_adjust=False, actions=True)
                if df is None or df.empty:
                    # yfinance logs network errors and returns an empty frame; a full-history request is never
                    # legitimately empty for a listed symbol, so treat it as a failure and retry with backoff
                    raise RuntimeError(f"empty history for {provider_symbol}")
            else:
                df = t.history(start=start, end=end, auto_adjust=False, actions=True)
            return df

        df = self._call(run)
        return self._normalize(df, provider_symbol)

    def get_daily_bars_many(self, symbols: list[str]) -> dict[str, pd.DataFrame]:
        """Full histories for several symbols in one request (yf.download, threads=False), used for the first
        load of a portfolio's instruments (PROMPT.md 2.2). Symbols missing from the answer are omitted."""
        import yfinance as yf

        if not symbols:
            return {}

        def run() -> pd.DataFrame:
            return yf.download(symbols, period="max", group_by="ticker", auto_adjust=False, actions=True,
                               threads=False, progress=False)

        raw = self._call(run)
        out: dict[str, pd.DataFrame] = {}
        if raw is None or raw.empty:
            return out
        for s in symbols:
            try:
                sub = raw[s] if isinstance(raw.columns, pd.MultiIndex) else raw
            except KeyError:
                continue
            sub = sub.dropna(how="all")
            if not sub.empty and sub["Close"].notna().any():
                out[s] = self._normalize(sub.dropna(subset=["Close"]), s)
        return out

    def _pence_quoted(self, symbol: str) -> bool:
        """London listings are usually quoted in pence (GBp); a few trade in GBP/USD. Checked once per process."""
        if not symbol.endswith(".L"):
            return False
        if symbol not in self._pence:
            import yfinance as yf

            def run() -> bool:
                cur = yf.Ticker(symbol).fast_info.get("currency")
                return cur in ("GBp", "GBX")

            try:
                self._pence[symbol] = self._call(run)
            except ProviderError:
                self._pence[symbol] = True  # the common case; logged by _call
        return self._pence[symbol]

    def _normalize(self, df: pd.DataFrame | None, provider_symbol: str) -> pd.DataFrame:
        if df is None or df.empty:
            return pd.DataFrame(columns=BAR_COLUMNS)
        df = df.rename(
            columns={
                "Open": "open", "High": "high", "Low": "low", "Close": "close", "Adj Close": "adj_close",
                "Volume": "volume", "Dividends": "dividends", "Stock Splits": "splits",
            }
        ).copy()
        for c in BAR_COLUMNS:
            if c not in df:
                df[c] = 0.0 if c in ("dividends", "splits") else float("nan")
        idx = pd.to_datetime(df.index)
        if getattr(idx, "tz", None) is not None:
            idx = idx.tz_localize(None)
        df.index = idx.normalize()
        df = df[BAR_COLUMNS].astype(float)
        df[["dividends", "splits"]] = df[["dividends", "splits"]].fillna(0.0)
        if self._pence_quoted(provider_symbol):  # GBp -> GBP
            px = ["open", "high", "low", "close", "adj_close", "dividends"]
            df[px] = df[px] / 100.0
        return df[~df.index.duplicated(keep="last")].sort_index()

    def get_latest_price(self, provider_symbol: str) -> PriceQuote:
        import yfinance as yf

        def run() -> PriceQuote:
            fi = yf.Ticker(provider_symbol).fast_info
            return PriceQuote(provider_symbol, float(fi["last_price"]), datetime.now(timezone.utc),
                              "yahoo:fast_info", True)

        q = self._call(run)
        if self._pence_quoted(provider_symbol):
            q.price /= 100.0
        return q

    def get_fx_daily(self, base: str, quote: str, start: date | None, end: date | None) -> pd.DataFrame:
        bars = self.get_daily_bars(f"{base}{quote}=X", start, end)
        return bars[["close"]].rename(columns={"close": "rate"})

    def get_corporate_actions(self, provider_symbol: str) -> CorporateActions:
        bars = self.get_daily_bars(provider_symbol, None, None)
        return CorporateActions(
            splits=bars["splits"][bars["splits"] > 0], dividends=bars["dividends"][bars["dividends"] > 0]
        )


def _normalize_currency(cur: str) -> str:
    return "GBP" if cur in ("GBp", "GBX") else cur.upper()
