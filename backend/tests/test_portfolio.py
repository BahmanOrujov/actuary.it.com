"""Input rules, FIFO / average cost, split adjustment, property-based invariants (PROMPT.md 3, 11)."""
from __future__ import annotations

from datetime import date, timedelta

import pandas as pd
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from portfolio.inputs import InputError, resolve_input
from portfolio.lots import LotError, Tx, apply_transactions, split_factor_after

TODAY = date(2026, 10, 27)


def _close_on(d):
    used = d - timedelta(days=1) if d.weekday() == 5 else d
    return used, 100.0, 98.0, 102.0


def _latest():
    return date(2026, 10, 23), 105.0


def test_quantity_date_price():
    r = resolve_input(quantity=10, trade_date=date(2025, 1, 6), price=101, today=TODAY,
                      close_on=_close_on, latest_close=_latest, first_history_date=date(2000, 1, 1))
    assert r.price == 101 and r.flags["price_source"] == "user" and not r.warnings


def test_price_outside_range_warns_not_blocks():
    r = resolve_input(quantity=10, trade_date=date(2025, 1, 6), price=150, today=TODAY,
                      close_on=_close_on, latest_close=_latest, first_history_date=None)
    assert r.price == 150 and r.warnings


def test_quantity_date_uses_close_and_previous_session():
    r = resolve_input(quantity=1, trade_date=date(2025, 6, 7), price=None, today=TODAY,
                      close_on=_close_on, latest_close=_latest, first_history_date=None)
    assert r.price == 100.0 and r.flags["price_date_used"] == "2025-06-06" and r.warnings


def test_quantity_price_uses_today():
    r = resolve_input(quantity=1, trade_date=None, price=99, today=TODAY,
                      close_on=_close_on, latest_close=_latest, first_history_date=None)
    assert r.trade_date == TODAY and r.flags["date_source"] == "today"


def test_quantity_only_uses_latest():
    r = resolve_input(quantity=1, trade_date=None, price=None, today=TODAY,
                      close_on=_close_on, latest_close=_latest, first_history_date=None)
    assert r.price == 105.0 and r.flags["price_source"] == "latest"


@pytest.mark.parametrize("qty", [0, -1, 1.23456])
def test_invalid_quantity(qty):
    with pytest.raises(InputError):
        resolve_input(quantity=qty, trade_date=None, price=None, today=TODAY,
                      close_on=_close_on, latest_close=_latest, first_history_date=None)


def test_future_date_rejected():
    with pytest.raises(InputError):
        resolve_input(quantity=1, trade_date=TODAY + timedelta(days=1), price=None, today=TODAY,
                      close_on=_close_on, latest_close=_latest, first_history_date=None)


def test_date_before_history_warns():
    r = resolve_input(quantity=1, trade_date=date(1990, 1, 2), price=10, today=TODAY,
                      close_on=_close_on, latest_close=_latest, first_history_date=date(2000, 1, 1))
    assert any("tarixçəsindən əvvəl" in w for w in r.warnings)


def test_fifo_realized_with_fees():
    txs = [
        Tx("A", "BUY", 10, date(2024, 1, 2), 100, fees=10),   # unit cost 101
        Tx("A", "BUY", 10, date(2024, 2, 1), 120),
        Tx("A", "SELL", 15, date(2024, 3, 1), 130, fees=15),  # proceeds 129/unit
    ]
    st_ = apply_transactions(txs)["A"]
    assert st_.quantity == pytest.approx(5)
    assert st_.realized == pytest.approx(10 * (129 - 101) + 5 * (129 - 120))
    assert st_.cost == pytest.approx(5 * 120)


def test_average_cost_method():
    txs = [Tx("A", "BUY", 10, date(2024, 1, 2), 100), Tx("A", "BUY", 10, date(2024, 2, 1), 120),
           Tx("A", "SELL", 10, date(2024, 3, 1), 130)]
    st_ = apply_transactions(txs, method="average")["A"]
    assert st_.realized == pytest.approx(10 * (130 - 110))


def test_oversell_rejected():
    with pytest.raises(LotError):
        apply_transactions([Tx("A", "BUY", 5, date(2024, 1, 2), 10), Tx("A", "SELL", 6, date(2024, 1, 3), 10)])


def test_sell_before_buy_rejected():
    with pytest.raises(LotError):
        apply_transactions([Tx("A", "SELL", 1, date(2024, 1, 1), 10), Tx("A", "BUY", 5, date(2024, 1, 2), 10)])


def test_split_adjustment():
    splits = pd.Series([4.0], index=[pd.Timestamp("2024-06-10")])
    assert split_factor_after(splits, date(2024, 1, 1)) == 4.0
    assert split_factor_after(splits, date(2024, 7, 1)) == 1.0
    st_ = apply_transactions([Tx("A", "BUY", 10, date(2024, 1, 2), 400)], {"A": splits})["A"]
    assert st_.quantity == 40 and st_.cost == pytest.approx(4000)
    # price taken from split-adjusted close is not divided again
    st2 = apply_transactions([Tx("A", "BUY", 10, date(2024, 1, 2), 100, price_is_adjusted=True)], {"A": splits})["A"]
    assert st2.cost == pytest.approx(4000)


def test_fx_cost_base():
    st_ = apply_transactions([Tx("A", "BUY", 10, date(2024, 1, 2), 100, fx=1.1)])["A"]
    assert st_.cost_base == pytest.approx(1100)


trade = st.tuples(st.sampled_from(["BUY", "SELL"]), st.integers(1, 50), st.integers(0, 200), st.integers(1, 500))


@settings(max_examples=200, deadline=None)
@given(st.lists(trade, min_size=1, max_size=30))
def test_fifo_invariants(ops):
    """Quantity never negative; cost is conserved: bought cost = remaining cost + cost of sold lots."""
    txs = []
    held = 0
    bought_cost = 0.0
    for i, (side, q, day, px) in enumerate(ops):
        d = date(2024, 1, 1) + timedelta(days=day)
        txs.append(Tx("A", side, q, d, px, tx_id=i))
    ordered = sorted(txs, key=lambda t: (t.trade_date, 0 if t.side == "BUY" else 1, t.tx_id))
    feasible = True
    for t in ordered:
        held += t.quantity if t.side == "BUY" else -t.quantity
        if held < 0:
            feasible = False
        if t.side == "BUY":
            bought_cost += t.quantity * t.price
    if not feasible:
        with pytest.raises(LotError):
            apply_transactions(txs)
        return
    s = apply_transactions(txs)["A"]
    assert s.quantity == pytest.approx(held)
    sold_value = sum(t.quantity * t.price for t in txs if t.side == "SELL")
    # realized = proceeds - cost of sold lots  =>  cost of sold = proceeds - realized
    assert bought_cost == pytest.approx(s.cost + (sold_value - s.realized), rel=1e-9, abs=1e-6)
