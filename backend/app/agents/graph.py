"""Workflow graph: profiling -> predictive -> pharmacist -> conditional order pipeline.

This version keeps deterministic quote + confirmation behavior:
- Quote math and unit conversion come only from backend pricing logic.
- Range quantities (for example `2-3`) are unresolved until user chooses one value.
- A single positive confirmation on a resolved pending quote proceeds to execution.
"""

from __future__ import annotations

import logging
import time
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.execution import execution_agent
from app.agents.inventory import inventory_agent as inventory_agent_fn
from app.agents.pending_state import (
    build_confirmation_message,
    build_pending_state,
    build_quantity_prompt_message,
    build_quantity_prompt_voice,
    can_emit_confirm_order,
    empty_pending_state,
    is_confirmable_pending,
    normalize_pending_state,
    pending_phase,
)
from app.agents.pharmacist import pharmacist_chat
from app.agents.predictive import predictive_agent
from app.agents.profiling import profiling_agent
from app.agents.quote_utils import (
    build_intent_items_from_quote,
    build_quote_signature,
    canonical_medicines_from_quote,
    format_inr,
    quote_is_resolved,
    quote_lines,
    quote_quantity_status,
    safe_float,
)
from app.agents.safety import safety_agent
from app.agents.state import PharmacyState
from app.services.confirmation_intent import classify_confirmation_intent
from app.services.pricing import build_order_quote, parse_quantity_and_unit

logger = logging.getLogger("pharmacy.agents.graph")


async def _auto_add_to_cart(
    user_id: str, quote: dict, db: AsyncSession | None
) -> None:
    """Silently add all items from a resolved quote into the user's cart."""
    if not db or not user_id or not quote:
        return
    try:
        from app.models.cart import Cart, CartItem

        result = await db.execute(select(Cart).where(Cart.user_id == user_id))
        cart = result.scalar_one_or_none()
        if not cart:
            cart = Cart(user_id=user_id)
            db.add(cart)
            await db.flush()

        for line in quote.get("lines", []):
            med_id = line.get("medicine_id")
            if not med_id:
                continue
            # Check if item already in cart — update qty instead of duplicating
            existing = None
            for ci in cart.items:
                if str(ci.medicine_id) == str(med_id):
                    existing = ci
                    break
            qty = int(line.get("billing_qty") or 1)
            price = float(line.get("unit_price") or 0.0)
            name = line.get("name", "")
            if existing:
                existing.quantity = qty
                existing.unit_price = price
            else:
                cart.items.append(
                    CartItem(
                        medicine_id=med_id,
                        medicine_name=name,
                        quantity=qty,
                        unit_price=price,
                    )
                )
        await db.commit()
        logger.info("[auto_cart] Added %d item(s) to cart for user %s", len(quote.get("lines", [])), user_id[:8])
    except Exception as e:
        logger.warning("[auto_cart] Failed (non-fatal): %s", e)
        try:
            await db.rollback()
        except Exception:
            pass


MISLEADING_SUCCESS_PHRASES = (
    "successfully placed",
    "order has been placed",
    "order is confirmed",
    "will be processed shortly",
    "thank you for your order",
)


def _claims_order_completed(text: str) -> bool:
    msg = str(text or "").lower()
    return any(phrase in msg for phrase in MISLEADING_SUCCESS_PHRASES)


def _medicines_from_intent_items(intent_items: list[dict] | None) -> list[dict]:
    medicines: list[dict] = []
    for item in intent_items or []:
        if not isinstance(item, dict):
            continue
        med_name = (
            item.get("matched_medicine_name")
            or item.get("medicine_name")
            or item.get("name")
            or ""
        )
        med_name = str(med_name).strip()
        if not med_name:
            continue
        medicines.append(
            {
                "name": med_name,
                "matched_medicine_name": med_name,
                "matched_medicine_id": str(item.get("matched_medicine_id", "") or ""),
                "quantity": item.get("quantity", item.get("billing_qty", item.get("requested_qty", 1))),
                "requested_qty": item.get("requested_qty", item.get("quantity", 1)),
                "requested_unit": item.get("requested_unit", "unknown"),
                "billing_qty": item.get("billing_qty", item.get("quantity", 1)),
                "billing_unit": item.get("billing_unit", "strip"),
                "strip_size": item.get("strip_size", 10),
                "price": item.get("price", 0),
                "quantity_explicit": bool(item.get("requested_unit") in {"strip", "pack", "tablet"}),
            }
        )
    return medicines



def _medicines_from_search_hints(search_hints: list[dict] | None, message: str) -> list[dict]:
    hints = search_hints if isinstance(search_hints, list) else []
    parsed_qty = parse_quantity_and_unit(message)
    parsed_qty_exact = int(parsed_qty.get("exact_qty") or 1)
    parsed_unit = str(parsed_qty.get("unit") or "unknown")
    quantity_is_explicit = parsed_qty.get("kind") == "exact" and parsed_unit in {"strip", "pack", "tablet"}
    deduped: dict[str, dict] = {}

    for hint in hints:
        if not isinstance(hint, dict):
            continue
        filters = hint.get("filters", {}) if isinstance(hint.get("filters"), dict) else {}
        otc_only = bool(filters.get("otc_only", False))
        in_stock_only = bool(filters.get("in_stock_only", False))

        for med in hint.get("results", []) or []:
            if not isinstance(med, dict):
                continue
            name = str(med.get("name", "")).strip()
            if not name:
                continue
            in_stock = bool(med.get("in_stock", False))
            prescription_required = bool(med.get("prescription_required", False))
            if otc_only and prescription_required:
                continue
            if in_stock_only and not in_stock:
                continue
            try:
                relevance = float(med.get("relevance", 0.0) or 0.0)
            except (TypeError, ValueError):
                relevance = 0.0
            if relevance < 0.78:
                continue
            try:
                price = float(med.get("price", 0.0) or 0.0)
            except (TypeError, ValueError):
                price = 0.0
            medicine_id = str(med.get("medicine_id", "") or "")
            candidate = {
                "name": name,
                "matched_medicine_name": name,
                "matched_medicine_id": medicine_id,
                "price": price,
                "in_stock": in_stock,
                "relevance": relevance,
            }
            key = f"{medicine_id}:{name.lower()}"
            existing = deduped.get(key)
            if not existing:
                deduped[key] = candidate
                continue
            existing_score = (1 if existing.get("in_stock") else 0, float(existing.get("relevance", 0.0)))
            candidate_score = (1 if candidate.get("in_stock") else 0, float(candidate.get("relevance", 0.0)))
            if candidate_score > existing_score:
                deduped[key] = candidate

    ranked_candidates = list(deduped.values())
    ranked_candidates.sort(
        key=lambda item: (1 if item.get("in_stock") else 0, float(item.get("relevance", 0.0))),
        reverse=True,
    )

    requested_qty = parsed_qty_exact if quantity_is_explicit else 1
    requested_unit = parsed_unit if quantity_is_explicit else "unknown"
    for item in ranked_candidates:
        # Prefer GPT-provided per-item qty over global regex parse
        item_qty = item.get("quantity") or item.get("requested_qty")
        try:
            item_qty_int = int(item_qty) if item_qty not in (None, "", 0) else 0
        except (TypeError, ValueError):
            item_qty_int = 0
        if item_qty_int > 0:
            item["requested_qty"] = item_qty_int
        else:
            item["requested_qty"] = requested_qty
        # Prefer GPT-provided unit
        item_unit = str(item.get("requested_unit") or "").strip().lower()
        if item_unit not in {"strip", "pack", "tablet"}:
            item["requested_unit"] = requested_unit
        item["quantity"] = item["requested_qty"]
    return ranked_candidates[:2]




def _extract_medicine_mentions(message: str) -> list[str]:
    """Extract medicine-name-like terms from user message using quantity patterns."""
    import re as _re
    mentions: list[str] = []
    # Pattern: "N strips/tablets/pack of <name>" or "<name> N strips"
    for m in _re.finditer(
        r"(\d+)\s*(?:strips?|tablets?|packs?|bottles?)\s+(?:of\s+)?([a-zA-Z][a-zA-Z0-9\s]{2,25})",
        message,
        _re.IGNORECASE,
    ):
        name = m.group(2).strip().rstrip(".,;!? ")
        if name and len(name) > 2:
            mentions.append(name)
    # Pattern: "<name> N strips"
    for m in _re.finditer(
        r"([a-zA-Z][a-zA-Z0-9\s]{2,25})\s+(\d+)\s*(?:strips?|tablets?|packs?)",
        message,
        _re.IGNORECASE,
    ):
        name = m.group(1).strip().rstrip(".,;!? ")
        # Exclude common false-positive prefixes
        if name.lower() not in ("i want", "give me", "need", "also", "and", "plus", "with"):
            mentions.append(name)
    # Deduplicate preserving order
    seen = set()
    unique: list[str] = []
    for n in mentions:
        key = n.lower()
        if key not in seen:
            seen.add(key)
            unique.append(n)
    return unique


_RX_UPLOAD_KEYWORDS = (
    "i have a prescription",
    "upload prescription",
    "check my prescription",
    "show my prescription",
    "prescription with me",
    "got a prescription",
    "have prescription",
)

