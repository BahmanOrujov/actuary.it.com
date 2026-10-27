"""Record real Yahoo responses as local test fixtures (PROMPT.md 11: integration test with recorded responses).

Yahoo data may only be used personally, so the fixtures stay on this machine: backend/tests/recorded/ is in
.gitignore. Sources: a cache database that already holds the data (no network) or live Yahoo (personal mode).

  python -m tests.record_fixtures --from-db "C:/path/app.db"     # export from an existing cache
  python -m tests.record_fixtures                               # fetch live (respects the rate limits)
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

OUT = Path(__file__).resolve().parent / "recorded"
SYMBOLS = ["AAPL", "MSFT", "SAP.DE", "VOD.L", "^GSPC", "^FTSE", "^GDAXI", "^TNX", "BZ=F", "^IRX",
           "EURUSD=X", "GBPUSD=X"]
INSTRUMENTS = {
    "AAPL": ("Apple Inc.", "NASDAQ", "USD"), "MSFT": ("Microsoft Corporation", "NASDAQ", "USD"),
    "SAP.DE": ("SAP SE", "XETRA", "EUR"), "VOD.L": ("Vodafone Group Plc", "LSE", "GBP"),
}
YEARS = 8


def fname(symbol: str) -> str:
    return symbol.replace("^", "IDX_").replace("=", "_EQ_") + ".csv"


def from_db(path: str) -> dict[str, pd.DataFrame]:
    con = sqlite3.connect(path)
    out = {}
    for s in SYMBOLS:
        df = pd.read_sql("select date, open, high, low, close, adj_close, volume, dividends, splits from price_bars "
                         "where symbol = ? and source = 'yahoo' order by date", con, params=(s,), parse_dates=["date"])
        if not df.empty:
            out[s] = df.set_index("date")
    return out


def live() -> dict[str, pd.DataFrame]:
    from data.yahoo import YahooProvider

    p = YahooProvider()
    return {s: p.get_daily_bars(s, None, None) for s in SYMBOLS}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-db")
    args = ap.parse_args()
    data = from_db(args.from_db) if args.from_db else live()
    OUT.mkdir(exist_ok=True)
    for s, df in data.items():
        df = df.loc[df.index.max() - pd.DateOffset(years=YEARS):]
        df.to_csv(OUT / fname(s), index_label="date")
    (OUT / "instruments.json").write_text(json.dumps(INSTRUMENTS, indent=1), encoding="utf-8")
    print(f"{len(data)} symbols written to {OUT}: {sorted(data)}")


if __name__ == "__main__":
    main()
