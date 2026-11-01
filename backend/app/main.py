"""FastAPI application. Run: uvicorn app.main:app (cwd = backend)."""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from app import api_admin, api_client
from app.config import PROJECT_ROOT, get_settings
from app.db import init_db
from app.i18n import L, resolve_text, set_lang, start_bilingual
from app.security import rate_limiter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title=get_settings()["app"]["brand"], docs_url=None, redoc_url=None, openapi_url=None)


@app.on_event("startup")
def _startup() -> None:
    init_db()


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # interface language: the x-lang header from the app, ?lang= on plain links (PDF download)
    set_lang(request.headers.get("x-lang") or request.query_params.get("lang"))
    start_bilingual()  # texts are resolved to that language once, in the reply below
    if request.url.path.startswith("/api/"):
        ip = request.client.host if request.client else "-"
        if not rate_limiter.allow(f"api:{ip}", get_settings()["security"]["rate_limit_per_minute"]):
            return JSONResponse({"detail": L("Çox sorğu. Bir az sonra yenidən yoxlayın.",
                                             "Too many requests. Try again shortly.")}, status_code=429)
    response = await call_next(request)
    if request.url.path.startswith("/api/") and response.headers.get("content-type", "").startswith("application/json"):
        response = await _in_language(response)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"  # admin report is embedded in the admin panel
    response.headers["Referrer-Policy"] = "same-origin"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


async def _in_language(response):
    """Stored texts made by the worker carry both languages (app.i18n); the reply gets the requested one."""
    body = b"".join([chunk async for chunk in response.body_iterator])
    if "\ue000".encode() in body:
        body = resolve_text(body.decode("utf-8")).encode("utf-8")
    out = Response(body, status_code=response.status_code)
    out.raw_headers = [(k, v) for k, v in response.raw_headers if k.lower() != b"content-length"] + [
        (b"content-length", str(len(body)).encode())]
    return out


def _field_messages() -> dict[str, str]:
    return {
        "email": L("E-poçt ünvanı düzgün deyil.", "The e-mail address is not valid."),
        "password": L("Parol 8–128 simvol olmalıdır.", "The password must be 8–128 characters."),
        "new_password": L("Yeni parol 8–128 simvol olmalıdır.", "The new password must be 8–128 characters."),
        "quantity": L("Say müsbət rəqəm olmalıdır.", "The quantity must be a positive number."),
        "price": L("Qiymət müsbət rəqəm olmalıdır.", "The price must be a positive number."),
        "fees": L("Komissiya mənfi ola bilməz.", "Fees cannot be negative."),
        "trade_date": L("Tarix düzgün deyil.", "The date is not valid."),
        "name": L("Ad 1–120 simvol olmalıdır.", "The name must be 1–120 characters."),
        "risk_limit": L("Risk limiti 0% ilə 100% arasında olmalıdır.", "The risk limit must be between 0% and 100%."),
        "cash": L("Nağd pul mənfi ola bilməz.", "Cash cannot be negative."),
        "provider_symbol": L("Simvol düzgün deyil.", "The symbol is not valid."),
        "trades": L("Ssenaridə ən azı bir əməliyyat olmalıdır.", "The scenario needs at least one trade."),
    }


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    """Client-facing validation messages in the interface language instead of raw pydantic text."""
    msgs = []
    fields = _field_messages()
    for err in exc.errors():
        field = str(err.get("loc", ["", ""])[-1])
        msgs.append(fields.get(field, L(f"Daxil edilən məlumat düzgün deyil ({field}).",
                                        f"The entered data is not valid ({field}).")))
    return JSONResponse({"detail": " ".join(dict.fromkeys(msgs))}, status_code=422)


app.include_router(api_client.router)
app.include_router(api_admin.router)

DIST = PROJECT_ROOT / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = (DIST / path).resolve()
        if path and f.is_file() and DIST.resolve() in f.parents:
            return FileResponse(f)
        # index.html names the current hashed bundle: never cache it, or browsers keep showing the old UI after
        # an update (assets/ files are content-hashed and safe to cache)
        return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-cache"})