def _deduplicate_medicines(meds: list[dict]) -> list[dict]:
    """Deduplicate medicines by normalized base name (case-insensitive, strip dosage)."""
    import re as _re
    seen: dict[str, dict] = {}
    for med in meds:
        raw_name = str(med.get("matched_medicine_name") or med.get("name") or "").strip()
        if not raw_name:
            continue
        # Normalize: lowercase, strip trailing dosage like "10mg", "650mg", "10mg/5mg"
        base = _re.sub(r"\s*\d+\s*mg(/\d+\s*mg)?\s*$", "", raw_name, flags=_re.IGNORECASE).strip().lower()
        if not base:
            base = raw_name.lower()
        if base in seen:
            # Keep the one with higher quantity or the one with a valid price
            existing = seen[base]
            existing_qty = int(existing.get("requested_qty") or existing.get("quantity") or 0)
            new_qty = int(med.get("requested_qty") or med.get("quantity") or 0)
            if new_qty > existing_qty:
                seen[base] = med
        else:
            seen[base] = med
    return list(seen.values())


def _recommendations_from_search_hints(search_hints: list[dict] | None, limit: int = 3) -> list[dict]:
    hints = search_hints if isinstance(search_hints, list) else []
    ranked_candidates: list[dict] = []
    seen: set[str] = set()

    for hint in hints:
        if not isinstance(hint, dict):
            continue
        filters = hint.get("filters", {}) if isinstance(hint.get("filters"), dict) else {}
        otc_only = bool(filters.get("otc_only", False))
        in_stock_only = bool(filters.get("in_stock_only", False))
        for med in hint.get("results", []) or []:
            if not isinstance(med, dict):
                continue
            name = str(med.get("name", "")).strip()
            if not name:
                continue
            in_stock = bool(med.get("in_stock", False))
            prescription_required = bool(med.get("prescription_required", False))
            if otc_only and prescription_required:
                continue
            if in_stock_only and not in_stock:
                continue
            medicine_id = str(med.get("medicine_id", "") or "")
            dedupe_key = f"{medicine_id}:{name.lower()}"
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)

            try:
                relevance = float(med.get("relevance", 0.0) or 0.0)
            except (TypeError, ValueError):
                relevance = 0.0
            try:
                price = float(med.get("price", 0.0) or 0.0)
            except (TypeError, ValueError):
                price = 0.0

            ranked_candidates.append(
                {
                    "name": name,
                    "matched_medicine_name": name,
                    "matched_medicine_id": medicine_id,
                    "price": price,
                    "in_stock": in_stock,
                    "relevance": relevance,
                    "generic_name": str(med.get("generic_name", "") or ""),
                    "category": str(med.get("category", "") or ""),
                    "dosage": str(med.get("dosage", "") or ""),
                    "prescription_required": prescription_required,
                    "rx_required": bool(med.get("rx_required", False)),
                }
            )

    if not ranked_candidates:
        return []

    ranked_candidates.sort(
        key=lambda item: (1 if item.get("in_stock") else 0, float(item.get("relevance", 0.0))),
        reverse=True,
    )
    return ranked_candidates[: max(1, limit)]


def _merge_medicine_candidates(primary: list[dict], secondary: list[dict], limit: int = 5) -> list[dict]:
    merged: list[dict] = []
    seen: set[str] = set()

    for source in (primary or [], secondary or []):
        if not isinstance(source, list):
            continue
        for med in source:
            if not isinstance(med, dict):
                continue
            med_name = str(med.get("matched_medicine_name") or med.get("name") or "").strip()
            if not med_name:
                continue
            med_id = str(med.get("matched_medicine_id", "") or "")
            key = f"{med_id}:{med_name.lower()}"
            if key in seen:
                continue
            seen.add(key)
            merged.append(med)
            if len(merged) >= max(1, limit):
                return merged
    return merged


def _set_skipped(steps: dict, step_ids: list[str], reason: str) -> None:
    for step_id in step_ids:
        steps[step_id]["status"] = "skipped"
        steps[step_id]["output"] = {"reason": reason}



async def _inject_counseling(state: dict) -> None:
    """Append patient counseling text to the response message if order items are available."""
    try:
        from app.services.counseling_engine import (
            format_counseling_for_response,
            generate_order_counseling,
        )
        from app.services.medicine_search import get_medicine_by_name

        order_items = state.get("execution_result", {}).get("items", [])
        if not order_items:
            order_items = state.get("pending_state", {}).get("pending_medicines", [])

        enriched_items = []
        for item in order_items:
            med_name = item.get("name", "")
            if med_name and not item.get("counseling_info"):
                catalog_med = await get_medicine_by_name(med_name)
                if catalog_med:
                    enriched = {**item, "counseling_info": catalog_med.get("counseling_info", {})}
                else:
                    enriched = item
            else:
                enriched = item
            enriched_items.append(enriched)

        if enriched_items:
            # We skip adding counseling to spoken text.
            # The frontend order card will render the counseling visually using the rich data.
            pass
    except Exception as err:
        logger.warning("Counseling injection error (non-fatal): %s", err)



PIPELINE_STEPS = [
    {"id": "medicine_search", "name": "Medicine Search", "icon": "S", "description": "Vector search & retrieval"},
    {"id": "pharmacist", "name": "Pharmacist AI", "icon": "Rx", "description": "GPT reasoning & tools"},
    {"id": "profiling", "name": "Profiling", "icon": "U", "description": "Patient history & patterns"},
    {"id": "predictive", "name": "Predictive", "icon": "P", "description": "Refill & depletion analysis"},
    {"id": "safety", "name": "Safety", "icon": "!", "description": "Rx & contraindication check"},
    {"id": "inventory", "name": "Inventory", "icon": "I", "description": "Stock & negotiation"},
    {"id": "execution", "name": "Execution", "icon": "OK", "description": "Order placement & webhook"},
]



def _make_step(step_def: dict, status: str = "pending", **extra) -> dict:
    return {**step_def, "status": status, "duration_ms": 0, "output": {}, **extra}



async def _quote_from_medicines(matched_medicines: list[dict], message: str) -> dict | None:
    from app.services.medicine_search import get_medicine_by_name

    return await build_order_quote(
        matched_medicines=matched_medicines,
        message=message,
        db_lookup=get_medicine_by_name,
    )


async def _merge_into_pending_cart(
    existing_pending: dict,
    new_medicines: list[dict],
    message: str,
) -> tuple[dict | None, list[dict]]:
    """Merge new medicines into an existing pending cart.

    Handles add (new items), remove (qty=0 items), and update (changed qty).
    Returns (merged_quote, merged_medicines_list).
    """
    import re as _re

    def _normalize_key(name: str) -> str:
        """Strip dosage like '10mg', '650mg', '10mg/5mg' for matching."""
        base = _re.sub(r"\s*\d+\s*mg(/\d+\s*mg)?\s*$", "", name, flags=_re.IGNORECASE).strip().lower()
        return base if base else name.lower()

    existing_medicines = list(existing_pending.get("pending_medicines") or [])
    existing_by_name: dict[str, dict] = {}
    for med in existing_medicines:
        raw = str(med.get("matched_medicine_name") or med.get("name") or "").strip()
        key = _normalize_key(raw)
        if key:
            existing_by_name[key] = med

    # Detect remove intent from message keywords
    msg_lower = message.lower()
    remove_keywords = ["remove", "cancel", "delete", "drop", "hatao", "nikal"]
    is_remove_msg = any(kw in msg_lower for kw in remove_keywords)

    for new_med in new_medicines:
        new_name = str(new_med.get("matched_medicine_name") or new_med.get("name") or "").strip()
        if not new_name:
            continue
        key = _normalize_key(new_name)
        new_qty = new_med.get("requested_qty") or new_med.get("quantity") or 0
        try:
            new_qty = int(new_qty)
        except (TypeError, ValueError):
            new_qty = 1

        # Remove operation: qty is 0 or message has remove keywords
        if new_qty == 0 or (is_remove_msg and key in existing_by_name):
            existing_by_name.pop(key, None)
            continue

        if key in existing_by_name:
            # Update existing item qty
            existing_by_name[key]["quantity"] = new_qty
            existing_by_name[key]["requested_qty"] = new_qty
            existing_by_name[key]["requested_unit"] = new_med.get("requested_unit") or existing_by_name[key].get("requested_unit", "strip")
        else:
            # Add new item
            existing_by_name[key] = new_med

    merged_list = list(existing_by_name.values())
    if not merged_list:
        return None, []

    merged_quote = await _quote_from_medicines(merged_list, message)
    return merged_quote, merged_list



