"""Chat service that orchestrates workflow, thread persistence, and memory."""

from datetime import datetime, timedelta, timezone
import json
import logging
from typing import Optional

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.graph import run_pharmacy_workflow
from app.agents.pending_state import (
    empty_pending_state,
    normalize_pending_state,
)
from app.agents.quote_utils import (
    canonical_medicines_from_quote,
    quote_lines,
)
from app.config import get_settings
from app.errors import ServiceError
from app.models.chat import ChatMessage, ChatThread, ChatThreadState, UserMemory
from app.services.openai_client import get_async_openai_client
from app.services.rich_payload import (
    build_payment_payload,
    build_quote_payload,
    build_recommendations_payload,
    build_ui_payload,
)
import app.redis_client as _redis_mod

logger = logging.getLogger("pharmacy.services.chat")
_PENDING_META_KEY = "__pending_meta__"


def _extract_waitlist_items(state: dict) -> list[dict]:
    """Extract waitlist subscription info from inventory_check state."""
    inv = state.get("inventory_check")
    if not isinstance(inv, dict):
        return []
    items = []
    for item_status in (inv.get("items_status") or []):
        if not isinstance(item_status, dict):
            continue
        if item_status.get("waitlist_subscribed"):
            items.append({
                "medicine_name": item_status.get("medicine_name", ""),
                "medicine_id": item_status.get("medicine_id", ""),
                "notification_method": "email",
            })
    return items


async def _resolve_thread(
    user_id: str,
    conversation_id: Optional[str],
    db: AsyncSession,
) -> ChatThread:
    result = await db.execute(
        select(ChatThread).where(
            ChatThread.thread_id == conversation_id,
            ChatThread.user_id == user_id,
        )
    )
    thread = result.scalar_one_or_none()
    if thread:
        return thread
    logger.warning(
        "chat_error user_id=%s conversation_id=%s error_code=conversation_not_found trace_id=%s",
        user_id,
        conversation_id,
        "",
    )
    raise ServiceError(
        status_code=404,
        code="conversation_not_found",
        message="Conversation not found or not owned by this user.",
    )


async def _load_thread_state(
    thread_id: str,
    db: AsyncSession,
) -> tuple[ChatThreadState | None, dict]:
    try:
        result = await db.execute(select(ChatThreadState).where(ChatThreadState.thread_id == thread_id))
        row = result.scalar_one_or_none()
        if not row:
            return None, empty_pending_state()
        return (
            row,
            normalize_pending_state(
                {
                    "pending_quote": row.pending_quote if isinstance(row.pending_quote, dict) else {},
                    "pending_medicines": (
                        row.pending_medicines if isinstance(row.pending_medicines, list) else []
                    ),
                    "quantity_resolved": bool(row.quantity_resolved),
                }
            ),
        )
    except SQLAlchemyError as err:
        logger.warning("Thread-state table unavailable, falling back to stateless flow: %s", err)
        return None, empty_pending_state()


async def _save_thread_state(
    thread_id: str,
    db: AsyncSession,
    row: ChatThreadState | None,
    pending_state: object,
) -> None:
    normalized = normalize_pending_state(pending_state)
    if not normalized["pending_medicines"] and quote_lines(normalized["pending_quote"]):
        normalized["pending_medicines"] = canonical_medicines_from_quote(normalized["pending_quote"])
    has_pending = (
        bool(normalized["pending_medicines"])
        or bool(quote_lines(normalized["pending_quote"]))
        or bool(normalized.get("payment_requested"))
    )
    try:
        if not has_pending:
            if row is not None:
                await db.delete(row)
            return

        if row is None:
            row = ChatThreadState(thread_id=thread_id)

        quote_to_store = dict(normalized["pending_quote"])
        quote_to_store[_PENDING_META_KEY] = {
            "quantity_resolved": bool(normalized["quantity_resolved"]),
            "awaiting_confirmation": bool(normalized["awaiting_confirmation"]),
            "confirmation_prompted_once": bool(normalized["confirmation_prompted_once"]),
            "quote_signature": normalized["quote_signature"],
            "last_confirmation_intent": normalized["last_confirmation_intent"],
            "last_confirmation_confidence": float(normalized["last_confirmation_confidence"]),
            "payment_requested": bool(normalized.get("payment_requested", False)),
            "payment_order_id": str(normalized.get("payment_order_id", "") or ""),
        }

        row.pending_quote = quote_to_store
        row.pending_medicines = normalized["pending_medicines"]
        row.quantity_resolved = bool(normalized["quantity_resolved"])
        db.add(row)
    except SQLAlchemyError as err:
        logger.warning("Unable to persist thread state; continuing without persistence: %s", err)


async def _load_history_from_db(thread_id: str, db: AsyncSession, limit: int = 20) -> list[dict]:
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread_id)
        .order_by(ChatMessage.created_at.asc())
    )
    messages = result.scalars().all()
    return [{"role": msg.role, "content": msg.content} for msg in messages[-limit:]]


