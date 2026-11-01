"""Admin-only API (PROMPT.md 9). Every route depends on require_admin."""
from __future__ import annotations

from typing import Any, Literal

import secrets
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.admin_settings import EDITABLE_KEYS, effective, set_override
from app.api_client import issue_reset_link
from app.config import get_settings
from app.i18n import L
from app.mailer import mail_enabled, send_mail
from app.db import get_db, retry_locked
from app.models import Alert, AnalysisRun, AuditLog, Job, Portfolio, RunDiagnostics, User, UserSession
from app.security import hash_password, is_locked, record_successful_login, require_admin, validate_new_password
from app.services import audit
from data.service import MarketData

router = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])


def commit(db: Session) -> None:
    retry_locked(db.commit)


@router.get("/runs")
def runs(limit: int = 200, db: Session = Depends(get_db)):
    rows = db.scalars(select(AnalysisRun).order_by(AnalysisRun.id.desc()).limit(min(limit, 1000))).all()
    out = []
    for r in rows:
        p = db.get(Portfolio, r.portfolio_id)
        owner = db.get(User, p.owner_id) if p else None
        out.append({
            "id": r.id, "portfolio_id": r.portfolio_id, "portfolio": p.name if p else None,
            "owner": owner.email if owner else None, "created_at": r.created_at.isoformat(),
            "status": r.status, "step": r.step, "validation_status": r.validation_status,
            "gate_verdict": r.gate_verdict, "reliability": r.reliability, "error": r.error,
            "data_as_of": r.data_as_of.isoformat() if r.data_as_of else None,
            "stale": p is not None and r.portfolio_version != p.version,
        })
    return out


@router.get("/runs/{run_id}")
def run_detail(run_id: int, db: Session = Depends(get_db)):
    r = db.get(AnalysisRun, run_id)
    if r is None:
        raise HTTPException(404, L("Tapılmadı.", "Not found."))
    d = db.get(RunDiagnostics, run_id)
    return {"run": {"id": r.id, "portfolio_id": r.portfolio_id, "status": r.status, "gate_verdict": r.gate_verdict,
                    "reliability": r.reliability, "validation_status": r.validation_status, "snapshot": r.snapshot,
                    "seed": r.seed, "model_version": r.model_version},
            "diagnostics": d.payload if d else None, "validation": d.validation if d else None}


@router.get("/runs/{run_id}/report.{fmt}")
def run_report(run_id: int, fmt: Literal["html", "json"], db: Session = Depends(get_db)):
    r = db.get(AnalysisRun, run_id)
    if r is None:
        raise HTTPException(404, L("Tapılmadı.", "Not found."))
    path = get_settings().reports_dir / str(r.portfolio_id) / str(run_id) / f"report.{fmt}"
    if not path.exists():
        raise HTTPException(404, L("Hesabat hələ hazır deyil.", "The report is not ready yet."))
    media = "text/html; charset=utf-8" if fmt == "html" else "application/json"
    return FileResponse(path, media_type=media, filename=f"run_{run_id}_report.{fmt}" if fmt == "json" else None)


@router.post("/runs/{run_id}/revalidate")
def revalidate(run_id: int, db: Session = Depends(get_db)):
    r = db.get(AnalysisRun, run_id)
    if r is None or r.status != "done":
        raise HTTPException(422, L("Run hazır deyil.", "The run is not finished."))
    r.validation_status = "pending"
    r.reliability = "checking"
    r.snapshot = {**r.snapshot, "validation_key": None}
    db.add(Job(kind="validate", run_id=run_id))
    commit(db)
    return {"ok": True}


@router.get("/alerts")
def alerts(include_resolved: bool = False, db: Session = Depends(get_db)):
    stmt = select(Alert).order_by(Alert.id.desc()).limit(300)
    if not include_resolved:
        stmt = stmt.where(Alert.resolved.is_(False))
    return [{"id": a.id, "level": a.level, "kind": a.kind, "message": a.message, "run_id": a.run_id,
             "portfolio_id": a.portfolio_id, "created_at": a.created_at.isoformat(), "resolved": a.resolved}
            for a in db.scalars(stmt).all()]