async def _rebuild_pending_state(
    pending_state: dict | None,
    *,
    message: str,
    history: list[dict],
    intent_items: list[dict] | None,
) -> dict:
    pending = normalize_pending_state(pending_state)
    if pending.get("payment_requested"):
        return pending
    if is_confirmable_pending(pending):
        return pending

    pending_quote = pending.get("pending_quote", {})
    pending_medicines = list(pending.get("pending_medicines", []))
    last_intent = str(pending.get("last_confirmation_intent", "") or "")
    last_confidence = safe_float(pending.get("last_confirmation_confidence", 0.0), 0.0)

    if quote_lines(pending_quote):
        canonical = canonical_medicines_from_quote(pending_quote)
        if canonical:
            pending_medicines = canonical

    if not quote_lines(pending_quote) and pending_medicines:
        rebuilt_quote = await _quote_from_medicines(pending_medicines, message=message)
        if rebuilt_quote:
            pending_quote = rebuilt_quote
            pending_medicines = canonical_medicines_from_quote(rebuilt_quote) or pending_medicines

    if not pending_medicines and intent_items:
        intent_meds = _medicines_from_intent_items(intent_items)
        if intent_meds:
            rebuilt_quote = await _quote_from_medicines(intent_meds, message=message)
            if rebuilt_quote:
                pending_quote = rebuilt_quote
                pending_medicines = canonical_medicines_from_quote(rebuilt_quote) or intent_meds

    if not pending_medicines or not quote_lines(pending_quote):
        return pending

    if quote_is_resolved(pending_quote):
        return build_pending_state(
            pending_quote,
            pending_medicines,
            awaiting_confirmation=True,
            confirmation_prompted_once=True,
            last_confirmation_intent=last_intent,
            last_confirmation_confidence=last_confidence,
        )

    return build_pending_state(
        pending_quote,
        pending_medicines,
        awaiting_confirmation=False,
        confirmation_prompted_once=False,
        last_confirmation_intent=last_intent,
        last_confirmation_confidence=last_confidence,
    )




async def _resolve_medicines_pipeline(
    *,
    gpt_result: dict,
    search_hints: list,
    tool_calls: list,
    pending: dict,
    pending_medicines: list,
    message: str,
    parsed_qty: dict,
    state: dict,
    db,
    user_id: str,
    trace_id: str,
    is_voice_mode: bool,
) -> tuple:
    """
    Single-pass medicine resolution pipeline.

    Stages:
      1. EXTRACT — get GPT medicines, validate against catalog if no tool calls
      2. ENRICH — add top-1 per search hint for order actions only
      3. GAP FILL — auto-search user-mentioned but missed medicines
      4. DEDUPLICATE — single normalized dedup pass
      5. MERGE CART — merge with pending state
      6. BUILD QUOTE — price, resolve quantities, determine action

    Returns: (action, matched_meds, quote, confidence, recovery_used)
    """
    import re as _re

    raw_action = str(gpt_result.get("action", "chat"))
    action = raw_action
    confidence = float(gpt_result.get("confidence", 0.5) or 0.5)
    matched_meds = list(gpt_result.get("matched_medicines", []) or [])
    recovery_used = "none"

    # ── Stage 1: EXTRACT — validate GPT medicines against catalog ──
    if matched_meds and not tool_calls:
        from app.services.medicine_search import get_medicine_by_name

        validated: list[dict] = []
        for med in matched_meds[:5]:
            med_name = str(
                med.get("matched_medicine_name")
                or med.get("name")
                or med.get("medicine_name")
                or ""
            ).strip()
            if not med_name:
                continue
            catalog_med = await get_medicine_by_name(med_name)
            if not catalog_med:
                continue
            qty_raw = med.get("requested_qty", med.get("quantity"))
            try:
                qty = int(qty_raw) if qty_raw not in (None, "", 0) else 1
            except (TypeError, ValueError):
                qty = 1
            qty = max(1, qty)
            req_unit = str(med.get("requested_unit") or "unknown").strip().lower()
            if req_unit not in {"strip", "pack", "tablet"}:
                req_unit = "unknown"
            validated.append({
                "name": str(catalog_med.get("name", med_name) or med_name),
                "matched_medicine_name": str(catalog_med.get("name", med_name) or med_name),
                "matched_medicine_id": str(catalog_med.get("medicine_id", "") or ""),
                "price": float(catalog_med.get("price", med.get("price", 0)) or 0),
                "requested_qty": qty,
                "requested_unit": req_unit,
                "quantity": qty,
            })
        if len(validated) < len(matched_meds):
            logger.warning(
                "[%s] Catalog validation: GPT returned %d, validated %d",
                trace_id[:8], len(matched_meds), len(validated),
            )
        matched_meds = validated
        if not matched_meds and action in {"confirm_order", "execute_order"}:
            action = "chat"
            recovery_used = "hallucination_guard"

    # ── Stage 2: ENRICH — add search hint results (top 1 per query) ──
    if action == "recommend":
        hinted_recs = _recommendations_from_search_hints(search_hints, limit=3)
        if hinted_recs:
            matched_meds = hinted_recs
            recovery_used = "search_hint_recommendation"
        elif not matched_meds:
            action = "chat"
            gpt_result["message"] = (
                "I could not fetch reliable recommendations right now. "
                "Could you share your main symptom once more?"
            )
    elif action in {"confirm_order", "execute_order", "modify_cart"}:
        # For order actions: only add search hint medicines if matched_meds
        # doesn't already cover them. Use strict top-1 per hint.
        if search_hints and not matched_meds:
            hinted = _medicines_from_search_hints(search_hints, message=message)
            if hinted:
                matched_meds = hinted[:2]  # strict limit
                recovery_used = "search_hint_order_recovery"
    elif action == "chat" and not matched_meds and search_hints:
        # GPT said chat but search happened — might have medicines
        hinted = _medicines_from_search_hints(search_hints, message=message)
        if hinted:
            matched_meds = hinted[:2]
            recovery_used = "search_hint_fallback"

    # ── Stage 2b: Low-confidence clarification ──
    if (
        not matched_meds
        and tool_calls
        and any(tc.get("tool") == "search_medicine" for tc in tool_calls)
        and action in {"chat", "confirm_order", "recommend"}
    ):
        from app.services.medicine_search import resolve_medicine_candidates

        resolved = await resolve_medicine_candidates(query=message, top_k=2)
        if resolved.get("status") == "low_confidence" and resolved.get("candidates"):
            candidates = resolved.get("candidates", [])[:2]
            options = " or ".join(f"'{c.get('name', 'this medicine')}'" for c in candidates)
            action = "chat"
            gpt_result["message"] = f"I might have misheard that. Did you mean {options}?"
            confidence = max(confidence, float(resolved.get("best_confidence", 0.0) or 0.0))
            recovery_used = "candidate_clarification"

    # ── Stage 2c: Promote chat→recommend if we have matches + search results ──
    if action == "chat" and matched_meds and parsed_qty.get("kind") != "exact":
        if any(isinstance(h, dict) and h.get("results") for h in search_hints):
            action = "recommend"
            hinted_recs = _recommendations_from_search_hints(search_hints, limit=3)
            if hinted_recs:
                matched_meds = hinted_recs
                recovery_used = "chat_to_recommend_promotion"

    # ── Stage 3: GAP FILL — auto-search user-mentioned but missed medicines ──
    searched_queries = {
        tc["args"].get("query", "").lower()
        for tc in tool_calls
        if tc.get("tool") == "search_medicine"
    }
    if searched_queries:
        mentioned = _extract_medicine_mentions(message)
        missing = [
            m for m in mentioned
            if not any(q in m.lower() or m.lower() in q for q in searched_queries)
        ]
        if missing:
            logger.info(
                "[%s] Gap detected: mentioned=%s searched=%s missing=%s",
                trace_id[:8], mentioned, list(searched_queries), missing,
            )
            for missed in missing[:2]:  # limit gap searches
                try:
                    result_text = await _execute_tool(
                        "search_medicine", {"query": missed}, db=db, user_id=user_id,
                    )
                    parsed = json.loads(result_text) if result_text else {}
                    hint = _extract_search_hint({"query": missed}, parsed)
                    if hint:
                        gap_meds = _medicines_from_search_hints([hint], message=message)
                        if gap_meds:
                            matched_meds.extend(gap_meds[:1])  # top 1 only
                            recovery_used = "gap_fill"
                except Exception as e:
                    logger.warning("[%s] Gap search failed: %s: %s", trace_id[:8], missed, e)

    # ── Stage 4: DEDUPLICATE — single pass, normalized base names ──
    if len(matched_meds) > 1:
        matched_meds = _deduplicate_medicines(matched_meds)

    # ── Stage 5: MERGE CART — combine with pending state ──
    quote = None
    if matched_meds and pending_medicines and action in {"modify_cart", "confirm_order", "chat"}:
        merged_quote, merged_list = await _merge_into_pending_cart(pending, matched_meds, message)
        if merged_quote and merged_list:
            state["quote"] = merged_quote
            matched_meds = canonical_medicines_from_quote(merged_quote)
            quote = merged_quote
            if action == "modify_cart":
                action = "confirm_order"
            recovery_used = "cart_merge"

    # ── Stage 6: BUILD QUOTE — price and resolve action ──
    has_per_item_quantities = bool(matched_meds) and all(
        (med.get("requested_qty") or med.get("quantity"))
        and str(med.get("requested_unit") or "").strip().lower() in {"strip", "pack", "tablet"}
        for med in matched_meds
    )

    should_build_quote = bool(matched_meds) and not quote and (
        action in {"confirm_order", "execute_order", "modify_cart"}
        or (action == "chat" and parsed_qty.get("kind") == "exact")
        or (action == "chat" and has_per_item_quantities)
    )

    if should_build_quote:
        quote = await _quote_from_medicines(matched_meds, message)
        if quote:
            state["quote"] = quote
            canonical = canonical_medicines_from_quote(quote)
            if canonical:
                matched_meds = canonical

            quantity_status = quote_quantity_status(quote)
            if quantity_status in {"range_needs_choice", "missing"}:
                if action != "recommend":
                    action = "chat"
                    gpt_result["message"] = (
                        build_quantity_prompt_voice(quote)
                        if is_voice_mode
                        else build_quantity_prompt_message(quote)
                    )
            elif action in {"chat", "recommend"}:
                action = "confirm_order"
                gpt_result["message"] = build_confirmation_message(quote, is_voice_mode)

    # Store recommendations if no quote
    if matched_meds and not quote and action == "recommend":
        state["recommendations"] = matched_meds

    return action, matched_meds, quote, confidence, recovery_used


