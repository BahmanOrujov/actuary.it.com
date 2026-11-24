"""Server-to-server password check used by the Learning app (app.api_internal)."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

TOKEN = "test-internal-token-0123456789"
H = {"X-Internal-Token": TOKEN}


def test_off_without_token(monkeypatch):
    monkeypatch.delenv("PA_INTERNAL_TOKEN", raising=False)
    c = TestClient(app)
    assert c.post("/api/internal/verify", json={"email": "a@example.com", "password": "x"}, headers=H).status_code == 404


def test_refuses_wrong_token_and_proxied_calls(monkeypatch):
    monkeypatch.setenv("PA_INTERNAL_TOKEN", TOKEN)
    c = TestClient(app)
    body = {"email": "a@example.com", "password": "x"}
    assert c.post("/api/internal/verify", json=body, headers={"X-Internal-Token": "nope"}).status_code == 404
    # through Caddy (/portfolio/*) the call carries X-Forwarded-Prefix: refused even with the right token
    assert c.post("/api/internal/verify", json=body, headers={**H, "X-Forwarded-Prefix": "/portfolio"}).status_code == 404


def test_register_then_verify(monkeypatch):
    monkeypatch.setenv("PA_INTERNAL_TOKEN", TOKEN)
    c = TestClient(app)
    email, pw = "learner@example.com", "Kolibri-Yasil-7731"
    assert c.post("/api/internal/verify", json={"email": email, "password": pw}, headers=H).json()["status"] == "unknown"
    assert c.post("/api/internal/register", json={"email": email, "password": "short"}, headers=H).status_code == 422
    assert c.post("/api/internal/register", json={"email": email, "password": pw}, headers=H).status_code == 200
    assert c.post("/api/internal/register", json={"email": email, "password": pw}, headers=H).status_code == 409
    assert c.post("/api/internal/verify", json={"email": email.upper(), "password": pw}, headers=H).json()["status"] == "ok"
    assert c.post("/api/internal/verify", json={"email": email, "password": pw + "x"}, headers=H).json()["status"] == "wrong"
    # the same password signs in to Portfel itself
    assert c.post("/api/auth/login", json={"email": email, "password": pw}).status_code == 200


def test_failed_checks_lock_the_account(monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("PA_INTERNAL_TOKEN", TOKEN)
    c = TestClient(app)
    email, pw = "locked@example.com", "Kolibri-Yasil-7731"
    c.post("/api/internal/register", json={"email": email, "password": pw}, headers=H)
    for _ in range(int(get_settings()["security"]["max_failed_logins"])):
        c.post("/api/internal/verify", json={"email": email, "password": "wrong-one"}, headers=H)
    assert c.post("/api/internal/verify", json={"email": email, "password": pw}, headers=H).json()["status"] == "locked"
