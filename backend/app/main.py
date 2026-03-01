"""FastAPI application entry point."""

import logging
import sys
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, select, text

from app.config import get_settings
from app.langfuse_client import flush_langfuse
from app.redis_client import (
    check_redis_and_fallback,
    close_redis,
    get_cache_status,
)
from app.security import decode_token
from app.services.openai_client import probe_openai_auth

from app.routes.admin import router as admin_router
from app.routes.auth import router as auth_router
from app.routes.chat import router as chat_router
from app.routes.chat_threads import router as chat_threads_router
from app.routes.prescription import router as prescription_router
from app.routes.system import router as system_router
from app.routes.user import router as user_router
from app.routes.voice import router as voice_router
from app.routes.webhooks import router as webhooks_router

logger = logging.getLogger("pharmacy")
settings = get_settings()


def _configure_console_encoding() -> None:
    """Force UTF-8 console streams when possible (helps on Windows CP-1252 terminals)."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                continue


def _safe_db_target(database_url: str) -> str:
    """Return a non-secret DB target string for startup logs."""
    try:
        parsed = urlparse(database_url)
    except Exception:
        return "unknown"

    scheme = parsed.scheme or "unknown"
    host = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port else ""
    path = parsed.path or ""
    if host:
        return f"{scheme}://{host}{port}{path}"
    return f"{scheme}:{path}"


def _log_startup_config() -> None:
    """Log critical non-secret runtime configuration."""
    key = settings.openai_api_key or ""
    logger.info(
        "Runtime config: app_env=%s mock_mode=%s auth_enabled=%s payment_enabled=%s sql_echo=%s "
        "openai_key_present=%s openai_key_len=%d db=%s redis=%s cache_namespace=%s dev_cache_persist=%s",
        settings.app_env,
        settings.mock_mode,
        settings.auth_enabled,
        settings.payment_enabled,
        settings.sql_echo,
        bool(key),
        len(key),
        _safe_db_target(settings.database_url),
        settings.redis_url,
        settings.cache_namespace,
        settings.dev_cache_persist,
    )


async def _ensure_schema_compatibility() -> None:
    """Apply minimal additive schema updates for existing local DBs."""
    from app.database import engine

    async with engine.begin() as conn:
        has_chat_threads = await conn.run_sync(
            lambda sync_conn: inspect(sync_conn).has_table("chat_threads")
        )
        if not has_chat_threads:
            return

        columns = await conn.run_sync(
            lambda sync_conn: {
                column["name"] for column in inspect(sync_conn).get_columns("chat_threads")
            }
        )

        if "source" not in columns:
            await conn.execute(
                text("ALTER TABLE chat_threads ADD COLUMN source VARCHAR(32) DEFAULT 'manual'")
            )
            await conn.execute(
                text("UPDATE chat_threads SET source='manual' WHERE source IS NULL")
            )
            logger.info("Schema compat: added chat_threads.source")

        if "client_session_id" not in columns:
            await conn.execute(
                text("ALTER TABLE chat_threads ADD COLUMN client_session_id VARCHAR(64)")
            )
            logger.info("Schema compat: added chat_threads.client_session_id")

        has_users = await conn.run_sync(
            lambda sync_conn: inspect(sync_conn).has_table("users")
        )
        if has_users:
            user_columns = await conn.run_sync(
                lambda sync_conn: {
                    column["name"] for column in inspect(sync_conn).get_columns("users")
                }
            )
            if "last_login_at" not in user_columns:
                await conn.execute(
                    text("ALTER TABLE users ADD COLUMN last_login_at DATETIME")
                )
                logger.info("Schema compat: added users.last_login_at")

        has_user_sessions = await conn.run_sync(
            lambda sync_conn: inspect(sync_conn).has_table("user_sessions")
        )
        if has_user_sessions:
            session_columns = await conn.run_sync(
                lambda sync_conn: {
                    column["name"] for column in inspect(sync_conn).get_columns("user_sessions")
                }
            )

            if "revoked_at" not in session_columns:
                await conn.execute(
                    text("ALTER TABLE user_sessions ADD COLUMN revoked_at DATETIME")
                )
                logger.info("Schema compat: added user_sessions.revoked_at")

            if "created_at" not in session_columns:
                await conn.execute(
                    text("ALTER TABLE user_sessions ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP")
                )
                logger.info("Schema compat: added user_sessions.created_at")

            if "last_seen_at" not in session_columns:
                await conn.execute(
                    text("ALTER TABLE user_sessions ADD COLUMN last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP")
                )
                await conn.execute(
                    text("UPDATE user_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE last_seen_at IS NULL")
                )
                logger.info("Schema compat: added user_sessions.last_seen_at")

            if "user_agent" not in session_columns:
                await conn.execute(
                    text("ALTER TABLE user_sessions ADD COLUMN user_agent VARCHAR(512)")
                )
                logger.info("Schema compat: added user_sessions.user_agent")

            if "ip_address" not in session_columns:
                await conn.execute(
                    text("ALTER TABLE user_sessions ADD COLUMN ip_address VARCHAR(64)")
                )
                logger.info("Schema compat: added user_sessions.ip_address")


async def _validate_inventory_units() -> None:
    """Warn (dev) or fail (non-dev) on non-canonical inventory unit types."""
    from app.database import async_session_factory
    from app.models.inventory import Inventory

    async with async_session_factory() as db:
        result = await db.execute(select(Inventory.unit_type).distinct())
        units = {(row[0] or "").strip().lower() for row in result.all()}

    invalid_units = {unit for unit in units if unit and unit not in {"strip", "strips"}}
    if not invalid_units:
        return

    message = (
        "Inventory unit_type contains non-canonical values: "
        f"{sorted(invalid_units)}. Expected only 'strip'/'strips' in this phase."
    )
    if settings.app_env == "development":
        logger.warning(message)
        return
    raise RuntimeError(message)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown hooks."""
    _configure_console_encoding()
    logger.info("Pharmacy API starting up")
    _log_startup_config()

    from app.database import Base, engine
    from app.models import (  # noqa: F401
        auth,
        cart,
        chat,
        inventory,
        medicine,
        order,
        prescription,
        refill_alert,
        user,
        waitlist,
    )
    from app.models import dispensing_log  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ready")
    await _ensure_schema_compatibility()

    await check_redis_and_fallback()
    logger.info("Cache status: %s", get_cache_status())
    await _validate_inventory_units()

    from app.services.medicine_search import init_medicine_search

    await init_medicine_search()
    try:
        llm_status = await probe_openai_auth(force_refresh=True)
        logger.info("LLM status probe: %s", llm_status)
    except Exception as err:
        logger.warning("LLM status probe failed: %s", err)

    yield

    logger.info("Shutting down")
    flush_langfuse()
    await close_redis()
    await engine.dispose()
    logger.info("Shutdown complete")


