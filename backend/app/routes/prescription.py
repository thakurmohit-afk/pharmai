"""Prescription routes - GPT-4o Vision OCR + chat pipeline integration."""

import json
import logging
import time

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.services.prescription_service import process_prescription_upload
import app.redis_client as _redis_mod

logger = logging.getLogger("pharmacy.prescription")

router = APIRouter(prefix="/api/prescription", tags=["prescription"])
MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8 MB
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}

# ── Redis key helpers ─────────────────────────────────────────────────────
_UPLOAD_LOCK_TTL = 30  # seconds — prevents duplicate uploads
_RX_STATE_TTL = 600    # seconds — lifecycle state persists for 10 min


def _rx_processing_key(user_id: str) -> str:
    return f"rx_processing:{user_id}"


def _rx_upload_lock_key(user_id: str) -> str:
    return f"rx_upload_lock:{user_id}"


def _rx_state_key(user_id: str) -> str:
    return f"rx_state:{user_id}"


async def _set_rx_state(user_id: str, state: str) -> None:
    """Set prescription lifecycle state: uploading | analyzing | analyzed | verified | rejected."""
    try:
        await _redis_mod.redis_client.set(
            _rx_state_key(user_id),
            json.dumps({"state": state, "ts": time.time()}),
            ex=_RX_STATE_TTL,
        )
    except Exception as e:
        logger.warning("Failed to set rx_state=%s: %s", state, e)


@router.post("/upload")
async def upload_prescription(
    image_file: UploadFile = File(...),
    conversation_id: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload prescription image -> OCR -> optionally feed into chat pipeline.

    When `conversation_id` is provided, the extracted medicines are matched
    against the medicine DB and routed through the pharmacist pipeline so
    GPT can respond naturally. Returns the same shape as /api/chat.

    When `conversation_id` is omitted, returns the raw extraction result
    (for dashboard / standalone use).
    """
    content_type = (image_file.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=415,
            detail={
                "code": "invalid_image_type",
                "message": "image_file must be one of: image/jpeg, image/png, image/webp.",
            },
        )

    image_bytes = await image_file.read()
    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail={"code": "empty_image", "message": "Uploaded image file is empty."},
        )

    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail={"code": "image_too_large", "message": "Image file exceeds 8 MB limit."},
        )

    user_id = str(current_user.user_id)
    rx_key = _rx_processing_key(user_id)
    lock_key = _rx_upload_lock_key(user_id)

    # ── Idempotent upload guard ───────────────────────────────────────────
    # If another upload is already in flight, reject to prevent duplicate
    # AI responses and stacked "checking your prescription" messages.
    try:
        existing_lock = await _redis_mod.redis_client.get(lock_key)
        if existing_lock:
            logger.info("Upload lock active for user %s — rejecting duplicate upload", user_id)
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "upload_in_progress",
                    "message": "A prescription is already being processed. Please wait.",
                },
            )
        await _redis_mod.redis_client.set(lock_key, "1", ex=_UPLOAD_LOCK_TTL)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Upload lock check failed (proceeding anyway): %s", e)

    # Signal to voice LLM that a prescription is being processed
    try:
        await _redis_mod.redis_client.set(rx_key, "1", ex=60)
    except Exception as e:
        logger.warning("Failed to set rx_processing flag: %s", e)

    await _set_rx_state(user_id, "uploading")

    try:
        await _set_rx_state(user_id, "analyzing")

        result = await process_prescription_upload(
            user_id=user_id,
            image_bytes=image_bytes,
            filename=image_file.filename or "prescription.jpg",
            db=db,
        )
        if not result.get("success"):
            await _set_rx_state(user_id, "rejected")
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "prescription_processing_failed",
                    "message": result.get("error", "Could not process prescription image."),
                },
            )

        await _set_rx_state(user_id, "analyzed")

        # Cache extracted prescription data for voice workflow to pick up
        try:
            await _redis_mod.redis_client.set(
                f"rx_result:{user_id}",
                json.dumps({
                    "medicines": result.get("extracted_medicines", []),
                    "advice": result.get("advice", []),
                }),
                ex=_RX_STATE_TTL,
            )
        except Exception as e:
            logger.warning("Failed to cache rx_result: %s", e)

        # If no conversation_id, return raw extraction (dashboard use)
        if not conversation_id:
            return result

        # ── Chat pipeline integration ─────────────────────────────────────
        # Feed extracted + DB-matched medicines into the pharmacist workflow
        # so GPT responds naturally about the prescription contents.
        from app.services.chat_service import process_chat_message_with_prescription

        chat_response = await process_chat_message_with_prescription(
            user_id=user_id,
            conversation_id=conversation_id,
            prescription_medicines=result.get("extracted_medicines", []),
            prescription_advice=result.get("advice", []),
            db=db,
        )

        # Merge prescription metadata into the chat response
        chat_response["prescription"] = {
            "prescription_id": result.get("prescription_id"),
            "confidence": result.get("confidence", 0),
            "doctor_name": result.get("doctor_name"),
            "prescription_date": result.get("prescription_date"),
            "medicines": result.get("extracted_medicines", []),
            "advice": result.get("advice", []),
            "summary": result.get("summary", ""),
        }

        await _set_rx_state(user_id, "verified")
        return chat_response
    finally:
        # Clear the processing flag so voice LLM resumes normal behavior
        try:
            await _redis_mod.redis_client.delete(rx_key)
        except Exception:
            pass
        # Release the upload lock
        try:
            await _redis_mod.redis_client.delete(lock_key)
        except Exception:
            pass
