"""Agent 1: Conversational understanding with GPT parsing."""

import json
import logging

from app.agents.state import PharmacyState
from app.config import get_settings
from app.langfuse_client import get_langfuse, observe
from app.services.openai_client import get_async_openai_client

logger = logging.getLogger("pharmacy.agents.understanding")
settings = get_settings()

SYSTEM_PROMPT = """You are a Pharmacy Order Understanding Agent.
Extract structured medicine-ordering intent from user messages.

Return strict JSON:
{
  "items": [
    {
      "medicine_name": "best guess name",
      "dosage": "dosage or null",
      "quantity": number_or_null,
      "confidence": 0.0-1.0
    }
  ],
  "raw_query": "original message",
  "overall_confidence": 0.0-1.0,
  "needs_clarification": true/false,
  "clarification_question": "if needed",
  "detected_language": "en|hi|hinglish",
  "is_reference": true/false,
  "reference_type": "last_order|conversation_context|null"
}

Guidelines:
- Handle Indian brand names and Hinglish naturally.
- If confidence is low, ask a concise clarification question.
- If user references prior meds, set is_reference=true.
"""


@observe(name="Understanding Agent")
async def understanding_agent(state: PharmacyState) -> PharmacyState:
    """Parse user message into structured intent with confidence scores."""
    message = state.get("message", "")
    conversation_history = state.get("conversation_history", [])

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in conversation_history[-6:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("bot", "assistant"):
            role = "assistant"
        elif role not in ("user", "system"):
            role = "user"
        messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})

    try:
        response = await get_async_openai_client(force_refresh=True).chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.1,
            max_completion_tokens=900,
        )
        content = response.choices[0].message.content or "{}"
        intent = json.loads(content)

        intent.setdefault("items", [])
        intent.setdefault("overall_confidence", 0.5)
        intent.setdefault("needs_clarification", intent["overall_confidence"] < 0.6)
        intent.setdefault("raw_query", message)
        intent.setdefault(
            "clarification_question",
            "Could you please share the medicine name and quantity?",
        )
        intent.setdefault("detected_language", "en")
        intent.setdefault("is_reference", False)
        intent.setdefault("reference_type", None)

        state["intent"] = intent
        state["understanding_confidence"] = intent["overall_confidence"]
        if intent.get("is_reference"):
            state["intent"]["resolve_from_history"] = True

        try:
            langfuse = get_langfuse()
            langfuse.trace(
                name="Understanding Agent",
                metadata={
                    "confidence": intent["overall_confidence"],
                    "items": len(intent["items"]),
                    "needs_clarification": intent["needs_clarification"],
                },
            )
        except Exception:
            pass

    except Exception as err:
        logger.error("Understanding agent error: %s", err)
        state["intent"] = {
            "items": [],
            "overall_confidence": 0.0,
            "needs_clarification": True,
            "clarification_question": (
                "I could not parse that clearly. Please share the medicine name and quantity."
            ),
            "raw_query": message,
            "error": str(err),
        }
        state["understanding_confidence"] = 0.0
        state["error"] = f"Understanding agent error: {err}"

    return state