app = FastAPI(
    title="Agentic Pharmacy API",
    description="Multi-agent autonomous pharmacy ordering system",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os as _os
_static_dir = _os.path.join(_os.path.dirname(__file__), "..", "static")
_os.makedirs(_os.path.join(_static_dir, "avatars"), exist_ok=True)
app.mount("/static", StaticFiles(directory=_static_dir), name="static")

app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(chat_threads_router)
app.include_router(system_router)
app.include_router(voice_router)
app.include_router(prescription_router)
app.include_router(user_router)
app.include_router(admin_router)
app.include_router(webhooks_router)

from app.routes.elevenlabs_llm import router as elevenlabs_router
from app.routes.payment import router as payment_router
from app.routes.refill_calls import router as refill_calls_router

app.include_router(elevenlabs_router)
app.include_router(payment_router)
app.include_router(refill_calls_router)

from app.routes.cart import router as cart_router
from app.routes.waitlist import router as waitlist_router

app.include_router(cart_router)
app.include_router(waitlist_router)

from app.routes.search import router as search_router
app.include_router(search_router)


@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    """Real-time chat over WebSocket using access-token auth."""
    token = websocket.query_params.get("token")
    payload = decode_token(token or "", expected_type="access")
    user_id = payload.get("sub") if payload else None
    if not user_id:
        await websocket.close(code=1008, reason="Unauthorized")
        return

    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            message = data.get("message", "")
            from app.database import async_session_factory
            from app.services.chat_service import process_chat_message

            async with async_session_factory() as db:
                result = await process_chat_message(
                    user_id=user_id,
                    message=message,
                    conversation_id=data.get("conversation_id"),
                    db=db,
                )
                await db.commit()

            await websocket.send_json(result)
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for user %s", user_id)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "pharmacy-api"}
