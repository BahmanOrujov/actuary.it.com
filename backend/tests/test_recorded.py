"""Full Generate + validation on recorded real Yahoo responses (PROMPT.md 11). Skipped when the local,
git-ignored fixtures are absent (create them with `python -m tests.record_fixtures`)."""
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from data.provider import (
    BAR_COLUMNS, CorporateActions, InstrumentCandidate, InstrumentMeta, PriceQuote, ProviderError,
)
from tests.record_fixtures import INSTRUMENTS, OUT, fname

pytestmark = pytest.mark.skipif(not (OUT / "instruments.json").exists(), reason="no recorded fixtures")


class RecordedProvider:
    name = "yahoo"

    def __init__(self) -> None:
        self.meta = json.loads((OUT / "instruments.json").read_text(encoding="utf-8"))
        self.requests = 0

    def _bars(self, s: str) -> pd.DataFrame:
        f = OUT / fname(s)
        if not f.exists():
            raise ProviderError(f"not recorded: {s}")
        df = pd.read_csv(f, parse_dates=["date"]).set_index("date")
        return df[BAR_COLUMNS]

    def search_symbols(self, q: str) -> list[InstrumentCandidate]:
        self.requests += 1
        return [InstrumentCandidate(s, m[0], m[1], None, m[2], "EQUITY") for s, m in self.meta.items()
                if s.split(".")[0] == q.upper()]

    def get_instrument(self, s: str) -> InstrumentMeta:
        m = self.meta[s]
        return InstrumentMeta(s, m[0], m[1], m[2], "EQUITY")

    def get_daily_bars(self, s: str, start: date | None, end: date | None) -> pd.DataFrame:
        self.requests += 1
        df = self._bars(s)
        return df if start is None else df.loc[pd.Timestamp(start):]

    def get_latest_price(self, s: str) -> PriceQuote:
        return PriceQuote(s, float(self._bars(s)["close"].iloc[-1]), datetime.now(timezone.utc), "recorded")

    def get_fx_daily(self, base, quote, start, end):
        return self.get_daily_bars(f"{base}{quote}=X", start, end)[["close"]].rename(columns={"close": "rate"})

    def get_corporate_actions(self, s: str) -> CorporateActions:
        df = self._bars(s)
        return CorporateActions(df["splits"][df["splits"] > 0], df["dividends"][df["dividends"] > 0])


@pytest.fixture()
def recorded(db):
    from app.models import PriceBar, SymbolFetchLog
    from data.service import set_provider
    from tests.fixture_provider import FixtureProvider

    def wipe():
        names = [f.stem for f in OUT.glob("*.csv")]
        syms = list(INSTRUMENTS) + ["^GSPC", "^FTSE", "^GDAXI", "^TNX", "BZ=F", "^IRX", "EURUSD=X", "GBPUSD=X"]
        db.query(PriceBar).filter(PriceBar.symbol.in_(syms)).delete(synchronize_session=False)
        db.query(SymbolFetchLog).filter(SymbolFetchLog.symbol.in_(syms)).delete(synchronize_session=False)
        db.commit()
        return names

    wipe()
    p = RecordedProvider()
    set_provider(p)
    yield p
    wipe()
    set_provider(FixtureProvider())


def test_generate_on_recorded_yahoo(recorded):
    from app.main import app
    from jobs import worker

    c = TestClient(app)
    r = c.post("/api/auth/register", json={"email": "rec@example.com", "password": "secret-pass-1"})
    if r.status_code == 409:
        r = c.post("/api/auth/login", json={"email": "rec@example.com", "password": "secret-pass-1"})
    c.headers["x-csrf-token"] = r.json()["csrf"]
    pid = c.post("/api/portfolios", json={"name": "Recorded", "base_currency": "USD"}).json()["id"]
    last = recorded._bars("MSFT").index[-1].date()
    for sym, qty in (("MSFT", 5), ("AAPL", 7), ("SAP.DE", 4), ("VOD.L", 100)):
        r = c.post(f"/api/portfolios/{pid}/transactions",
                   json={"provider_symbol": sym, "quantity": qty, "trade_date": str(last - pd.Timedelta(days=400))})
        assert r.status_code == 200, r.text
    c.post(f"/api/portfolios/{pid}/generate")
    while (jid := worker.claim_job()) is not None:
        worker.process(jid)
    res = c.get(f"/api/portfolios/{pid}/runs/latest").json()
    assert res["status"] == "done", res.get("error")
    risk = res["result"]["risk"]["0.95"]
    assert 0.04 < risk["var_pct"] < 0.40 and risk["cvar_pct"] >= risk["var_pct"]
    vod = [a for a in res["result"]["assets"] if a["symbol"] == "VOD.L"][0]
    assert 0.2 < vod["price0"] < 10  # pence converted to pounds
    assert res["validation_status"] == "done" and res["reliability"] in ("high", "medium", "low")