async def _load_user_memory(user_id: str, db: AsyncSession) -> UserMemory:
    result = await db.execute(select(UserMemory).where(UserMemory.user_id == user_id))
    memory = result.scalar_one_or_none()
    if memory:
        return memory

    memory = UserMemory(user_id=user_id, summary_text="", turns_since_refresh=0)
    db.add(memory)
    await db.flush()
    return memory


async def _summarize_memory(
    previous_summary: str,
    history: list[dict],
) -> str | None:
    settings = get_settings(force_refresh=True)
    if settings.mock_mode or not settings.openai_api_key:
        return previous_summary

    transcript_lines = []
    for msg in history[-24:]:
        role = msg.get("role", "user")
        if role not in {"user", "assistant", "bot"}:
            continue
        label = "User" if role == "user" else "Assistant"
        transcript_lines.append(f"{label}: {msg.get('content', '')}")

    if not transcript_lines:
        return previous_summary

    prompt = (
        "You maintain long-term memory for a pharmacy assistant. "
        "Produce a concise, factual memory summary in <= 120 words. "
        "Include persistent preferences, chronic conditions, recurring meds, and notable safety context. "
        "Do not include transient greetings."
    )
    user_content = (
        f"Previous summary:\n{previous_summary or 'None'}\n\n"
        f"Recent transcript:\n" + "\n".join(transcript_lines)
    )
    try:
        response = await get_async_openai_client(force_refresh=True).chat.completions.create(
            model="gpt-5.2",
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.2,
            max_completion_tokens=220,
        )
        new_summary = (response.choices[0].message.content or "").strip()
        if not new_summary:
            return previous_summary
        return new_summary[:1200]
    except Exception as err:
        logger.warning("User memory summarization failed: %s", err)
        return previous_summary


