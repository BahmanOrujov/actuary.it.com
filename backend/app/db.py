"""Database engine, sessions and SQLite hardening (WAL + retry on lock)."""
from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from typing import Callable, Iterator, TypeVar

from sqlalchemy import create_engine, event
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

T = TypeVar("T")


class Base(DeclarativeBase):
    pass


def _make_engine(url: str):
    is_sqlite = url.startswith("sqlite")
    engine = create_engine(
        url,
        connect_args={"check_same_thread": False, "timeout": 30} if is_sqlite else {},
        future=True,
    )
    if is_sqlite:
        @event.listens_for(engine, "connect")
        def _pragmas(dbapi_conn, _):  # noqa: ANN001
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA synchronous=NORMAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA busy_timeout=30000")
            cur.close()
    return engine


engine = _make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, future=True)


def retry_locked(fn: Callable[[], T], retries: int | None = None) -> T:
    """Retry an operation when SQLite reports 'database is locked' (OneDrive sync, worker contention)."""
    retries = retries or get_settings()["jobs"]["sqlite_retries"]
    for attempt in range(retries):
        try:
            return fn()
        except OperationalError as exc:
            if "locked" not in str(exc).lower() or attempt == retries - 1:
                raise
            time.sleep(0.1 * 2 ** attempt)
    raise RuntimeError("unreachable")


@contextmanager
def session_scope() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        retry_locked(session.commit)
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def init_db() -> None:
    """Bring the schema to the latest Alembic revision.

    A database created before migrations existed (no alembic_version table) has the 0001 schema: it is stamped
    at 0001 and upgraded from there; every later schema change is an Alembic revision."""
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect

    from app import models  # noqa: F401  (register tables)
    from app.config import BACKEND_ROOT

    logging.getLogger("alembic").setLevel(logging.WARNING)
    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
    cfg.attributes["configure_logger"] = False
    tables = set(inspect(engine).get_table_names())
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        if tables and "alembic_version" not in tables:
            # created by create_all before migrations existed (= schema of revision 0001)
            command.stamp(cfg, "0001")
        command.upgrade(cfg, "head")
