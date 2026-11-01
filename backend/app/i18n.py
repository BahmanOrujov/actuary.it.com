"""Two interface languages (az default, en). L(az, en) gives the text in the language of the current request.

Texts made by the worker (briefings, recommendations, warnings, notifications) are stored for later viewing in
either language: inside bilingual() L() returns both versions wrapped in private-use markers, and resolve() picks
one when the text is served (the JSON middleware, the PDF). API requests run bilingual too, so any text reaching a
JSON reply (errors, stored alerts) is resolved in one place. Runs computed before this existed stay Azerbaijani."""
from __future__ import annotations

import contextvars
import re
from contextlib import contextmanager
from typing import Any, Iterator

LANGS = ("az", "en")
_lang: contextvars.ContextVar[str] = contextvars.ContextVar("lang", default="az")
_both: contextvars.ContextVar[bool] = contextvars.ContextVar("both", default=False)

_A, _B, _E = "\ue000", "\ue001", "\ue002"  # private-use code points, never in real text
_INNER = re.compile(f"{_A}([^{_A}{_B}{_E}]*){_B}([^{_A}{_B}{_E}]*){_E}")


def L(az: str, en: str) -> str:
    if _both.get():
        return B(az, en)
    return en if _lang.get() == "en" else az


def B(az: str, en: str) -> str:
    """Both versions, always: for module-level texts, which exist before any request; resolved when served."""
    return f"{_A}{az}{_B}{en}{_E}"


def current() -> str:
    return _lang.get()


def set_lang(lang: str | None) -> contextvars.Token:
    return _lang.set(lang if lang in LANGS else "az")


@contextmanager
def bilingual(on: bool = True) -> Iterator[None]:
    """bilingual(False) inside a request: plain texts in the request's language (e.g. drawing a PDF)."""
    token = _both.set(on)
    try:
        yield
    finally:
        _both.reset(token)


def start_bilingual() -> contextvars.Token:
    return _both.set(True)


def resolve_text(s: str, lang: str | None = None) -> str:
    if _A not in s:
        return s
    pick = 2 if (lang or _lang.get()) == "en" else 1
    prev = None
    while prev != s:  # innermost first, so texts built from other texts resolve too
        prev, s = s, _INNER.sub(lambda m: m.group(pick), s)
    return s


def resolve(obj: Any, lang: str | None = None) -> Any:
    if isinstance(obj, str):
        return resolve_text(obj, lang)
    if isinstance(obj, list):
        return [resolve(x, lang) for x in obj]
    if isinstance(obj, tuple):
        return tuple(resolve(x, lang) for x in obj)
    if isinstance(obj, dict):
        return {k: resolve(v, lang) for k, v in obj.items()}
    return obj


def cfg_text(section: dict[str, Any], key: str) -> str:
    """A text from config.yaml with its English version under key + "_en" (the Azerbaijani one if missing)."""
    return L(section[key], section.get(f"{key}_en", section[key]))
