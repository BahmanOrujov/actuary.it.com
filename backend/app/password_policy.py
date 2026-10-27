"""Password policy: length, common/leaked passwords, personal data, trivial patterns. No network calls."""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from app.config import get_settings

_LEET = str.maketrans({"@": "a", "4": "a", "0": "o", "1": "i", "!": "i", "3": "e", "$": "s", "5": "s", "7": "t",
                       "9": "g", "+": "t"})
_SEQUENCES = ("abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiop", "asdfghjkl", "zxcvbnm",
              "qwertyuıopğü", "1qaz2wsx3edc", "1q2w3e4r5t6y")


@lru_cache(maxsize=1)
def _common() -> frozenset[str]:
    path = Path(__file__).with_name("common_passwords.txt")
    words = {w.strip().lower() for w in path.read_text(encoding="utf-8").splitlines()}
    return frozenset(w for w in words if w and not w.startswith("#"))


def _core(pw: str) -> str:
    """Lower-case, leetspeak undone, and leading/trailing digits and symbols removed ("P@ssw0rd2024!" -> "password")."""
    edges = r"^[\W\d_]+|[\W\d_]+$"
    s = re.sub(edges, "", pw.lower())  # first drop "2024!" style decorations, then undo leetspeak inside
    return re.sub(edges, "", s.translate(_LEET))


def _is_sequence(s: str) -> bool:
    s = s.lower()
    if len(s) < 4:
        return False
    for seq in _SEQUENCES:
        for src in (seq, seq[::-1]):
            if s in src or s in (src * 3):
                return True
    return False


def check_password(pw: str, email: str | None = None) -> list[str]:
    """Problems with a proposed password, in Azerbaijani (empty list = acceptable)."""
    cfg = get_settings()["security"]
    errors: list[str] = []
    min_len = int(cfg["password_min_length"])
    if len(pw) < min_len:
        errors.append(f"Parol ən azı {min_len} simvol olmalıdır.")
    if len(pw) > 128:
        errors.append("Parol 128 simvoldan uzun ola bilməz.")
    low = pw.lower()
    core = _core(pw)
    common = _common()
    if low in common or core in common or (len(core) >= 4 and core.rstrip("0123456789") in common):
        errors.append("Bu parol çox yayılmışdır və ya sızmış parollar siyahısındadır.")
    if len(set(low)) < int(cfg["password_min_unique_chars"]):
        errors.append("Parolda çox az fərqli simvol var.")
    if _is_sequence(low) or _is_sequence(core):
        errors.append("Parol ardıcıl simvollardan ibarətdir (məs. 12345678, qwerty).")
    if email:
        local = email.split("@")[0].lower()
        if len(local) >= 4 and (local in low or local in core):
            errors.append("Parolda e-poçt adınız olmamalıdır.")
    if "portfel" in core or "analiz" in core:
        errors.append("Parolda tətbiqin adı olmamalıdır.")
    return list(dict.fromkeys(errors))
