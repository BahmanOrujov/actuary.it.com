"""Transaction input rules (PROMPT.md 3.2): resolve missing date/price."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from app.config import get_settings


class InputError(ValueError):
    pass


@dataclass
class ResolvedInput:
    trade_date: date
    price: float
    flags: dict[str, Any]
    warnings: list[str] = field(default_factory=list)


def validate_quantity(qty: float) -> float:
    dec = get_settings()["portfolio"]["fractional_decimals"]
    if qty is None or qty <= 0:
        raise InputError("Say müsbət olmalıdır.")
    if round(qty, dec) != qty:
        raise InputError(f"Say ən çox {dec} onluq rəqəmlə yazıla bilər.")
    return qty


def resolve_input(
    *,
    quantity: float,
    trade_date: date | None,
    price: float | None,
    today: date,
    close_on,      # callable(date) -> (date_used, close, low, high)
    latest_close,  # callable() -> (date, close)
    first_history_date: date | None,
) -> ResolvedInput:
    validate_quantity(quantity)
    warnings: list[str] = []
    tol = get_settings()["portfolio"]["price_tolerance_pct"] / 100.0
    if trade_date is not None and trade_date > today:
        raise InputError("Gələcək tarix qəbul edilmir.")
    if price is not None and price <= 0:
        raise InputError("Qiymət müsbət olmalıdır.")

    if trade_date is not None and first_history_date is not None and trade_date < first_history_date:
        warnings.append("Tarix alətin qiymət tarixçəsindən əvvəldir.")

    if trade_date is not None and price is not None:
        flags = {"date_source": "user", "price_source": "user"}
        try:
            used, _, low, high = close_on(trade_date)
            if low is not None and high is not None and not (low * (1 - tol) <= price <= high * (1 + tol)):
                warnings.append(
                    f"Daxil edilən qiymət {used:%d.%m.%Y} günün aralığından kənardır "
                    f"({low:,.2f} – {high:,.2f}). Yoxlayın."
                )
        except (ValueError, KeyError):
            pass
        return ResolvedInput(trade_date, price, flags, warnings)

    if trade_date is not None:
        used, close, _, _ = close_on(trade_date)
        flags = {"date_source": "user", "price_source": "close", "price_date_used": used.isoformat()}
        if used != trade_date:
            warnings.append(f"{trade_date:%d.%m.%Y} ticarət günü deyil; {used:%d.%m.%Y} bağlanışı götürüldü.")
        return ResolvedInput(trade_date, close, flags, warnings)

    if price is not None:
        flags = {"date_source": "today", "price_source": "user", "note": "Tarix daxil edilməyib"}
        return ResolvedInput(today, price, flags, warnings)

    used, close = latest_close()
    flags = {
        "date_source": "today", "price_source": "latest", "price_date_used": used.isoformat(),
        "note": "Cari tarix və qiymət istifadə olundu",
    }
    return ResolvedInput(today, close, flags, warnings)
