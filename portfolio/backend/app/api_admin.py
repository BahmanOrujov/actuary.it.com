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
from app.api_client import issue_reset_link, portfolio_detail, support_access_active
from app.config import get_settings
from app.i18n import L
from app.mailer import mail_enabled, send_mail
from app.db import get_db, retry_locked
from app.models import Alert, AnalysisRun, AuditLog, Job, Notification, Portfolio, RunDiagnostics, User, UserSession
from app.security import hash_password, is_locked, record_successful_login, require_admin
from app.services import audit
from data.service import MarketData

router = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])


def commit(db: Session) -> None:
    retry_locked(db.commit)


# Least privilege: model diagnostics need the instruments and the statistics, not how much a client holds.
# Unless the owner has granted support access, these keys (amounts, quantities, trades, cash) are removed.
PRIVATE_KEYS = {
    "name", "cash", "transactions", "closed_positions", "targets", "lots", "quantity", "cost_local", "cost_base",
    "market_value_base", "realized_base", "dividends_base", "first_open_date", "cvar95_money", "euler_sum",
}


def _redact(o: Any) -> Any:
    if isinstance(o, dict):
        out = {k: _redact(v) for k, v in o.items() if k not in PRIVATE_KEYS}
        mc = o.get("mc")
        if isinstance(mc, dict) and mc.get("cvar95_money"):
            # the Euler consistency check survives as a ratio (1 = component CVaRs add up to the total)
            out["mc"]["euler_ratio"] = mc.get("euler_sum", 0) / mc["cvar95_money"]
        return out
    if isinstance(o, list):
        return [_redact(v) for v in o]
    return o


def _with_ratio(diag: dict | None) -> dict | None:
    mc = (diag or {}).get("mc")
    if isinstance(mc, dict) and mc.get("cvar95_money"):
        mc["euler_ratio"] = mc.get("euler_sum", 0) / mc["cvar95_money"]
    return diag


def _owner(db: Session, portfolio_id: int) -> tuple[Portfolio | None, User | None]:
    p = db.get(Portfolio, portfolio_id)
    return p, (db.get(User, p.owner_id) if p else None)


def _supported(owner: User | None) -> bool:
    return owner is not None and support_access_active(owner)


@router.get("/runs")
def runs(limit: int = 200, db: Session = Depends(get_db)):
    rows = db.scalars(select(AnalysisRun).order_by(AnalysisRun.id.desc()).limit(min(limit, 1000))).all()
    out = []
    for r in rows:
        p, owner = _owner(db, r.portfolio_id)
        open_ = _supported(owner)
        out.append({
            # pseudonymous unless the owner granted support access
            "id": r.id, "portfolio_id": r.portfolio_id, "portfolio": p.name if p and open_ else f"#{r.portfolio_id}",
            "owner": (owner.email if open_ else f"user #{owner.id}") if owner else None,
            "support_access": open_, "created_at": r.created_at.isoformat(),
            "status": r.status, "step": r.step, "validation_status": r.validation_status,
            "gate_verdict": r.gate_verdict, "reliability": r.reliability, "error": r.error,
            "data_as_of": r.data_as_of.isoformat() if r.data_as_of else None,
            "stale": p is not None and r.portfolio_version != p.version,
        })
    return out


