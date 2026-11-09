# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

import hmac
from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import config, mailer, models, schemas
from ..database import get_db
from ..deps import COOKIE, get_current_user_any
from ..models import Business, User
from ..ratelimit import RateLimiter
from ..schemas import ChangePasswordIn, DeleteAccountIn, ForgotIn, RegisterIn, ResetIn, Token, VerifyIn
from ..security import (create_purpose_token, create_token, decode_purpose_token, fingerprint, hash_password,
                        verify_password)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Abuse protection, per client IP (behind the proxy the real IP comes from X-Forwarded-For).
login_user_limiter = RateLimiter(5, 300, "Too many failed attempts. Please try again in a few minutes.")
login_ip_limiter = RateLimiter(30, 300, "Too many failed attempts from this network. Please try again in a few minutes.")
register_limiter = RateLimiter(5, 3600, "Too many sign-up attempts from this network. Please try again later.")
forgot_limiter = RateLimiter(5, 3600, "Too many reset requests from this network. Please try again later.")
resend_limiter = RateLimiter(3, 3600, "Verification email already sent a few times. Please check your inbox and spam folder.")
sensitive_limiter = RateLimiter(5, 900, "Too many attempts. Please wait a few minutes.")


def _ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _start_session(response: Response, user: User) -> Token:
    """Log the user in with an httpOnly cookie (the web app) and also return the token (API clients)."""
    token = create_token(user)
    response.set_cookie(COOKIE, token, max_age=config.TOKEN_EXPIRE_MINUTES * 60, httponly=True,
                        secure=config.PRODUCTION, samesite="lax", path="/api")
    return Token(access_token=token)


def _verification_mail(user: User) -> tuple[str, str, str]:
    token = create_purpose_token("verify", user, 60 * 48, email=user.email)
    body = (f"Hi {user.username},\n\nPlease confirm your email address to finish setting up your account:\n"
            f"{config.APP_URL}/?verify={token}\n\nThe link is valid for 48 hours. If you did not create an account, ignore this email.")
    return user.email, "Confirm your email address", body


def _confirm_password(user: User, password: str) -> None:
    key = str(user.id)
    sensitive_limiter.check(key)
    if not verify_password(password, user.password_hash):
        sensitive_limiter.record(key)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password is incorrect")


@router.get("/config")
def auth_config():
    """What the login page needs to know before anyone is signed in."""
    return {"signup_enabled": config.ALLOW_SIGNUP, "invite_required": bool(config.INVITE_CODE),
            "contact_email": config.CONTACT_EMAIL, "email_enabled": bool(config.SMTP_HOST)}


