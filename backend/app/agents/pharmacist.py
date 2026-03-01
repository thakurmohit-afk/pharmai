"""Unified GPT Pharmacist Agent with function calling + hybrid search tools."""

import asyncio
import json
import logging
import os
import re

from app.langfuse_client import get_langfuse
from app.services.openai_client import (
    classify_openai_error,
    get_async_openai_client,
)

logger = logging.getLogger("pharmacy.agents.pharmacist")


def _env_float(name: str, default: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default
    return max(1.0, value)


_MAIN_TIMEOUT_SEC = _env_float("PHARMACIST_MAIN_TIMEOUT_SEC", 7.0)


async def _create_chat_completion(timeout_sec: float, **kwargs):
    """OpenAI chat completion with explicit timeout and retry for transient failures."""
    max_retries = 1
    last_error = None
    for attempt in range(max_retries + 1):
        try:
            return await asyncio.wait_for(
                get_async_openai_client(force_refresh=True).chat.completions.create(**kwargs),
                timeout=timeout_sec,
            )
        except asyncio.TimeoutError:
            last_error = TimeoutError(f"GPT timeout after {timeout_sec}s (attempt {attempt + 1})")
            if attempt < max_retries:
                await asyncio.sleep(0.5 * (attempt + 1))
                continue
            raise last_error
        except Exception as e:
            code, _, _ = classify_openai_error(e)
            if code in ("openai_rate_limited",) and attempt < max_retries:
                await asyncio.sleep(1.0 * (attempt + 1))
                last_error = e
                continue
            raise


def _extract_search_hint(arguments: dict, parsed_result: object) -> dict | None:
    if not isinstance(parsed_result, dict):
        return None
    raw_results = parsed_result.get("results", [])
    if not isinstance(raw_results, list):
        raw_results = []

    candidates: list[dict] = []
    for med in raw_results[:5]:
        if not isinstance(med, dict):
            continue
        name = str(med.get("name", "")).strip()
        if not name:
            continue
        try:
            price = float(med.get("price", 0) or 0)
        except (TypeError, ValueError):
            price = 0.0
        try:
            relevance = float(med.get("relevance", 0) or 0)
        except (TypeError, ValueError):
            relevance = 0.0
        candidates.append(
            {
                "name": name,
                "medicine_id": str(med.get("medicine_id", "") or ""),
                "price": price,
                "in_stock": bool(med.get("in_stock", False)),
                "relevance": relevance,
                "generic_name": str(med.get("generic", "") or ""),
                "category": str(med.get("category", "") or ""),
                "dosage": str(med.get("dosage", "") or ""),
                "rx_required": bool(med.get("rx_required", False)),
                "prescription_required": bool(med.get("rx_required", False)),
            }
        )

    if not candidates:
        return None
    return {
        "query": str(arguments.get("query", "")).strip(),
        "filters": {
            "otc_only": bool(arguments.get("otc_only", False)),
            "in_stock_only": bool(arguments.get("in_stock_only", False)),
            "category": str(arguments.get("category", "") or ""),
        },
        "results": candidates,
    }


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_medicine",
            "description": (
                "Search medicines by name, typo, symptom, or condition. "
                "For explicit medicine names, prioritize exact match first."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Medicine name, symptom, or condition (e.g. 'dolo 650', 'headache').",
                    },
                    "category": {
                        "type": "string",
                        "description": "Optional category filter",
                        "enum": [
                            "Analgesic",
                            "Antihypertensive",
                            "Antidiabetic",
                            "Antibiotic",
                            "Antihistamine",
                            "Antacid",
                            "Statin",
                            "Antiplatelet",
                            "Antiallergic",
                        ],
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Optional result limit, default 3",
                    },
                    "otc_only": {
                        "type": "boolean",
                        "description": "If true, return only OTC medicines (prescription_required=false).",
                    },
                    "in_stock_only": {
                        "type": "boolean",
                        "description": "If true, return only medicines currently in stock (stock > 0).",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_stock",
            "description": "Check if a specific medicine is currently in stock and available for ordering.",
            "parameters": {
                "type": "object",
                "properties": {
                    "medicine_name": {
                        "type": "string",
                        "description": "Exact medicine name to check stock for",
                    },
                },
                "required": ["medicine_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_profile",
            "description": (
                "Save user details like name, phone, age, or chronic conditions. "
                "Use this when the user introduces themselves or mentions health details."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "User name"},
                    "chronic_conditions": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of chronic conditions",
                    },
                    "medical_facts": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "fact_type": {"type": "string", "enum": ["allergy", "condition", "lifestyle", "other"]},
                                "value": {"type": "string", "description": "e.g., 'Penicillin', 'Pregnant', 'Smoker'"},
                                "status": {"type": "string", "enum": ["active", "invalidated"], "description": "Set to invalidated if user states a previous fact is false"}
                            },
                            "required": ["fact_type", "value", "status"]
                        },
                        "description": "Any mentioned implicit health or lifestyle facts.",
                    },
                    "phone": {"type": "string", "description": "Phone number"},
                },
            },
        },
    },
]