@router.post("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: int, db: Session = Depends(get_db)):
    a = db.get(Alert, alert_id)
    if a is None:
        raise HTTPException(404, L("Tapılmadı.", "Not found."))
    a.resolved = True
    commit(db)
    return {"ok": True}


@router.get("/settings")
def get_admin_settings(db: Session = Depends(get_db)):
    cfg = get_settings()
    return {"effective": effective(db), "editable": sorted(EDITABLE_KEYS), "mode": cfg.mode,
            "gates_alpha": cfg["validation"]["alpha"]}


class SettingIn(BaseModel):
    key: str
    value: Any


@router.put("/settings")
def put_setting(body: SettingIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if body.key not in EDITABLE_KEYS:
        raise HTTPException(422, L("Bu parametr dəyişdirilə bilməz.", "This setting cannot be changed."))
    v = body.value
    if body.key.startswith("feature."):
        if not isinstance(v, bool):
            raise HTTPException(422, L("Bool dəyər gözlənilir.", "A true/false value is expected."))
        if body.key == "feature.signal_model" and v:
            raise HTTPException(422, L("Siqnal modeli validasiya gate-lərindən keçməyənə qədər aktivləşdirilə bilməz.", "The signal model cannot be enabled until it passes the validation gates."))
    elif v is not None:
        try:
            v = float(v)
        except (TypeError, ValueError) as exc:
            raise HTTPException(422, L("Rəqəm gözlənilir.", "A number is expected.")) from exc
        if not (0 <= v < 1):
            raise HTTPException(422, L("Dəyər 0 ilə 1 arasında olmalıdır (məs. 0.04 = 4%).", "The value must be between 0 and 1 (e.g. 0.04 = 4%)."))
    set_override(db, body.key, v)
    audit(db, admin.id, "admin_setting", {"key": body.key, "value": v})
    commit(db)
    return {"ok": True, "effective": effective(db)}


@router.get("/users")
def users(db: Session = Depends(get_db)):
    return [{"id": u.id, "email": u.email, "role": u.role, "is_blocked": u.is_blocked,
             "locked_until": u.locked_until.isoformat() if is_locked(u) else None,
             "failed_logins": u.failed_logins or 0,
             "created_at": u.created_at.isoformat(), "portfolios": len(u.portfolios)}
            for u in db.scalars(select(User).order_by(User.id)).all()]


class Invite(BaseModel):
    email: EmailStr
    role: Literal["client", "admin"] = "client"


@router.post("/users/invite")
def invite_user(body: Invite, request: Request, background: BackgroundTasks, db: Session = Depends(get_db),
                admin: User = Depends(require_admin)):
    """Creates the account (registration is closed on a server) with a password nobody knows, and e-mails a link
    where the invitee sets their own. Without SMTP the link is returned for the admin to pass on."""
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, L("Bu e-poçtla hesab artıq var. Parolu unudubsa, «Parolu unutmusunuz?» ilə bərpa etsin.", "An account with this e-mail already exists. If they forgot the password, they can use “Forgot your password?”."))
    user = User(email=email, password_hash=hash_password(secrets.token_urlsafe(32)), role=body.role)
    db.add(user)
    db.flush()
    hours = get_settings()["security"]["invite_hours"]
    link = issue_reset_link(db, user, request, timedelta(hours=hours), query="&invite=1")
    audit(db, admin.id, "user_invited", {"user_id": user.id, "role": body.role})
    commit(db)
    if mail_enabled():
        background.add_task(send_mail, email, L("Portfel Analizi: hesabınız açıldı",
                                                "Portfel Analizi: your account is ready"),
                            L(f"Sizin üçün Portfel Analizi hesabı açıldı ({email}).\n\n"
                              f"Parolunuzu təyin etmək üçün bu linki açın ({hours} saat etibarlıdır):\n\n{link}\n\n"
                              "Link vaxtı keçsə, giriş səhifəsində «Parolu unutmusunuz?» ilə yenisini istəyin.",
                              f"A Portfel Analizi account has been created for you ({email}).\n\n"
                              f"Open this link to set your password (valid for {hours} hours):\n\n{link}\n\n"
                              "If the link expires, ask for a new one with “Forgot your password?” on the sign-in page."))
        return {"ok": True, "emailed": True}
    return {"ok": True, "emailed": False, "link": link}


class UserPatch(BaseModel):
    role: Literal["client", "admin"] | None = None
    is_blocked: bool | None = None
    new_password: str | None = Field(default=None, min_length=1, max_length=128)
    unlock: bool = False


@router.patch("/users/{user_id}")
def patch_user(user_id: int, body: UserPatch, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, L("Tapılmadı.", "Not found."))
    if u.id == admin.id and (body.role == "client" or body.is_blocked):
        raise HTTPException(422, L("Öz admin hüququnuzu və ya hesabınızı bloklaya bilməzsiniz.", "You cannot remove your own admin role or block your own account."))
    if body.role:
        u.role = body.role
    if body.is_blocked is not None:
        u.is_blocked = body.is_blocked
        if body.is_blocked:
            for s in db.scalars(select(UserSession).where(UserSession.user_id == u.id)).all():
                db.delete(s)
    if body.new_password:
        validate_new_password(body.new_password, u.email)
        u.password_hash = hash_password(body.new_password)
        for s in db.scalars(select(UserSession).where(UserSession.user_id == u.id)).all():
            db.delete(s)
    if body.unlock or body.new_password:
        record_successful_login(u)
    audit(db, admin.id, "admin_user_update", {"user_id": u.id, "role": body.role, "blocked": body.is_blocked,
                                              "password_reset": bool(body.new_password), "unlock": body.unlock})
    commit(db)
    return {"ok": True}


@router.get("/provider-status")
def provider_status(db: Session = Depends(get_db)):
    md = MarketData(db)
    jobs = db.scalars(select(Job).order_by(Job.id.desc()).limit(50)).all()
    try:
        req = md.provider.request_count  # type: ignore[attr-defined]
    except Exception:
        req = None
    return {"mode": get_settings().mode, "provider": get_settings()["data"]["provider"],
            "requests_this_process": req, "symbols": md.provider_status(),
            "jobs": [{"id": j.id, "kind": j.kind, "run_id": j.run_id, "status": j.status, "attempts": j.attempts,
                      "error": (j.error or "")[:300]} for j in jobs]}


@router.get("/audit")
def audit_log(limit: int = 200, db: Session = Depends(get_db)):
    rows = db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(min(limit, 1000))).all()
    return [{"id": a.id, "user_id": a.user_id, "action": a.action, "detail": a.detail,
             "created_at": a.created_at.isoformat()} for a in rows]
