"""Build the data of the read-only web demo (frontend `npm run build:demo`).

Creates a sample portfolio in a throw-away database, runs Generate and the validation exactly as the app does,
and saves what the API returns (plus the PDF report) so the demo shows real output of the real code.

Usage (from backend/):
    python tools/export_demo.py <out_dir>
Writes <out_dir>/data.json and <out_dir>/report.pdf. Needs internet access (market data)."""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="pa_demo_"))
os.environ["DATABASE_URL"] = "sqlite:///" + str(_tmp / "demo.db").replace("\\", "/")
os.environ["DATA_CACHE_DIR"] = str(_tmp / "cache")
os.environ["ADMIN_REPORTS_DIR"] = str(_tmp / "reports")
os.environ["APP_MODE"] = "personal"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

DEMO_EMAIL = "demo@example.com"
PORTFOLIO = "Nümunə portfel: ABŞ və Avropa"
# (provider symbol, investing.com symbol, quantity, purchase date): a diversified sample, not anyone's holdings
HOLDINGS = [
    ("AAPL", "AAPL", 12, "2023-03-01"),
    ("AAPL", "AAPL", 6, "2025-01-15"),
    ("MSFT", "MSFT", 6, "2022-11-01"),
    ("NVDA", "NVDA", 20, "2024-02-01"),
    ("JNJ", "JNJ", 10, "2023-06-01"),
    ("JPM", "JPM", 8, "2022-09-01"),
    ("XOM", "XOM", 14, "2023-01-10"),
    ("SAP.DE", "SAP", 8, "2024-01-15"),
]


def main(out_dir: str) -> None:
    from fastapi.testclient import TestClient

    from app.db import init_db
    from app.main import app
    from jobs.worker import claim_job, process

    init_db()
    c = TestClient(app)
    password = "Sx-" + os.urandom(12).hex()  # random; the throw-away account is never used again
    r = c.post("/api/auth/register", json={"email": DEMO_EMAIL, "password": password})
    r.raise_for_status()
    c.headers["x-csrf-token"] = c.cookies.get("pa_csrf", "")
    pid = c.post("/api/portfolios", json={"name": PORTFOLIO, "base_currency": "USD", "risk_profile": "moderate"}).json()["id"]
    for prov, inv, qty, day in HOLDINGS:
        r = c.post(f"/api/portfolios/{pid}/transactions",
                   json={"provider_symbol": prov, "investing_symbol": inv, "quantity": qty, "trade_date": day})
        r.raise_for_status()
        print(f"added {inv} {qty} @ {day}", flush=True)
    c.post(f"/api/portfolios/{pid}/generate").raise_for_status()
    while (jid := claim_job()) is not None:  # generate, then validation
        process(jid)
    run = c.get(f"/api/portfolios/{pid}/runs/latest").json()
    if run.get("status") != "done":
        raise SystemExit(f"run failed: {run.get('error')}")

    user = c.get("/api/auth/me").json()
    user["role"] = "client"  # the demo never shows admin pages
    data = {
        "user": user,
        "config": c.get("/api/config/public").json(),
        "portfolios": c.get("/api/portfolios").json(),
        "details": {str(pid): c.get(f"/api/portfolios/{pid}").json()},
        "runs": {str(pid): run},
    }
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "data.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    pdf = c.get(f"/api/portfolios/{pid}/report.pdf")
    pdf.raise_for_status()
    (out / "report.pdf").write_bytes(pdf.content)
    print(f"wrote {out / 'data.json'} and report.pdf; reliability {run['reliability']}, "
          f"{len(run['result']['stress'])} stress scenarios")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "demo_out")
