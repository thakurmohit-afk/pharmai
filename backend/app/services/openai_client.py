"""Shared OpenAI client factory and error classification helpers."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

from openai import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    AsyncOpenAI,
    AuthenticationError,
    BadRequestError,
    OpenAIError,
    RateLimitError,
)

from app.config import get_settings

_async_client: AsyncOpenAI | None = None
_async_key = ""
_status_cache: dict[str, Any] = {
    "checked_at": None,
    "auth_ok": None,
    "last_error_code": None,
    "status": "unknown",
}


def get_async_openai_client(force_refresh: bool = False) -> AsyncOpenAI:
    """Return cached AsyncOpenAI client bound to current API key."""
    global _async_client, _async_key
    settings = get_settings(force_refresh=force_refresh)
    api_key = settings.openai_api_key
    if _async_client is None or _async_key != api_key:
        _async_client = AsyncOpenAI(api_key=api_key)
        _async_key = api_key
    return _async_client


def _safe_error_message(default_message: str, err: Exception) -> str:
    text = str(err or "").strip()
    if not text:
        return default_message
    if len(text) > 240:
        return default_message
    return text


def classify_openai_error(err: Exception) -> tuple[str, int, str]:
    """Map OpenAI/client errors to stable API error codes."""
    if isinstance(err, AuthenticationError):
        return (
            "openai_auth_failed",
            503,
            "OpenAI authentication failed. Please verify OPENAI_API_KEY.",
        )
    if isinstance(err, RateLimitError):
        return (
            "openai_rate_limited",
            503,
            "OpenAI rate limit reached. Please retry shortly.",
        )
    if isinstance(err, APITimeoutError):
        return (
            "openai_timeout",
            503,
            "OpenAI request timed out. Please retry.",
        )
    if isinstance(err, APIConnectionError):
        return (
            "openai_connection_error",
            503,
            "Unable to reach OpenAI service.",
        )
    if isinstance(err, BadRequestError):
        return (
            "openai_bad_request",
            502,
            _safe_error_message("OpenAI rejected the request payload.", err),
        )
    if isinstance(err, APIError):
        return (
            "openai_api_error",
            503,
            _safe_error_message("OpenAI API error occurred.", err),
        )
    if isinstance(err, OpenAIError):
        return (
            "openai_error",
            503,
            _safe_error_message("OpenAI request failed.", err),
        )
    return (
        "llm_unavailable",
        503,
        _safe_error_message("Model service is unavailable.", err),
    )


async def probe_openai_auth(force_refresh: bool = False) -> dict[str, Any]:
    """Lightweight auth probe used by `/api/system/llm-status` and diagnostics."""
    now = datetime.now(timezone.utc)
    last_checked = _status_cache.get("checked_at")
    if (
        not force_refresh
        and isinstance(last_checked, datetime)
        and (now - last_checked) < timedelta(seconds=20)
    ):
        return {
            "status": _status_cache["status"],
            "provider": "openai",
            "auth_ok": _status_cache["auth_ok"],
            "last_error_code": _status_cache["last_error_code"],
            "checked_at": _status_cache["checked_at"].isoformat(),
        }

    settings = get_settings(force_refresh=True)
    if settings.mock_mode:
        _status_cache.update(
            {
                "checked_at": now,
                "auth_ok": True,
                "last_error_code": None,
                "status": "mock_mode",
            }
        )
        return {
            "status": "mock_mode",
            "provider": "openai",
            "auth_ok": True,
            "last_error_code": None,
            "checked_at": now.isoformat(),
        }

    if not settings.openai_api_key:
        _status_cache.update(
            {
                "checked_at": now,
                "auth_ok": False,
                "last_error_code": "openai_key_missing",
                "status": "error",
            }
        )
        return {
            "status": "error",
            "provider": "openai",
            "auth_ok": False,
            "last_error_code": "openai_key_missing",
            "checked_at": now.isoformat(),
        }

    try:
        client = get_async_openai_client(force_refresh=True)
        await asyncio.wait_for(client.models.list(), timeout=6.0)
        _status_cache.update(
            {
                "checked_at": now,
                "auth_ok": True,
                "last_error_code": None,
                "status": "ok",
            }
        )
    except Exception as err:
        code, _, _ = classify_openai_error(err)
        _status_cache.update(
            {
                "checked_at": now,
                "auth_ok": False,
                "last_error_code": code,
                "status": "error",
            }
        )

    return {
        "status": _status_cache["status"],
        "provider": "openai",
        "auth_ok": _status_cache["auth_ok"],
        "last_error_code": _status_cache["last_error_code"],
        "checked_at": _status_cache["checked_at"].isoformat(),
    }

