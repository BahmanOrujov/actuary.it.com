"""Features added after the first audit: dividends, password reset, monitoring, admin overrides, reliability cap,
gate-failure fallback, candidate currency, autocomplete, CSV source tags, cache-only market data."""
from __future__ import annotations

import logging
import re
from datetime import date

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from jobs import worker
from portfolio.lots import Tx
from portfolio.snapshot import dividends_received


def _client(email: str) -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/register", json={"email": email, "password": "secret-pass-1"})
    if r.status_code == 409:
        r = c.post("/api/auth/login", json={"email": email, "password": "secret-pass-1"})
    assert r.status_code == 200, r.text
    c.headers["x-csrf-token"] = r.json()["csrf"]
    return c


def _drain() -> None:
    while (jid := worker.claim_job()) is not None:
        worker.process(jid)


@pytest.fixture(scope="module")
def admin():
    return _client("admin@example.com")


@pytest.fixture(scope="module")
def dora(admin):
    return _client("dora@example.com")


# ------------------------------------------------------------------ dividends
def test_dividend_entitlement_rules():
    divs = pd.Series([1.0, 1.0], index=pd.to_datetime(["2024-03-01", "2024-06-03"]))
    txs = [
        Tx("A", "BUY", 10, date(2024, 2, 1), 50),
        Tx("A", "BUY", 5, date(2024, 3, 1), 50),     # bought on the ex-date: not entitled to the March dividend
        Tx("A", "SELL", 15, date(2024, 6, 3), 60),   # sold on the ex-date: still entitled to the June dividend
    ]
    assert dividends_received(txs, divs, None, 1.0, date(2024, 12, 31)) == pytest.approx(10 * 1 + 15 * 1)
    fx = pd.Series([2.0], index=pd.to_datetime(["2024-01-01"]))
    assert dividends_received(txs, divs, None, fx, date(2024, 4, 1)) == pytest.approx(10 * 1 * 2)
    splits = pd.Series([2.0], index=pd.to_datetime(["2024-04-15"]))   # 2:1 split; dividends are split-adjusted
    assert dividends_received(txs[:1], divs.iloc[1:] / 2, splits, 1.0, date(2024, 12, 31)) == pytest.approx(20 * 0.5)


# ------------------------------------------------------------------ password reset
def test_password_reset_flow(caplog):
    c = _client("erin@example.com")
    anon = TestClient(app)
    with caplog.at_level(logging.WARNING, logger="password-reset"):
        r = anon.post("/api/auth/password-reset/request", json={"email": "erin@example.com"})
    assert r.status_code == 200
    # unknown e-mail gets the same answer (no enumeration)
    assert anon.post("/api/auth/password-reset/request", json={"email": "nobody@example.com"}).json() == r.json()
    token = re.search(r"token=([\w-]+)", caplog.text).group(1)
    assert anon.post("/api/auth/password-reset/confirm", json={"token": token, "new_password": "brand-new-pass"}).status_code == 200
    assert anon.post("/api/auth/password-reset/confirm", json={"token": token, "new_password": "again-new-pass"}).status_code == 400
    assert c.get("/api/auth/me").status_code == 401  # sessions were revoked
    assert anon.post("/api/auth/login", json={"email": "erin@example.com", "password": "brand-new-pass"}).status_code == 200


def test_admin_invite_creates_account_and_link(admin, monkeypatch):
    from app import api_admin
    monkeypatch.delenv("PA_SMTP_USER", raising=False)
    anon = TestClient(app)
    assert anon.post("/api/admin/users/invite", json={"email": "gina@example.com"}).status_code in (401, 403)
    r = admin.post("/api/admin/users/invite", json={"email": "Gina@example.com"})
    assert r.status_code == 200 and r.json()["emailed"] is False and "invite=1" in r.json()["link"]
    assert admin.post("/api/admin/users/invite", json={"email": "gina@example.com"}).status_code == 409
    # nobody knows the initial password; the invitee sets one through the link
    assert anon.post("/api/auth/login", json={"email": "gina@example.com", "password": "secret-pass-1"}).status_code == 401
    token = re.search(r"token=([\w-]+)", r.json()["link"]).group(1)
    assert anon.post("/api/auth/password-reset/confirm", json={"token": token, "new_password": "maple-river-42"}).status_code == 200
    me = anon.post("/api/auth/login", json={"email": "gina@example.com", "password": "maple-river-42"})
    assert me.status_code == 200 and me.json()["role"] == "client"

    sent = []
    monkeypatch.setenv("PA_SMTP_USER", "site@example.com")
    monkeypatch.setenv("PA_SMTP_PASSWORD", "app-password")
    monkeypatch.setattr(api_admin, "send_mail", lambda to, subject, body: sent.append((to, body)))
    r = admin.post("/api/admin/users/invite", json={"email": "hank@example.com", "role": "admin"})
    assert r.json() == {"ok": True, "emailed": True}  # the link is not shown when it was e-mailed
    assert sent[0][0] == "hank@example.com" and "invite=1" in sent[0][1]