@router.post("/login", response_model=Token)
def login(request: Request, response: Response, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    ip = _ip(request)
    user_key = f"{ip}:{form.username.lower()}"
    login_user_limiter.check(user_key)
    login_ip_limiter.check(ip)
    user = db.query(User).filter(User.username == form.username).first()
    if user is None or not verify_password(form.password, user.password_hash):
        login_user_limiter.record(user_key)
        login_ip_limiter.record(ip)
        # Same message for both cases so attackers can't discover valid usernames.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password")
    login_user_limiter.clear(user_key)
    return _start_session(response, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout():
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(COOKIE, path="/api")
    return response


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(body: RegisterIn, request: Request, response: Response, tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Create an account plus its first business, log the user in, and email a confirmation link."""
    if not config.ALLOW_SIGNUP:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sign-up is disabled on this server")
    ip = _ip(request)
    register_limiter.check(ip)
    register_limiter.record(ip)
    if config.INVITE_CODE and not hmac.compare_digest(body.invite_code.encode(), config.INVITE_CODE.encode()):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid invite code")
    if not body.accepted_terms:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please accept the Terms of Service and Privacy Policy")
    email = body.email.lower()
    if db.query(User).filter(func.lower(User.username) == body.username.lower()).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "That username is already taken")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with that email already exists")
    user = User(username=body.username, password_hash=hash_password(body.password), email=email,
                terms_accepted_at=datetime.now(timezone.utc).replace(tzinfo=None))
    db.add(user)
    db.flush()
    db.add(Business(owner_id=user.id, name=body.business_name, industry=body.industry))
    db.commit()
    tasks.add_task(mailer.send_email, *_verification_mail(user))
    return _start_session(response, user)


def _me(user: User) -> dict:
    return {"username": user.username, "email": user.email, "email_verified": user.email_verified,
            "verification_required": config.REQUIRE_VERIFIED_EMAIL}


@router.get("/me")
def me(user: User = Depends(get_current_user_any)):
    return _me(user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(body: DeleteAccountIn, user: User = Depends(get_current_user_any), db: Session = Depends(get_db)):
    """Permanently delete the account and everything it owns (all businesses and their data)."""
    _confirm_password(user, body.password)
    db.delete(user)
    db.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(COOKIE, path="/api")
    return response


@router.post("/change-password", response_model=Token)
def change_password(body: ChangePasswordIn, response: Response, user: User = Depends(get_current_user_any), db: Session = Depends(get_db)):
    _confirm_password(user, body.current_password)
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return _start_session(response, user)  # every older session is now invalid; this one stays signed in


@router.get("/export")
def export_data(user: User = Depends(get_current_user_any), db: Session = Depends(get_db)):
    """Everything we hold about the user, as JSON (the 'download my data' right)."""
    def rows(model, schema, business_id):
        return [schema.model_validate(o).model_dump(mode="json")
                for o in db.query(model).filter(model.business_id == business_id).order_by(model.id)]
    businesses = db.query(Business).filter(Business.owner_id == user.id).order_by(Business.id).all()
    return {
        "user": {"username": user.username, "email": user.email, "email_verified": user.email_verified,
                 "terms_accepted_at": user.terms_accepted_at.isoformat() if user.terms_accepted_at else None},
        "businesses": [{"name": b.name, "industry": b.industry,
                        "locations": rows(models.Site, schemas.SiteOut, b.id),
                        "projects": rows(models.Project, schemas.ProjectOut, b.id),
                        "work_items": rows(models.WorkItem, schemas.WorkItemOut, b.id),
                        "meetings": rows(models.Meeting, schemas.MeetingOut, b.id),
                        "equipment": rows(models.Machine, schemas.MachineOut, b.id)} for b in businesses],
    }


@router.post("/verify-email")
def verify_email(body: VerifyIn, db: Session = Depends(get_db)):
    bad = HTTPException(status.HTTP_400_BAD_REQUEST, "This confirmation link is invalid or has expired")
    try:
        payload = decode_purpose_token(body.token, "verify")
    except jwt.PyJWTError:
        raise bad
    user = db.get(User, int(payload["sub"]))
    if user is None or user.email != payload.get("email"):
        raise bad
    user.email_verified = True
    db.commit()
    return {"message": "Email confirmed. Thank you!"}


@router.post("/resend-verification")
def resend_verification(tasks: BackgroundTasks, user: User = Depends(get_current_user_any)):
    if user.email_verified:
        return {"message": "Your email is already confirmed."}
    resend_limiter.check(str(user.id))
    resend_limiter.record(str(user.id))
    tasks.add_task(mailer.send_email, *_verification_mail(user))
    return {"message": "Confirmation email sent. Please check your inbox and spam folder."}


@router.post("/forgot-password")
def forgot_password(body: ForgotIn, request: Request, tasks: BackgroundTasks, db: Session = Depends(get_db)):
    ip = _ip(request)
    forgot_limiter.check(ip)
    forgot_limiter.record(ip)
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if user:
        token = create_purpose_token("reset", user, 60)
        text = (f"Hi {user.username},\n\nUse this link to choose a new password (valid for 1 hour):\n{config.APP_URL}/?reset={token}\n\n"
                "If you did not ask for this, you can ignore this email; your password stays unchanged.")
        tasks.add_task(mailer.send_email, user.email, "Reset your password", text)
    # Same answer whether or not the account exists, so this cannot be used to find registered emails.
    return {"message": "If an account exists for that email, a reset link is on its way."}


@router.post("/reset-password")
def reset_password(body: ResetIn, db: Session = Depends(get_db)):
    bad = HTTPException(status.HTTP_400_BAD_REQUEST, "This reset link is invalid or has expired")
    try:
        payload = decode_purpose_token(body.token, "reset")
    except jwt.PyJWTError:
        raise bad
    user = db.get(User, int(payload["sub"]))
    if user is None or payload.get("pf") != fingerprint(user.password_hash):  # already used, or password changed since
        raise bad
    user.password_hash = hash_password(body.new_password)
    user.email_verified = True  # they just proved they control the inbox
    db.commit()
    return {"message": "Password updated. You can now sign in."}