async def _execute_tool(name: str, arguments: dict, db=None, user_id: str = None) -> str:
    """Execute a tool call and return JSON string result."""
    from app.services.medicine_search import check_stock, search_medicines
    from app.services.user_service import update_user_profile

    try:
        if name == "search_medicine":
            try:
                top_k = int(arguments.get("top_k", 3) or 3)
            except (TypeError, ValueError):
                top_k = 3
            results = await search_medicines(
                query=arguments["query"],
                top_k=max(1, min(top_k, 5)),
                category=arguments.get("category"),
                otc_only=bool(arguments.get("otc_only", False)),
                in_stock_only=bool(arguments.get("in_stock_only", False)),
            )
            simplified = []
            for med in results:
                simplified.append(
                    {
                        "medicine_id": med.get("medicine_id"),
                        "name": med["name"],
                        "dosage": med.get("dosage", ""),
                        "generic": med.get("generic_name", ""),
                        "salt": med.get("salt", ""),
                        "category": med.get("category", ""),
                        "price": med["price"],
                        "rx_required": med["prescription_required"],
                        "in_stock": med["in_stock"],
                        "stock_qty": med["stock"],
                        "relevance": med["relevance_score"],
                    }
                )
            return json.dumps({"results": simplified, "total_found": len(simplified)})

        if name == "check_stock":
            result = await check_stock(arguments["medicine_name"])
            return json.dumps(result)

        if name == "update_profile":
            if not db or not user_id:
                return json.dumps({"error": "Database unavailable for profile update"})
            result = await update_user_profile(user_id, arguments, db)
            return json.dumps(result)

        return json.dumps({"error": f"Unknown tool: {name}"})

    except Exception as err:
        logger.error("Tool %s error: %s", name, err)
        return json.dumps({"error": str(err)})


