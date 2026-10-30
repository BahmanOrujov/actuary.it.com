"""End-to-end Generate flow with the fixture provider, plus security/privacy checks (PROMPT.md 11)."""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import FORBIDDEN_CLIENT_KEYS
from jobs.worker import claim_job, process


def _client(email: str) -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/register", json={"email": email, "password": "secret-pass-1"})
    if r.status_code == 409:
        r = c.post("/api/auth/login", json={"email": email, "password": "secret-pass-1"})
    assert r.status_code == 200, r.text
    c.headers["x-csrf-token"] = r.json()["csrf"]
    return c


def _drain() -> None:
    while (jid := claim_job()) is not None:
        process(jid)


def _walk_keys(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k
            yield from _walk_keys(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _walk_keys(v)


@pytest.fixture(scope="module")
def admin():
    return _client("admin@example.com")


@pytest.fixture(scope="module")
def alice(admin):
    return _client("alice@example.com")


@pytest.fixture(scope="module")
def bob(admin):
    return _client("bob@example.com")


def test_first_user_is_admin(admin, alice):
    assert admin.get("/api/auth/me").json()["role"] == "admin"
    assert alice.get("/api/auth/me").json()["role"] == "client"


def test_csrf_required(alice):
    c = TestClient(app)
    c.cookies = alice.cookies
    r = c.post("/api/portfolios", json={"name": "x"})
    assert r.status_code == 403


def test_full_generate_flow(alice, bob, admin):
    p = alice.post("/api/portfolios", json={"name": "Əsas", "base_currency": "USD"}).json()
    pid = p["id"]
    s = alice.get("/api/symbols/search", params={"q": "MSFT"}).json()
    assert s["auto_select"] and s["candidates"][0]["provider_symbol"] == "MSFT"
    # quantity + date + price
    r = alice.post(f"/api/portfolios/{pid}/transactions",
                   json={"provider_symbol": "MSFT", "quantity": 10, "trade_date": "2024-03-04", "price": 410})
    assert r.status_code == 200, r.text
    # quantity + date -> close price
    r = alice.post(f"/api/portfolios/{pid}/transactions",
                   json={"provider_symbol": "AAPL", "quantity": 5, "trade_date": "2025-06-07"})
    assert r.status_code == 200 and r.json()["flags"]["price_source"] == "close"
    assert any("ticarət günü deyil" in w for w in r.json()["warnings"])  # Saturday
    # only quantity -> latest
    r = alice.post(f"/api/portfolios/{pid}/transactions", json={"provider_symbol": "SAP.DE", "quantity": 3})
    assert r.json()["flags"]["price_source"] == "latest"
    # future date rejected
    r = alice.post(f"/api/portfolios/{pid}/transactions",
                   json={"provider_symbol": "XOM", "quantity": 1, "trade_date": "2099-01-01"})
    assert r.status_code == 422
    # oversell rejected
    r = alice.post(f"/api/portfolios/{pid}/transactions",
                   json={"provider_symbol": "MSFT", "side": "SELL", "quantity": 50, "trade_date": "2025-01-02", "price": 420})
    assert r.status_code == 422
    r = alice.post(f"/api/portfolios/{pid}/transactions",
                   json={"provider_symbol": "MSFT", "side": "SELL", "quantity": 2, "trade_date": "2025-01-02", "price": 420, "fees": 1})
    assert r.status_code == 200

    # bob cannot see alice's portfolio, nor admin endpoints
    assert bob.get(f"/api/portfolios/{pid}").status_code == 404
    assert bob.get("/api/admin/runs").status_code == 403
    assert alice.get("/api/admin/runs").status_code == 403

    run = alice.post(f"/api/portfolios/{pid}/generate").json()
    assert run["status"] == "queued"
    _drain()
    latest = alice.get(f"/api/portfolios/{pid}/runs/latest").json()
    assert latest["status"] == "done", latest.get("error")
    assert latest["stale"] is False
    res = latest["result"]
    assert len(res["dates"]) == 63
    assert res["risk"]["0.95"]["cvar_pct"] >= res["risk"]["0.95"]["var_pct"] > 0
    assert latest["validation_status"] == "done"
    assert latest["reliability"] in ("high", "medium", "low")
    assert latest["recommendations"] and all("disclaimer" in r for r in latest["recommendations"])
    # CIO / CRO views come from the same simulation as the headline numbers
    ins = res["insights"]
    inv, rk = ins["investment"], ins["risk"]
    assert inv["memo"] and rk["memo"] and len(inv["positions"]) == len(res["assets"]) == 3
    assert abs(sum(p["risk_share"] for p in inv["positions"]) - 1) < 1e-6
    assert abs(sum(e["weight"] for e in inv["exposure"]["currency"]) - 1) < 1e-6
    assert rk["metrics"]["cvar95"] == pytest.approx(res["risk"]["0.95"]["cvar_pct"])
    assert rk["metrics"]["limit"] == res["risk_limit"]
    assert {k["key"] for k in rk["kri"]} >= {"limit_use", "vol_regime", "top_weight", "stress", "liquidity"}
    assert all(k["status"] in ("green", "amber", "red", "none") for k in rk["kri"])
    assert 0 < inv["metrics"]["diversification_benefit"] < 1
    # the quantile grid behind user-chosen VaR levels agrees with the headline VaR
    q = rk["quantiles"]
    assert len(q) == 999 and all(a <= b for a, b in zip(q, q[1:]))
    assert -q[49] == pytest.approx(res["risk"]["0.95"]["var_pct"], abs=2e-3)
    assert 0 <= inv["metrics"]["prob_beat_rf"] <= 1 and rk["metrics"]["semidev_annual"] > 0
    # privacy: no diagnostics in client payloads
    keys = set(_walk_keys(latest))
    assert not keys & FORBIDDEN_CLIENT_KEYS, keys & FORBIDDEN_CLIENT_KEYS
    assert "p_value" not in json.dumps(latest)

    # admin sees diagnostics and the report
    rid = latest["id"]
    d = admin.get(f"/api/admin/runs/{rid}").json()
    assert d["diagnostics"]["assets"] and d["validation"]["gates"]
    rep = admin.get(f"/api/admin/runs/{rid}/report.html")
    assert rep.status_code == 200 and "Gate" in rep.text

    # reproducibility: same snapshot -> same results
    run2 = alice.post(f"/api/portfolios/{pid}/generate").json()
    _drain()
    again = alice.get(f"/api/runs/{run2['id']}").json()
    assert again["result"]["risk"] == res["risk"]
    assert again["result"]["fan"] == res["fan"]


def test_stale_after_change(alice):
    pid = alice.get("/api/portfolios").json()[0]["id"]
    alice.post(f"/api/portfolios/{pid}/transactions", json={"provider_symbol": "XOM", "quantity": 2})
    latest = alice.get(f"/api/portfolios/{pid}/runs/latest").json()
    assert latest["stale"] is True


def test_provider_outage_uses_cache(alice, db):
    from data.service import MarketData, set_provider
    from tests.fixture_provider import FixtureProvider
    from app.models import SymbolFetchLog

    for row in db.query(SymbolFetchLog).all():
        db.delete(row)
    db.commit()
    md = MarketData(db, FixtureProvider(fail=True))
    bars = md.bars("MSFT")
    assert len(bars) > 100
    assert md.messages and "keşdəki" in md.messages[0]
    set_provider(FixtureProvider())


def test_account_deletion(admin):
    c = _client("carol@example.com")
    c.post("/api/portfolios", json={"name": "c"})
    assert c.delete("/api/auth/account").status_code == 200
    users = admin.get("/api/admin/users").json()
    assert "carol@example.com" not in [u["email"] for u in users]
