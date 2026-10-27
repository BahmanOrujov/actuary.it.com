"""Test configuration: isolated temp database/cache, fixture provider, reduced simulation sizes."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="pa_test_"))
os.environ["DATABASE_URL"] = "sqlite:///" + str(_tmp / "test.db").replace("\\", "/")
os.environ["DATA_CACHE_DIR"] = str(_tmp / "cache")
os.environ["ADMIN_REPORTS_DIR"] = str(_tmp / "reports")
os.environ["APP_MODE"] = "personal"
os.environ["PA_NO_PARALLEL"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app.config import get_settings  # noqa: E402

cfg = get_settings().raw
cfg["model"]["scenarios"] = 2000
cfg["model"]["scenarios_max"] = 4000
cfg["model"]["param_sets"] = 50
cfg["model"]["garch"]["vol_models"] = ["GARCH", "GJR"]
cfg["model"]["garch"]["dists"] = ["t", "skewt"]
cfg["validation"]["backtest_months"] = 4
cfg["validation"]["backtest_scenarios"] = 300
cfg["validation"]["bootstrap_reps"] = 100
cfg["validation"]["one_step_samples"] = 500
cfg["validation"]["power_reps"] = 300
cfg["data"]["rate_limit"]["min_interval_seconds"] = 0
# every TestClient comes from the same host; the limiter itself is unit-tested in test_features
cfg["security"]["login_rate_limit_per_minute"] = 10_000
cfg["security"]["rate_limit_per_minute"] = 100_000


@pytest.fixture(scope="session", autouse=True)
def _db():
    from app.db import init_db
    from data.service import set_provider
    from tests.fixture_provider import FixtureProvider

    init_db()
    set_provider(FixtureProvider())
    # the first registered user becomes admin: create the shared admin up front so test order never matters
    from app.db import SessionLocal
    from app.models import User
    from app.security import hash_password

    with SessionLocal() as s:
        s.add(User(email="admin@example.com", password_hash=hash_password("secret-pass-1"), role="admin"))
        s.commit()
    yield


@pytest.fixture()
def db():
    from app.db import SessionLocal

    s = SessionLocal()
    try:
        yield s
    finally:
        s.rollback()
        s.close()
