# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

"""Password hashing (stdlib PBKDF2) and signed tokens (PyJWT)."""
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt

from .config import ALGORITHM, TOKEN_EXPIRE_MINUTES, get_secret_key

ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    salt_hex, digest_hex = stored.split("$")
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), ITERATIONS)
    return hmac.compare_digest(digest.hex(), digest_hex)


def fingerprint(password_hash: str) -> str:
    """Changes whenever the password changes, so old sessions and old reset links die with the old password."""
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def _encode(payload: dict, minutes: int) -> str:
    payload["exp"] = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    return jwt.encode(payload, get_secret_key(), algorithm=ALGORITHM)


def create_token(user) -> str:
    """A login session."""
    return _encode({"sub": user.username, "pf": fingerprint(user.password_hash)}, TOKEN_EXPIRE_MINUTES)


def decode_token(token: str) -> dict:
    payload = jwt.decode(token, get_secret_key(), algorithms=[ALGORITHM])
    if "purpose" in payload:  # an emailed link must never work as a login
        raise jwt.InvalidTokenError("not a session token")
    return payload


def create_purpose_token(purpose: str, user, minutes: int, **extra) -> str:
    """A single-purpose emailed link ('verify' or 'reset')."""
    return _encode({"purpose": purpose, "sub": str(user.id), "pf": fingerprint(user.password_hash), **extra}, minutes)


def decode_purpose_token(token: str, purpose: str) -> dict:
    payload = jwt.decode(token, get_secret_key(), algorithms=[ALGORITHM])
    if payload.get("purpose") != purpose:
        raise jwt.InvalidTokenError("wrong token type")
    return payload
