"""Pending order state machine shared by graph.py and chat_service.py.

Manages the lifecycle of an in-progress order: none → collect_quantity →
await_confirm → payment_requested. All functions are pure and stateless.
"""

from __future__ import annotations

from app.agents.quote_utils import (
    build_quote_signature,
    canonical_medicines_from_quote,
    canonical_unit_for_prompt,
    format_inr,
    line_quantity_explicit,
    quote_is_resolved,
    quote_lines,
    quote_quantity_status,
    safe_float,
)


# ── Empty / normalize ───────────────────────────────────────────────────


def empty_pending_state() -> dict:
    """Return a blank pending state dict with all expected keys."""
    return {
        "pending_quote": {},
        "pending_medicines": [],
        "quantity_resolved": False,
        "awaiting_confirmation": False,
        "confirmation_prompted_once": False,
        "quote_signature": "",
        "last_confirmation_intent": "",
        "last_confirmation_confidence": 0.0,
        "payment_requested": False,
        "payment_order_id": "",
        "refill_offer_status": "not_checked",
        "refill_offer_medicine": {},
    }


_PENDING_META_KEY = "__pending_meta__"


def normalize_pending_state(raw: dict | None) -> dict:
    """Normalize a raw pending state dict (including DB-stored __pending_meta__)."""
    if not isinstance(raw, dict):
        return empty_pending_state()
    pending_quote = raw.get("pending_quote")
    pending_medicines = raw.get("pending_medicines")
    quote_dict = pending_quote if isinstance(pending_quote, dict) else {}

    meta = quote_dict.get(_PENDING_META_KEY, {}) if isinstance(quote_dict, dict) else {}
    if not isinstance(meta, dict):
        meta = {}
    sanitized_quote = {k: v for k, v in quote_dict.items() if k != _PENDING_META_KEY}

    medicines_list = pending_medicines if isinstance(pending_medicines, list) else []
    quantity_resolved = (
        bool(raw.get("quantity_resolved", meta.get("quantity_resolved")))
        or quote_is_resolved(sanitized_quote)
    )
    quote_sig = str(raw.get("quote_signature", meta.get("quote_signature", "")) or "")
    if not quote_sig and quote_lines(sanitized_quote):
        quote_sig = build_quote_signature(sanitized_quote)

    if "awaiting_confirmation" in raw:
        awaiting_confirmation = bool(raw.get("awaiting_confirmation"))
    elif "awaiting_confirmation" in meta:
        awaiting_confirmation = bool(meta.get("awaiting_confirmation"))
    else:
        awaiting_confirmation = bool(quantity_resolved and medicines_list and quote_lines(sanitized_quote))

    if "confirmation_prompted_once" in raw:
        confirmation_prompted_once = bool(raw.get("confirmation_prompted_once"))
    elif "confirmation_prompted_once" in meta:
        confirmation_prompted_once = bool(meta.get("confirmation_prompted_once"))
    else:
        confirmation_prompted_once = bool(awaiting_confirmation)

    if not quantity_resolved:
        awaiting_confirmation = False
        confirmation_prompted_once = False
        quote_sig = ""

    # Refill offer state — tracked to prevent loops
    refill_offer_status = str(
        raw.get("refill_offer_status", meta.get("refill_offer_status", "not_checked")) or "not_checked"
    )
    if refill_offer_status not in {"not_checked", "offered", "accepted", "declined"}:
        refill_offer_status = "not_checked"
    refill_offer_medicine = raw.get("refill_offer_medicine", meta.get("refill_offer_medicine", {}))
    if not isinstance(refill_offer_medicine, dict):
        refill_offer_medicine = {}

    return {
        "pending_quote": sanitized_quote,
        "pending_medicines": medicines_list,
        "quantity_resolved": quantity_resolved,
        "awaiting_confirmation": awaiting_confirmation,
        "confirmation_prompted_once": confirmation_prompted_once,
        "quote_signature": quote_sig,
        "last_confirmation_intent": str(
            raw.get("last_confirmation_intent", meta.get("last_confirmation_intent", "")) or ""
        ),
        "last_confirmation_confidence": safe_float(
            raw.get("last_confirmation_confidence", meta.get("last_confirmation_confidence", 0.0)) or 0.0,
            0.0,
        ),
        "payment_requested": bool(raw.get("payment_requested", meta.get("payment_requested", False))),
        "payment_order_id": str(raw.get("payment_order_id", meta.get("payment_order_id", "")) or ""),
        "refill_offer_status": refill_offer_status,
        "refill_offer_medicine": refill_offer_medicine,
    }


# ── Build / query ───────────────────────────────────────────────────────


def build_pending_state(
    quote: dict | None,
    medicines: list[dict],
    *,
    awaiting_confirmation: bool = False,
    confirmation_prompted_once: bool = False,
    last_confirmation_intent: str = "",
    last_confirmation_confidence: float = 0.0,
    refill_offer_status: str = "not_checked",
    refill_offer_medicine: dict | None = None,
) -> dict:
    """Construct a fresh pending state from a quote and medicines list."""
    if not isinstance(quote, dict) or not isinstance(medicines, list) or not medicines:
        return empty_pending_state()
    quantity_resolved = quote_is_resolved(quote)
    return {
        "pending_quote": quote,
        "pending_medicines": medicines,
        "quantity_resolved": quantity_resolved,
        "awaiting_confirmation": bool(awaiting_confirmation and quantity_resolved),
        "confirmation_prompted_once": bool(confirmation_prompted_once and quantity_resolved),
        "quote_signature": build_quote_signature(quote),
        "last_confirmation_intent": str(last_confirmation_intent or ""),
        "last_confirmation_confidence": safe_float(last_confirmation_confidence or 0.0, 0.0),
        "refill_offer_status": refill_offer_status if refill_offer_status in {"not_checked", "offered", "accepted", "declined"} else "not_checked",
        "refill_offer_medicine": refill_offer_medicine or {},
    }


