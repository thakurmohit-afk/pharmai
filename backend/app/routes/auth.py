"""Authentication routes for cookie-based sessions."""

from datetime import timedelta
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.auth import UserSession
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    DevLoginRequest,
    LoginRequest,
    RegisterRequest,
)
from app.security import (
    ACCESS_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    cookie_settings,
    create_access_token,
    create_refresh_token,
    decode_token,
    ensure_utc_datetime,
    hash_password,
    hash_token,
    now_utc,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _auth_user_payload(user: User) -> dict:
    return {
        "user_id": str(user.user_id),
        "name": user.name,
        "email": user.email,
        "role": user.role,
    }


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    settings = get_settings()
    base_kwargs = cookie_settings()
    response.set_cookie(
        ACCESS_COOKIE_NAME,
        access_token,
        max_age=settings.access_token_ttl_min * 60,
        path="/",
        **base_kwargs,
    )
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        refresh_token,
        max_age=settings.refresh_token_ttl_days * 24 * 60 * 60,
        path="/",
        **base_kwargs,
    )


def _clear_auth_cookies(response: Response) -> None:
    base_kwargs = cookie_settings()
    response.delete_cookie(ACCESS_COOKIE_NAME, path="/", **base_kwargs)
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/", **base_kwargs)


async def _create_session_tokens(
    user: User,
    db: AsyncSession,
    request: Request,
) -> tuple[str, str]:
    settings = get_settings()
    session_uuid = uuid.uuid4()
    session_id = str(session_uuid)
    refresh_token = create_refresh_token(str(user.user_id), user.role, session_id)
    access_token = create_access_token(str(user.user_id), user.role, session_id)

    user_agent = request.headers.get("user-agent", "")[:512]
    ip_address = request.client.host if request.client else None
    db.add(
        UserSession(
            session_id=session_uuid,
            user_id=user.user_id,
            refresh_token_hash=hash_token(refresh_token),
            expires_at=now_utc() + timedelta(days=settings.refresh_token_ttl_days),
            user_agent=user_agent,
            ip_address=ip_address,
        )
    )
    user.last_login_at = now_utc()
    return access_token, refresh_token


@router.post("/register", response_model=AuthResponse)
async def register(
    payload: RegisterRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create an account and start an authenticated session."""
    existing = await db.execute(select(User).where(User.email == payload.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email is already registered.")

    user = User(
        name=payload.name.strip(),
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role="user",
        phone=payload.phone,
        address={},
    )
    db.add(user)
    await db.flush()

    access_token, refresh_token = await _create_session_tokens(user, db, request)
    _set_auth_cookies(response, access_token, refresh_token)
    return {"user": _auth_user_payload(user), "message": "Registration successful."}


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate with email/password and issue cookies."""
    result = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive.")

    access_token, refresh_token = await _create_session_tokens(user, db, request)
    _set_auth_cookies(response, access_token, refresh_token)
    return {"user": _auth_user_payload(user), "message": "Login successful."}


@router.post("/refresh", response_model=AuthResponse)
async def refresh_token(
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Rotate refresh token and mint a fresh access token."""
    raw_refresh = request.cookies.get(REFRESH_COOKIE_NAME)
    if not raw_refresh:
        raise HTTPException(status_code=401, detail="Missing refresh token.")

    payload = decode_token(raw_refresh, expected_type="refresh")
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid refresh token.")

    user_id = payload.get("sub")
    session_id = payload.get("sid")
    if not user_id or not session_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token payload.")

    session_result = await db.execute(
        select(UserSession).where(
            UserSession.session_id == session_id,
            UserSession.user_id == user_id,
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=401, detail="Session not found.")
    session_expires_at = ensure_utc_datetime(session.expires_at)
    if session.revoked_at is not None or (
        session_expires_at is not None and session_expires_at <= now_utc()
    ):
        raise HTTPException(status_code=401, detail="Session expired.")
    if session.refresh_token_hash != hash_token(raw_refresh):
        raise HTTPException(status_code=401, detail="Refresh token mismatch.")

    user_result = await db.execute(select(User).where(User.user_id == user_id))
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive.")

    new_refresh = create_refresh_token(str(user.user_id), user.role, str(session.session_id))
    new_access = create_access_token(str(user.user_id), user.role, str(session.session_id))
    settings = get_settings()
    session.refresh_token_hash = hash_token(new_refresh)
    session.expires_at = now_utc() + timedelta(days=settings.refresh_token_ttl_days)
    session.last_seen_at = now_utc()

    _set_auth_cookies(response, new_access, new_refresh)
    return {"user": _auth_user_payload(user), "message": "Session refreshed."}


@router.post("/logout")
async def logout(
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Revoke current refresh session and clear cookies."""
    raw_refresh = request.cookies.get(REFRESH_COOKIE_NAME)
    if raw_refresh:
        payload = decode_token(raw_refresh, expected_type="refresh")
        if payload:
            session_id = payload.get("sid")
            user_id = payload.get("sub")
            if session_id and user_id:
                session_result = await db.execute(
                    select(UserSession).where(
                        UserSession.session_id == session_id,
                        UserSession.user_id == user_id,
                    )
                )
                session = session_result.scalar_one_or_none()
                if session and session.revoked_at is None:
                    session.revoked_at = now_utc()

    _clear_auth_cookies(response)
    return {"message": "Logged out."}


@router.get("/me", response_model=AuthResponse)
async def me(current_user: User = Depends(get_current_user)):
    """Return current authenticated user."""
    return {"user": _auth_user_payload(current_user), "message": "ok"}


@router.post("/dev-login", response_model=AuthResponse)
async def dev_login(
    payload: DevLoginRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Development-only shortcut login for seeded users."""
    settings = get_settings()
    if not settings.allow_demo_bypass:
        raise HTTPException(status_code=403, detail="Demo login is disabled.")

    result = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Demo user not found.")

    access_token, refresh_token = await _create_session_tokens(user, db, request)
    _set_auth_cookies(response, access_token, refresh_token)
    return {"user": _auth_user_payload(user), "message": "Demo login successful."}