async def process_chat_message(
    user_id: str,
    message: str,
    conversation_id: Optional[str],
    db: AsyncSession,
) -> dict:
    """Run message through workflow using authenticated user + persisted thread memory."""
    logger.info(
        "chat_request user_id=%s conversation_id=%s message_len=%d",
        user_id,
        conversation_id,
        len((message or "").strip()),
    )
    settings = get_settings()
    if not conversation_id:
        logger.warning(
            "chat_error user_id=%s conversation_id=%s error_code=conversation_required trace_id=%s",
            user_id,
            conversation_id,
            "",
        )
        raise ServiceError(
            status_code=422,
            code="conversation_required",
            message="conversation_id is required. Create/select a thread first.",
        )
    thread = await _resolve_thread(user_id=user_id, conversation_id=conversation_id, db=db)
    conversation_id = str(thread.thread_id)
    cache_key = f"thread:{conversation_id}:last20"

    conversation_history: list[dict] = []
    try:
        cached = await _redis_mod.redis_client.get(cache_key)
        if cached:
            conversation_history = json.loads(cached)
    except Exception as err:
        logger.warning("Redis read failed (non-critical): %s", err)

    if not conversation_history:
        conversation_history = await _load_history_from_db(conversation_id, db, limit=20)

    thread_state_row, pending_state = await _load_thread_state(conversation_id, db)

    user_memory = await _load_user_memory(user_id, db)
    workflow_history = list(conversation_history[-12:])
    if user_memory.summary_text:
        workflow_history.insert(
            0,
            {
                "role": "system",
                "content": f"Long-term user memory: {user_memory.summary_text}",
            },
        )

    workflow_history.append({"role": "user", "content": message})

    state = await run_pharmacy_workflow(
        user_id=user_id,
        message=message,
        conversation_history=workflow_history,
        db=db,
        pending_state=pending_state,
    )

    if state.get("error_code"):
        logger.error(
            "chat_error user_id=%s conversation_id=%s error_code=%s trace_id=%s",
            user_id,
            conversation_id,
            state.get("error_code"),
            state.get("trace_id", ""),
        )
        # Return a graceful response instead of raising an HTTP error.
        # This prevents the frontend from silently deleting the user's message.
        error_message = str(
            state.get("error_message")
            or "I'm having trouble connecting to my AI service right now. Please try again in a moment."
        )
        # Still persist the user message so conversation history stays intact
        db.add(ChatMessage(thread_id=thread.thread_id, role="user", content=message))
        db.add(ChatMessage(
            thread_id=thread.thread_id, role="assistant", content=error_message,
            msg_metadata={"trace_id": state.get("trace_id", ""), "error_code": state.get("error_code")},
        ))
        thread.updated_at = datetime.now(timezone.utc)
        try:
            await db.commit()
        except Exception:
            pass
        return {
            "message": error_message,
            "conversation_id": conversation_id,
            "trace_id": state.get("trace_id", ""),
            "action": "chat",
            "needs_clarification": False,
            "confidence": 0.0,
            "payment": None,
            "quote": None,
            "prescription": None,
            "recommendations": [],
            "ui_payload": {"type": "none", "data": {}},
            "agent_actions": [],
            "pipeline_steps": state.get("pipeline_steps", []),
        }

    response_message = state.get("response_message", "I'm sorry, I couldn't process that.")
    trace_id = state.get("trace_id", "")
    final_decision = state.get("final_decision", {})
    execution_result = state.get("execution_result", {})
    needs_clarification = final_decision.get("needs_clarification", False)
    confidence = final_decision.get("combined_confidence", 0.0)
    action = final_decision.get("action", "chat")
    pipeline_steps = state.get("pipeline_steps", [])
    raw_quote = state.get("quote")
    raw_pending_state = normalize_pending_state(state.get("pending_state"))

    agent_actions = []
    for step in pipeline_steps:
        if step.get("status") in ("completed", "blocked"):
            agent_actions.append(
                {
                    "agent": step["id"],
                    "status": step["status"],
                    "duration_ms": step.get("duration_ms", 0),
                    **step.get("output", {}),
                }
            )

    db.add(ChatMessage(thread_id=thread.thread_id, role="user", content=message))
    trace_meta = {
        "trace_id": trace_id,
        "action": action,
        "confidence": round(confidence, 3),
        "pipeline_steps": pipeline_steps,
        "safety_decision": (state.get("safety_check") or {}).get("decision"),
        "needs_clarification": needs_clarification,
    }
    db.add(ChatMessage(thread_id=thread.thread_id, role="assistant", content=response_message, msg_metadata=trace_meta))
    thread.updated_at = datetime.now(timezone.utc)
    await _save_thread_state(conversation_id, db, thread_state_row, raw_pending_state)

    raw_history_for_cache = conversation_history + [
        {"role": "user", "content": message},
        {"role": "assistant", "content": response_message},
    ]
    try:
        await _redis_mod.redis_client.set(cache_key, json.dumps(raw_history_for_cache[-20:]), ex=3600)
    except Exception as err:
        logger.warning("Redis write failed (non-critical): %s", err)

    user_memory.turns_since_refresh = (user_memory.turns_since_refresh or 0) + 1
    if user_memory.turns_since_refresh >= settings.chat_summary_refresh_turns:
        summary = await _summarize_memory(user_memory.summary_text or "", raw_history_for_cache[-24:])
        if summary is not None:
            user_memory.summary_text = summary
            user_memory.turns_since_refresh = 0

    if settings.chat_history_retention_days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=settings.chat_history_retention_days)
        await db.execute(
            delete(ChatMessage).where(
                ChatMessage.thread_id == thread.thread_id,
                ChatMessage.created_at < cutoff,
            )
        )

    payment = build_payment_payload(action, execution_result)
    quote = build_quote_payload(raw_quote)
    recommendations = build_recommendations_payload(state.get("recommendations"))

    # When a confirmed order (quote with resolved lines) exists,
    # suppress recommendations so the frontend renders OrderSummaryCard, not MedicineSuggestionCard.
    if quote and quote.get("lines") and action in ("confirm_order", "proceed"):
        recommendations = []

    ui_payload = build_ui_payload(
        action=action,
        quote=quote,
        payment=payment,
        recommendations=recommendations,
        safety_check=state.get("safety_check") if isinstance(state.get("safety_check"), dict) else {},
        order_id=str((execution_result or {}).get("order_id") or ""),
        waitlist_items=_extract_waitlist_items(state),
    )

    logger.info(
        "chat_response user_id=%s conversation_id=%s action=%s trace_id=%s quote_signature=%s awaiting_confirmation=%s",
        user_id,
        conversation_id,
        action,
        trace_id,
        raw_pending_state.get("quote_signature", ""),
        bool(raw_pending_state.get("awaiting_confirmation")),
    )

    return {
        "message": response_message,
        "conversation_id": conversation_id,
        "trace_id": trace_id,
        "action": action,
        "needs_clarification": needs_clarification,
        "confidence": round(confidence, 3),
        "payment": payment,
        "quote": quote,
        "recommendations": recommendations,
        "ui_payload": ui_payload,
        "agent_actions": agent_actions,
        "pipeline_steps": pipeline_steps,
    }