def is_confirmable_pending(pending_state: dict | None) -> bool:
    """Return True if pending state is ready for user confirmation."""
    pending = normalize_pending_state(pending_state)
    pending_quote = pending.get("pending_quote", {})
    return bool(
        pending.get("pending_medicines")
        and quote_lines(pending_quote)
        and bool(pending.get("quantity_resolved"))
        and bool(pending.get("awaiting_confirmation"))
        and quote_is_resolved(pending_quote)
        and bool(pending.get("quote_signature"))
    )


def can_emit_confirm_order(quote: dict | None) -> bool:
    """Return True if a quote is fully resolved and ready to be confirmed."""
    if not isinstance(quote, dict):
        return False
    if not quote_is_resolved(quote):
        return False
    if not build_quote_signature(quote):
        return False
    return bool(canonical_medicines_from_quote(quote))


def pending_phase(pending_state: dict | None) -> str:
    """Determine the current phase of the pending order state machine."""
    pending = normalize_pending_state(pending_state)
    if pending.get("payment_requested"):
        return "payment_requested"
    if is_confirmable_pending(pending):
        return "await_confirm"
    if pending.get("pending_medicines") or quote_lines(pending.get("pending_quote")):
        return "collect_quantity"
    return "none"


# ── Message builders ────────────────────────────────────────────────────


def build_ask_quantity_message(quote: dict) -> str:
    """Prompt user for quantity when a medicine is found but qty is missing."""
    lines = quote_lines(quote)
    if not lines:
        return "How many strips would you like to order?"
    line = lines[0]
    return (
        f"I found **{line.get('name', 'this medicine')}** available for you at "
        f"**Rs.{format_inr(line.get('unit_price', 0))} per strip**.\n\n"
        "How many strips would you like to order?"
    )


def build_range_choice_message(quote: dict) -> str:
    """Prompt user to pick from a range of quantities (e.g. '2-3 strips')."""
    lines = quote_lines(quote)
    med_name = lines[0].get("name", "this medicine") if lines else "this medicine"
    options = quote.get("quantity_options") or []
    normalized_options = []
    for value in options:
        try:
            normalized_options.append(int(value))
        except (TypeError, ValueError):
            continue
    normalized_options = sorted({value for value in normalized_options if value > 0})
    if len(normalized_options) >= 2:
        unit = canonical_unit_for_prompt(quote)
        return (
            f"To confirm, do you want **{normalized_options[0]}** or **{normalized_options[-1]}** "
            f"{unit} of **{med_name}**?"
        )
    return "Please share one exact quantity to continue (for example: 2 strips or 3 strips)."


def build_missing_quantity_message(quote: dict) -> str:
    """Prompt for quantity when unit is also missing."""
    lines = quote_lines(quote)
    med_name = lines[0].get("name", "that medicine") if lines else "that medicine"
    return (
        f"Please share the exact quantity for **{med_name}** with unit "
        "(for example: 3 strips or 15 tablets)."
    )


def build_quantity_prompt_message(quote: dict) -> str:
    """Select the right quantity prompt based on quote status."""
    status = quote_quantity_status(quote)
    if status == "range_needs_choice":
        return build_range_choice_message(quote)
    if status == "missing":
        return build_missing_quantity_message(quote)
    return build_ask_quantity_message(quote)


def build_quantity_prompt_voice(quote: dict) -> str:
    """Voice-friendly quantity prompt that handles all items at once.

    Instead of asking about each medicine serially, this lists all
    unresolved medicines in one natural sentence:
    'I found Dolo 650 at 35 rupees and Cetirizine at 12 rupees per strip.
     How many strips of each would you like?'
    """
    lines = quote_lines(quote)
    if not lines:
        return "How many strips would you like?"

    if len(lines) == 1:
        line = lines[0]
        name = line.get("name", "this medicine")
        price = format_inr(line.get("unit_price", 0))
        return (
            f"I found {name} at {price} rupees per strip. "
            "How many strips would you like?"
        )

    # Multiple items — list them all in one sentence
    item_parts = []
    for line in lines:
        name = line.get("name", "medicine")
        price = format_inr(line.get("unit_price", 0))
        item_parts.append(f"{name} at {price} rupees per strip")

    joined = ", and ".join([", ".join(item_parts[:-1]), item_parts[-1]]) if len(item_parts) > 2 else " and ".join(item_parts)
    return f"I found {joined}. How many strips of each would you like?"


def build_confirmation_message(quote: dict, is_voice_mode: bool = False) -> str:
    """Build the order confirmation prompt shown before payment."""
    lines = quote_lines(quote)
    if not lines:
        return "Would you like to confirm this order?"

    if is_voice_mode:
        return (
            "I have your order summary ready! Please take a look at the card on your screen "
            "to review the items and total price. Would you like to confirm this order?"
        )

    line_text = []
    for line in lines:
        line_text.append(
            f"- **{line.get('name', 'Medicine')}**: "
            f"{line.get('billing_qty', 1)} strips x Rs.{format_inr(line.get('unit_price', 0))} = "
            f"Rs.{format_inr(line.get('subtotal', 0))}"
        )

    conversion_note = (quote.get("conversion_note") or "").strip()
    conversion_block = f"{conversion_note}\n\n" if conversion_note else ""
    return (
        f"{conversion_block}Here is your order summary:\n\n"
        + "\n".join(line_text)
        + f"\n\n**Total: Rs.{format_inr(quote.get('total_amount', 0))}**\n\n"
        "Would you like to confirm this order?"
    )
