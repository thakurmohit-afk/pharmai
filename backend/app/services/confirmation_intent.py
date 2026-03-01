"""GPT-based confirmation intent classification for pending order turns."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from app.services.openai_client import classify_openai_error, get_async_openai_client

logger = logging.getLogger("pharmacy.services.confirmation_intent")


def _env_float(name: str, default: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default
    return max(1.0, value)


_TIMEOUT_SEC = _env_float("CONFIRMATION_INTENT_TIMEOUT_SEC", 3.5)


def _quote_context(quote: dict | None) -> str:
    if not isinstance(quote, dict):
        return "No quote context available."

    lines = quote.get("lines", [])
    if not isinstance(lines, list):
        lines = []

    parts: list[str] = []
    for line in lines:
        if not isinstance(line, dict):
            continue
        parts.append(
            (
                f"- {line.get('name', 'Medicine')}: "
                f"{int(line.get('billing_qty') or 1)} strip(s) x "
                f"Rs.{float(line.get('unit_price') or 0):.2f}"
            )
        )

    total = float(quote.get("total_amount") or 0.0)
    currency = str(quote.get("currency") or "INR")
    if parts:
        return "Quote summary:\n" + "\n".join(parts) + f"\nTotal: {currency} {total:.2f}"
    return f"Quote total: {currency} {total:.2f}"


def _clamp_confidence(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, number))


async def classify_confirmation_intent(
    message: str,
    pending_quote: dict | None,
    conversation_history: list | None = None,
) -> dict:
    """Classify pending-order reply as confirm/cancel/unclear using GPT only."""
    history = conversation_history or []
    recent_turns: list[dict[str, str]] = []
    for turn in history[-6:]:
        role = str(turn.get("role", "user"))
        content = str(turn.get("content", ""))
        if role in {"bot", "assistant"}:
            role = "assistant"
        elif role != "user":
            continue
        recent_turns.append({"role": role, "content": content})

    system_prompt = (
        "You classify a user's reply to a pending pharmacy order.\n"
        "Return strict JSON only with keys: intent, confidence, message.\n"
        "intent must be one of: confirm, cancel, unclear.\n"
        "Interpret colloquial natural confirmations and cancellations.\n"
        "Do not require exact phrases.\n"
        "Examples: 'yes', 'yessir', 'obv yes', 'go ahead', 'proceed', 'confirm' -> confirm.\n"
        "Examples: 'add to cart', 'add to cad', 'cart it', 'add it', 'cart', 'put in cart' -> confirm.\n"
        "Examples: 'nah', 'leave it', 'cancel', 'not now' -> cancel.\n"
        "Examples: 'hmm', 'wait', unrelated text -> unclear.\n"
        "message MUST be empty string for confirm and cancel intent.\n"
        "message should be a short clarifying question only for unclear intent.\n"
        "NEVER include prices, totals, or order details in message — the backend handles those."
    )

    user_prompt = (
        f"{_quote_context(pending_quote)}\n\n"
        f"Latest user message:\n{message}\n\n"
        "Classify the user's intent for this pending order."
    )

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(recent_turns)
    messages.append({"role": "user", "content": user_prompt})

    try:
        response = await asyncio.wait_for(
            get_async_openai_client(force_refresh=True).chat.completions.create(
                model="gpt-5.2",
                messages=messages,
                temperature=0.0,
                max_completion_tokens=120,
                response_format={"type": "json_object"},
            ),
            timeout=_TIMEOUT_SEC,
        )
        content = (response.choices[0].message.content or "").strip()
        parsed = json.loads(content) if content else {}
    except Exception as err:
        code, status, message_text = classify_openai_error(err)
        logger.warning("Confirmation intent classification failed: %s", err)
        return {
            "intent": "unclear",
            "confidence": 0.0,
            "message": message_text,
            "infra_error": True,
            "error_code": code,
            "error_status": status,
        }

    intent = str(parsed.get("intent", "unclear")).strip().lower()
    if intent not in {"confirm", "cancel", "unclear"}:
        intent = "unclear"

    return {
        "intent": intent,
        "confidence": _clamp_confidence(parsed.get("confidence")),
        "message": str(parsed.get("message", "")).strip() if parsed.get("message") else "",
    }
