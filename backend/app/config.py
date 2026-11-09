# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

"""Settings read from environment variables (see .env.example). No secrets live in code."""
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./worktime.db")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")]
TOKEN_EXPIRE_MINUTES = int(os.getenv("TOKEN_EXPIRE_MINUTES", "60"))
ALGORITHM = "HS256"
ALLOW_SIGNUP = os.getenv("ALLOW_SIGNUP", "true").lower() == "true"
APP_ENV = os.getenv("APP_ENV", "development")
PRODUCTION = APP_ENV == "production"
INVITE_CODE = os.getenv("INVITE_CODE", "")  # if set, creating an account requires this code
MAX_ROWS_PER_TABLE = int(os.getenv("MAX_ROWS_PER_TABLE", "5000"))  # abuse protection, per business
APP_URL = os.getenv("APP_URL", "http://localhost:5173").rstrip("/")  # used to build the links in emails
CONTACT_EMAIL = os.getenv("CONTACT_EMAIL", "")  # shown on the Terms and Privacy pages
SMTP_HOST = os.getenv("SMTP_HOST", "")  # empty = emails are only written to the server log (development)
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
MAIL_FROM = os.getenv("MAIL_FROM", "Work-Time <no-reply@localhost>")
# Must users confirm their email before using the app? Yes in production, no in development.
REQUIRE_VERIFIED_EMAIL = os.getenv("REQUIRE_VERIFIED_EMAIL", "true" if PRODUCTION else "false").lower() == "true"
MAX_BUSINESSES_PER_USER = int(os.getenv("MAX_BUSINESSES_PER_USER", "10"))  # set false to stop new accounts being created
APP_TIMEZONE = os.getenv("APP_TIMEZONE", "Asia/Kolkata")  # decides what "today" means on the dashboard


def get_secret_key() -> str:
    key = os.getenv("SECRET_KEY", "")
    if len(key) < 16 or key.startswith("change-me"):
        raise RuntimeError("SECRET_KEY is missing, shorter than 16 characters, or still the placeholder. Set a long random value in .env.")
    return key


def validate_production_config() -> None:
    """Refuse to start in production with unsafe settings (checked at startup, before serving any request)."""
    if not PRODUCTION:
        return
    problems = []
    if len(os.getenv("SECRET_KEY", "")) < 32:
        problems.append("SECRET_KEY must be at least 32 characters")
    if DATABASE_URL.startswith("sqlite"):
        problems.append("DATABASE_URL must point to PostgreSQL, not SQLite")
    if any("localhost" in origin or "127.0.0.1" in origin for origin in CORS_ORIGINS):
        problems.append("CORS_ORIGINS must list your real https:// domain, not localhost")
    if not SMTP_HOST:
        problems.append("SMTP_HOST must be set so verification and password-reset emails can be sent")
    if not APP_URL.startswith("https://"):
        problems.append("APP_URL must be your public https:// address")
    if not CONTACT_EMAIL:
        problems.append("CONTACT_EMAIL must be set (it is shown on the Terms and Privacy pages)")
    if problems:
        raise RuntimeError("Unsafe production configuration: " + "; ".join(problems))
