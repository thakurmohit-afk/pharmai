"""User routes for self profile/dashboard and admin read access."""

import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user, require_admin
from app.models.user import User
from app.services.user_service import get_user_dashboard, get_user_profile, update_user_profile

router = APIRouter(prefix="/api/user", tags=["user"])

_AVATAR_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "static", "avatars")
_ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


class ProfileUpdateRequest(BaseModel):
    name: str | None = None
    phone: str | None = None
    gender: str | None = None
    age: int | None = None
    address: dict | None = None
    chronic_conditions: list[str] | None = None


@router.get("/me/profile")
async def my_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve profile for authenticated user."""
    return await get_user_profile(str(current_user.user_id), db)


@router.get("/me/dashboard")
async def my_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve dashboard for authenticated user."""
    return await get_user_dashboard(str(current_user.user_id), db)


@router.patch("/me/profile")
async def patch_my_profile(
    payload: ProfileUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update name, phone, gender, age, address."""
    updates = payload.model_dump(exclude_none=True)
    result = await update_user_profile(str(current_user.user_id), updates, db)
    return result


@router.post("/me/avatar")
async def upload_avatar(
    avatar: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a profile picture. Saves to static/avatars/ and updates user.avatar_url."""
    ext = os.path.splitext(avatar.filename or "")[1].lower()
    if ext not in _ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail="Unsupported image format.")

    os.makedirs(_AVATAR_DIR, exist_ok=True)
    filename = f"{current_user.user_id}{ext}"
    filepath = os.path.join(_AVATAR_DIR, filename)

    content = await avatar.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5 MB).")

    with open(filepath, "wb") as f:
        f.write(content)

    avatar_url = f"/static/avatars/{filename}"
    await db.execute(
        update(User).where(User.user_id == current_user.user_id).values(avatar_url=avatar_url)
    )
    await db.commit()
    return {"avatar_url": avatar_url}


@router.get("/{user_id}/profile", dependencies=[Depends(require_admin)])
async def user_profile(user_id: str, db: AsyncSession = Depends(get_db)):
    """Admin-only profile lookup."""
    return await get_user_profile(user_id, db)


@router.get("/{user_id}/dashboard", dependencies=[Depends(require_admin)])
async def user_dashboard(user_id: str, db: AsyncSession = Depends(get_db)):
    """Admin-only dashboard lookup."""
    return await get_user_dashboard(user_id, db)
