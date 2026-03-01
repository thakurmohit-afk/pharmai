"""Custom LLM endpoint for ElevenLabs Conversational AI.

Voice chat is a thin proxy over the main text chat pipeline.
ElevenLabs sends the user's spoken transcript as text, we run it through
the same `process_chat_message` used by the text UI, then stream the
response back as SSE chunks for TTS.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
import uuid
from typing import List, Optional

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

import app.redis_client as _redis_mod
from app.database import async_session_factory
from app.errors import ServiceError
from app.models.chat import ChatThread
from app.security import decode_voice_token
from app.services.chat_service import process_chat_message

logger = logging.getLogger("pharmacy.elevenlabs")
router = APIRouter(tags=["elevenlabs-llm"])


# ── SSE / TTS helpers ───────────────────────────────────────────────────


def _stream_tts_chunks(text: str, chunk_id: str, model: str, chunk_size: int = 8):
    """Yield SSE word-chunked responses for TTS. Centralizes the chunking logic."""
    tts_text = _sanitize_for_tts(text)
    words = tts_text.split()
    for i in range(0, len(words), chunk_size):
        text_chunk = " ".join(words[i:i + chunk_size])
        if i + chunk_size < len(words):
            text_chunk += " "
        yield _make_chunk(text_chunk, chunk_id, model)
    yield _make_chunk(None, chunk_id, model, finish_reason="stop")
    yield _make_done()


GREETING_KEYWORDS = {
    "hi", "hello", "hey", "namaste", "hola",
    "thanks", "thank you", "bye", "goodbye",
    "ok", "okay", "yes", "no", "haan", "nahi", "theek",
    "confirm", "cancel",
    "how are you", "whats up",
    "good morning", "good evening", "good night",
}

_DEFAULT_WORKFLOW_TIMEOUT_SEC = 12.0


def _env_float(name: str, default: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default
    return max(2.0, value)


def _sanitize_for_tts(text: str) -> str:
    text = re.sub(r"Rs\.?\s*(\d[\d,]*\.?\d*)", r"\1 rupees", text)
    text = re.sub(r"\u20B9\s*(\d[\d,]*\.?\d*)", r"\1 rupees", text)
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"\*(.*?)\*", r"\1", text)
    text = re.sub(r"(?m)^-{3,}\s*$", "", text)
    text = re.sub(r"(?m)^- ", "", text)
    # Strip emojis so TTS doesn't read unicode names
    text = re.sub(
        r"[\U0001F300-\U0001F9FF\U00002600-\U000027BF\U0000FE00-\U0000FEFF"
        r"\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF\U00002702-\U000027B0]+",
        "", text,
    )
    # Collapse leftover whitespace
    text = re.sub(r"  +", " ", text).strip()
    return text


def _is_simple_message(text: str) -> bool:
    clean = text.lower().strip().rstrip("!?.,'\"")
    if len(clean.split()) <= 4:
        return any(kw in clean for kw in GREETING_KEYWORDS)
    return False


def _has_thread_id(thread_id: str | None) -> bool:
    value = str(thread_id or "").strip().lower()
    return bool(value and value not in {"new", "null", "none"})


# ── Pydantic request model ──────────────────────────────────────────────


class Message(BaseModel):
    role: str
    content: str | None = None


class ChatCompletionRequest(BaseModel):
    messages: List[Message]
    model: str = "gpt-4o-mini"
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = None
    stream: Optional[bool] = True
    elevenlabs_extra_body: Optional[dict] = None
    custom_llm_extra_body: Optional[dict] = Field(default=None, alias="customLlmExtraBody")

    model_config = {"populate_by_name": True, "extra": "allow"}


# ── SSE chunk builders ──────────────────────────────────────────────────


def _make_chunk(content: str | None, chunk_id: str, model: str, finish_reason=None, role=None) -> str:
    delta = {}
    if role:
        delta["role"] = role
    if content is not None:
        delta["content"] = content

    chunk = {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [{"delta": delta, "index": 0, "finish_reason": finish_reason}],
    }
    return f"data: {json.dumps(chunk)}\n\n"


def _make_done() -> str:
    return "data: [DONE]\n\n"


_SSE_HEADERS = {"Cache-Control": "no-cache", "Connection": "keep-alive"}


def _sse_response(generator) -> StreamingResponse:
    """Wrap an async/sync generator in a StreamingResponse with correct SSE headers."""
    return StreamingResponse(generator, media_type="text/event-stream", headers=_SSE_HEADERS)


async def _next_turn_seq(user_id: str) -> int:
    key = f"voice_turn_seq:{user_id}"
    try:
        seq = await _redis_mod.redis_client.incr(key)
        return int(seq)
    except Exception:
        return int(time.time() * 1000)


async def _resolve_or_create_thread(user_id: str, thread_id: str | None, db) -> str:
    """Ensure a valid ChatThread row exists for the voice session.
    
    If thread_id is 'new'/None/invalid, create a fresh thread.
    If thread_id is a valid UUID but doesn't exist in the DB for this user,
    also create a new thread. Returns the valid thread_id (UUID string).
    """
    if _has_thread_id(thread_id):
        # Check if it actually exists in the DB for this user
        result = await db.execute(
            select(ChatThread.thread_id).where(
                ChatThread.thread_id == thread_id,
                ChatThread.user_id == user_id,
            )
        )
        row = result.scalar_one_or_none()
        if row:
            return str(row)

    # Thread doesn't exist or is "new" — create one
    new_thread = ChatThread(
        user_id=user_id,
        title="Voice conversation",
        source="voice",
    )
    db.add(new_thread)
    await db.flush()  # Generates the UUID
    logger.info("Created new voice thread %s for user %s", new_thread.thread_id, user_id)
    return str(new_thread.thread_id)


# ── Health check ────────────────────────────────────────────────────────


@router.get("/v1/chat/completions/health")
@router.get("/api/v1/chat/completions/health")
async def custom_llm_health():
    """Health check — use to verify ngrok tunnel + endpoint reachability."""
    return {"status": "ok", "endpoint": "/v1/chat/completions"}


# ── Main endpoint ───────────────────────────────────────────────────────


@router.post("/v1/chat/completions")
@router.post("/api/v1/chat/completions")
async def chat_completions(request: Request):
    body = await request.json()

    # ── Debug logging ─────────────────────────────────────────────────
    logger.info(
        "[custom_llm] Incoming request — keys=%s, has_dynamic_variables=%s, has_customLlmExtraBody=%s, msg_count=%d",
        list(body.keys()),
        "dynamic_variables" in body,
        "customLlmExtraBody" in body,
        len(body.get("messages", [])),
    )

    req = ChatCompletionRequest(**body)

    chunk_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    model = req.model

    # ── Extract last user message ─────────────────────────────────────
    user_message = ""
    for msg in reversed(req.messages):
        if msg.role == "user" and msg.content:
            user_message = msg.content
            break

    if not user_message:
        async def empty_stream():
            yield _make_chunk("", chunk_id, model, role="assistant")
            yield _make_chunk("How can I help you today?", chunk_id, model)
            yield _make_chunk(None, chunk_id, model, finish_reason="stop")
            yield _make_done()

        return _sse_response(empty_stream())

    # ── Extract auth_token and thread_id from multiple possible locations ──
    auth_source = "none"
    dyn_vars = body.get("dynamic_variables")
    auth_token = None
    thread_id = None
    if isinstance(dyn_vars, dict):
        auth_token = dyn_vars.get("auth_token")
        thread_id = dyn_vars.get("thread_id")
        if auth_token:
            auth_source = "dynamic_variables"

    if not auth_token:
        el_extra = body.get("elevenlabs_extra_body")
        if isinstance(el_extra, dict):
            auth_token = el_extra.get("auth_token")
            thread_id = thread_id or el_extra.get("thread_id")
            if auth_token:
                auth_source = "elevenlabs_extra_body"

    if not auth_token:
        extra_body = body.get("customLlmExtraBody")
        if isinstance(extra_body, dict):
            auth_token = extra_body.get("auth_token")
            thread_id = thread_id or extra_body.get("thread_id")
            if auth_token:
                auth_source = "customLlmExtraBody"

    if not auth_token and isinstance(req.custom_llm_extra_body, dict):
        auth_token = req.custom_llm_extra_body.get("auth_token")
        thread_id = thread_id or req.custom_llm_extra_body.get("thread_id")
        if auth_token:
            auth_source = "custom_llm_extra_body_field"

    if not auth_token or not thread_id:
        for msg in req.messages:
            if msg.role != "system" or not msg.content:
                continue
            if not auth_token:
                match = re.search(r"AUTH_TOKEN:([A-Za-z0-9_.-]+)", msg.content)
                if match:
                    auth_token = match.group(1)
                    auth_source = "system_message_regex"
            if not thread_id:
                match = re.search(r"THREAD_ID:([A-Za-z0-9_-]+)", msg.content)
                if match:
                    thread_id = match.group(1)

    logger.info(
        "[custom_llm] Auth extraction — source=%s, has_token=%s, thread_id=%s, user_msg=%r",
        auth_source,
        bool(auth_token),
        thread_id,
        user_message[:80] if user_message else "",
    )

    claims = decode_voice_token(auth_token or "")
    user_id = claims.get("sub") if claims else None

    logger.info(
        "[custom_llm] Token decode — user_id=%s, claims_present=%s",
        user_id,
        bool(claims),
    )

    if not user_id:
        async def unauthorized_stream():
            yield _make_chunk("", chunk_id, model, role="assistant")
            yield _make_chunk(
                "I'm having trouble verifying your session right now. Could you try closing and reopening the voice chat?",
                chunk_id,
                model,
            )
            yield _make_chunk(None, chunk_id, model, finish_reason="stop")
            yield _make_done()

        return _sse_response(unauthorized_stream())

    if not user_message.strip() or len(user_message.strip()) < 2:
        async def fast_fallback():
            yield _make_chunk("", chunk_id, model, role="assistant")
            yield _make_chunk("I didn't quite catch that, could you please repeat it?", chunk_id, model)
            yield _make_chunk(None, chunk_id, model, finish_reason="stop")
            yield _make_done()

        return _sse_response(fast_fallback())

    # ── Compute timeout before entering the generator ─────────────────
    workflow_timeout_sec = _env_float("VOICE_WORKFLOW_TIMEOUT_SEC", _DEFAULT_WORKFLOW_TIMEOUT_SEC)

    async def event_stream():
        # ElevenLabs has a first-content-token timeout. Send a buffer word
        # chunk immediately so TTS stays alive while the backend processes.
        yield _make_chunk("", chunk_id, model, role="assistant")

        try:
            # ── Check if a prescription is currently being processed ──
            try:
                rx_flag = await _redis_mod.redis_client.get(f"rx_processing:{user_id}")
                if rx_flag:
                    logger.info("rx_processing active for %s — sending hold message", user_id)
                    hold_msg = "One moment, I'm analyzing your prescription."
                    for chunk in _stream_tts_chunks(hold_msg, chunk_id, model):
                        yield chunk
                    return
            except Exception as e:
                logger.warning("rx_processing check failed: %s", e)

            # ── Execute unified chat pipeline ─────────────────────────
            # CRITICAL: We use async_session_factory() which does NOT
            # auto-commit. We must explicitly commit() after
            # process_chat_message() so that DB writes (messages, thread
            # state) are actually persisted.
            t0 = time.time()
            logger.info("[custom_llm] Passing to chat_service for user=%s msg=%r", user_id, user_message[:60])

            async with async_session_factory() as db:
                # Resolve or create the thread BEFORE calling
                # process_chat_message. The chat service requires a valid
                # conversation_id that maps to an existing ChatThread row.
                resolved_thread_id = await _resolve_or_create_thread(user_id, thread_id, db)
                await db.commit()  # Persist the new thread if created

                chat_result = await asyncio.wait_for(
                    process_chat_message(
                        user_id=user_id,
                        message=user_message,
                        conversation_id=resolved_thread_id,
                        db=db,
                    ),
                    timeout=workflow_timeout_sec,
                )
                # CRITICAL: Explicitly commit — async_session_factory()
                # does NOT auto-commit like the get_db() FastAPI dependency.
                await db.commit()

            logger.info("Chat service complete in %.2fs", time.time() - t0)

            response_message = chat_result.get("message", "I'm sorry, could you repeat that?")
            action = chat_result.get("action", "chat")
            turn_seq = await _next_turn_seq(user_id)

            # Broadcast UI state to dashboard via Redis side-channel
            side_channel = {
                "action": action,
                "quote": chat_result.get("quote"),
                "payment": chat_result.get("payment"),
                "recommendations": chat_result.get("recommendations"),
                "ui_payload": chat_result.get("ui_payload"),
                "conversation_id": resolved_thread_id,
                "turn_seq": turn_seq,
                "ts": time.time(),
                "voice_pause": action == "request_payment",
                "trace_id": chat_result.get("trace_id", ""),
            }
            try:
                await _redis_mod.redis_client.set(
                    f"voice_state:{user_id}",
                    json.dumps(side_channel),
                    ex=300,
                )
            except Exception as e:
                logger.warning("Redis side-channel write failed: %s", e)

            # Stream the TTS response back to ElevenLabs
            for chunk in _stream_tts_chunks(response_message, chunk_id, model):
                yield chunk

        except asyncio.TimeoutError:
            logger.warning(
                "Workflow timeout after %.2fs for user=%s thread=%s",
                workflow_timeout_sec,
                user_id,
                thread_id,
            )
            timeout_msg = "I am still checking that. Please repeat in one short sentence so I can respond faster."
            for chunk in _stream_tts_chunks(timeout_msg, chunk_id, model):
                yield chunk

        except ServiceError as e:
            # ServiceError from process_chat_message (e.g. model unavailable)
            logger.error("Chat service error for voice user=%s: %s", user_id, e.message)
            error_msg = "I'm having a bit of trouble processing that. Could you try again?"
            for chunk in _stream_tts_chunks(error_msg, chunk_id, model):
                yield chunk

        except BaseException as e:
            logger.error("ElevenLabs LLM error: %s", e, exc_info=True)
            yield _make_chunk("I'm having trouble right now. Could you try again?", chunk_id, model)
            yield _make_chunk(None, chunk_id, model, finish_reason="stop")
            yield _make_done()

    return _sse_response(event_stream())