@router.get("/runs/{run_id}")
def run_detail(run_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    r = db.get(AnalysisRun, run_id)
    if r is None:
        raise HTTPException(404, L("Tapılmadı.", "Not found."))
    d = db.get(RunDiagnostics, run_id)
    _, owner = _owner(db, r.portfolio_id)
    out = {"run": {"id": r.id, "portfolio_id": r.portfolio_id, "status": r.status, "gate_verdict": r.gate_verdict,
                   "reliability": r.reliability, "validation_status": r.validation_status, "snapshot": r.snapshot,
                   "seed": r.seed, "model_version": r.model_version},
           "diagnostics": _with_ratio(d.payload) if d else None, "validation": d.validation if d else None,
           "redacted": not _supported(owner)}
    audit(db, admin.id, "admin_view_run", {"run_id": run_id, "redacted": out["redacted"]})
    commit(db)
    return _redact(out) | {"redacted": True} if out["redacted"] else out


@router.get("/runs/{run_id}/report.{fmt}")
def run_report(run_id: int, fmt: Literal["html", "json"], db: Session = Depends(get_db)):
    """Rendered from the stored JSON on every request, so the redaction also covers reports written before it."""
    import json

    from fastapi.responses import HTMLResponse, JSONResponse

    from validation.report import render_html

    r = db.get(AnalysisRun, run_id)
    if r is None:
        raise HTTPException(404, L("Tapılmadı.", "Not found."))
    path = get_settings().reports_dir / str(r.portfolio_id) / str(run_id) / "report.json"
    if not path.exists():
        raise HTTPException(404, L("Hesabat hələ hazır deyil.", "The report is not ready yet."))
    data = json.loads(path.read_text(encoding="utf-8"))
    data["diagnostics"] = _with_ratio(data.get("diagnostics"))
    _, owner = _owner(db, r.portfolio_id)
    if not _supported(owner):
        data = _redact(data)
    if fmt == "json":
        return JSONResponse(data, headers={"Content-Disposition": f'attachment; filename="run_{run_id}_report.json"'})
    return HTMLResponse(render_html(r.portfolio_id, run_id, data.get("diagnostics") or {}, data.get("validation")))


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
             "support_access_until": u.support_access_until.isoformat() if support_access_active(u) else None,
             "two_factor": u.totp_enabled,
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
    where the invitee sets their own. The link only ever goes to the invitee's mailbox: an admin who held it
    could set the password and use the account, so without SMTP there is no invitation."""
    if not mail_enabled():
        raise HTTPException(503, L("Dəvət üçün serverdə e-poçt (SMTP) qurulmalıdır.", "Invitations need e-mail (SMTP) set up on the server."))
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
    return {"ok": True, "emailed": False}


class UserPatch(BaseModel):
    role: Literal["client", "admin"] | None = None
    is_blocked: bool | None = None
    unlock: bool = False
    sign_out: bool = False  # end every session of the user (e.g. a lost device)


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
    if body.sign_out:
        for s in db.scalars(select(UserSession).where(UserSession.user_id == u.id)).all():
            db.delete(s)
    if body.unlock:
        record_successful_login(u)
    audit(db, admin.id, "admin_user_update", {"user_id": u.id, "role": body.role, "blocked": body.is_blocked,
                                              "unlock": body.unlock, "sign_out": body.sign_out})
    commit(db)
    return {"ok": True}


@router.post("/users/{user_id}/send-reset")
def send_reset(user_id: int, request: Request, background: BackgroundTasks, db: Session = Depends(get_db),
               admin: User = Depends(require_admin)):
    """Admins never set or see a user's password: they can only have a one-time reset link e-mailed to the user."""
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, L("Tapılmadı.", "Not found."))
    if not mail_enabled():
        raise HTTPException(503, L("Bərpa linki üçün serverdə e-poçt (SMTP) qurulmalıdır.", "A reset link needs e-mail (SMTP) set up on the server."))
    minutes = get_settings()["security"]["password_reset_minutes"]
    link = issue_reset_link(db, u, request, timedelta(minutes=minutes))
    audit(db, admin.id, "admin_sent_reset", {"user_id": u.id})
    commit(db)
    background.add_task(send_mail, u.email, L("Portfel Analizi: parolun bərpası", "Portfel Analizi: password reset"),
                        L(f"Administrator hesabınız üçün parol bərpası istədi.\n\nYeni parol təyin etmək üçün bu linki açın "
                          f"({minutes} dəqiqə etibarlıdır):\n\n{link}\n\nBunu gözləmirdinizsə, linki açmayın — köhnə parolunuz işləməyə davam edir.",
                          f"An administrator requested a password reset for your account.\n\nOpen this link to set a new password "
                          f"(valid for {minutes} minutes):\n\n{link}\n\nIf you did not expect this, ignore it — your current password keeps working."))
    return {"ok": True}


