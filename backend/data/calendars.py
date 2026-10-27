"""Trading calendars (exchange_calendars) with a business-day fallback."""
from __future__ import annotations

from datetime import date
from functools import lru_cache

import pandas as pd

from app.config import get_settings


@lru_cache(maxsize=16)
def _calendar(exchange: str):
    import exchange_calendars as xcals

    name = get_settings()["data"]["exchange_calendars"].get(exchange, "XNYS")
    return xcals.get_calendar(name)


def future_sessions(exchange: str, after: date, n: int) -> list[date]:
    """The next n trading sessions strictly after `after`."""
    try:
        cal = _calendar(exchange)
        start = pd.Timestamp(after) + pd.Timedelta(days=1)
        last = cal.last_session
        if start > last:
            raise ValueError("calendar exhausted")
        sessions = cal.sessions_in_range(start, min(start + pd.Timedelta(days=int(n * 1.6) + 15), last))
        out = [s.date() for s in sessions[:n]]
        if len(out) == n:
            return out
    except Exception:
        pass
    return [d.date() for d in pd.bdate_range(pd.Timestamp(after) + pd.Timedelta(days=1), periods=n)]


def previous_session(exchange: str, d: date) -> date:
    """d itself if it is a session, otherwise the previous one."""
    try:
        cal = _calendar(exchange)
        ts = pd.Timestamp(d)
        if cal.is_session(ts):
            return d
        return cal.date_to_session(ts, direction="previous").date()
    except Exception:
        ts = pd.Timestamp(d)
        while ts.weekday() >= 5:
            ts -= pd.Timedelta(days=1)
        return ts.date()


def month_end_checkpoints(sessions: list[date]) -> list[int]:
    """Indices (0-based) of the last session of each month within the horizon, plus the horizon end."""
    idx: list[int] = []
    for i, d in enumerate(sessions):
        if i == len(sessions) - 1 or sessions[i + 1].month != d.month:
            idx.append(i)
    if idx[-1] != len(sessions) - 1:
        idx.append(len(sessions) - 1)
    return idx
