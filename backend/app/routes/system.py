"""System diagnostics and debug maintenance routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.dependencies.auth import get_current_user, require_admin
from app.models.user import User
from app.redis_client import clear_runtime_cache, get_cache_status
from app.services.openai_client import probe_openai_auth

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/llm-status")
async def llm_status(
    force_refresh: bool = Query(default=False),
    _: User = Depends(get_current_user),
):
    """Return provider auth/config status for the model backend."""
    return await probe_openai_auth(force_refresh=force_refresh)


@router.get("/cache-status")
async def cache_status(
    _: User = Depends(get_current_user),
):
    """Return active cache backend and namespace details."""
    return get_cache_status()


@router.post("/cache/clear")
async def clear_cache(
    _: User = Depends(require_admin),
):
    """Clear runtime cache namespace (admin-only)."""
    return await clear_runtime_cache()