def test_password_reset_link_is_emailed_when_smtp_is_set(monkeypatch, caplog):
    from app import api_client
    sent = []
    monkeypatch.setenv("PA_SMTP_USER", "site@example.com")
    monkeypatch.setenv("PA_SMTP_PASSWORD", "app-password")
    monkeypatch.setattr(api_client, "send_mail", lambda to, subject, body: sent.append((to, body)))
    _client("fred@example.com")
    anon = TestClient(app)
    with caplog.at_level(logging.WARNING, logger="password-reset"):
        r = anon.post("/api/auth/password-reset/request", json={"email": "fred@example.com"})
    assert r.status_code == 200 and "göndərildi" in r.json()["message"]
    assert anon.post("/api/auth/password-reset/request", json={"email": "nobody@example.com"}).json() == r.json()
    assert len(sent) == 1 and sent[0][0] == "fred@example.com"
    assert "token=" not in caplog.text  # the link goes only to the mailbox, not to the server log
    token = re.search(r"token=([\w-]+)", sent[0][1]).group(1)
    assert anon.post("/api/auth/password-reset/confirm", json={"token": token, "new_password": "brand-new-pass"}).status_code == 200


# ------------------------------------------------------------------ search helpers and CSV source
def test_candidate_currency_and_suggest(dora):
    r = dora.get("/api/symbols/search", params={"q": "SAP"}).json()
    sap = [c for c in r["candidates"] if c["provider_symbol"] == "SAP.DE"][0]
    assert sap["currency"] == "EUR"
    pid = dora.post("/api/portfolios", json={"name": "Suggest"}).json()["id"]
    dora.post(f"/api/portfolios/{pid}/transactions", json={"provider_symbol": "SAP.DE", "quantity": 1})
    s = dora.get("/api/instruments/suggest", params={"q": "SA"}).json()
    assert any(i["provider_symbol"] == "SAP.DE" for i in s)


def test_csv_generic_source(dora, db):
    from app.models import PriceBar

    pid = dora.post("/api/portfolios", json={"name": "CSV"}).json()["id"]
    csv = "Date,Close\n2025-01-03,10.5\n2025-01-02,10.1\n"
    r = dora.post(f"/api/portfolios/{pid}/csv-import", files={"file": ("x.csv", csv, "text/csv")},
                  data={"symbol": "MYCO", "exchange": "NYSE", "currency": "USD", "source": "user"})
    assert r.status_code == 200, r.text
    rows = db.query(PriceBar).filter(PriceBar.symbol == "CSV:MYCO").all()
    assert rows and {b.source for b in rows} == {"csv:user"}


# ------------------------------------------------------------------ admin overrides frozen into the run
def test_admin_overrides_reach_the_run(admin, dora, db):
    from app.models import AnalysisRun

    assert admin.put("/api/admin/settings", json={"key": "gate.alpha", "value": 0.01}).status_code == 200
    assert admin.put("/api/admin/settings", json={"key": "mrp.USD", "value": 0.06}).status_code == 200
    try:
        pid = dora.post("/api/portfolios", json={"name": "Overrides"}).json()["id"]
        dora.post(f"/api/portfolios/{pid}/transactions", json={"provider_symbol": "MSFT", "quantity": 3})
        run = dora.post(f"/api/portfolios/{pid}/generate").json()
        _drain()
        db.expire_all()
        r = db.get(AnalysisRun, run["id"])
        assert r.snapshot["config"]["validation"]["alpha"] == 0.01
        assert r.snapshot["config"]["model"]["drift"]["mrp_by_currency"]["USD"] == 0.06
        d = admin.get(f"/api/admin/runs/{run['id']}").json()
        assert d["diagnostics"]["drift"]["mrp"] == pytest.approx(0.06)
    finally:
        admin.put("/api/admin/settings", json={"key": "gate.alpha", "value": None})
        admin.put("/api/admin/settings", json={"key": "mrp.USD", "value": None})


# ------------------------------------------------------------------ short history caps reliability
def test_short_history_caps_reliability(dora):
    pid = dora.post("/api/portfolios", json={"name": "Young"}).json()["id"]
    dora.post(f"/api/portfolios/{pid}/transactions", json={"provider_symbol": "MSFT", "quantity": 2})
    dora.post(f"/api/portfolios/{pid}/transactions", json={"provider_symbol": "NEWCO", "quantity": 10})
    dora.post(f"/api/portfolios/{pid}/generate")
    _drain()
    latest = dora.get(f"/api/portfolios/{pid}/runs/latest").json()
    assert latest["status"] == "done", latest.get("error")
    assert latest["reliability"] == "low"
    assert "risk" in latest["result"] and "0.99" not in latest["result"]["risk"]  # 99% hidden when low


