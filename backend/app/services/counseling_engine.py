"""Patient Counseling Engine — structured dispensing instructions per medicine.

Generates clinically accurate counseling cards for dispensed medicines,
covering food timing, drowsiness warnings, alcohol interactions, storage,
missed dose instructions, and antibiotic course completion reminders.
"""

import logging

logger = logging.getLogger("pharmacy.services.counseling")


# ── Counseling card generation ───────────────────────────────────────────────

_FOOD_LABELS = {
    "before_food": "🍽️ Take on an empty stomach (30 min before meals)",
    "after_food": "🍽️ Take after meals to reduce stomach irritation",
    "with_food": "🍽️ Take with food for better absorption",
    "any": "🍽️ Can be taken with or without food",
}


def generate_counseling_card(medicine_dict: dict) -> dict | None:
    """Build a structured counseling card for a single medicine.

    Args:
        medicine_dict: Dict with at least 'name' and optionally 'counseling_info'.

    Returns:
        Counseling card dict or None if no counseling info available.
    """
    info = medicine_dict.get("counseling_info")
    if not info or not isinstance(info, dict):
        return None

    name = medicine_dict.get("name", "Medicine")
    card: dict = {"medicine": name, "instructions": []}

    # Food timing
    food_timing = info.get("food_timing")
    if food_timing:
        label = _FOOD_LABELS.get(food_timing, f"🍽️ {info.get('food_note', 'Follow doctor instructions')}")
        if info.get("food_note"):
            label = f"🍽️ {info['food_note']}"
        card["instructions"].append({"type": "food_timing", "text": label})

    # Drowsiness
    if info.get("drowsiness"):
        note = info.get("drowsiness_note", "May cause drowsiness. Avoid driving or operating heavy machinery.")
        card["instructions"].append({"type": "drowsiness", "text": f"😴 {note}"})

    # Alcohol
    if info.get("alcohol_warning"):
        note = info.get("alcohol_note", "Avoid alcohol while taking this medicine.")
        card["instructions"].append({"type": "alcohol", "text": f"🚫 {note}"})

    # Storage
    storage = info.get("storage")
    if storage:
        card["instructions"].append({"type": "storage", "text": f"📦 {storage}"})

    # Common side effects
    side_effects = info.get("common_side_effects", [])
    if side_effects:
        card["instructions"].append({
            "type": "side_effects",
            "text": f"💊 Common side effects: {', '.join(side_effects)}. Consult doctor if persistent.",
        })

    # Missed dose
    missed = info.get("missed_dose_action")
    if missed:
        card["instructions"].append({"type": "missed_dose", "text": f"⏰ Missed dose: {missed}"})

    # Antibiotic course completion
    if info.get("course_completion_critical"):
        card["instructions"].append({
            "type": "course_completion",
            "text": "💊 IMPORTANT: Complete the full course even if you feel better. Stopping early can cause resistance.",
        })

    return card if card["instructions"] else None


def generate_order_counseling(order_items: list[dict]) -> dict:
    """Generate aggregated counseling for all medicines in an order.

    Args:
        order_items: List of dicts with medicine info + counseling_info.

    Returns:
        Dict with 'cards' (per-medicine) and 'summary_text' (formatted string).
    """
    cards: list[dict] = []
    for item in order_items:
        card = generate_counseling_card(item)
        if card:
            cards.append(card)

    if not cards:
        return {"cards": [], "summary_text": ""}

    # Build human-readable summary
    lines = ["", "── Patient Counseling ──"]
    for card in cards:
        lines.append(f"\n📋 **{card['medicine']}**:")
        for inst in card["instructions"]:
            lines.append(f"  {inst['text']}")

    lines.append("")
    lines.append("If you have any concerns, consult your pharmacist or doctor.")

    return {
        "cards": cards,
        "summary_text": "\n".join(lines),
    }


def format_counseling_for_response(counseling_result: dict) -> str:
    """Format counseling result as a string to append to the bot response."""
    return counseling_result.get("summary_text", "")


# Priority order for voice: most important instructions first
_VOICE_INSTRUCTION_PRIORITY = [
    "course_completion",  # critical — must always mention
    "food_timing",        # practical — most common question
    "drowsiness",         # safety — driving warning
    "alcohol",            # safety — interaction warning
]

_MAX_VOICE_INSTRUCTIONS = 2  # keep it concise for TTS


def format_counseling_for_voice(counseling_result: dict) -> str:
    """Format counseling as natural spoken sentences for TTS.

    Strips emojis, limits to top 2 instructions per medicine,
    and produces conversational language suitable for voice delivery.
    """
    cards = counseling_result.get("cards", [])
    if not cards:
        return ""

    import re
    parts = []
    for card in cards:
        med_name = card.get("medicine", "your medicine")
        instructions = card.get("instructions", [])
        if not instructions:
            continue

        # Sort by priority
        def _priority(inst: dict) -> int:
            t = inst.get("type", "")
            try:
                return _VOICE_INSTRUCTION_PRIORITY.index(t)
            except ValueError:
                return 99

        sorted_insts = sorted(instructions, key=_priority)[:_MAX_VOICE_INSTRUCTIONS]

        # Strip emojis and format as natural speech
        tips = []
        for inst in sorted_insts:
            text = inst.get("text", "")
            # Remove emojis and leading labels
            text = re.sub(
                r"[\U0001F300-\U0001F9FF\U00002600-\U000027BF\U0000FE00-\U0000FEFF"
                r"\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF\U00002702-\U000027B0]+",
                "", text,
            ).strip()
            if text:
                # Lowercase first char to flow naturally in a sentence
                tips.append(text[0].lower() + text[1:] if len(text) > 1 else text)

        if tips:
            joined = ", and ".join(tips) if len(tips) == 2 else tips[0]
            parts.append(f"About your {med_name}: {joined}.")

    if not parts:
        return ""

    return " ".join(parts)
