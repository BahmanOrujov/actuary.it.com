"""FastAPI application. Run: uvicorn app.main:app (cwd = backend)."""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import api_admin, api_client
from app.config import PROJECT_ROOT, get_settings
from app.db import init_db
from app.security import rate_limiter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title=get_settings()["app"]["brand"], docs_url=None, redoc_url=None, openapi_url=None)


@app.on_event("startup")
def _startup() -> None:
    init_db()


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        ip = request.client.host if request.client else "-"
        if not rate_limiter.allow(f"api:{ip}", get_settings()["security"]["rate_limit_per_minute"]):
            return JSONResponse({"detail": "Çox sorğu. Bir az sonra yenidən yoxlayın."}, status_code=429)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"  # admin report is embedded in the admin panel
    response.headers["Referrer-Policy"] = "same-origin"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


FIELD_MESSAGES = {
    "email": "E-poçt ünvanı düzgün deyil.",
    "password": "Parol 8–128 simvol olmalıdır.",
    "new_password": "Yeni parol 8–128 simvol olmalıdır.",
    "quantity": "Say müsbət rəqəm olmalıdır.",
    "price": "Qiymət müsbət rəqəm olmalıdır.",
    "fees": "Komissiya mənfi ola bilməz.",
    "trade_date": "Tarix düzgün deyil.",
    "name": "Ad 1–120 simvol olmalıdır.",
    "risk_limit": "Risk limiti 0% ilə 100% arasında olmalıdır.",
    "cash": "Nağd pul mənfi ola bilməz.",
    "provider_symbol": "Simvol düzgün deyil.",
}


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    """Client-facing validation messages in Azerbaijani instead of raw pydantic text."""
    msgs = []
    for err in exc.errors():
        field = str(err.get("loc", ["", ""])[-1])
        msgs.append(FIELD_MESSAGES.get(field, f"Daxil edilən məlumat düzgün deyil ({field})."))
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