async def process_chat_message_with_prescription(
    user_id: str,
    conversation_id: str,
    prescription_medicines: list[dict],
    prescription_advice: list[dict] | None = None,
    db: AsyncSession = None,
) -> dict:
    """Route a prescription upload through the chat pipeline.

    Instead of showing a static "Medicines found: X, Y" message, this
    injects the matched prescription data into the pharmacist workflow
    so GPT can respond naturally about the prescription contents.
    """
    # Build a synthetic user message for the conversation history
    med_names = [m.get("name", "Unknown") for m in prescription_medicines if m.get("name")]
    synthetic_message = (
        f"I uploaded a prescription with these medicines: {', '.join(med_names)}."
        if med_names
        else "I uploaded a prescription."
    )

    # Reuse the same thread/history/memory loading as process_chat_message
    thread = await _resolve_thread(user_id=user_id, conversation_id=conversation_id, db=db)
    conversation_id = str(thread.thread_id)
    cache_key = f"thread:{conversation_id}:last20"

    conversation_history: list[dict] = []
    try:
        cached = await _redis_mod.redis_client.get(cache_key)
        if cached:
            conversation_history = json.loads(cached)
    except Exception as err:
        logger.warning("Redis read failed (non-critical): %s", err)

    if not conversation_history:
        conversation_history = await _load_history_from_db(conversation_id, db, limit=20)

    thread_state_row, pending_state = await _load_thread_state(conversation_id, db)
    user_memory = await _load_user_memory(user_id, db)

    workflow_history = list(conversation_history[-12:])
    if user_memory.summary_text:
        workflow_history.insert(
            0,
            {"role": "system", "content": f"Long-term user memory: {user_memory.summary_text}"},
        )
    workflow_history.append({"role": "user", "content": synthetic_message})

    # Bundle medicines + advice into prescription_context for the pipeline
    prescription_context = {
        "medicines": prescription_medicines,
        "advice": prescription_advice or [],
    }

    # Run the pipeline with prescription context injected
    state = await run_pharmacy_workflow(
        user_id=user_id,
        message=synthetic_message,
        conversation_history=workflow_history,
        db=db,
        pending_state=pending_state,
        prescription_context=prescription_context,
    )

    if state.get("error_code"):
        raise ServiceError(
            status_code=int(state.get("error_status") or 503),
            code=str(state.get("error_code")),
            message=str(state.get("error_message") or "Model service unavailable."),
            extra={"trace_id": state.get("trace_id", "")},
        )

    response_message = state.get("response_message", "I'm sorry, I couldn't process that.")
    trace_id = state.get("trace_id", "")
    final_decision = state.get("final_decision", {})
    action = final_decision.get("action", "chat")
    execution_result = state.get("execution_result", {})
    pipeline_steps = state.get("pipeline_steps", [])
    raw_quote = state.get("quote")
    raw_pending_state = normalize_pending_state(state.get("pending_state"))

    # Persist messages
    db.add(ChatMessage(thread_id=thread.thread_id, role="user", content=synthetic_message))

    meta = {
        "trace_id": trace_id,
        "action": action,
        "confidence": round(final_decision.get("combined_confidence", 0.0), 3),
        "pipeline_steps": pipeline_steps,
        "safety_decision": (state.get("safety_check") or {}).get("decision"),
    }
    if prescription_medicines or prescription_advice:
        meta["prescription"] = {
            "medicines": prescription_medicines,
            "advice": prescription_advice or [],
        }

    db.add(ChatMessage(thread_id=thread.thread_id, role="assistant", content=response_message, msg_metadata=meta))
    thread.updated_at = datetime.now(timezone.utc)
    await _save_thread_state(conversation_id, db, thread_state_row, raw_pending_state)

    # Update cache
    raw_history_for_cache = conversation_history + [
        {"role": "user", "content": synthetic_message},
        {"role": "assistant", "content": response_message},
    ]
    try:
        await _redis_mod.redis_client.set(cache_key, json.dumps(raw_history_for_cache[-20:]), ex=3600)
    except Exception as err:
        logger.warning("Redis write failed (non-critical): %s", err)

    payment = build_payment_payload(action, execution_result)
    # ── Suppress quote and recommendations on initial prescription upload ──
    # The user just uploaded a prescription — they should see the prescription
    # analysis card and a conversational message about the detected medicines,
    # NOT an immediate order summary or medicine suggestion cards.
    # The quote/recommendations will appear naturally when the user explicitly
    # asks to order specific medicines from the prescription.
    quote = None
    recommendations = []
    ui_payload = {"type": "none", "data": {}}

    return {
        "message": response_message,
        "conversation_id": conversation_id,
        "trace_id": trace_id,
        "action": "chat",  # Force "chat" action so no order_summary card renders
        "needs_clarification": final_decision.get("needs_clarification", False),
        "confidence": round(final_decision.get("combined_confidence", 0.0), 3),
        "payment": payment,
        "quote": quote,
        "recommendations": recommendations,
        "ui_payload": ui_payload,
        "agent_actions": [
            {"agent": s["id"], "status": s["status"], "duration_ms": s.get("duration_ms", 0), **s.get("output", {})}
            for s in pipeline_steps
            if s.get("status") in ("completed", "blocked")
        ],
        "pipeline_steps": pipeline_steps,
    }