@router.post("/users/{user_id}/reset-2fa")
def reset_two_factor(user_id: int, background: BackgroundTasks, db: Session = Depends(get_db),
                     admin: User = Depends(require_admin)):
    """For a user who lost the phone and the recovery codes. Their sessions end and they are told by e-mail."""
    from app import twofactor

    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, L("Tapılmadı.", "Not found."))
    if u.id == admin.id:
        raise HTTPException(422, L("Öz iki mərhələli girişinizi buradan sıfırlaya bilməzsiniz.", "You cannot reset your own two-factor sign-in here."))
    twofactor.clear(u)
    for s in db.scalars(select(UserSession).where(UserSession.user_id == u.id)).all():
        db.delete(s)
    audit(db, admin.id, "admin_reset_2fa", {"user_id": u.id})
    commit(db)
    if mail_enabled():
        background.add_task(send_mail, u.email, L("Portfel Analizi: iki mərhələli giriş sıfırlandı", "Portfel Analizi: two-factor sign-in was reset"),
                            L("Administrator hesabınızda iki mərhələli girişi sıfırladı. Bunu siz istəmisinizsə, daxil olub Parametrlərdə yenidən aktivləşdirin. "
                              "İstəməmisinizsə, dərhal parolunuzu dəyişin və bizə yazın.",
                              "An administrator reset two-factor sign-in on your account. If you asked for it, sign in and turn it on again in Settings. "
                              "If you did not, change your password at once and contact us."))
    return {"ok": True}


@router.post("/mail-test")
def mail_test(admin: User = Depends(require_admin)):
    """Sends a test e-mail to the admin who asks, and reports the SMTP error if there is one."""
    import smtplib

    if not mail_enabled():
        raise HTTPException(503, L("Serverdə e-poçt (SMTP) qurulmayıb: PA_SMTP_USER və PA_SMTP_PASSWORD.", "E-mail (SMTP) is not set up on the server: PA_SMTP_USER and PA_SMTP_PASSWORD."))
    try:
        send_mail(admin.email, L("Portfel Analizi: test e-poçtu", "Portfel Analizi: test e-mail"),
                  L("Bu, admin panelindən göndərilən test məktubudur. Gəlibsə, e-poçt xidməti işləyir.",
                    "This is a test e-mail from the admin panel. If it arrived, e-mail works."), raise_errors=True)
    except smtplib.SMTPAuthenticationError as e:
        raise HTTPException(502, L(f"SMTP girişi rədd edildi ({e.smtp_code}): tətbiq parolunu yoxlayın.",
                                   f"The SMTP login was refused ({e.smtp_code}): check the app password.")) from e
    except (OSError, smtplib.SMTPException) as e:
        raise HTTPException(502, L(f"Göndərilmədi: {type(e).__name__}.", f"Not sent: {type(e).__name__}.")) from e
    return {"ok": True, "to": admin.email}


@router.get("/users/{user_id}/portfolios")
def user_portfolios(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Read-only view of a user's portfolios, only while the user has granted support access. Every view is
    audited and the user gets a notice."""
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, L("Tapılmadı.", "Not found."))
    if not support_access_active(u):
        raise HTTPException(403, L("İstifadəçi dəstək üçün icazə verməyib. O, Parametrlər səhifəsindən müvəqqəti icazə verə bilər.",
                                   "The user has not granted support access. They can grant temporary access on their Settings page."))
    audit(db, admin.id, "admin_view_portfolios", {"user_id": u.id})
    key = f"support_view:{u.id}:{u.support_access_until.isoformat()}"  # one notice per granted period
    if db.scalar(select(Notification).where(Notification.dedup_key == key)) is None:
        db.add(Notification(user_id=u.id, kind="support_view", dedup_key=key,
                            message=L("Dəstək komandası verdiyiniz icazə ilə portfellərinizə baxdı. İcazəni Parametrlərdə dayandıra bilərsiniz.",
                                      "Support looked at your portfolios with the access you granted. You can end the access in Settings.")))
    out = [portfolio_detail(db, p) for p in u.portfolios if p.scenario_of is None]
    commit(db)
    return {"email": u.email, "support_access_until": u.support_access_until.isoformat(), "portfolios": out}


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
