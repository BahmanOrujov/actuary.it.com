"""Login security: password policy, hashed sessions, account lockout without account enumeration."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.password_policy import check_password


@pytest.mark.parametrize("pw", ["password123", "P@ssw0rd2024!", "Qwerty123456", "azerbaycan2025", "12345678901",
                                "aaaaaaaaaaaa", "abcdefghijk", "Salam12345!", "short1!"])
def test_weak_passwords_rejected(pw):
    assert check_password(pw, "user@example.com")


def test_email_name_and_good_password():
    assert check_password("gunel.mammadova-77", "gunel.mammadova@example.com")
    assert check_password("Tənha-çinar 41 yarpaq", "x@example.com") == []
    assert check_password("plum-river-orbit-8", "x@example.com") == []


def test_register_enforces_policy():
    c = TestClient(app)
    r = c.post("/api/auth/register", json={"email": "weak@example.com", "password": "password123"})
    assert r.status_code == 422 and "yayılmış" in r.json()["detail"]


def test_sessions_stored_as_hashes(db):
    from app.models import UserSession
    from app.security import token_digest

    c = TestClient(app)
    r = c.post("/api/auth/register", json={"email": "hashy@example.com", "password": "plum-river-orbit-8"})
    assert r.status_code == 200, r.text
    raw = c.cookies.get("pa_session")
    db.expire_all()
    rows = [s.token for s in db.query(UserSession).all()]
    assert raw not in rows and token_digest(raw) in rows
    assert c.get("/api/auth/me").status_code == 200


def test_lockout_after_failed_attempts_and_admin_unlock(db):
    from app.models import User

    c = TestClient(app)
    assert c.post("/api/auth/register", json={"email": "lock@example.com", "password": "plum-river-orbit-9"}).status_code == 200
    anon = TestClient(app)
    for _ in range(5):
        assert anon.post("/api/auth/login", json={"email": "lock@example.com", "password": "wrong-pass"}).status_code == 401
    # now locked: even the right password is refused, with the same message as for unknown accounts
    r = anon.post("/api/auth/login", json={"email": "lock@example.com", "password": "plum-river-orbit-9"})
    assert r.status_code == 429
    for _ in range(5):
        anon.post("/api/auth/login", json={"email": "ghost@example.com", "password": "wrong-pass"})
    r2 = anon.post("/api/auth/login", json={"email": "ghost@example.com", "password": "wrong-pass"})
    assert r2.status_code == 429 and r2.json() == r.json()
    db.expire_all()
    u = db.query(User).filter(User.email == "lock@example.com").one()
    assert u.locked_until is not None

    admin = TestClient(app)
    a = admin.post("/api/auth/login", json={"email": "admin@example.com", "password": "secret-pass-1"})
    admin.headers["x-csrf-token"] = a.json()["csrf"]
    users = admin.get("/api/admin/users").json()
    assert [x for x in users if x["email"] == "lock@example.com"][0]["locked_until"]
    assert admin.patch(f"/api/admin/users/{u.id}", json={"unlock": True}).status_code == 200
    assert anon.post("/api/auth/login", json={"email": "lock@example.com", "password": "plum-river-orbit-9"}).status_code == 200


def test_password_change_policy_and_other_sessions_revoked():
    a = TestClient(app)
    r = a.post("/api/auth/register", json={"email": "chg@example.com", "password": "plum-river-orbit-7"})
    a.headers["x-csrf-token"] = r.json()["csrf"]
    b = TestClient(app)
    b.post("/api/auth/login", json={"email": "chg@example.com", "password": "plum-river-orbit-7"})
    bad = a.post("/api/auth/password", json={"old_password": "plum-river-orbit-7", "new_password": "qwerty12345"})
    assert bad.status_code == 422
    ok = a.post("/api/auth/password", json={"old_password": "plum-river-orbit-7", "new_password": "cedar-lake-quartz-3"})
    assert ok.status_code == 200
    assert a.get("/api/auth/me").status_code == 200   # this device stays signed in
    assert b.get("/api/auth/me").status_code == 401   # the other device is signed out


def test_closed_registration_allows_only_the_first_account(monkeypatch):
    from app.config import get_settings

    c = TestClient(app)
    c.post("/api/auth/register", json={"email": "first-open@example.com", "password": "plum-river-orbit-8"})
    monkeypatch.setattr(get_settings(), "open_registration", False)
    r = TestClient(app).post("/api/auth/register", json={"email": "late@example.com", "password": "plum-river-orbit-8"})
    assert r.status_code == 403 and "bağlıdır" in r.json()["detail"]
