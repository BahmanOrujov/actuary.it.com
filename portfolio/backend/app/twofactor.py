"""Two-factor sign-in with an authenticator app (TOTP, RFC 6238) and one-time recovery codes."""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

from app.config import get_settings
from app.models import User
from app.security import token_digest

STEP = 30      # seconds per code (RFC 6238 default, what every authenticator app uses)
DIGITS = 6
ISSUER = "Portfel Analizi"


def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _code(secret: str, step: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    off = digest[-1] & 0x0F
    n = (struct.unpack(">I", digest[off:off + 4])[0] & 0x7FFFFFFF) % 10 ** DIGITS
    return str(n).zfill(DIGITS)


def code_now(secret: str, at: float | None = None) -> str:
    return _code(secret, int((time.time() if at is None else at) // STEP))


def match_step(secret: str, code: str, after: int | None = None) -> int | None:
    """The time step whose code equals `code`, allowing one step of clock drift either way; a step at or before
    `after` (already used) does not count, so a code cannot be replayed."""
    code = code.strip().replace(" ", "")
    if len(code) != DIGITS or not code.isdigit():
        return None
    now = int(time.time() // STEP)
    for step in (now, now - 1, now + 1):
        if (after is None or step > after) and hmac.compare_digest(_code(secret, step), code):
            return step
    return None


def otpauth_uri(email: str, secret: str) -> str:
    return (f"otpauth://totp/{quote(ISSUER)}:{quote(email)}?secret={secret}&issuer={quote(ISSUER)}"
            f"&digits={DIGITS}&period={STEP}")


def qr_svg(uri: str) -> str:
    import io

    import segno

    buf = io.BytesIO()
    segno.make(uri, error="m").save(buf, kind="svg", scale=5, border=2, xmldecl=False, svgns=True)
    return buf.getvalue().decode()


def new_recovery_codes() -> tuple[list[str], list[str]]:
    """(codes shown once to the user, their digests to store)."""
    n = get_settings()["security"]["two_factor_recovery_codes"]
    codes = [f"{secrets.token_hex(4)}-{secrets.token_hex(4)}" for _ in range(n)]
    return codes, [token_digest(c) for c in codes]


def check(user: User, code: str) -> str | None:
    """Verifies a sign-in code: "totp" or "recovery" on success (a recovery code is used up), None otherwise."""
    if not user.totp_enabled or not user.totp_secret:
        return None
    step = match_step(user.totp_secret, code, user.totp_last_step)
    if step is not None:
        user.totp_last_step = step
        return "totp"
    digest = token_digest(code.strip().lower())
    left = list(user.recovery_codes or [])
    for d in left:
        if hmac.compare_digest(d, digest):
            left.remove(d)
            user.recovery_codes = left
            return "recovery"
    return None


def clear(user: User) -> None:
    user.totp_enabled = False
    user.totp_secret = None
    user.totp_last_step = None
    user.recovery_codes = None