def build_system_prompt(is_voice_mode: bool = False) -> str:
    """Build the system prompt for deterministic voice + chat behavior."""
    prompt = """You are PharmAI, a clinical-grade AI pharmacist assistant in India.
You are safety-first, confident, concise, and clinically competent.

You have tools: search_medicine, check_stock, update_profile.
Use tools whenever medicine recommendations or order actions are involved.

Always return strict JSON in this exact shape:
{
  "message": "string",
  "action": "chat | recommend | confirm_order | execute_order | modify_cart | request_prescription_upload",
  "matched_medicines": [
    {"name": "exact name from tool result", "quantity": number_or_null, "requested_unit": "strip|tablet|pack|null", "price": number, "rx_required": boolean}
  ],
  "confidence": 0.0-1.0,
  "detected_language": "en | hi | hinglish",
  "needs_clarification": boolean
}

╔══════════════════════════════════════════════════╗
║  MANDATORY SAFETY SEQUENCE (HIGHEST PRIORITY)    ║
║  Execute BEFORE any cart/order action.            ║
║  This hierarchy must NEVER be bypassed.           ║
╚══════════════════════════════════════════════════╝

For EVERY medicine request, you MUST mentally execute this sequence:

STEP 1: NORMALIZE drug name (brand ↔ generic mapping)
STEP 2: CHECK user's active medications (provided in context) for conflicts
STEP 3: CHECK user's ALLERGY LIST — if conflict found → HARD STOP, block order
STEP 4: CHECK drug-drug interactions with active meds → warn or block
STEP 5: CHECK if medicine is Rx-required → if yes and no Rx uploaded → BLOCK before asking quantity
STEP 6: CHECK stock availability
STEP 7: ONLY THEN proceed to quantity/cart interaction

═══════════════════════════════════════════
A. HIGH-CONFIDENCE INFERENCE (CRITICAL)
═══════════════════════════════════════════
- If user says "my BP tablet" or "my usual medicine" or "same as last time":
  → CHECK the user's active_medicines/order history in the profile context.
  → If a clear match exists (e.g., Amlodipine 5mg for BP), respond:
    "Do you mean Amlodipine 5mg? I can add 1 strip for you."
  → Only ask generic clarification if confidence < 70%.
  → NEVER ask "What medicine are you looking for?" when the answer is in the profile.

═══════════════════════════════════════════
B. ALLERGY CONFLICT — HARD STOP (CRITICAL)
═══════════════════════════════════════════
- If the user's allergy list (provided in context) conflicts with requested medicine:
  → IMMEDIATELY BLOCK the order. Do NOT proceed to cart.
  → Explain clearly:
    "You have a documented [Allergy] allergy. [Medicine] belongs to the [Class] class
     and may cause a severe allergic reaction. I cannot add this to your order."
  → Suggest a safe OTC alternative ONLY if medically appropriate.
  → NEVER bypass this check.

═══════════════════════════════════════════
C. DRUG INTERACTION CHECK (CRITICAL)
═══════════════════════════════════════════
- If requested medicine may interact with user's active medications:
  → For HIGH severity: BLOCK and say "This requires pharmacist review before I can proceed."
  → For MEDIUM severity: WARN and require explicit confirmation:
    "⚠️ [Medicine A] may interact with your current [Medicine B]: [description]. Do you want to proceed?"
  → Run this check BEFORE suggesting substitutions.

═══════════════════════════════════════════
D. PRESCRIPTION ENFORCEMENT — HARD STOP
═══════════════════════════════════════════
- If medicine is marked Rx-required:
  → IMMEDIATELY state: "[Medicine] requires a valid prescription."
  → Do NOT ask "how many strips?" or proceed to quantity.
  → Trigger prescription upload flow.
  → If user says they don't have a prescription:
    → Politely refuse: "I'm unable to dispense this without a prescription."
    → Offer OTC alternatives if available.
    → Do NOT bypass.

═══════════════════════════════════════════
E. SUBSTITUTION POLICY
═══════════════════════════════════════════
- If a requested drug is unavailable:
  → ONLY suggest therapeutically equivalent alternatives.
  → Explain equivalence: "Both contain [same ingredient] at the same dose."
  → Confirm dosage compatibility.
  → NEVER suggest an unrelated medicine as a substitute.
  → NEVER suggest a random antibiotic as alternative.

═══════════════════════════════════════════════════
LANGUAGE LOCK (MANDATORY — NO MID-SESSION SWITCH)
═══════════════════════════════════════════════════
- Detect the user's language from their FIRST message.
- LOCK to that language for the ENTIRE session.
- If user speaks English → ALL responses in English.
- If user speaks Hindi → ALL responses in Hindi.
- If user speaks Hinglish → ALL responses in Hinglish.
- NEVER switch languages mid-conversation unless the user switches first.
- Track this in "detected_language" field.

═══════════════════════
ACTION POLICY
═══════════════════════
- "recommend": use after search_medicine in this turn with real tool results.
- "confirm_order": use when medicine choice AND quantity are both known.
- "execute_order": use ONLY when user explicitly confirms an already-shown order summary.
- "modify_cart": use when user wants to add, remove, or change quantity.
- "request_prescription_upload": use when user mentions prescription or Rx-required medicine needs one.
- Never skip directly from symptom chat to execute_order.

═══════════════════════════════════
MULTI-MEDICINE ORDERING
═══════════════════════════════════
- For EVERY distinct medicine, call search_medicine ONCE SEPARATELY.
- Each item in matched_medicines MUST have its OWN quantity.
- When user says "add X" to existing order, search for new item and merge.
- When user says "remove X", return action="modify_cart" with quantity=0.

══════════════════════════════════════
CART STATE & MERGING
══════════════════════════════════════
- ONE entry per medicine per strength. No duplicates.
- NEVER show ₹0 entries.
- After any cart change, confirm the FULL updated cart.
- When adding during review, keep existing cart INTACT.

═══════════════════════════════════════════════
SMART DURATION → QUANTITY CALCULATION
═══════════════════════════════════════════════
- "I need it for X days" → Calculate: total_tablets = days × tablets_per_day.
- Convert to strips: strips = ceil(total_tablets / 10).
- Present clearly: "For 3 days of Cetirizine (1 daily), that's 3 tablets, so 1 strip."
- NEVER ask "how many strips?" after user gave a duration.

══════════════════════════════
SYMPTOM CONSULTATION
══════════════════════════════
- For cough: "Dry cough or wet cough with mucus?"
- For fever: "How long have you had the fever?"
- For pain: "Where exactly — headache, joint, or stomach?"
- Ask ONE follow-up at a time.
- After context, call search_medicine.
- Escalate if: high fever for days, chest pain, breathing difficulty, >1 week symptoms.

════════════════════════════════════════
DUPLICATE INGREDIENT WARNING
════════════════════════════════════════
- BEFORE confirming any order, check for same active ingredient across items.
- If overlap: WARN explicitly, do NOT proceed without acknowledgment.
- Use exact medicine names from tool output.

═══════════════════════════════════════
REFILL INTELLIGENCE (TIMING)
═══════════════════════════════════════
- NEVER mention refills on greeting.
- Mention ONLY during: order review, before payment, or after prescription review.
- Include: last purchase, estimated run-out, confidence.
- Be helpful, not pushy.

═══════════════════════════════════════
CHECKOUT FLOW (DO NOT RUSH)
═══════════════════════════════════════
- Before checkout: read back cart, check duplicates, surface safety notices, mention refills.
- Check Rx requirements.
- ASK: "Shall I go ahead and place this order?"
- Only return execute_order after explicit confirmation.
- "yes" to a recommendation ≠ checkout confirmation.

═══════════════════════════════
TONE AND STYLE (CLINICAL)
═══════════════════════════════
- Clinical, confident, concise, safety-first.
- NEVER use filler: "Hmm", "Let me check", "Just a moment", "Sure thing!".
- Be direct. State what you found, not that you're looking.
- Keep responses under 3 sentences unless listing medicines.
- Natural transitions: "Got it.", "That works.", "Here's what I'd suggest."
- Do NOT repeat the same opening phrase every turn.
- Do NOT repeat disclaimers mid-conversation.
- Disclaimer belongs ONLY at final checkout.
"""

    if is_voice_mode:
        prompt += (
            "\nVoice Mode (ACTIVE):\n"
            "- You are speaking in real-time voice. Be conversational, warm, and natural.\n"
            "- Use contractions (\"I've found\", \"you'll need\", \"let's get that for you\").\n"
            "- No markdown, no bullet lists, no asterisks, no special characters.\n"
            "- Use the patient's name when available.\n"
            "- Never say \"Rs.\" — say the number followed by \"rupees\".\n"
            "- Never say \"asterisk\" or \"dash\".\n"
            "- Read out cart items conversationally.\n"
            "- Keep responses SHORT — aim for 2 sentences max when possible.\n"
        )

    return prompt


