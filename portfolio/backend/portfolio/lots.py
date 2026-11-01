"""Lot accounting: FIFO / average cost, realized P&L, split adjustment (PROMPT.md 3.2-3.3)."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import date
from typing import Iterable

import pandas as pd

from app.i18n import L


class LotError(ValueError):
    pass


@dataclass
class Tx:
    key: str              # instrument key (provider symbol)
    side: str             # BUY | SELL
    quantity: float
    trade_date: date
    price: float          # per share, instrument currency, as entered or resolved
    fees: float = 0.0
    price_is_adjusted: bool = False  # True when the price came from the split-adjusted close series
    fx: float = 1.0       # base-currency units per instrument-currency unit on trade_date
    tx_id: int | None = None


@dataclass
class Lot:
    quantity: float
    unit_cost: float      # incl. buy fees, instrument currency, split-adjusted
    unit_cost_base: float
    trade_date: date


@dataclass
class PositionState:
    key: str
    lots: deque[Lot] = field(default_factory=deque)
    realized: float = 0.0
    realized_base: float = 0.0
    fees_paid: float = 0.0
    sold_quantity: float = 0.0

    @property
    def quantity(self) -> float:
        return sum(l.quantity for l in self.lots)

    @property
    def cost(self) -> float:
        return sum(l.quantity * l.unit_cost for l in self.lots)

    @property
    def cost_base(self) -> float:
        return sum(l.quantity * l.unit_cost_base for l in self.lots)

    @property
    def first_open_date(self) -> date | None:
        return self.lots[0].trade_date if self.lots else None


def split_factor_after(splits: pd.Series | None, d: date) -> float:
    """Cumulative split ratio for splits strictly after date d (e.g. a 4:1 split -> 4.0)."""
    if splits is None or splits.empty:
        return 1.0
    s = splits[(splits.index > pd.Timestamp(d)) & (splits > 0)]
    return float(s.prod()) if len(s) else 1.0


EPS = 1e-9


def apply_transactions(
    txs: Iterable[Tx], splits: dict[str, pd.Series] | None = None, method: str = "fifo"
) -> dict[str, PositionState]:
    """Replay transactions in date order and return positions. Raises LotError if a sale exceeds holdings."""
    splits = splits or {}
    order = sorted(txs, key=lambda t: (t.trade_date, 0 if t.side == "BUY" else 1, t.tx_id or 0))
    states: dict[str, PositionState] = {}
    for t in order:
        if t.quantity <= 0:
            raise LotError(L("Say müsbət olmalıdır.", "The quantity must be positive."))
        st = states.setdefault(t.key, PositionState(t.key))
        k = split_factor_after(splits.get(t.key), t.trade_date)
        qty = t.quantity * k
        px = t.price if t.price_is_adjusted else t.price / k
        st.fees_paid += t.fees
        if t.side == "BUY":
            unit = px + t.fees / qty
            st.lots.append(Lot(qty, unit, unit * t.fx, t.trade_date))
            if method == "average" and len(st.lots) > 1:
                q = st.quantity
                c, cb = st.cost, st.cost_base
                st.lots = deque([Lot(q, c / q, cb / q, st.lots[0].trade_date)])
        elif t.side == "SELL":
            if qty > st.quantity + EPS:
                raise LotError(
                    L(f"{t.key}: {t.trade_date:%d.%m.%Y} tarixində satılan say ({t.quantity:g}) mövcud saydan çoxdur.",
                      f"{t.key}: the quantity sold on {t.trade_date:%d.%m.%Y} ({t.quantity:g}) exceeds the holding.")
                )
            remaining = qty
            proceeds_unit = px - t.fees / qty
            while remaining > EPS:
                lot = st.lots[0]
                take = min(lot.quantity, remaining)
                st.realized += take * (proceeds_unit - lot.unit_cost)
                st.realized_base += take * (proceeds_unit * t.fx - lot.unit_cost_base)
                lot.quantity -= take
                remaining -= take
                if lot.quantity <= EPS:
                    st.lots.popleft()
            st.sold_quantity += qty
        else:
            raise LotError(L(f"Naməlum əməliyyat növü: {t.side}", f"Unknown transaction type: {t.side}"))
    return states


def available_quantity(txs: Iterable[Tx], key: str, on: date, splits: pd.Series | None = None) -> float:
    """Quantity held (split-adjusted to today) at the end of a given date."""
    sub = [t for t in txs if t.key == key and t.trade_date <= on]
    st = apply_transactions(sub, {key: splits} if splits is not None else None).get(key)
    return st.quantity if st else 0.0
