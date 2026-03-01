"""Auth dependencies for request-scoped user resolution."""

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.security import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, cookie_settings, decode_token


def _extract_access_token(request: Request) -> str | None:
    cookie_token = request.cookies.get(ACCESS_COOKIE_NAME)
    if cookie_token:
        return cookie_token
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return None


def _clear_stale_cookies(response: Response) -> None:
    """Delete auth cookies so the browser stops sending dead tokens."""
    base = cookie_settings()
    response.delete_cookie(ACCESS_COOKIE_NAME, path="/", **base)
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/", **base)


async def get_current_user(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve authenticated user from access token cookie.
    
    If the token is structurally valid but the user no longer exists
    (e.g. after a DB recreation), clear the stale cookies so the
    browser doesn't keep sending them on every request.
    """
    settings = get_settings()
    if not settings.auth_enabled:
        raise HTTPException(status_code=503, detail="Authentication is currently disabled.")

    token = _extract_access_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    payload = decode_token(token, expected_type="access")
    if not payload:
        # Token expired or tampered — clear cookies
        _clear_stale_cookies(response)
        raise HTTPException(status_code=401, detail="Invalid or expired access token.")

    user_id = payload.get("sub")
    if not user_id:
        _clear_stale_cookies(response)
        raise HTTPException(status_code=401, detail="Invalid token payload.")

    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        # Token is valid but user doesn't exist anymore — CLEAR COOKIES
        _clear_stale_cookies(response)
        raise HTTPException(status_code=401, detail="User not found or inactive.")

    return user


async def get_optional_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Best-effort user resolution for routes that may be anonymous."""
    try:
        return await get_current_user(request, db)
    except HTTPException:
        return None


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require admin role."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return current_user

