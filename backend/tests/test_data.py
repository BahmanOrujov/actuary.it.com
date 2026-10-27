"""CSV parser (investing.com variants), FX conversion, calendars, quality checks, Yahoo mode gating."""
from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
import pytest

from data.calendars import future_sessions, month_end_checkpoints, previous_session
from data.csv_investing import CsvFormatError, parse_price_csv
from data.quality import check_bars
from data.service import to_base_currency

US_CSV = '''"Date","Price","Open","High","Low","Vol.","Change %"
"10/24/2025","1,234.50","1,220.00","1,240.00","1,215.25","12.5M","1.20%"
"10/23/2025","1,219.87","1,210.00","1,225.00","1,205.00","850.20K","-0.35%"
"10/22/2025","1,224.16","1,230.00","1,231.00","1,219.00","1.1B","0.10%"
'''

EU_CSV = '''Date;Price;Open;High;Low;Vol.;Change %
24.10.2025;1.234,50;1.220,00;1.240,00;1.215,25;12,5M;1,20%
23.10.2025;1.219,87;1.210,00;1.225,00;1.205,00;850,20K;-0,35%
22.10.2025;1.224,16;1.230,00;1.231,00;1.219,00;-;0,10%
'''


def test_parse_us_format():
    df = parse_price_csv(US_CSV.encode("utf-8-sig"))
    assert list(df.index) == sorted(df.index)  # reverse chronology fixed
    assert df["close"].iloc[-1] == pytest.approx(1234.5)
    assert df["volume"].iloc[-1] == pytest.approx(12.5e6)
    assert df["volume"].iloc[1] == pytest.approx(850.2e3)
    assert df["volume"].iloc[0] == pytest.approx(1.1e9)
    assert df.index[0] == pd.Timestamp("2025-10-22")


def test_parse_eu_format():
    df = parse_price_csv(EU_CSV)
    assert df["close"].iloc[-1] == pytest.approx(1234.5)
    assert df["open"].iloc[0] == pytest.approx(1230.0)
    assert np.isnan(df["volume"].iloc[0])
    assert df.index[-1] == pd.Timestamp("2025-10-24")


def test_parse_iso_dates_plain_numbers():
    df = parse_price_csv("Date,Close\n2025-01-03,10.5\n2025-01-02,10.1\n")
    assert df["close"].tolist() == [10.1, 10.5]


def test_bad_csv():
    with pytest.raises(CsvFormatError):
        parse_price_csv("foo,bar\n1,2\n")
    with pytest.raises(CsvFormatError):
        parse_price_csv("Date,Price\n2025-01-03,-1\n")


def test_fx_conversion_ffill():
    px = pd.Series([10.0, 11.0, 12.0], index=pd.to_datetime(["2025-01-02", "2025-01-03", "2025-01-06"]))
    fx = pd.Series([1.1, 1.2], index=pd.to_datetime(["2025-01-02", "2025-01-03"]))
    out = to_base_currency(px, fx)
    assert out.tolist() == pytest.approx([11.0, 13.2, 14.4])
    assert to_base_currency(px, 1.7).tolist() == pytest.approx([17.0, 18.7, 20.4])


def test_fx_azn_fixed(db):
    from data.service import MarketData

    md = MarketData(db)
    assert md.fx_series("USD", "AZN") == pytest.approx(1.70)
    assert md.fx_series("AZN", "USD") == pytest.approx(1 / 1.70)
    eur_azn = md.fx_series("EUR", "AZN")
    assert isinstance(eur_azn, pd.Series) and eur_azn.iloc[-1] > 1.70
    assert any("sabit" in n for n in md.admin_notes)


def test_calendars():
    s = future_sessions("NYSE", date(2026, 10, 23), 63)
    assert len(s) == 63 and s[0] == date(2026, 10, 26)
    assert date(2026, 11, 26) not in s  # Thanksgiving
    assert date(2026, 12, 25) not in s
    cps = month_end_checkpoints(s)
    assert cps[-1] == 62 and s[cps[0]].month == 10
    assert previous_session("NYSE", date(2026, 10, 25)) == date(2026, 10, 23)
    x = future_sessions("XETRA", date(2026, 12, 23), 5)
    assert date(2026, 12, 24) not in x and date(2026, 12, 25) not in x


def test_quality_detects_problems():
    idx = pd.bdate_range("2024-01-01", periods=300)
    px = np.exp(np.cumsum(np.random.default_rng(0).normal(0, 0.01, 300))) * 100
    px[150:] = px[150:] / 2  # unadjusted 2:1 split
    px[200:215] = px[200]   # stale run
    df = pd.DataFrame({"close": px, "adj_close": px, "splits": 0.0}, index=idx)
    q = check_bars("X", df)
    assert q.suspected_unadjusted_splits and q.longest_stale_run >= 14
    assert q.client_warnings()


def test_yahoo_blocked_in_commercial(monkeypatch):
    from app import config
    from data.provider import ProviderError
    from data.yahoo import YahooProvider

    s = config.get_settings()
    monkeypatch.setattr(s, "mode", "commercial")
    with pytest.raises(ProviderError):
        YahooProvider()
    assert s.feature("csv_import") is False