# ------------------------------------------------------------------ gate-failure fallback (step 1)
def test_fallback_spec_applied_when_gates_fail(dora, admin, monkeypatch, db):
    from app.models import AnalysisRun

    real = worker.evaluate

    def fake(bt, cfg, mc_rel):
        out = real(bt, cfg, mc_rel)
        fb = cfg["validation"]["fallback_spec"]
        is_fb = cfg["model"]["garch"]["vol_models"] == [fb["vol"]] and cfg["model"]["garch"]["dists"] == [fb["dist"]]
        out.update({"verdict": "pass" if is_fb else "fail", "failed_gates": [] if is_fb else [1],
                    "reliability": "high" if is_fb else "low"})
        return out

    monkeypatch.setattr(worker, "evaluate", fake)
    pid = dora.post("/api/portfolios", json={"name": "Fallback"}).json()["id"]
    dora.post(f"/api/portfolios/{pid}/transactions", json={"provider_symbol": "XOM", "quantity": 4})
    run = dora.post(f"/api/portfolios/{pid}/generate").json()
    _drain()
    db.expire_all()
    r = db.get(AnalysisRun, run["id"])
    assert r.gate_verdict == "pass" and r.snapshot.get("fallback_spec")
    d = admin.get(f"/api/admin/runs/{run['id']}").json()
    assert d["diagnostics"].get("fallback_applied") and d["validation"]["fallback_applied"]["previous_verdict"] == "fail"
    assert all(a["kind"] == "GJR" for a in d["diagnostics"]["assets"].values())


# ------------------------------------------------------------------ monitoring notifications
def test_monitoring_notification_once(dora, db):
    from app.models import AnalysisRun, Notification, Portfolio, RunResult, User
    from data.service import MarketData
    from recommend.monitor import check_portfolio

    user = db.query(User).filter(User.email == "dora@example.com").one()
    p = Portfolio(owner_id=user.id, name="Monitor", base_currency="USD")
    db.add(p)
    db.flush()
    md = MarketData(db)
    last = md.bars("MSFT").index[-1]
    prev = md.bars("MSFT").index[-2]
    run = AnalysisRun(portfolio_id=p.id, portfolio_version=p.version, status="done", snapshot={}, seed=1,
                      model_version="t")
    db.add(run)
    db.flush()
    narrow = [[1.0, 1.0, 1.0, 1.0, 1.0]]  # price far above a band of [1, 1]
    db.add(RunResult(run_id=run.id, payload={
        "as_of": prev.date().isoformat(), "base_currency": "USD", "dates": [last.date().isoformat()],
        "assets": [{"symbol": "MSFT", "investing_symbol": "MSFT", "name": "Microsoft", "currency": "USD", "fan": narrow}],
    }))
    db.commit()
    assert check_portfolio(db, md, p) == 1
    db.commit()
    assert check_portfolio(db, md, p) == 0  # deduplicated
    n = db.query(Notification).filter(Notification.portfolio_id == p.id).one()
    assert "avtomatik satış deyil" in n.message
    lst = dora.get("/api/notifications").json()
    assert lst["unread"] >= 1
    assert dora.post(f"/api/notifications/{n.id}/read").status_code == 200


# ------------------------------------------------------------------ cache-only market data
def test_cache_only_market_data_never_calls_provider(db):
    from data.service import MarketData
    from tests.fixture_provider import FixtureProvider

    p = FixtureProvider(fail=True)
    md = MarketData(db, p, refresh=False)
    assert len(md.bars("MSFT")) > 100
    assert p.request_count == 0 and not md.messages


def test_rate_limiter_blocks_after_limit():
    from app.security import RateLimiter

    rl = RateLimiter()
    assert all(rl.allow("k", 3) for _ in range(3))
    assert not rl.allow("k", 3)
    assert rl.allow("other", 3)


