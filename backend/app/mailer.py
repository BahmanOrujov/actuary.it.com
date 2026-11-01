"""Outgoing e-mail over SMTP (e.g. Gmail with an app password). Off unless PA_SMTP_USER and PA_SMTP_PASSWORD are
set: the local personal app has no mail account and prints one-time links to its console instead."""
from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage


def mail_enabled() -> bool:
    return bool(os.getenv("PA_SMTP_USER") and os.getenv("PA_SMTP_PASSWORD"))


def send_mail(to: str, subject: str, body: str) -> None:
    """Runs in a background task: failures are logged (without the body, which may hold a token), not raised."""
    user = os.environ["PA_SMTP_USER"]
    msg = EmailMessage()
    msg["From"] = os.getenv("PA_MAIL_FROM", user)
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(os.getenv("PA_SMTP_HOST", "smtp.gmail.com"), int(os.getenv("PA_SMTP_PORT", "587")),
                          timeout=20) as s:
            s.starttls()
            s.login(user, os.environ["PA_SMTP_PASSWORD"])
            s.send_message(msg)
    except (OSError, smtplib.SMTPException) as e:
        logging.getLogger("mailer").error("e-mail to %s failed: %s", to, e)
