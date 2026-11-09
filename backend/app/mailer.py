# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

"""Sends account emails (verification, password reset) over SMTP.

Without SMTP_HOST (development and tests) nothing is sent: the message is logged and kept in `sent`.
Production refuses to start without SMTP_HOST, so real users always get real emails.
"""
import logging
import smtplib
from email.message import EmailMessage

from . import config

log = logging.getLogger("mailer")
sent: list[dict] = []


def send_email(to: str, subject: str, body: str) -> None:
    if not config.SMTP_HOST:
        sent.append({"to": to, "subject": subject, "body": body})
        log.warning("EMAIL (SMTP not configured) to=%s subject=%s\n%s", to, subject, body)
        return
    message = EmailMessage()
    message["From"], message["To"], message["Subject"] = config.MAIL_FROM, to, subject
    message.set_content(body)
    try:
        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as smtp:
            smtp.starttls()
            if config.SMTP_USER:
                smtp.login(config.SMTP_USER, config.SMTP_PASSWORD)
            smtp.send_message(message)
    except Exception:  # never crash a request because the mail server is down
        log.exception("Could not send email to %s", to)
