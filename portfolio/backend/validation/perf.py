"""Generate fast-path timing for a 30-instrument portfolio (PROMPT.md 4.4, 11).

Production configuration (10 000 scenarios, full 9-spec GARCH search, K = 200, break tests, process pool),
synthetic data, isolated temporary database - no provider requests.

Run:  python -m validation.perf [n_instruments]   (cwd = backend)
"""
from __future__ import annotations

import os
import sys
import tempfile
import time
import zlib
from datetime import date
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="pa_perf_"))
os.environ["DATABASE_URL"] = "sqlite:///" + str(_tmp / "perf.db").replace("\\", "/")
os.environ["DATA_CACHE_DIR"] = str(_tmp / "cache")
os.environ["ADMIN_REPORTS_DIR"] = str(_tmp / "reports")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from data.provider import BAR_COLUMNS, InstrumentMeta, ProviderError  # noqa: E402

END = pd.Timestamp("2026-10-23")


class SyntheticProvider:
    """n instruments driven by one market factor with GJR-GARCH idiosyncratic volatility."""
    name = "yahoo"

    def __init__(self, n: int):
        self.symbols = [f"SYN{i:02d}" for i in range(n)]
        idx = pd.bdate_range(END - pd.DateOffset(years=12), END)
        mrng = np.random.default_rng(99)
        self.market = mrng.standard_t(5, len(idx)) / np.sqrt(5 / 3) * 0.009
        self.idx = idx

    def _series(self, s: str) -> pd.DataFrame:
        if s not in self.symbols and s != "^GSPC":
            raise ProviderError(s)
        rng = np.random.default_rng(zlib.crc32(s.encode()))
        n = len(self.idx)
        beta = 0.6 + 0.8 * rng.random() if s != "^GSPC" else 1.0
        w, a, g, b = 2e-6, 0.04, 0.08, 0.9
        s2, r = 1e-4, np.empty(n)
        for t in range(n):
            e = np.sqrt(s2) * rng.standard_t(6) / np.sqrt(1.5) if s != "^GSPC" else 0.0
            r[t] = 0.0003 + beta * self.market[t] + e
            s2 = w + (a + g * (e < 0)) * e * e + b * s2
        px = 100 * np.exp(np.cumsum(r))
        df = pd.DataFrame({"open": px, "high": px * 1.01, "low": px * 0.99, "close": px, "adj_close": px,
                           "volume": 1e6, "dividends": 0.0, "splits": 0.0}, index=self.idx)
        return df[BAR_COLUMNS]

    def search_symbols(self, q):
        return []

    def get_instrument(self, s):
        return InstrumentMeta(s, s, "NYSE", "USD", "EQUITY")

    def get_daily_bars(self, s, start, end):
        df = self._series(s)
        return df if start is None else df.loc[pd.Timestamp(start):]

    def get_fx_daily(self, *a):
        raise ProviderError("no fx")

    def get_latest_price(self, s):
        raise ProviderError("n/a")

    def get_corporate_actions(self, s):
        raise ProviderError("n/a")


def main(n: int = 30) -> None:
    from types import SimpleNamespace

    from app.config import get_settings
    from app.db import SessionLocal, init_db
    from app.models import Instrument
    from data.service import MarketData, set_provider
    from portfolio.snapshot import build_portfolio_data
    from risk.engine import run_generate

    init_db()
    prov = SyntheticProvider(n)
    set_provider(prov)
    cfg = get_settings().raw
    steps: dict[str, float] = {}
    t0 = time.perf_counter()
    with SessionLocal() as db:
        md = MarketData(db, prov)
        txs = []
        for i, s in enumerate(prov.symbols):
            inst = md.ensure_instrument(s, s)
            txs.append(SimpleNamespace(id=i, instrument_id=inst.id, instrument=inst, side="BUY", quantity=10.0 + i,
                                       trade_date=date(2024, 1, 2), price=100.0, fees=0.0, input_flags={}))
        md.bars("^GSPC")
        for s in prov.symbols:
            md.bars(s)
        db.commit()
        steps["data load (cache warm-up, not part of a normal run)"] = time.perf_counter() - t0
        portfolio = SimpleNamespace(id=1, owner_id=1, name="perf", base_currency="USD", risk_profile="moderate",
                                    risk_limit=None, cash=0.0, version=1, transactions=txs, targets=[])
        t1 = time.perf_counter()
        marks = {}

        def progress(step, frac):
            marks[step] = time.perf_counter()

        pdata = build_portfolio_data(db, portfolio, md, seed=cfg["model"]["seed"], cfg=cfg)
        client, admin, _ = run_generate(pdata, md, cfg, progress, db)
        total = time.perf_counter() - t1
    t_end = t1 + total
    phases = [("snapshot", t1, "checking"), ("data checks + return diagnostics", "checking", "modeling"),
              ("GARCH selection + break tests + DCC", "modeling", "simulation"),
              ("simulation + risk measures", "simulation", "stress"), ("stress tests + payload", "stress", None)]
    for label, a, b in phases:
        start = a if isinstance(a, float) else marks.get(a)
        stop = marks.get(b) if b else t_end
        if start is not None and stop is not None:
            steps[label] = stop - start
    print(f"Instruments: {n}; scenarios used: {client['scenarios']}; specs: "
          f"{sorted({a['kind'] + '-' + a['dist'] for a in admin['assets'].values()})}")
    workers = max(1, min(int(cfg["jobs"]["max_workers"]), (os.cpu_count() or 2) - 1))
    e = admin["mc"]["errors"]["0.95"]
    print(f"Correlation model: {admin['multivariate']['kind']}; process-pool workers: {workers}")
    print(f"MC relative error VaR95 {e['var_rel']:.2%}, CVaR95 {e['cvar_rel']:.2%} "
          f"(target {cfg['model']['mc_rel_error_target']:.0%}; memory cap on scenarios applies)")
    for k, v in steps.items():
        print(f"  {k}: {v:.1f} s")
    print(f"GENERATE FAST PATH TOTAL: {total:.1f} s  (target: ~120-180 s)")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 30)