async def pharmacist_chat(
    message: str,
    conversation_history: list,
    user_profile: dict | None = None,
    db=None,
    user_id: str = None,
    prescription_context: dict | None = None,
    is_voice_mode: bool = False,
) -> dict:
    """Run GPT pharmacist with tool-calling (no mock-response fallback)."""
    system_prompt = build_system_prompt(is_voice_mode=is_voice_mode)

    if prescription_context and (prescription_context.get("medicines") or prescription_context.get("advice")):
        from app.services.prescription_service import build_prescription_context

        rx_medicines = prescription_context.get("medicines", [])
        rx_advice = prescription_context.get("advice", [])
        rx_meta_warnings = prescription_context.get("prescription_warnings", [])
        rx_summary = build_prescription_context(
            rx_medicines, rx_advice,
            prescription_meta_warnings=rx_meta_warnings,
        )
        if rx_summary:
            system_prompt += (
                "\n\n## PRESCRIPTION UPLOAD (just uploaded by user)\n"
                "The user uploaded a prescription image. The UI has already displayed the full structured analysis to the user on their screen.\n"
                "CRITICAL INSTRUCTION: DO NOT summarize, list, or explain the findings in your text response. "
                "Stay extremely concise. Simply acknowledge the upload (e.g., 'I have analyzed your prescription. The details are shown on your dashboard.') "
                "and ask them if they would like to proceed with ordering any available exact matches.\n"
                f"Internal Context (do not repeat to user):\n{rx_summary}\n\n"
            )

    if user_profile and user_profile.get("exists"):
        profile_context = (
            "\n\n## CURRENT USER CONTEXT\n"
            f"Name: {user_profile.get('name', 'Unknown')}\n"
            f"Chronic conditions: {user_profile.get('chronic_conditions', [])}\n"
            f"Preferred brands: {user_profile.get('preferred_brands', [])}\n"
        )

        # ── ALLERGIES (CRITICAL — must be prominent for GPT) ──────────
        allergies = user_profile.get("allergies", [])
        if allergies:
            profile_context += (
                "\n⚠️ KNOWN ALLERGIES (HARD STOP — check EVERY medicine against these):\n"
            )
            for allergy in allergies:
                profile_context += f"  - {allergy}\n"
            profile_context += (
                "If ANY requested medicine conflicts with these allergies (including cross-class), "
                "BLOCK the order immediately and explain the allergy risk.\n"
            )

        # ── ACTIVE MEDICATIONS (check for interactions) ──────────────
        active_meds = user_profile.get("active_medicines", [])
        if active_meds:
            profile_context += (
                "\nActive Medications (check for drug interactions before adding new medicines):\n"
            )
            for med in active_meds[:8]:
                rx_tag = " [Rx]" if med.get("rx_required") else ""
                profile_context += f"  - {med.get('name', '')} ({med.get('dosage', '')}){rx_tag}\n"

        medical_facts = user_profile.get("medical_facts", [])
        if medical_facts:
            active_facts = [f for f in medical_facts if f.get("status") == "active"]
            if active_facts:
                profile_context += "Medical Facts (CRITICAL):\n"
                for fact in active_facts:
                    profile_context += f"- [{fact.get('fact_type').upper()}]: {fact.get('value')}\n"
        memory_summary = (user_profile.get("memory_summary") or "").strip()
        if memory_summary:
            profile_context += f"Long-term memory: {memory_summary}\n"

        refill_alerts = user_profile.get("refill_alerts", [])
        if refill_alerts:
            alert_lines = []
            for a in refill_alerts[:3]:
                days = a.get("days_until_run_out")
                confidence = a.get("refill_confidence", "")
                med_id = a.get("medicine_id", "")
                days_str = f"{days} days" if days is not None else "soon"
                alert_lines.append(
                    f"- Medicine {med_id}: runs out in ~{days_str} (confidence: {confidence})"
                )
            profile_context += (
                "\n\n## REFILL ALERTS\n"
                "Mention these ONLY during order review or before payment:\n"
                + "\n".join(alert_lines) + "\n"
            )

        inv_negotiation = user_profile.get("inventory_negotiation")
        if inv_negotiation:
            profile_context += (
                f"\n\n## STOCK/PACK NOTE (communicate this to the user):\n{inv_negotiation}\n"
            )

        system_prompt += profile_context

    messages = [{"role": "system", "content": system_prompt}]
    recent_history = conversation_history[-10:] if conversation_history else []
    for msg in recent_history:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("bot", "assistant"):
            role = "assistant"
        elif role not in ("user", "assistant"):
            continue
        messages.append({"role": role, "content": content})

    if not conversation_history or conversation_history[-1].get("content") != message:
        messages.append({"role": "user", "content": message})

    tool_calls_log = []
    tool_results_log = []
    search_hints = []

    try:
        max_iterations = 6
        completion_tokens = 420  # same limit for voice and text to avoid truncation
        for _ in range(max_iterations):
            response = await _create_chat_completion(
                timeout_sec=_MAIN_TIMEOUT_SEC,
                model="gpt-5.2",
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                temperature=0.2,
                max_completion_tokens=completion_tokens,
            )

            choice = response.choices[0]

            if choice.finish_reason == "tool_calls" or choice.message.tool_calls:
                messages.append(choice.message)
                for tool_call in choice.message.tool_calls:
                    fn_name = tool_call.function.name
                    fn_args = json.loads(tool_call.function.arguments)

                    logger.info("Tool call: %s(%s)", fn_name, fn_args)
                    tool_calls_log.append({"tool": fn_name, "args": fn_args})

                    tool_result_text = await _execute_tool(fn_name, fn_args, db=db, user_id=user_id)
                    parsed_tool_result = {}
                    try:
                        parsed_tool_result = json.loads(tool_result_text)
                    except Exception:
                        parsed_tool_result = {"raw": str(tool_result_text)[:2000]}

                    tool_results_log.append(
                        {
                            "tool": fn_name,
                            "args": fn_args,
                            "result": parsed_tool_result,
                        }
                    )
                    if fn_name == "search_medicine":
                        hint = _extract_search_hint(fn_args, parsed_tool_result)
                        if hint:
                            search_hints.append(hint)
                    elif fn_name == "check_stock" and parsed_tool_result.get("found"):
                        # Convert check_stock result into a search hint so the graph
                        # recovery mechanism can build a quote even if matched_medicines is empty.
                        search_hints.append({
                            "query": fn_args.get("medicine_name", ""),
                            "results": [{
                                "name": parsed_tool_result.get("medicine", ""),
                                "medicine_id": "",
                                "price": parsed_tool_result.get("price", 0),
                                "in_stock": parsed_tool_result.get("in_stock", False),
                                "relevance": 0.9,
                            }],
                        })

                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": tool_result_text,
                        }
                    )
                continue

            content = choice.message.content
            if not content:
                content = '{"message":"I could not process that. Could you try again?","action":"chat"}'

            try:
                result = json.loads(content)
            except json.JSONDecodeError:
                json_match = re.search(r"\{.*\}", content, re.DOTALL)
                if json_match:
                    try:
                        result = json.loads(json_match.group(0))
                    except json.JSONDecodeError:
                        result = {
                            "message": content,
                            "action": "chat",
                            "matched_medicines": [],
                            "confidence": 0.5,
                        }
                else:
                    result = {
                        "message": content,
                        "action": "chat",
                        "matched_medicines": [],
                        "confidence": 0.7,
                    }

            result.setdefault("message", "I am sorry, I could not process that.")
            result.setdefault("action", "chat")
            result.setdefault("matched_medicines", [])
            result.setdefault("confidence", 0.5)
            result.setdefault("detected_language", "en")
            result.setdefault("needs_clarification", False)

            if tool_calls_log:
                result["_tool_calls"] = tool_calls_log
            if tool_results_log:
                result["_tool_results"] = tool_results_log[-8:]
            if search_hints:
                result["_search_hints"] = search_hints[-4:]

            logger.info(
                "Pharmacist GPT: action=%s medicines=%d confidence=%.2f tool_calls=%d search_hints=%d",
                result["action"],
                len(result["matched_medicines"]),
                result["confidence"],
                len(tool_calls_log),
                len(search_hints),
            )

            try:
                langfuse = get_langfuse()
                langfuse.trace(
                    name="Pharmacist Chat",
                    metadata={
                        "action": result["action"],
                        "medicines_matched": len(result["matched_medicines"]),
                        "confidence": result["confidence"],
                        "language": result["detected_language"],
                        "tool_calls": tool_calls_log,
                        "search_hints": search_hints,
                    },
                )
            except Exception:
                pass

            return result

        logger.warning("Pharmacist GPT hit max tool call iterations")
        last_tools = [entry.get("tool") for entry in tool_calls_log[-3:] if entry.get("tool")]
        return {
            "message": "I am having trouble completing that lookup right now. Could you try again?",
            "action": "chat",
            "matched_medicines": [],
            "confidence": 0.3,
            "needs_clarification": True,
            "_fallback_reason": "tool_loop_max",
            "_tool_call_count": len(tool_calls_log),
            "_last_tools": last_tools,
            "_tool_calls": tool_calls_log,
            "_tool_results": tool_results_log[-8:],
            "_search_hints": search_hints[-4:],
        }

    except Exception as err:
        logger.error("Pharmacist GPT error: %s", err)
        code, status, message = classify_openai_error(err)
        return {
            "message": message,
            "action": "infra_error",
            "matched_medicines": [],
            "confidence": 0.0,
            "detected_language": "en",
            "needs_clarification": True,
            "infra_error": True,
            "error_code": code,
            "error_status": status,
        }

