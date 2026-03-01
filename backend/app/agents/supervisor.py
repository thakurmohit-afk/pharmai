"""Agent 6: Decision Arbitration (Supervisor) Agent.

Aggregates all agent outputs, calculates combined confidence,
and decides: proceed / clarify / reject / negotiate.
"""

import json
import logging

from app.config import get_settings
from app.langfuse_client import observe, get_langfuse
from app.agents.state import PharmacyState
from app.services.openai_client import get_async_openai_client

logger = logging.getLogger("pharmacy.agents.supervisor")
settings = get_settings()

# Confidence weights
WEIGHT_UNDERSTANDING = 0.25
WEIGHT_SAFETY = 0.35
WEIGHT_INVENTORY = 0.25
WEIGHT_CONTEXT = 0.15

SUPERVISOR_PROMPT = """You are the Decision Arbitration Agent for a pharmacy ordering system. 
Given the aggregated output of all upstream agents, decide the next action.

Your inputs:
- Understanding intent with confidence score
- User profile and context
- Safety check results (allow / hard_block / soft_block)
- Inventory check results (available / strategy)
- Prediction data (refill alerts)

Decision rules:
1. If safety_check.decision == "hard_block" → action: "reject", compose a polite rejection with options
2. If safety_check.decision == "soft_block" or inventory needs negotiation → action: "negotiate", compose negotiation message
3. If combined_confidence < 0.7 OR risk is high → action: "clarify", compose clarification question
4. Otherwise → action: "proceed", compose confirmation message

Your output format (JSON):
{
  "action": "proceed | clarify | reject | negotiate",
  "combined_confidence": 0.0-1.0,
  "risk_level": "low | medium | high",
  "needs_clarification": true/false,
  "reasoning": "brief explanation of your decision",
  "response_message": "the message to send to the user"
}

IMPORTANT: 
- Mirror the user's tone (formal/casual)
- For hard blocks, always offer alternatives (upload prescription, talk to pharmacist, OTC alternatives)
- For negotiations, present numbered options
- For proceeding, confirm the order details clearly
"""


@observe(name="Supervisor Decision")
async def supervisor_agent(state: PharmacyState) -> PharmacyState:
    """Aggregate all agent outputs and make final decision."""
    intent = state.get("intent", {})
    user_profile = state.get("user_profile", {})
    safety_check = state.get("safety_check", {})
    inventory_check = state.get("inventory_check", {})
    prediction = state.get("prediction", {})

    # ── Calculate combined confidence ────────────────────────────────────
    understanding_conf = state.get("understanding_confidence", 0.0)

    safety_conf = 1.0 if safety_check.get("decision") == "allow" else (
        0.5 if safety_check.get("decision") == "soft_block" else 0.0
    )

    inventory_conf = 1.0 if inventory_check.get("available") else (
        0.6 if inventory_check.get("strategy") in ("partial", "alternative") else 0.2
    )

    context_conf = 0.8 if user_profile.get("exists") else 0.4

    combined = (
        WEIGHT_UNDERSTANDING * understanding_conf
        + WEIGHT_SAFETY * safety_conf
        + WEIGHT_INVENTORY * inventory_conf
        + WEIGHT_CONTEXT * context_conf
    )

    # ── Fast-path decisions (no LLM needed) ──────────────────────────────
    # 1. Hard block → reject immediately
    if safety_check.get("decision") == "hard_block":
        blocked = safety_check.get("blocked_items", [])
        block_reasons = [b.get("reason", "") for b in blocked]
        block_type = blocked[0].get("type", "unknown") if blocked else "unknown"

        if block_type == "prescription_required":
            message = (
                "Hey! This medicine requires a prescription. Would you like to:\n"
                "1. Upload a prescription now\n"
                "2. Talk to our pharmacist\n"
                "3. Browse similar OTC alternatives"
            )
        else:
            message = f"Sorry, we can't process this order: {'; '.join(block_reasons)}"

        state["final_decision"] = {
            "action": "reject",
            "combined_confidence": combined,
            "risk_level": "high",
            "needs_clarification": False,
            "reasoning": f"Hard block: {'; '.join(block_reasons)}",
        }
        state["response_message"] = message
        logger.info(f"Supervisor: REJECT (hard block), confidence={combined:.2f}")
        return state

    # 2. Needs clarification (low understanding confidence)
    if understanding_conf < 0.6 or intent.get("needs_clarification"):
        clarification = intent.get(
            "clarification_question",
            "Could you please clarify which medicine you need?"
        )
        state["final_decision"] = {
            "action": "clarify",
            "combined_confidence": combined,
            "risk_level": "medium",
            "needs_clarification": True,
            "reasoning": f"Understanding confidence too low ({understanding_conf:.2f})",
        }
        state["response_message"] = clarification
        logger.info(f"Supervisor: CLARIFY, confidence={combined:.2f}")
        return state

    # ── LLM decision for negotiate / proceed ─────────────────────────────
    try:
        context_payload = {
            "intent": intent,
            "safety_check": {
                "decision": safety_check.get("decision"),
                "soft_blocks": safety_check.get("soft_blocks", []),
            },
            "inventory": {
                "available": inventory_check.get("available"),
                "strategy": inventory_check.get("strategy"),
                "negotiation": inventory_check.get("negotiation"),
                "alternatives": inventory_check.get("alternatives", [])[:3],
            },
            "prediction": {
                "refill_suggestions": prediction.get("refill_suggestions", []),
            },
            "user_name": user_profile.get("name", "there"),
            "combined_confidence": round(combined, 3),
        }

        response = await get_async_openai_client(force_refresh=True).chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[
                {"role": "system", "content": SUPERVISOR_PROMPT},
                {"role": "user", "content": json.dumps(context_payload)},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_completion_tokens=800,
        )

        decision = json.loads(response.choices[0].message.content)
        decision.setdefault("combined_confidence", combined)
        decision.setdefault("needs_clarification", decision.get("action") == "clarify")

        state["final_decision"] = decision
        state["response_message"] = decision.get(
            "response_message", "I'll process your order now."
        )

        # Log decision to LangFuse
        langfuse = get_langfuse()
        langfuse.trace(
            name="Supervisor Decision",
            metadata={
                "user_id": state.get("user_id"),
                "combined_confidence": combined,
                "action": decision.get("action"),
                "risk_level": decision.get("risk_level"),
            },
        )

        logger.info(
            f"Supervisor: {decision.get('action', 'unknown').upper()}, "
            f"confidence={combined:.2f}"
        )

    except Exception as e:
        logger.error(f"Supervisor agent error: {e}")
        # Fallback: if we got this far without hard blocks, try to proceed
        state["final_decision"] = {
            "action": "proceed" if combined >= 0.7 else "clarify",
            "combined_confidence": combined,
            "risk_level": "medium",
            "needs_clarification": combined < 0.7,
            "reasoning": f"Fallback decision due to error: {e}",
        }
        state["response_message"] = (
            "Let me confirm your order details."
            if combined >= 0.7
            else "Could you please confirm the medicine and quantity?"
        )

    return state
