"""Voice routes - Whisper STT, TTS, and authenticated voice token minting."""

import json
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.dependencies.auth import get_current_user
from app.database import get_db
from app.errors import ServiceError
from app.models.user import User
from app.schemas.auth import VoiceTokenResponse
from app.security import create_voice_token
from app.services.voice_service import text_to_speech_stream, transcribe_audio
from app.services.chat_service import process_chat_message
import app.redis_client as _redis_mod
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/voice", tags=["voice"])
MAX_AUDIO_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/upload")
async def upload_voice(audio_file: UploadFile = File(...)):
    """Transcribe uploaded audio via OpenAI Whisper."""
    content_type = (audio_file.content_type or "").lower()
    if not content_type.startswith("audio/"):
        raise HTTPException(
            status_code=415,
            detail={
                "code": "invalid_audio_type",
                "message": "audio_file must be an audio/* MIME type.",
            },
        )

    audio_bytes = await audio_file.read()
    if not audio_bytes:
        raise HTTPException(
            status_code=400,
            detail={"code": "empty_audio", "message": "Uploaded audio file is empty."},
        )

    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=413,
            detail={"code": "audio_too_large", "message": "Audio file exceeds 10 MB limit."},
        )

    result = await transcribe_audio(audio_bytes, audio_file.filename or "audio.webm")
    if not result.get("success"):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "transcription_failed",
                "message": result.get("error", "Voice transcription failed."),
            },
        )
    return result


@router.get("/speak")
async def speak(text: str = Query(..., min_length=1)):
    """Stream TTS audio from ElevenLabs."""
    audio_stream = text_to_speech_stream(text)
    return StreamingResponse(audio_stream, media_type="audio/mpeg")


@router.post("/token", response_model=VoiceTokenResponse)
async def voice_token(current_user: User = Depends(get_current_user)):
    """Mint short-lived token to bind ElevenLabs voice session to logged-in user."""
    settings = get_settings()
    token = create_voice_token(str(current_user.user_id))
    return {"token": token, "expires_in": settings.voice_token_ttl_sec}


@router.get("/last-action")
async def voice_last_action(current_user: User = Depends(get_current_user)):
    """One-shot read of the Redis side-channel written by the custom LLM endpoint.

    The frontend polls this after each ElevenLabs agent message to retrieve
    rich state (action, quote, payment) that can't travel through the
    audio-only ElevenLabs channel.
    """
    _log = logging.getLogger("pharmacy.voice")
    key = f"voice_state:{current_user.user_id}"
    data = await _redis_mod.redis_client.get(key)
    if not data:
        _log.debug("[last-action] key=%s => NO DATA (backend=%s, mem_entries=%d)",
                   key, _redis_mod.redis_client._backend, len(_redis_mod.redis_client._fallback_cache))
        return {"action": "none", "turn_seq": 0, "ui_payload": {"type": "none", "data": {}}}
    parsed = json.loads(data)
    _log.info("[last-action] key=%s => action=%s ui_type=%s turn_seq=%s",
              key, parsed.get("action"), parsed.get("ui_payload", {}).get("type"), parsed.get("turn_seq"))
    return parsed


@router.post("/payment-status")
async def voice_payment_status(
    data: dict,
    current_user: User = Depends(get_current_user),
):
    """Frontend notifies voice flow of payment outcome.

    Expected body: {"status": "success"|"failed"|"dismissed", "order_id": "..."}
    The voice LLM endpoint reads this to react appropriately on the next turn.
    """
    status = str(data.get("status", "")).strip()
    if status not in {"success", "failed", "dismissed"}:
        raise HTTPException(status_code=400, detail="status must be success, failed, or dismissed")
    key = f"voice_payment_result:{current_user.user_id}"
    await _redis_mod.redis_client.set(key, json.dumps(data), ex=600)
    return {"ok": True}


@router.post("/session-end")
async def voice_session_end(current_user: User = Depends(get_current_user)):
    """Clean up voice session state on disconnect."""
    uid = str(current_user.user_id)
    for key in [
        f"voice_state:{uid}",
        f"voice_turn_seq:{uid}",
        f"voice_payment_result:{uid}",
    ]:
        try:
            await _redis_mod.redis_client.delete(key)
        except Exception:
            pass
    return {"ok": True}


@router.post("/turn")
async def voice_turn(
    thread_id: str = Form(...),
    audio_file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Hybrid voice turn: Whisper STT -> chat workflow -> rich response payload."""
    content_type = (audio_file.content_type or "").lower()
    if not content_type.startswith("audio/"):
        raise HTTPException(
            status_code=415,
            detail={
                "code": "invalid_audio_type",
                "message": "audio_file must be an audio/* MIME type.",
            },
        )

    audio_bytes = await audio_file.read()
    if not audio_bytes:
        raise HTTPException(
            status_code=400,
            detail={"code": "empty_audio", "message": "Uploaded audio file is empty."},
        )
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=413,
            detail={"code": "audio_too_large", "message": "Audio file exceeds 10 MB limit."},
        )

    stt = await transcribe_audio(audio_bytes, audio_file.filename or "audio.webm")
    if not stt.get("success"):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "transcription_failed",
                "message": stt.get("error", "Voice transcription failed."),
            },
        )

    transcript = str(stt.get("transcription", "") or "").strip()
    if not transcript:
        raise HTTPException(
            status_code=400,
            detail={"code": "empty_transcription", "message": "Could not transcribe speech. Please try again."},
        )

    try:
        chat_result = await process_chat_message(
            user_id=str(current_user.user_id),
            message=transcript,
            conversation_id=thread_id,
            db=db,
        )
    except ServiceError as err:
        raise HTTPException(status_code=err.status_code, detail=err.to_detail()) from err

    return {
        "transcription": transcript,
        "language": str(stt.get("language", "en") or "en"),
        "duration": stt.get("duration"),
        **chat_result,
    }