async def run_pharmacy_workflow(
    user_id: str,
    message: str,
    conversation_history: list | None = None,
    db: AsyncSession | None = None,
    pending_state: dict | None = None,
    prescription_context: dict | None = None,
    is_voice_mode: bool = False,
) -> PharmacyState:
    """Run the pharmacy pipeline with deterministic quote + confirm behavior."""
    trace_id = str(uuid.uuid4())
    history = conversation_history or []

    steps = {s["id"]: _make_step(s) for s in PIPELINE_STEPS}
    state: PharmacyState = {
        "user_id": user_id,
        "message": message,
        "conversation_history": history,
        "trace_id": trace_id,
        "intent": {},
        "user_profile": {},
        "prediction": {},
        "safety_check": {},
        "inventory_check": {},
        "final_decision": {},
        "execution_result": {},
        "quote": {},
        "pending_state": normalize_pending_state(pending_state),
        "prescription_context": prescription_context or {},
        "response_message": "",
        "understanding_confidence": 0.0,
        "error": "",
        "pipeline_steps": [],
        "_is_voice_mode": is_voice_mode,
    }

    try:
        # ── CART CHECKOUT FAST-PATH ──────────────────────────────────
        # The CartDrawer sends "My cart checkout is complete.Order ID: <uuid>"
        # after a successful checkout.  Detect this early and return a
        # delivery-confirmation response so the frontend shows a
        # DeliveryTracker instead of routing through the full pipeline.
        import re as _re
        _cart_done_match = _re.search(
            r"(?:cart\s+checkout\s+is\s+complete|checkout\s+complete).*?Order\s*ID[:.]?\s*([0-9a-fA-F-]{36})",
            message,
            _re.IGNORECASE,
        )
        if _cart_done_match:
            _cart_order_id = _cart_done_match.group(1)
            logger.info("[%s] Cart checkout acknowledged for order %s", trace_id[:8], _cart_order_id)
            state["pending_state"] = empty_pending_state()
            state["response_message"] = (
                "Your order has been placed successfully! "
                "You can track your delivery status below."
            )
            state["understanding_confidence"] = 0.95
            state["final_decision"] = {
                "action": "delivery_confirmed",
                "combined_confidence": 0.95,
                "risk_level": "low",
                "needs_clarification": False,
                "reasoning": "Cart checkout completed — order confirmed",
            }
            state["execution_result"] = {
                "success": True,
                "order_id": _cart_order_id,
            }
            _set_skipped(
                steps,
                ["profiling", "predictive", "medicine_search", "pharmacist", "safety", "inventory", "execution"],
                "Cart checkout fast-path",
            )
            state["pipeline_steps"] = list(steps.values())
            return state

        pending = normalize_pending_state(state.get("pending_state"))
        initial_pending_phase = pending_phase(pending)
        voice_turn_count = len(
            [
                turn
                for turn in history
                if str(turn.get("role", "")).lower() in {"user", "assistant", "bot"}
            ]
        )
        should_run_profile_predictive = bool(db) and (
            not is_voice_mode
            or (initial_pending_phase == "none" and voice_turn_count <= 2)
        )

        if should_run_profile_predictive:
            steps["profiling"]["status"] = "running"
            t0 = time.perf_counter()
            if db:
                state = await profiling_agent(state, db)
            steps["profiling"]["duration_ms"] = round((time.perf_counter() - t0) * 1000)
            steps["profiling"]["status"] = "completed"
            steps["profiling"]["output"] = {
                "user_found": state.get("user_profile", {}).get("exists", False),
                "chronic_conditions": state.get("user_profile", {}).get("chronic_conditions", []),
            }

            steps["predictive"]["status"] = "running"
            t0 = time.perf_counter()
            if db:
                state = await predictive_agent(state, db)
            steps["predictive"]["duration_ms"] = round((time.perf_counter() - t0) * 1000)
            steps["predictive"]["status"] = "completed"
            steps["predictive"]["output"] = {
                "refill_alerts": len(state.get("prediction", {}).get("refill_suggestions", [])),
            }


        else:
            _set_skipped(
                steps,
                ["profiling", "predictive"],
                "Voice fast path: reuse persisted state for non-initial turns",
            )

        pending = await _rebuild_pending_state(
            pending,
            message=message,
            history=history,
            intent_items=state.get("intent", {}).get("items", []),
        )
        state["pending_state"] = pending
        pending_medicines = pending.get("pending_medicines", [])
        pending_quote = pending.get("pending_quote", {})
        pending_flow_phase = pending_phase(pending)
        parsed_qty = parse_quantity_and_unit(message)
        deterministic_execute = False

        # ── Detect modify-intent early: user wants to add/remove/change ──
        _MODIFY_INTENT_KEYWORDS = (
            "add ", "also want", "also need", "one more", "another medicine",
            "remove ", "change ", "modify", "update ", "replace ",
            "aur ek", "aur chahiye", "ek aur", "bhi chahiye", "bhi do",
            "hatao", "nikal", "badal",
        )
        _msg_lower = message.lower().strip()
        _user_wants_modify = any(kw in _msg_lower for kw in _MODIFY_INTENT_KEYWORDS)

        # Also detect new medicine names not in the pending quote.
        # If user says "and citrazine 2 strips" while Dolo is pending, break out
        # of confirmation and go through full pharmacist pipeline.
        if not _user_wants_modify and pending_medicines:
            import re as _re
            _KNOWN_MEDS_RE = [
                (r"\bcrocin\b", "Crocin"), (r"\bdolo\b", "Dolo"),
                (r"\bamlodip", "Amlodipine"), (r"\btelma\b", "Telma"),
                (r"\bmetformin\b", "Metformin"), (r"\bglycomet\b", "Glycomet"),
                (r"\bazithro", "Azithromycin"), (r"\bcetiriz", "Cetirizine"),
                (r"\bcitrazine\b", "Cetirizine"),  # common misspelling
                (r"\bpanto", "Pantoprazole"), (r"\batorva", "Atorvastatin"),
                (r"\becosprin\b", "Ecosprin"), (r"\bmontair\b", "Montair"),
                (r"\bparacetamol\b", "Paracetamol"), (r"\baspirin\b", "Aspirin"),
            ]
            _pending_names = {(m.get("name") or "").lower() for m in pending_medicines}
            for _pat, _label in _KNOWN_MEDS_RE:
                if _re.search(_pat, _msg_lower):
                    # Check if this medicine is already in the pending list
                    if not any(_label.lower() in pn for pn in _pending_names):
                        _user_wants_modify = True
                        logger.info(
                            "[%s] New medicine '%s' detected during confirmation — breaking to pharmacist",
                            trace_id[:8], _label,
                        )
                        break

        if pending_flow_phase != "none":
            logger.info(
                "[%s] pending quote_signature=%s awaiting_confirmation=%s quantity_resolved=%s phase=%s",
                trace_id[:8],
                pending.get("quote_signature", ""),
                bool(pending.get("awaiting_confirmation")),
                bool(pending.get("quantity_resolved")),
                pending_flow_phase,
            )

        if pending_flow_phase in {"collect_quantity", "await_confirm"} and not _user_wants_modify:
            cancel_probe = await classify_confirmation_intent(
                message=message,
                pending_quote=pending_quote,
                conversation_history=history,
            )
            cancel_intent = str(cancel_probe.get("intent", "unclear") or "unclear")
            cancel_confidence = float(cancel_probe.get("confidence", 0.0) or 0.0)
            if cancel_intent == "cancel" and cancel_confidence >= 0.7:
                state["pending_state"] = empty_pending_state()
                state["response_message"] = "Understood. I have canceled this order request."
                state["understanding_confidence"] = cancel_confidence
                state["final_decision"] = {
                    "action": "chat",
                    "combined_confidence": cancel_confidence,
                    "risk_level": "low",
                    "needs_clarification": False,
                    "reasoning": "User canceled pending order flow",
                }
                _set_skipped(
                    steps,
                    ["medicine_search", "pharmacist", "safety", "inventory", "execution"],
                    "Pending order canceled by user intent classifier",
                )
                state["pipeline_steps"] = list(steps.values())
                return state

        if (
            not deterministic_execute
            and not _user_wants_modify
            and pending_medicines
            and parsed_qty.get("kind") == "exact"
            and parsed_qty.get("exact_qty")
        ):
            exact_qty = int(parsed_qty["exact_qty"])
            parsed_unit = str(parsed_qty.get("unit") or "unknown")
            if parsed_unit == "unknown":
                options = pending_quote.get("quantity_options") or []
                normalized = []
                for value in options:
                    try:
                        normalized.append(int(value))
                    except (TypeError, ValueError):
                        continue
                if exact_qty in normalized:
                    parsed_unit = str(pending_quote.get("display_unit") or "strip")

            if parsed_unit in {"strip", "pack", "tablet"}:
                rewritten_medicines = []
                for med in pending_medicines:
                    med_copy = dict(med)
                    med_copy["quantity"] = exact_qty
                    med_copy["requested_qty"] = exact_qty
                    med_copy["requested_unit"] = parsed_unit
                    rewritten_medicines.append(med_copy)

                quote = await _quote_from_medicines(
                    rewritten_medicines, message=f"{exact_qty} {parsed_unit}"
                )
                if quote:
                    canonical = canonical_medicines_from_quote(quote)
                    state["quote"] = quote
                    if can_emit_confirm_order(quote):
                        state["pending_state"] = build_pending_state(
                            quote,
                            canonical,
                            awaiting_confirmation=True,
                            confirmation_prompted_once=True,
                        )
                        state["response_message"] = build_confirmation_message(quote, is_voice_mode)
                        state["understanding_confidence"] = 0.9
                        state["final_decision"] = {
                            "action": "confirm_order",
                            "combined_confidence": 0.9,
                            "risk_level": "low",
                            "needs_clarification": True,
                            "reasoning": "Pending quantity resolved deterministically",
                        }
                    else:
                        state["pending_state"] = build_pending_state(
                            quote,
                            canonical,
                            awaiting_confirmation=False,
                            confirmation_prompted_once=False,
                        )
                        state["response_message"] = (
                            build_quantity_prompt_voice(quote)
                            if is_voice_mode
                            else build_quantity_prompt_message(quote)
                        )
                        state["understanding_confidence"] = 0.88
                        state["final_decision"] = {
                            "action": "chat",
                            "combined_confidence": 0.88,
                            "risk_level": "low",
                            "needs_clarification": True,
                            "reasoning": "Pending quantity still unresolved",
                        }
                    _set_skipped(
                        steps,
                        ["medicine_search", "pharmacist", "safety", "inventory", "execution"],
                        "Deterministic pending quantity update",
                    )
                    await _inject_counseling(state)
                    state["pipeline_steps"] = list(steps.values())
                    return state

        # ── Handle post-payment confirmation ───────────────────────────
        if pending.get("payment_requested"):
            payment_order_id = str(pending.get("payment_order_id", "") or "")

            # Run confirmation classifier (same for voice and text)
            steps["medicine_search"]["status"] = "skipped"
            steps["medicine_search"]["output"] = {"reason": "Payment already requested; awaiting user ack"}
            steps["pharmacist"]["status"] = "running"
            t0 = time.perf_counter()

            # Use LLM-based classifier — no hardcoded keywords.
            # For voice: auto-detection happens BEFORE this in elevenlabs_llm.py
            # via Redis voice_payment_result:{user_id}. This path is only reached
            # in text mode or as a fallback.
            confirmation_result = await classify_confirmation_intent(
                message=message,
                pending_quote=pending_quote,
                conversation_history=history,
            )
            ci = str(confirmation_result.get("intent", "unclear") or "unclear")
            cc = float(confirmation_result.get("confidence", 0.0) or 0.0)

            steps["pharmacist"]["duration_ms"] = round((time.perf_counter() - t0) * 1000)
            steps["pharmacist"]["status"] = "completed"
            steps["pharmacist"]["output"] = {
                "action": "payment_ack",
                "confirmation_intent": ci,
                "confirmation_confidence": cc,
            }

            if ci == "confirm":
                # ── Payment confirmed — clear pending state ──
                state["pending_state"] = empty_pending_state()
                order_total = format_inr(pending_quote.get("total_amount", 0))
                items_summary = ", ".join(
                    f"{line.get('name', 'Medicine')} x{line.get('billing_qty', 1)}"
                    for line in quote_lines(pending_quote)
                )

                if is_voice_mode:
                    # Voice-friendly confirmation — natural, conversational
                    state["response_message"] = (
                        f"Your order for {items_summary} is confirmed! "
                        f"Total is {order_total} rupees. "
                        "It will arrive tomorrow between 6 and 9 PM. "
                        "Is there anything else you need?"
                    )
                else:
                    state["response_message"] = (
                        f"Your order for {items_summary} has been confirmed and is being processed.\n\n"
                        f"**Total: ₹{order_total}**\n\n"
                        "You will be notified once your order is ready for pickup.\n\n"
                        "Is there anything else I can help you with?"
                    )

                state["final_decision"] = {
                    "action": "delivery_confirmed",
                    "combined_confidence": 0.95,
                    "risk_level": "low",
                    "needs_clarification": False,
                    "reasoning": "Payment acknowledged; order confirmed",
                }

            elif ci == "cancel":
                state["pending_state"] = empty_pending_state()
                if is_voice_mode:
                    state["response_message"] = "Order cancelled. Let me know if you need anything else."
                else:
                    state["response_message"] = "Order cancelled. Let me know if you need anything else."
                state["final_decision"] = {
                    "action": "chat",
                    "combined_confidence": 0.9,
                    "risk_level": "low",
                    "needs_clarification": False,
                    "reasoning": "User cancelled payment",
                }
            else:
                # Unclear — ask again
                if is_voice_mode:
                    state["response_message"] = (
                        "I'll wait while you complete the payment. "
                        "Just let me know once you're done."
                    )
                else:
                    state["response_message"] = (
                        "Your order has been placed and is awaiting payment. "
                        "Would you like to confirm or cancel?"
                    )
                state["pending_state"] = pending  # keep payment_requested=True
                state["quote"] = pending_quote
                state["final_decision"] = {
                    "action": "request_payment",
                    "combined_confidence": 0.8,
                    "risk_level": "low",
                    "needs_clarification": True,
                    "reasoning": "Payment ack intent unclear; waiting for user",
                }

            _set_skipped(
                steps,
                ["safety", "inventory", "execution"],
                "Post-payment acknowledgement flow",
            )
            state["pipeline_steps"] = list(steps.values())
            return state


        if is_confirmable_pending(pending) and not _user_wants_modify:
            steps["medicine_search"]["status"] = "skipped"
            steps["medicine_search"]["output"] = {"reason": "Pending confirmation intent classification"}
            steps["pharmacist"]["status"] = "running"
            t0 = time.perf_counter()
            confirmation_result = await classify_confirmation_intent(
                message=message,
                pending_quote=pending_quote,
                conversation_history=history,
            )
            classifier_ms = round((time.perf_counter() - t0) * 1000)
            steps["pharmacist"]["duration_ms"] = classifier_ms
            steps["pharmacist"]["status"] = "completed"

            if confirmation_result.get("infra_error"):
                code = str(confirmation_result.get("error_code") or "llm_unavailable")
                status = int(confirmation_result.get("error_status") or 503)
                message_text = str(
                    confirmation_result.get("message")
                    or confirmation_result.get("error_message")
                    or "Model service unavailable."
                )
                steps["pharmacist"]["output"] = {
                    "action": "infra_error",
                    "error_code": code,
                    "error_status": status,
                    "classifier": "gpt_confirmation_intent",
                    "classifier_invoked": True,
                    "quote_signature": pending.get("quote_signature", ""),
                }
                _set_skipped(
                    steps,
                    ["safety", "inventory", "execution"],
                    f"Infrastructure error: {code}",
                )
                state["error_code"] = code
                state["error_status"] = status
                state["error_message"] = message_text
                state["response_message"] = message_text
                state["final_decision"] = {
                    "action": "infra_error",
                    "combined_confidence": 0.0,
                    "risk_level": "high",
                    "needs_clarification": True,
                    "reasoning": f"Confirmation classifier error: {code}",
                }
                state["pipeline_steps"] = list(steps.values())
                return state

            confirmation_intent = str(confirmation_result.get("intent", "unclear") or "unclear")
            confirmation_confidence = float(confirmation_result.get("confidence", 0.0) or 0.0)
            pending["last_confirmation_intent"] = confirmation_intent
            pending["last_confirmation_confidence"] = confirmation_confidence

            steps["pharmacist"]["output"] = {
                "action": "confirmation_intent",
                "classifier": "gpt_confirmation_intent",
                "classifier_invoked": True,
                "confirmation_intent": confirmation_intent,
                "confirmation_confidence": confirmation_confidence,
                "quote_signature": pending.get("quote_signature", ""),
                "awaiting_confirmation": bool(pending.get("awaiting_confirmation")),
            }
            logger.info(
                "[%s] confirmation_intent=%s confidence=%.2f quote_signature=%s awaiting_confirmation=%s",
                trace_id[:8],
                confirmation_intent,
                confirmation_confidence,
                pending.get("quote_signature", ""),
                bool(pending.get("awaiting_confirmation")),
            )

            if confirmation_intent == "confirm":
                # Proceed directly to order execution / payment

                canonical_quote = pending_quote
                canonical_medicines = canonical_medicines_from_quote(canonical_quote)
                if not can_emit_confirm_order(canonical_quote) and canonical_medicines:
                    rebuilt_quote = await _quote_from_medicines(canonical_medicines, message=message)
                    if rebuilt_quote:
                        canonical_quote = rebuilt_quote
                        canonical_medicines = canonical_medicines_from_quote(rebuilt_quote)
                        pending = build_pending_state(
                            canonical_quote,
                            canonical_medicines,
                            awaiting_confirmation=True,
                            confirmation_prompted_once=True,
                            last_confirmation_intent=confirmation_intent,
                            last_confirmation_confidence=confirmation_confidence,
                        )

                state["quote"] = canonical_quote
                # Skip auto-add to cart — chat orders go directly to payment
                # await _auto_add_to_cart(user_id, canonical_quote, db)
                intent_items = build_intent_items_from_quote(canonical_quote, confidence=0.92)
                if intent_items:
                    state["intent"] = {
                        "items": intent_items,
                        "raw_query": message,
                        "overall_confidence": 0.92,
                    }
                    state["pending_state"] = pending
                    state["response_message"] = "Understood. Processing your order now."
                    state["understanding_confidence"] = max(0.7, confirmation_confidence)
                    state["final_decision"] = {
                        "action": "proceed",
                        "combined_confidence": max(0.7, confirmation_confidence),
                        "risk_level": "low",
                        "needs_clarification": False,
                        "reasoning": "Pending quote confirmed by GPT intent classifier",
                    }
                    deterministic_execute = True
                else:
                    pending = await _rebuild_pending_state(
                        pending,
                        message=message,
                        history=history,
                        intent_items=[],
                    )
                    pending_quote = pending.get("pending_quote", {})
                    state["pending_state"] = pending
                    state["quote"] = pending_quote
                    state["response_message"] = (
                        build_quantity_prompt_message(pending_quote)
                        if quote_lines(pending_quote)
                        else "Please share the medicine name and quantity to continue."
                    )
                    state["understanding_confidence"] = 0.65
                    state["final_decision"] = {
                        "action": "chat",
                        "combined_confidence": 0.65,
                        "risk_level": "low",
                        "needs_clarification": True,
                        "reasoning": "Confirmation intent was positive but executable quote context was incomplete",
                    }
                    _set_skipped(
                        steps,
                        ["safety", "inventory", "execution"],
                        "Awaiting canonical quote details",
                    )
                    state["pipeline_steps"] = list(steps.values())
                    return state
            elif confirmation_intent == "cancel":
                # Order cancellation
                state["pending_state"] = empty_pending_state()
                state["response_message"] = (
                    confirmation_result.get("message")
                    or "Understood. I will not place this order. Share any new medicine details whenever you are ready."
                )
                state["understanding_confidence"] = max(0.6, confirmation_confidence)
                state["final_decision"] = {
                    "action": "chat",
                    "combined_confidence": max(0.6, confirmation_confidence),
                    "risk_level": "low",
                    "needs_clarification": False,
                    "reasoning": "Pending order cancelled by GPT intent classifier",
                }
                _set_skipped(steps, ["safety", "inventory", "execution"], "Pending order canceled")
                state["pipeline_steps"] = list(steps.values())
                return state
            else:
                state["pending_state"] = pending
                state["quote"] = pending_quote
                state["response_message"] = (
                    confirmation_result.get("message")
                    or "I am holding this order. Tell me in your own words if you want me to place it, cancel it, or change quantity."
                )
                state["understanding_confidence"] = confirmation_confidence
                state["final_decision"] = {
                    "action": "confirm_order",
                    "combined_confidence": confirmation_confidence,
                    "risk_level": "low",
                    "needs_clarification": True,
                    "reasoning": "Confirmation intent unclear; keeping same pending quote",
                }
                _set_skipped(
                    steps,
                    ["safety", "inventory", "execution"],
                    "Awaiting clearer confirmation intent",
                )
                state["pipeline_steps"] = list(steps.values())
                return state

        gpt_action = "execute_order" if deterministic_execute else "chat"
        gpt_confidence = 0.92 if deterministic_execute else 0.0
        matched_meds = canonical_medicines_from_quote(state.get("quote", {})) if deterministic_execute else []
        gpt_result = {}

        # Guard: if the user sends a standalone confirmation word (yes/yeah/go ahead/etc.)
        # but there is no pending order, respond gracefully rather than sending the message
        # to pharmacist_chat where GPT will spin through tool-call iterations and fail.
        if not deterministic_execute:
            steps["pharmacist"]["status"] = "running"
            t0 = time.perf_counter()
            # Inject refill alerts + inventory negotiation into user_profile context
            _pharmacist_profile = dict(state.get("user_profile") or {})
            _prediction = state.get("prediction") or {}
            _refill_alerts = _prediction.get("alerts", [])
            if _refill_alerts:
                _pharmacist_profile["refill_alerts"] = _refill_alerts
            _inv_check = state.get("inventory_check") or {}
            _neg_msg = _inv_check.get("negotiation_message")
            if _neg_msg:
                _pharmacist_profile["inventory_negotiation"] = _neg_msg
            gpt_result = await pharmacist_chat(
                message=message,
                conversation_history=history,
                user_profile=_pharmacist_profile,
                db=db,
                user_id=state["user_id"],
                prescription_context=state.get("prescription_context"),
                is_voice_mode=is_voice_mode,
            )
            pharmacist_ms = round((time.perf_counter() - t0) * 1000)
            steps["pharmacist"]["duration_ms"] = pharmacist_ms
            steps["pharmacist"]["status"] = "completed"

            if gpt_result.get("infra_error"):
                code = str(gpt_result.get("error_code") or "llm_unavailable")
                status = int(gpt_result.get("error_status") or 503)
                message_text = str(gpt_result.get("message") or "Model service unavailable.")
                steps["medicine_search"]["status"] = "skipped"
                steps["medicine_search"]["output"] = {"reason": f"Infra error: {code}"}
                steps["pharmacist"]["output"] = {
                    "action": "infra_error",
                    "error_code": code,
                    "error_status": status,
                }
                _set_skipped(
                    steps,
                    ["safety", "inventory", "execution"],
                    f"Infrastructure error: {code}",
                )
                state["error_code"] = code
                state["error_status"] = status
                state["error_message"] = message_text
                state["response_message"] = message_text
                state["final_decision"] = {
                    "action": "infra_error",
                    "combined_confidence": 0.0,
                    "risk_level": "high",
                    "needs_clarification": True,
                    "reasoning": f"LLM infrastructure error: {code}",
                }
                state["pipeline_steps"] = list(steps.values())
                return state

            raw_action = str(gpt_result.get("action", "chat"))
            gpt_action = raw_action
            gpt_confidence = float(gpt_result.get("confidence", 0.5) or 0.5)
            matched_meds = list(gpt_result.get("matched_medicines", []) or [])
            tool_calls = gpt_result.get("_tool_calls", []) or []
            search_hints = gpt_result.get("_search_hints", []) or []
            recovery_used = "none"

            # Prescription upload request — skip all medicine/order processing
            if gpt_action == "request_prescription_upload":
                state["response_message"] = gpt_result.get("message", "Please upload your prescription. I\'ll review it for you.")
                state["final_decision"] = {
                    "action": "request_prescription_upload",
                    "combined_confidence": gpt_confidence,
                    "risk_level": "low",
                    "needs_clarification": False,
                    "reasoning": "User requested prescription upload",
                }
                steps["pharmacist"]["status"] = "completed"
                steps["pharmacist"]["duration_ms"] = pharmacist_ms
                steps["pharmacist"]["output"] = {
                    "action": "request_prescription_upload",
                    "raw_action": raw_action,
                    "normalized_action": "request_prescription_upload",
                    "confidence": gpt_confidence,
                    "medicines_matched": 0,
                    "matched_names": [],
                }
                _set_skipped(steps, ["medicine_search", "safety", "inventory", "execution"], "Prescription upload")
                state["pipeline_steps"] = list(steps.values())
                return state

            # ── Prescription keyword override ──
            if gpt_action == "chat" and not matched_meds:
                msg_lower = message.lower()
                if any(kw in msg_lower for kw in _RX_UPLOAD_KEYWORDS):
                    gpt_action = "request_prescription_upload"
                    gpt_result["action"] = "request_prescription_upload"
                    if not gpt_result.get("message"):
                        gpt_result["message"] = "Please upload your prescription. I will review it for you."

            # ══════════════════════════════════════════════════
            # CLEAN MEDICINE RESOLUTION PIPELINE (single-pass)
            # ══════════════════════════════════════════════════
            gpt_action, matched_meds, quote, gpt_confidence, recovery_used = await _resolve_medicines_pipeline(
                gpt_result=gpt_result,
                search_hints=search_hints,
                tool_calls=tool_calls,
                pending=pending,
                pending_medicines=pending_medicines,
                message=message,
                parsed_qty=parsed_qty,
                state=state,
                db=db,
                user_id=user_id,
                trace_id=trace_id,
                is_voice_mode=is_voice_mode,
            )
            gpt_result["action"] = gpt_action
            gpt_result["matched_medicines"] = matched_meds

            # ── PRE-EMPTIVE Rx GATE ──────────────────────────────────────
            # Before quantity/confirm, check if any matched medicine is
            # Rx-required and the user has no valid prescription.
            # SKIP if prescription_context is present — the user already uploaded a prescription.
            has_rx_context = bool(state.get("prescription_context", {}).get("medicines"))
            if matched_meds and gpt_action in {"confirm_order", "recommend", "modify_cart"} and not has_rx_context:
                rx_blocked_names = []
                for med in matched_meds:
                    if med.get("rx_required") or med.get("prescription_required"):
                        # Quick check: does user have a valid Rx for this med?
                        has_rx = False
                        if db and user_id:
                            try:
                                from app.models.prescription import Prescription as RxModel
                                rx_result = await db.execute(
                                    select(RxModel).where(
                                        RxModel.user_id == user_id,
                                        RxModel.verified == True,
                                    )
                                )
                                for rx in rx_result.scalars().all():
                                    extracted = rx.extracted_data or {}
                                    for rx_med in extracted.get("medicines", []):
                                        rx_nm = (rx_med.get("name") or "").lower()
                                        med_nm = (med.get("name") or "").lower()
                                        if med_nm and (med_nm in rx_nm or rx_nm in med_nm):
                                            has_rx = True
                                            break
                                    if has_rx:
                                        break
                            except Exception as rx_err:
                                logger.warning("Pre-emptive Rx check error: %s", rx_err)
                        if not has_rx:
                            rx_blocked_names.append(med.get("name", "this medicine"))

                if rx_blocked_names:
                    names_str = ", ".join(rx_blocked_names)
                    gpt_action = "request_prescription_upload"
                    gpt_result["action"] = "request_prescription_upload"
                    if is_voice_mode:
                        gpt_result["message"] = (
                            f"{names_str} requires a valid prescription. "
                            "Please upload your prescription to continue, "
                            "or I can suggest similar over-the-counter alternatives."
                        )
                    else:
                        gpt_result["message"] = (
                            f"**{names_str}** requires a valid prescription. "
                            "Please upload your prescription to continue, "
                            "or I can suggest OTC alternatives."
                        )
                    state["response_message"] = gpt_result["message"]
                    state["final_decision"] = {
                        "action": "request_prescription_upload",
                        "combined_confidence": 0.95,
                        "risk_level": "high",
                        "needs_clarification": False,
                        "reasoning": f"Pre-emptive Rx block for: {names_str}",
                    }
                    _set_skipped(steps, ["safety", "inventory", "execution"], f"Rx required: {names_str}")
                    state["pipeline_steps"] = list(steps.values())
                    return state

            if gpt_action == "confirm_order":
                quote = state.get("quote", {})
                if can_emit_confirm_order(quote):
                    # Skip auto-add to cart — chat orders go directly to payment
                    # await _auto_add_to_cart(user_id, quote, db)
                    gpt_result["message"] = build_confirmation_message(quote, is_voice_mode)
                elif quote_lines(quote):
                    # Quote exists but quantity unresolved — fall back to chat
                    gpt_action = "chat"
                    gpt_result["action"] = "chat"
                    # ALWAYS overwrite the message. If GPT outputted action=confirm_order, its message
                    # is hallucinating a confirmation, but we still need the quantity.
                    gpt_result["message"] = build_quantity_prompt_message(quote)
                else:
                    gpt_action = "chat"
                    gpt_result["action"] = "chat"
                    gpt_result["message"] = (
                        "Please share the medicine name and exact quantity so I can prepare the order."
                    )

            search_calls = [tc for tc in tool_calls if tc.get("tool") == "search_medicine"]
            if search_calls:
                steps["medicine_search"]["status"] = "completed"
                steps["medicine_search"]["duration_ms"] = pharmacist_ms
                steps["medicine_search"]["output"] = {
                    "searches": len(search_calls),
                    "queries": [tc.get("args", {}).get("query", "") for tc in search_calls],
                    "hint_candidates": sum(
                        len(hint.get("results", []) or [])
                        for hint in search_hints
                        if isinstance(hint, dict)
                    ),
                }
            else:
                steps["medicine_search"]["status"] = "skipped"
                steps["medicine_search"]["output"] = {"reason": "No search tool call"}

            steps["pharmacist"]["output"] = {
                "action": gpt_action,
                "raw_action": raw_action,
                "normalized_action": gpt_action,
                "confidence": gpt_confidence,
                "medicines_matched": len(matched_meds),
                "matched_names": [m.get("name", "") for m in matched_meds],
                "language": gpt_result.get("detected_language", "en"),
                "tool_calls": len(tool_calls),
                "search_hints": len(search_hints),
                "recovery_used": recovery_used,
                "quote_total": state.get("quote", {}).get("total_amount"),
                "quote_unit": state.get("quote", {}).get("display_unit"),
                "quote_signature": build_quote_signature(state.get("quote", {})),
                "fallback_reason": gpt_result.get("_fallback_reason"),
                "tool_call_count": gpt_result.get("_tool_call_count"),
                "last_tools": gpt_result.get("_last_tools", []),
            }

            state["response_message"] = gpt_result.get("message", "")
            if gpt_action != "execute_order" and _claims_order_completed(state["response_message"]):
                if gpt_action == "confirm_order" and can_emit_confirm_order(state.get("quote", {})):
                    state["response_message"] = build_confirmation_message(state["quote"])
                elif quote_lines(state.get("quote", {})):
                    state["response_message"] = build_quantity_prompt_message(state["quote"])
                else:
                    state["response_message"] = (
                        "I have not placed this order yet. Please share the medicine name and quantity to continue."
                    )
            state["understanding_confidence"] = gpt_confidence

            intent_items = []
            if quote_lines(state.get("quote")):
                intent_items = build_intent_items_from_quote(state["quote"], gpt_confidence)
            elif matched_meds:
                for med in matched_meds:
                    if not med.get("quantity"):
                        continue
                    intent_items.append(
                        {
                            "medicine_name": med.get("name", ""),
                            "matched_medicine_name": med.get("matched_medicine_name", med.get("name", "")),
                            "matched_medicine_id": med.get("matched_medicine_id", ""),
                            "requested_qty": med.get("requested_qty", med.get("quantity", 1)),
                            "requested_unit": med.get("requested_unit", "strip"),
                            "strip_size": med.get("strip_size", 10),
                            "billing_qty": med.get("billing_qty", med.get("quantity", 1)),
                            "billing_unit": med.get("billing_unit", "strip"),
                            "quantity": med.get("billing_qty", med.get("quantity", 1)),
                            "price": med.get("price", 0),
                            "confidence": gpt_confidence,
                        }
                    )

            if intent_items:
                state["intent"] = {
                    "items": intent_items,
                    "raw_query": message,
                    "overall_confidence": gpt_confidence,
                }

            state["final_decision"] = {
                "action": "proceed" if gpt_action == "execute_order" else gpt_action,
                "combined_confidence": gpt_confidence,
                "risk_level": "low",
                "needs_clarification": gpt_action != "execute_order",
                "reasoning": f"Pharmacist action: {gpt_action}",
            }

            if gpt_action in {"chat", "confirm_order"}:
                quote = state.get("quote", {})
                if quote_lines(quote):
                    canonical = canonical_medicines_from_quote(quote)
                    if gpt_action == "confirm_order":
                        if can_emit_confirm_order(quote):
                            state["pending_state"] = build_pending_state(
                                quote,
                                canonical,
                                awaiting_confirmation=True,
                                confirmation_prompted_once=True,
                            )
                        else:
                            # Quote unresolved — stay in chat, store pending so next qty message resolves it
                            state["response_message"] = build_quantity_prompt_message(quote)
                            state["final_decision"]["action"] = "chat"
                            state["final_decision"]["needs_clarification"] = True
                            state["pending_state"] = build_pending_state(
                                quote,
                                canonical,
                                awaiting_confirmation=False,
                                confirmation_prompted_once=False,
                            )
                    else:
                        # chat with a pending medicine — store so next quantity message can resolve
                        state["pending_state"] = build_pending_state(
                            quote,
                            canonical,
                            awaiting_confirmation=False,
                            confirmation_prompted_once=False,
                        )

            if steps["pharmacist"]["status"] == "completed":
                steps["pharmacist"]["output"]["action"] = state.get("final_decision", {}).get(
                    "action",
                    gpt_action,
                )

        if state.get("final_decision", {}).get("action") != "proceed":
            _set_skipped(
                steps,
                ["safety", "inventory", "execution"],
                f"No order: action={state.get('final_decision', {}).get('action', 'chat')}",
            )
            await _inject_counseling(state)
            state["pipeline_steps"] = list(steps.values())
            return state

        if not state.get("intent", {}).get("items"):
            quote = state.get("quote", {})
            if can_emit_confirm_order(quote):
                canonical = canonical_medicines_from_quote(quote)
                state["pending_state"] = build_pending_state(
                    quote,
                    canonical,
                    awaiting_confirmation=True,
                    confirmation_prompted_once=True,
                )
                state["final_decision"]["action"] = "confirm_order"
                state["final_decision"]["needs_clarification"] = True
                state["response_message"] = (
                    "I am holding this order. Tell me in your own words if you want to place it, "
                    "cancel it, or change quantity."
                )
            elif quote_lines(quote):
                canonical = canonical_medicines_from_quote(quote)
                state["pending_state"] = build_pending_state(
                    quote,
                    canonical,
                    awaiting_confirmation=False,
                    confirmation_prompted_once=False,
                )
                state["final_decision"]["action"] = "chat"
                state["final_decision"]["needs_clarification"] = True
                
                # Check what is missing to give a better prompt
                if not canonical:
                    state["response_message"] = "Please share the medicine name so I can prepare your order."
                elif quote_quantity_status(quote) != "resolved":
                    state["response_message"] = build_quantity_prompt_message(quote)
                else:
                    state["response_message"] = "Could you please clarify your request?"
            else:
                state["final_decision"]["action"] = "chat"
                state["final_decision"]["needs_clarification"] = True
                state["response_message"] = (
                    "Please share the medicine name and exact quantity so I can prepare your order."
                )
            _set_skipped(
                steps,
                ["safety", "inventory", "execution"],
                "Missing executable intent items",
            )
            await _inject_counseling(state)
            state["pipeline_steps"] = list(steps.values())
            return state

        steps["safety"]["status"] = "running"
        t0 = time.perf_counter()
        if db:
            state = await safety_agent(state, db)
        steps["safety"]["duration_ms"] = round((time.perf_counter() - t0) * 1000)

        safety_decision = state["safety_check"].get("decision", "allow")
        steps["safety"]["output"] = {
            "decision": safety_decision,
            "blocked_count": len(state["safety_check"].get("blocked_items", [])),
            "reason": state["safety_check"].get("reason", ""),
        }

        if safety_decision == "hard_block":
            steps["safety"]["status"] = "blocked"
            blocked = state["safety_check"].get("blocked_items", [])
            block_type = blocked[0].get("type", "") if blocked else ""
            if block_type == "prescription_required":
                if is_voice_mode:
                    state["response_message"] = (
                        "This medicine requires a prescription. "
                        "Please upload your prescription to continue, "
                        "or I can suggest similar over-the-counter alternatives."
                    )
                else:
                    state["response_message"] = (
                        "This medicine requires a prescription. Would you like to:\n"
                        "1. Upload a prescription now\n"
                        "2. Talk to our pharmacist\n"
                        "3. Browse similar OTC alternatives\n"
                        "4. Cancel this order"
                    )
            else:
                state["response_message"] = (
                    f"Sorry, we cannot process this: "
                    f"{state['safety_check'].get('reason', 'safety check failed')}"
                )
            state["final_decision"]["action"] = "reject"
            _set_skipped(steps, ["inventory", "execution"], f"Safety hard block: {block_type}")
            state["pipeline_steps"] = list(steps.values())
            return state

        steps["safety"]["status"] = "completed"

        # ── Surface soft_block warnings (drug interactions, duplicates) ──
        if safety_decision == "soft_block":
            soft_blocks = state["safety_check"].get("soft_blocks", [])
            clinical_warnings = []
            for sb in soft_blocks:
                sb_type = sb.get("type", "")
                if sb_type in {"duplicate_ingredient", "drug_interaction", "patient_flag_allergy", "patient_flag_pregnancy"}:
                    clinical_warnings.append(sb.get("reason", ""))
            if clinical_warnings:
                msg = state.get("response_message", "")
                if is_voice_mode:
                    warnings_text = " Please note: " + ". ".join(clinical_warnings) + ". Would you like to continue?"
                else:
                    warnings_text = "\n\n⚠️ **Safety Notice:** " + "; ".join(clinical_warnings) + ". Would you like to continue?"
                state["response_message"] = (msg + warnings_text) if msg else warnings_text

        steps["inventory"]["status"] = "running"
        t0 = time.perf_counter()
        if db:
            state = await inventory_agent_fn(state, db)
        steps["inventory"]["duration_ms"] = round((time.perf_counter() - t0) * 1000)
        steps["inventory"]["output"] = {
            "available": state.get("inventory_check", {}).get("available", False),
            "strategy": state.get("inventory_check", {}).get("strategy", "unknown"),
        }
        steps["inventory"]["status"] = "completed"

        inv_check = state.get("inventory_check", {})
        if not inv_check.get("available") and inv_check.get("strategy") != "fulfill":
            negotiations = inv_check.get("negotiation", {})
            alternatives = inv_check.get("alternatives", [])
            parts = []
            for _, neg in negotiations.items():
                parts.append(neg.get("message", ""))
            if alternatives:
                parts.extend([a.get("message", "") for a in alternatives[:2]])
            if parts:
                state["response_message"] = "\n\n".join(parts)
                state["final_decision"]["action"] = "negotiate"
            steps["execution"]["status"] = "skipped"
            steps["execution"]["output"] = {"reason": "Inventory negotiation required"}
            state["pipeline_steps"] = list(steps.values())
            return state

        steps["execution"]["status"] = "running"
        t0 = time.perf_counter()
        if db:
            state = await execution_agent(state, db)
        steps["execution"]["duration_ms"] = round((time.perf_counter() - t0) * 1000)
        execution_result = state.get("execution_result", {})
        steps["execution"]["output"] = {
            "success": execution_result.get("success", False),
            "order_id": execution_result.get("order_id"),
            "action": state.get("final_decision", {}).get("action"),
            "razorpay_order_id": execution_result.get("razorpay_order_id"),
            "amount": execution_result.get("amount"),
            "currency": execution_result.get("currency"),
            "key_id": execution_result.get("key_id"),
            "items": execution_result.get("items", []),
        }
        steps["execution"]["status"] = "completed"

        if state.get("final_decision", {}).get("action") == "request_payment":
            # Preserve pending state so the next turn can detect the payment was requested
            exec_result = state.get("execution_result", {})
            ps = normalize_pending_state(state.get("pending_state"))
            ps["payment_requested"] = True
            ps["payment_order_id"] = str(exec_result.get("order_id") or "")
            ps["awaiting_confirmation"] = False  # no longer awaiting order confirm
            state["pending_state"] = ps

            # In voice mode, update response so it doesn't repeat the confirmation prompt.
            # Without this, the AI speaks "Would you like to confirm?" AGAIN even though
            # execution already happened, causing a frustrating double-confirmation loop.
            if is_voice_mode:
                state["response_message"] = "Take your time with the payment. I'll be right here."

    except Exception as err:
        logger.error("[%s] Pipeline error: %s", trace_id[:8], err, exc_info=True)
        state["error"] = str(err)
        if not state.get("response_message"):
            state["response_message"] = "I am sorry, something went wrong. Please try again."
        for step in steps.values():
            if step["status"] == "running":
                step["status"] = "error"
                step["output"] = {"error": str(err)}

    state["pipeline_steps"] = list(steps.values())

    # ── Patient counseling injection ─────────────────────────────────────
    try:
        action = state.get("final_decision", {}).get("action", "")
        if action in {"confirm_order", "execute_order"}:
            from app.services.counseling_engine import (
                format_counseling_for_response,
                generate_order_counseling,
            )
            from app.services.medicine_search import get_medicine_by_name

            order_items = state.get("execution_result", {}).get("items", [])
            if not order_items:
                order_items = state.get("pending_state", {}).get("pending_medicines", [])

            # Enrich items with counseling_info from the medicine catalog
            enriched_items = []
            for item in order_items:
                med_name = item.get("name", "")
                if med_name and not item.get("counseling_info"):
                    catalog_med = await get_medicine_by_name(med_name)
                    if catalog_med:
                        enriched = {**item, "counseling_info": catalog_med.get("counseling_info", {})}
                    else:
                        enriched = item
                else:
                    enriched = item
                enriched_items.append(enriched)

            if enriched_items:
                counseling_result = generate_order_counseling(enriched_items)

                # Use voice-optimized counseling when in voice mode
                if is_voice_mode:
                    from app.services.counseling_engine import format_counseling_for_voice
                    counseling_text = format_counseling_for_voice(counseling_result)
                    # Chain counseling naturally into the response
                    if counseling_text:
                        msg = state.get("response_message", "")
                        state["response_message"] = f"{msg} {counseling_text}" if msg else counseling_text
                else:
                    counseling_text = format_counseling_for_response(counseling_result)

                # Attach counseling data for audit trail
                state.setdefault("execution_result", {})["counseling_provided"] = counseling_result.get("cards", [])

                # Attach safety summary for audit trail
                safety = state.get("safety_check", {})
                state["execution_result"]["safety_summary"] = {
                    "decision": safety.get("decision", "unknown"),
                    "blocked_items": safety.get("blocked_items", []),
                    "soft_blocks": safety.get("soft_blocks", []),
                    "checks_run": safety.get("checks_run", 0),
                }
    except Exception as err:
        logger.warning("[%s] Counseling injection error (non-fatal): %s", trace_id[:8], err)

    # Refill gate (stateful) — handled inline in confirmation flow above.
    # No longer using the old _append_refill_nudge.

    # ── Legal disclaimer injection ───────────────────────────────────────
    action = state.get("final_decision", {}).get("action", "")
    has_prescription = bool(state.get("prescription_context"))
    if action in {"execute_order", "request_payment"}:
        msg = state.get("response_message", "")
        disclaimer_text = "dispensing assistance system"
        if msg and disclaimer_text not in msg:
            if is_voice_mode:
                # Voice-safe: no markdown, no asterisks, no dashes
                state["response_message"] = (
                    msg + " This is a dispensing assistance system. "
                    "Final dispensing is subject to pharmacist verification. "
                    "Not a substitute for medical advice."
                )
            else:
                state["response_message"] = (
                    msg + "\n\n---\n*This is a dispensing assistance system. "
                    "Final dispensing is subject to pharmacist verification. "
                    "Not a substitute for medical advice.*"
                )

    return state



