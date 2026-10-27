# Architecture

```text
Browser (React + ECharts)
   │  cookie session + CSRF header
   ▼
FastAPI (backend/app)  ── client API (/api/…)      → run_results, recommendations (no diagnostics)
                       ── admin API (/api/admin/…) → run_diagnostics, reports   (require_admin)
   │  enqueue Job rows
   ▼
SQLite (WAL) ◄──────── worker (backend/jobs/worker.py)
                          generate: snapshot → data refresh → diagnostics → GARCH/DCC → FHS → measures
                                    → stress → recommendations → client payload + admin diagnostics
                          validate: rolling backtest → tests → gates → reliability label → HTML/JSON report
```

## Key decisions

- **Provider abstraction.** `data/provider.py` defines `MarketDataProvider`. `YahooProvider` refuses to start
  outside `personal` mode. A licensed provider can be added without touching the risk engine.
- **Cache.** `price_bars` keyed by (symbol, date, source). Incremental refresh at most once per day; a split
  triggers a full reload. Provider errors fall back to the cache with a client-safe message.
- **Snapshot immutability.** Generate freezes the portfolio composition into `analysis_runs.snapshot`; the worker
  rebuilds a read-only portfolio from it. The seed, config subset and model version are stored, so the same
  snapshot reproduces the same numbers (tested).
- **Stale detection.** `portfolios.version` increments on every change; a run is stale when its version differs.
- **Privacy split.** Client payloads are built from an allow-list of fields and checked by
  `services.assert_client_safe` (forbidden keys such as `p_value`, `params`, `tests`) on every response.
- **Validation cache.** Backtests are keyed by (instruments, quantities, data date, config) and reused.
- **Parallelism.** GARCH specification search runs in a process pool (`PA_NO_PARALLEL=1` disables it).
- **Commercial mode.** `APP_MODE=commercial` disables Yahoo and CSV import automatically.
