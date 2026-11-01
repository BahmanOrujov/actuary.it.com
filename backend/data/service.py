"""Market data service: provider selection, local cache, incremental refresh, FX, symbol resolution."""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.i18n import L
from app.models import Instrument, PriceBar, SymbolFetchLog
from data.provider import BAR_COLUMNS, MarketDataProvider, ProviderError

log = logging.getLogger(__name__)

_provider_singleton: MarketDataProvider | None = None


def get_provider() -> MarketDataProvider:
    global _provider_singleton
    if _provider_singleton is None:
        settings = get_settings()
        if settings.yahoo_allowed and settings["data"]["provider"] == "yahoo":
            from data.yahoo import YahooProvider

            _provider_singleton = YahooProvider()
        elif settings["data"]["provider"].startswith("api:"):
            from data.licensed_api import LicensedApiProvider

            _provider_singleton = LicensedApiProvider()
        else:
            raise ProviderError(
                "Kommersiya rejimində lisenziyalı məlumat provayderi tələb olunur (MarketDataProvider)."
            )
    return _provider_singleton


def set_provider(p: MarketDataProvider | None) -> None:
    """Testing hook: inject a fixture provider."""
    global _provider_singleton
    _provider_singleton = p


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class MarketData:
    def __init__(self, db: Session, provider: MarketDataProvider | None = None, refresh: bool = True):
        self.db = db
        self._provider = provider
        self.refresh_enabled = refresh  # False: cache only (validation of a frozen run must not see new data)
        self.cfg = get_settings()
        self.messages: list[str] = []  # client-safe messages about degraded data
        self.admin_notes: list[str] = []
        self._frames: dict[tuple[str, str | None], pd.DataFrame] = {}

    @property
    def provider(self) -> MarketDataProvider:
        if self._provider is None:
            self._provider = get_provider()
        return self._provider

    # -- symbols ------------------------------------------------------------
    def search(self, query: str) -> list[dict]:
        q = query.strip().upper()
        if not q or len(q) > 32:
            return []
        cands = self.provider.search_symbols(q)
        exact = [c for c in cands if c.provider_symbol.split(".")[0].upper() == q.split(".")[0]]
        chosen = exact or cands
        return [c.to_dict() for c in chosen]

    def ensure_instrument(self, provider_symbol: str, investing_symbol: str | None = None) -> Instrument:
        inst = self.db.scalar(select(Instrument).where(Instrument.provider_symbol == provider_symbol))
        if inst:
            return inst
        meta = self.provider.get_instrument(provider_symbol)
        mic = self.cfg["data"]["exchange_mic"].get(meta.exchange)
        inst = Instrument(
            investing_symbol=(investing_symbol or provider_symbol.split(".")[0]).upper(),
            provider_symbol=provider_symbol,
            exchange=meta.exchange,
            exchange_mic=mic,
            currency=meta.currency,
            isin=meta.isin,
            name=meta.name,
            type=meta.type,
            source=self.provider.name,
        )
        self.db.add(inst)
        self.db.flush()
        return inst

    def create_csv_instrument(self, symbol: str, name: str, exchange: str, currency: str) -> Instrument:
        provider_symbol = f"CSV:{symbol.upper()}"
        inst = self.db.scalar(select(Instrument).where(Instrument.provider_symbol == provider_symbol))
        if inst:
            return inst
        inst = Instrument(
            investing_symbol=symbol.upper(), provider_symbol=provider_symbol, exchange=exchange,
            exchange_mic=self.cfg["data"]["exchange_mic"].get(exchange), currency=currency.upper(),
            name=name or symbol.upper(), type="EQUITY", source="csv",
        )
        self.db.add(inst)
        self.db.flush()
        return inst

    # -- bars ---------------------------------------------------------------
    def _forget(self, symbol: str) -> None:
        for key in [k for k in self._frames if k[0] == symbol]:
            del self._frames[key]

    def _load_cached(self, symbol: str, source: str | None = None) -> pd.DataFrame:
        # one Generate reads the same symbol several times (snapshot, FX, index, stress, liquidity): keep the frame
        # for the lifetime of this MarketData; store_bars drops it when the symbol's data changes
        key = (symbol, source)
        if key in self._frames:
            return self._frames[key].copy()
        cols = [PriceBar.date, PriceBar.open, PriceBar.high, PriceBar.low, PriceBar.close, PriceBar.adj_close,
                PriceBar.volume, PriceBar.dividends, PriceBar.splits, PriceBar.source]
        stmt = select(*cols).where(PriceBar.symbol == symbol)
        if source:
            stmt = stmt.where(PriceBar.source == source)
        # plain column tuples, not ORM objects: ~10x faster for 25+ years of daily bars
        rows = self.db.execute(stmt.order_by(PriceBar.date)).all()
        if not rows:
            return pd.DataFrame(columns=BAR_COLUMNS + ["source"])
        df = pd.DataFrame.from_records(rows, columns=[c.key for c in cols])
        df["date"] = pd.to_datetime(df["date"])
        # prefer provider data over CSV on overlapping days
        df["prio"] = df["source"].map(lambda s: 0 if s.startswith("csv") else 1)
        df = df.sort_values(["date", "prio"]).drop_duplicates("date", keep="last").set_index("date")
        df = df.drop(columns="prio")
        self._frames[key] = df
        return df.copy()

    def store_bars(self, symbol: str, bars: pd.DataFrame, source: str) -> int:
        self._forget(symbol)
        # providers occasionally return a day without a close (e.g. a partial European session): not a price
        bars = bars[pd.to_numeric(bars["close"], errors="coerce").notna()] if not bars.empty else bars
        if bars.empty:
            return 0
        dates = [d.date() for d in bars.index]
        self.db.execute(
            delete(PriceBar).where(
                PriceBar.symbol == symbol, PriceBar.source == source, PriceBar.date.in_(dates)
            )
        )

        def f(v: object) -> float | None:
            return None if v is None or (isinstance(v, float) and np.isnan(v)) else float(v)

        for d, row in zip(dates, bars.itertuples(index=False)):
            self.db.add(
                PriceBar(
                    symbol=symbol, date=d, source=source, open=f(row.open), high=f(row.high), low=f(row.low),
                    close=float(row.close), adj_close=f(row.adj_close), volume=f(row.volume),
                    dividends=f(row.dividends) or 0.0, splits=f(row.splits) or 0.0,
                )
            )
        self.db.flush()
        return len(dates)

    def _has_cache(self, symbol: str) -> bool:
        return self.db.scalar(select(PriceBar.symbol).where(PriceBar.symbol == symbol).limit(1)) is not None

    def prefetch(self, symbols: list[str]) -> None:
        """First load of several uncached symbols in one provider request when the provider supports it
        (yf.download with threads=False); everything else goes through bars() one by one."""
        if not self.refresh_enabled:
            return
        missing = [s for s in dict.fromkeys(symbols) if not s.startswith("CSV:") and not self._has_cache(s)]
        if len(missing) < 2:
            return
        many = getattr(self.provider, "get_daily_bars_many", None)
        if many is None:
            return
        try:
            got = many(missing)
        except ProviderError as exc:
            log.warning("batch prefetch failed, falling back to single requests: %s", exc)
            return
        for s, df in got.items():
            self.store_bars(s, df, self.provider.name)
            self._log_fetch(s, "ok")

    def fx_ticker(self, ccy: str, base: str) -> str | None:
        """The Yahoo FX ticker fx_series() will try first for a currency pair (None: identity or fixed rate)."""
        ccy, base = ccy.upper(), base.upper()
        if ccy == base or "AZN" in (ccy, base):
            return None
        return f"{ccy}{base}=X"

    def _needs_refresh(self, symbol: str) -> bool:
        logrow = self.db.get(SymbolFetchLog, symbol)
        if logrow is None:
            return True
        now = _utcnow()
        cutoff_hour = self.cfg["data"]["refresh_after_hour_utc"]
        # refresh at most once per day after market close
        last = logrow.last_fetch_at
        if last.date() == now.date():
            return last.hour < cutoff_hour <= now.hour
        return True

    def bars(self, symbol: str, refresh: bool = True) -> pd.DataFrame:
        """Daily bars for a symbol, refreshing the cache incrementally. Falls back to cache on provider errors."""
        if symbol.startswith("CSV:"):
            return self._load_cached(symbol)
        cached = self._load_cached(symbol)
        if refresh and self.refresh_enabled and self._needs_refresh(symbol):
            start = None
            if not cached.empty:
                start = (cached.index.max() - pd.Timedelta(days=7)).date()
            try:
                new = self.provider.get_daily_bars(symbol, start, None)
                # a split since the last fetch rewrites history -> reload in full
                if start is not None and not new.empty and (new["splits"].fillna(0) > 0).any():
                    new = self.provider.get_daily_bars(symbol, None, None)
                    self.db.execute(delete(PriceBar).where(PriceBar.symbol == symbol, PriceBar.source == self.provider.name))
                    self._forget(symbol)
                self.store_bars(symbol, new, self.provider.name)
                self._log_fetch(symbol, "ok")
                cached = self._load_cached(symbol)
            except ProviderError as exc:
                self._log_fetch(symbol, f"error: {exc}"[:250])
                if cached.empty:
                    raise
                self.messages.append(
                    L(f"{symbol}: məlumat mənbəyi cavab vermədi, keşdəki məlumat istifadə olundu "
                      f"(son tarix {cached.index.max():%Y-%m-%d}).",
                      f"{symbol}: the data source did not answer; cached data was used "
                      f"(last date {cached.index.max():%Y-%m-%d}).")
                )
        if cached.empty:
            raise ProviderError(L(f"{symbol} üçün qiymət tarixçəsi tapılmadı.", f"No price history found for {symbol}."))
        return cached

    def _log_fetch(self, symbol: str, status: str) -> None:
        row = self.db.get(SymbolFetchLog, symbol)
        if row is None:
            row = SymbolFetchLog(symbol=symbol, last_fetch_at=_utcnow(), last_status=status, request_count=0)
            self.db.add(row)
        row.last_fetch_at = _utcnow()
        row.last_status = status
        row.request_count = (row.request_count or 0) + 1

    def close_on(self, symbol: str, d: date, exchange: str) -> tuple[date, float, float | None, float | None]:
        """Split-adjusted close on d or the previous trading day. Returns (date_used, close, low, high)."""
        bars = self.bars(symbol)
        sub = bars.loc[: pd.Timestamp(d)]
        if sub.empty:
            raise ValueError(L("Bu tarix alətin tarixçəsindən əvvəldir.", "This date is before the instrument's history."))
        row = sub.iloc[-1]
        return sub.index[-1].date(), float(row["close"]), _nf(row.get("low")), _nf(row.get("high"))

    def latest_close(self, symbol: str) -> tuple[date, float]:
        bars = self.bars(symbol)
        return bars.index[-1].date(), float(bars["close"].iloc[-1])

    # -- FX -----------------------------------------------------------------
    def fx_series(self, ccy: str, base: str) -> pd.Series | float:
        """Units of `base` per 1 unit of `ccy`. A float means a constant rate."""
        ccy, base = ccy.upper(), base.upper()
        if ccy == base:
            return 1.0
        fallback = self.cfg["data"]["fx_fallback"]
        if f"{ccy}{base}" in fallback:
            self.messages_admin(f"FX {ccy}{base}: sabit məzənnə {fallback[f'{ccy}{base}']} istifadə olundu.")
            return float(fallback[f"{ccy}{base}"])
        if f"{base}{ccy}" in fallback:
            self.messages_admin(f"FX {base}{ccy}: sabit məzənnə {fallback[f'{base}{ccy}']} istifadə olundu.")
            return 1.0 / float(fallback[f"{base}{ccy}"])
        if "AZN" in (ccy, base):
            # cross through USD with the fixed AZN rate
            return _mul(self.fx_series(ccy, "USD"), self.fx_series("USD", base))
        try:
            bars = self.bars(f"{ccy}{base}=X")
            return bars["close"].astype(float)
        except ProviderError:
            bars = self.bars(f"{base}{ccy}=X")
            return 1.0 / bars["close"].astype(float)

    def messages_admin(self, msg: str) -> None:
        if msg not in self.admin_notes:
            self.admin_notes.append(msg)

    def provider_status(self) -> list[dict]:
        rows = self.db.scalars(select(SymbolFetchLog).order_by(SymbolFetchLog.last_fetch_at.desc())).all()
        return [
            {"symbol": r.symbol, "last_fetch_at": r.last_fetch_at.isoformat(), "status": r.last_status,
             "requests": r.request_count}
            for r in rows
        ]

    def risk_free(self, currency: str) -> float:
        """Annual risk-free rate for a currency (admin override > Yahoo ticker > config fallback)."""
        from app.admin_settings import get_override

        override = get_override(self.db, f"rf.{currency}")
        if override is not None:
            return float(override)
        drift = self.cfg["model"]["drift"]
        ticker = drift.get("rf_ticker", {}).get(currency)
        if ticker:
            try:
                b = self.bars(ticker)
                return float(b["close"].iloc[-1]) / 100.0
            except Exception:
                self.messages_admin(f"rf {currency}: {ticker} alınmadı, config dəyəri istifadə olundu.")
        return float(drift["rf"].get(currency, 0.03))

    def risk_free_history(self, currency: str) -> pd.Series | None:
        """Daily annual risk-free rate (decimal) for point-in-time use in the backtest.

        None when an admin override is set or no rate ticker is configured/available: the caller then uses
        the constant risk_free() value."""
        from app.admin_settings import get_override

        if get_override(self.db, f"rf.{currency}") is not None:
            return None
        ticker = self.cfg["model"]["drift"].get("rf_ticker", {}).get(currency)
        if not ticker:
            return None
        try:
            s = self.bars(ticker)["close"].astype(float).dropna() / 100.0
        except Exception:
            return None
        return s if len(s) else None


def _mul(a: pd.Series | float, b: pd.Series | float) -> pd.Series | float:
    if isinstance(a, float) and isinstance(b, float):
        return a * b
    if isinstance(a, float):
        return b * a
    if isinstance(b, float):
        return a * b
    return (a * b.reindex(a.index).ffill()).dropna()


def _nf(v: object) -> float | None:
    try:
        f = float(v)  # type: ignore[arg-type]
        return None if np.isnan(f) else f
    except (TypeError, ValueError):
        return None


def to_base_currency(px: pd.Series, fx: pd.Series | float) -> pd.Series:
    if isinstance(fx, float):
        return px * fx
    fx_al = fx.reindex(px.index.union(fx.index)).sort_index().ffill().reindex(px.index)
    return (px * fx_al).dropna()


def stale_cutoff(days: int = 7) -> date:
    return (_utcnow() - timedelta(days=days)).date()