# ------------------------------------------------------------------ read-only share link
def test_share_link_shows_results_without_login(dora):
    pid = dora.post("/api/portfolios", json={"name": "Shared"}).json()["id"]
    dora.post(f"/api/portfolios/{pid}/transactions", json={"provider_symbol": "MSFT", "quantity": 3})
    dora.post(f"/api/portfolios/{pid}/generate")
    _drain()
    anon = TestClient(app)
    assert anon.post(f"/api/portfolios/{pid}/share").status_code == 401
    url = dora.post(f"/api/portfolios/{pid}/share").json()["url"]
    token = url.rsplit("/shared/", 1)[1]
    assert dora.get(f"/api/portfolios/{pid}").json()["shared"] is True
    view = anon.get(f"/api/shared/{token}").json()
    assert view["name"] == "Shared" and view["run"]["status"] == "done" and "result" in view["run"]
    assert "owner" not in str(view.keys()) and "email" not in view
    # a new link replaces the old one; unsharing stops the current one
    url2 = dora.post(f"/api/portfolios/{pid}/share").json()["url"]
    assert anon.get(f"/api/shared/{token}").status_code == 404
    assert dora.delete(f"/api/portfolios/{pid}/share").status_code == 200
    assert anon.get(f"/api/shared/{url2.rsplit('/shared/', 1)[1]}").status_code == 404
    assert anon.get("/api/shared/not-a-real-token").status_code == 404


# ------------------------------------------------------------------ what-if scenario
def test_whatif_scenario_is_hidden_and_comparable(dora):
    pid = dora.post("/api/portfolios", json={"name": "WhatIf"}).json()["id"]
    dora.post(f"/api/portfolios/{pid}/transactions", json={"provider_symbol": "MSFT", "quantity": 4})
    dora.post(f"/api/portfolios/{pid}/generate")
    _drain()
    assert dora.get(f"/api/portfolios/{pid}/whatif").json() is None
    # selling more than held is refused like a real trade
    bad = dora.post(f"/api/portfolios/{pid}/whatif", json={"trades": [{"provider_symbol": "MSFT", "side": "SELL", "quantity": 99}]})
    assert bad.status_code == 422
    r = dora.post(f"/api/portfolios/{pid}/whatif", json={"trades": [
        {"provider_symbol": "MSFT", "side": "SELL", "quantity": 2},
        {"provider_symbol": "XOM", "side": "BUY", "quantity": 3}]})
    assert r.status_code == 200, r.text
    _drain()
    w = dora.get(f"/api/portfolios/{pid}/whatif").json()
    assert w["run"]["status"] == "done" and w["base"] and w["scenario"] and len(w["trades"]) == 2
    # the scenario never appears as a portfolio of its own, and the real portfolio is untouched
    names = [p["name"] for p in dora.get("/api/portfolios").json()]
    assert not any("ssenari" in n for n in names)
    real = dora.get(f"/api/portfolios/{pid}").json()
    assert [(x["investing_symbol"], x["quantity"]) for x in real["positions"]] == [("MSFT", 4)]
    # a new scenario replaces the previous one; deleting the portfolio removes it too
    dora.post(f"/api/portfolios/{pid}/whatif", json={"trades": [{"provider_symbol": "MSFT", "side": "BUY", "quantity": 1}]})
    assert len(dora.get(f"/api/portfolios/{pid}/whatif").json()["trades"]) == 1
    assert dora.delete(f"/api/portfolios/{pid}/whatif").json() == {"ok": True}
    assert dora.get(f"/api/portfolios/{pid}/whatif").json() is None


# ------------------------------------------------------------------ interface language
def test_results_and_errors_follow_the_requested_language(dora):
    pid = dora.post("/api/portfolios", json={"name": "Lang"}).json()["id"]
    dora.post(f"/api/portfolios/{pid}/transactions", json={"provider_symbol": "MSFT", "quantity": 3})
    dora.post(f"/api/portfolios/{pid}/generate")
    _drain()
    az = dora.get(f"/api/portfolios/{pid}/runs/latest").json()
    en = dora.get(f"/api/portfolios/{pid}/runs/latest", headers={"x-lang": "en"}).json()
    memo_az = az["result"]["insights"]["investment"]["memo"][0]["text"]
    memo_en = en["result"]["insights"]["investment"]["memo"][0]["text"]
    assert "gözlənilən gəlir" in memo_az and "Expected return" in memo_en
    assert "" not in str(az) and "" not in str(en)  # every stored text is resolved before it leaves
    assert "investisiya məsləhəti" in az["disclaimer"] and "investment advice" in en["disclaimer"]
    assert any(s["name"] == "COVID 2020" for s in en["result"]["stress"])
    assert any(s["name"].startswith("Market −") for s in en["result"]["stress"])
    # errors too
    bad = dora.post(f"/api/portfolios/{pid}/transactions", json={"provider_symbol": "MSFT", "quantity": -1},
                    headers={"x-lang": "en"})
    assert bad.status_code == 422 and "positive" in bad.json()["detail"]
    # and the PDF (plain link: ?lang=)
    pdf = dora.get(f"/api/portfolios/{pid}/report.pdf?lang=en")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
