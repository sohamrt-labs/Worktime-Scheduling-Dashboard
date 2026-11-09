# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from . import config
from .database import get_db
from .models import Business, User
from .security import decode_token, fingerprint

COOKIE = "wt_session"  # httpOnly: JavaScript in the page can never read it
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_current_user_any(request: Request, bearer: str | None = Depends(oauth2), db: Session = Depends(get_db)) -> User:
    """Who is calling? A Bearer token (API clients, Swagger) or the session cookie (the web app). No email check."""
    error = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session", headers={"WWW-Authenticate": "Bearer"})
    token = bearer or request.cookies.get(COOKIE)
    if not token:
        raise error
    # Cookies are sent automatically by browsers, so changing requests must prove they come from our own page:
    # a custom header cannot be added by another site without our CORS permission.
    if not bearer and request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get("x-requested-with") != "XMLHttpRequest":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "CSRF check failed")
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        raise error
    user = db.query(User).filter(User.username == payload.get("sub")).first()
    if user is None or payload.get("pf") != fingerprint(user.password_hash):  # password changed since login
        raise error
    return user


def get_current_user(user: User = Depends(get_current_user_any)) -> User:
    """Like get_current_user_any, but also requires a confirmed email when the server demands it."""
    if config.REQUIRE_VERIFIED_EMAIL and not user.email_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Please confirm your email address first")
    return user


def get_business(x_business_id: int | None = Header(default=None), user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)) -> Business:
    """The business the user is currently working in (sent by the UI as X-Business-Id). Must belong to the user."""
    if x_business_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "X-Business-Id header is required")
    business = db.query(Business).filter(Business.id == x_business_id, Business.owner_id == user.id).first()
    if business is None:  # same answer for "does not exist" and "belongs to someone else"
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found")
    return business
