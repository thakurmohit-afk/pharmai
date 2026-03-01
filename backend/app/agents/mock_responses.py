"""Mock responses for development and demo — used when MOCK_MODE=true.

Acts like a professional pharmacist: recommends medicines for symptoms,
asks clarifying questions, and NEVER auto-orders without confirmation.
"""

import re
import json

# ═══════════════════════════════════════════════════════════════════════════
# MEDICINE DATABASE (mirrors seed_data.py)
# ═══════════════════════════════════════════════════════════════════════════

MEDICINE_DB = {
    "Crocin 500mg":       {"salt": "Paracetamol 500mg",  "category": "Analgesic",       "price": 30.0,  "rx": False, "use": "fever, mild pain, headache"},
    "Dolo 650mg":         {"salt": "Paracetamol 650mg",  "category": "Analgesic",       "price": 35.0,  "rx": False, "use": "fever, headache, body pain"},
    "Amlodipine 5mg":     {"salt": "Amlodipine 5mg",     "category": "Antihypertensive","price": 45.0,  "rx": True,  "use": "high blood pressure"},
    "Telma 40mg":         {"salt": "Telmisartan 40mg",   "category": "Antihypertensive","price": 120.0, "rx": True,  "use": "high blood pressure"},
    "Metformin 500mg":    {"salt": "Metformin 500mg",    "category": "Antidiabetic",    "price": 25.0,  "rx": True,  "use": "type 2 diabetes, blood sugar"},
    "Glycomet GP 2":      {"salt": "Metformin+Glimepiride","category": "Antidiabetic",  "price": 95.0,  "rx": True,  "use": "type 2 diabetes"},
    "Azithromycin 500mg": {"salt": "Azithromycin 500mg", "category": "Antibiotic",      "price": 85.0,  "rx": True,  "use": "bacterial infection"},
    "Cetirizine 10mg":    {"salt": "Cetirizine 10mg",    "category": "Antihistamine",   "price": 20.0,  "rx": False, "use": "allergy, sneezing, runny nose"},
    "Pantoprazole 40mg":  {"salt": "Pantoprazole 40mg",  "category": "Antacid",         "price": 55.0,  "rx": False, "use": "acidity, heartburn, gastric"},
    "Atorvastatin 10mg":  {"salt": "Atorvastatin 10mg",  "category": "Statin",          "price": 70.0,  "rx": True,  "use": "high cholesterol"},
    "Ecosprin 75mg":      {"salt": "Aspirin 75mg",       "category": "Antiplatelet",    "price": 15.0,  "rx": False, "use": "blood thinning, cardiac"},
    "Montair LC":         {"salt": "Montelukast+Levocetirizine","category": "Antiallergic","price": 140.0,"rx": True, "use": "sinus, nasal congestion, allergy"},
}

# ═══════════════════════════════════════════════════════════════════════════
# SYMPTOM → MEDICINE RECOMMENDATIONS (pharmacist knowledge)
# ═══════════════════════════════════════════════════════════════════════════

SYMPTOM_MAP = {
    r"headache|sar\s*dard|sir\s*dard|head\s*pain|migraine": {
        "symptom": "headache",
        "recommendations": [
            {"name": "Crocin 500mg", "why": "Paracetamol 500mg — effective for mild to moderate headache, gentle on stomach"},
            {"name": "Dolo 650mg",   "why": "Paracetamol 650mg — stronger dose for persistent headache or body pain"},
        ],
        "followup": "How severe is the headache? Mild → Crocin 500mg is usually sufficient. More persistent → Dolo 650mg may work better.",
    },
    r"fever|bukhar|temperature|badan\s*garam": {
        "symptom": "fever",
        "recommendations": [
            {"name": "Crocin 500mg", "why": "Paracetamol 500mg — standard antipyretic for mild fever"},
            {"name": "Dolo 650mg",   "why": "Paracetamol 650mg — recommended for high fever (>101°F)"},
        ],
        "followup": "How high is the fever? If it's mild, Crocin 500mg works well. For high fever, Dolo 650mg is more effective.",
    },
    r"bp\s*(ki)?.*dawa|blood\s*pressure|hypertension": {
        "symptom": "blood pressure / hypertension",
        "recommendations": [
            {"name": "Amlodipine 5mg", "why": "Calcium channel blocker — commonly prescribed as first-line for BP"},
            {"name": "Telma 40mg",     "why": "ARB class — good choice if you've been on Telmisartan before"},
        ],
        "followup": "⚠️ BP medicines require a prescription. Are you already on a prescribed medication, or is this a new concern? If you have a prescription, please upload it.",
    },
    r"sugar\s*(ki)?.*tablet|diabet|blood\s*sugar|madhumeh": {
        "symptom": "diabetes / blood sugar management",
        "recommendations": [
            {"name": "Metformin 500mg", "why": "First-line therapy for Type 2 diabetes"},
            {"name": "Glycomet GP 2",   "why": "Combination pill if Metformin alone isn't sufficient"},
        ],
        "followup": "⚠️ Diabetes medicines require a prescription. Which medication are you currently taking? If you have a prescription, please upload it.",
    },
    r"allergy|khansi|sneez|naak|runny\s*nose|itching|khujai": {
        "symptom": "allergy",
        "recommendations": [
            {"name": "Cetirizine 10mg", "why": "Non-drowsy antihistamine for sneezing, runny nose, mild allergy"},
            {"name": "Montair LC",      "why": "Montelukast + Levocetirizine — stronger for sinus/nasal congestion (Rx required)"},
        ],
        "followup": "What symptoms are you experiencing? Sneezing/runny nose → Cetirizine is OTC and effective. Nasal congestion/sinus → Montair LC is stronger but needs a prescription.",
    },
    r"acidity|pet\s*dard|gastric|heartburn|acid\s*reflux|seene\s*mein\s*jalan": {
        "symptom": "acidity / gastric issues",
        "recommendations": [
            {"name": "Pantoprazole 40mg", "why": "Proton pump inhibitor — very effective for acid reflux and heartburn. Take 30 min before meals."},
        ],
        "followup": "How long have you been experiencing acidity? If it's occasional, Pantoprazole should help. For chronic issues, I'd recommend seeing a gastroenterologist.",
    },
    r"infect|antibiotic|gala\s*kharab|throat|sore": {
        "symptom": "possible infection",
        "recommendations": [
            {"name": "Azithromycin 500mg", "why": "Broad-spectrum antibiotic effective for respiratory and throat infections"},
        ],
        "followup": "⚠️ Antibiotics require a prescription and should only be taken as directed by a doctor. Please upload your prescription, or would you like to consult with our pharmacist?",
    },
    r"cholesterol|lipid|statin": {
        "symptom": "high cholesterol",
        "recommendations": [
            {"name": "Atorvastatin 10mg", "why": "Most commonly prescribed statin for managing cholesterol levels"},
        ],
        "followup": "⚠️ Statins require a prescription. Are you already on Atorvastatin? If so, I can help with a refill once you upload your prescription.",
    },
    r"body\s*pain|dard|pain|muscle": {
        "symptom": "body pain",
        "recommendations": [
            {"name": "Crocin 500mg", "why": "Paracetamol — mild analgesic for general body pain"},
            {"name": "Dolo 650mg",   "why": "Higher-dose Paracetamol for moderate pain"},
        ],
        "followup": "Where exactly is the pain and how long have you had it? For general body pain, Crocin or Dolo should help. If it's persistent, please consult a doctor.",
    },
}

# ═══════════════════════════════════════════════════════════════════════════
# DIRECT MEDICINE NAME PATTERNS (user knows exactly what they want)
# ═══════════════════════════════════════════════════════════════════════════

DIRECT_MEDICINE_PATTERNS = {
    r"\bcrocin\b": "Crocin 500mg",
    r"\bdolo\b": "Dolo 650mg",
    r"\bamlodip": "Amlodipine 5mg",
    r"\btelma\b": "Telma 40mg",
    r"\bmetformin\b": "Metformin 500mg",
    r"\bglycomet\b": "Glycomet GP 2",
    r"\bazithro": "Azithromycin 500mg",
    r"\bcetiriz": "Cetirizine 10mg",
    r"\bpanto": "Pantoprazole 40mg",
    r"\batorva": "Atorvastatin 10mg",
    r"\becosprin\b": "Ecosprin 75mg",
    r"\bmontair\b": "Montair LC",
    r"\bparacetamol\b": "Crocin 500mg",
    r"\baspirin\b": "Ecosprin 75mg",
}

# Quantity patterns
QTY_PATTERN = re.compile(r"(\d+)\s*(strip|strips|pack|packs|tablet|tablets|goli|pcs|box|boxes)?", re.IGNORECASE)

# Confirmation patterns — user explicitly agreeing
CONFIRM_PATTERNS = re.compile(
    r"\b(yes|yeah|yep|yup|ok|okay|sure|confirm|order|place|haan|theek|thik|sahi|proceed|go ahead|done|kardo|karido|kar do|do it|add to cart|add to cad|cart it|add it|cart)\b",
    re.IGNORECASE,
)

# Selection patterns — user choosing an option
SELECTION_PATTERN = re.compile(r"^[①②]?\s*(?:option\s*)?([12])\b", re.IGNORECASE)


def mock_understanding(message: str) -> dict:
    """Parse user message as a professional pharmacist would.

    Three intents:
    1. Symptom query → recommend medicines, ask clarifying questions
    2. Direct medicine name → identify medicine, ask for quantity if missing
    3. Confirmation / selection → proceed with order
    """
    msg_lower = message.lower().strip()

    # ── Check for "same as last time" references ─────────────────────────
    is_reference = any(
        phrase in msg_lower
        for phrase in ["same as last", "wahi wali", "same order", "phir se", "repeat order"]
    )
    if is_reference:
        return {
            "items": [],
            "raw_query": message,
            "overall_confidence": 0.75,
            "needs_clarification": False,
            "is_reference": True,
            "reference_type": "last_order",
            "intent_type": "reference",
            "detected_language": "hinglish" if any(w in msg_lower for w in ["wahi", "phir"]) else "en",
        }

    # ── Check for confirmation / selection ────────────────────────────────
    selection_match = SELECTION_PATTERN.search(msg_lower)
    if selection_match:
        return {
            "items": [],
            "raw_query": message,
            "overall_confidence": 0.85,
            "needs_clarification": False,
            "intent_type": "selection",
            "selected_option": int(selection_match.group(1)),
            "detected_language": "en",
        }

    if CONFIRM_PATTERNS.search(msg_lower) and len(msg_lower.split()) <= 4:
        return {
            "items": [],
            "raw_query": message,
            "overall_confidence": 0.85,
            "needs_clarification": False,
            "intent_type": "confirmation",
            "detected_language": "en",
        }

    # ── Check for DIRECT medicine name first ─────────────────────────────
    direct_matches = []
    for pattern, med_name in DIRECT_MEDICINE_PATTERNS.items():
        if re.search(pattern, msg_lower):
            med_info = MEDICINE_DB[med_name]
            # Extract quantity if present
            qty_match = QTY_PATTERN.search(msg_lower)
            quantity = int(qty_match.group(1)) if qty_match else None
            direct_matches.append({
                "medicine_name": med_name,
                "dosage": med_info["salt"],
                "price": med_info["price"],
                "rx_required": med_info["rx"],
                "confidence": 0.92,
                "quantity": quantity,
            })

    if direct_matches:
        # Has quantity? → ready to confirm. No quantity? → ask for it.
        has_quantity = all(m["quantity"] is not None for m in direct_matches)
        return {
            "items": direct_matches,
            "raw_query": message,
            "overall_confidence": 0.92 if has_quantity else 0.75,
            "needs_clarification": not has_quantity,
            "intent_type": "direct_order" if has_quantity else "direct_order_incomplete",
            "missing": [] if has_quantity else ["quantity"],
            "detected_language": "hinglish" if re.search(r"(ki|wali|dawa|tablet|goli|chahiye)", msg_lower) else "en",
            "is_reference": False,
        }

    # ── Check for SYMPTOMS → recommend medicines ─────────────────────────
    for pattern, symptom_data in SYMPTOM_MAP.items():
        if re.search(pattern, msg_lower):
            recs = symptom_data["recommendations"]
            rec_items = []
            for rec in recs:
                med_info = MEDICINE_DB[rec["name"]]
                rec_items.append({
                    "medicine_name": rec["name"],
                    "dosage": med_info["salt"],
                    "price": med_info["price"],
                    "rx_required": med_info["rx"],
                    "confidence": 0.8,
                    "quantity": None,
                    "recommendation_reason": rec["why"],
                })
            return {
                "items": rec_items,
                "raw_query": message,
                "overall_confidence": 0.8,
                "needs_clarification": True,
                "intent_type": "symptom_query",
                "symptom": symptom_data["symptom"],
                "pharmacist_note": symptom_data["followup"],
                "detected_language": "hinglish" if re.search(r"(dard|bukhar|dawa|goli|pet|khansi|khujai)", msg_lower) else "en",
                "is_reference": False,
            }

    # ── Greeting ─────────────────────────────────────────────────────────
    if re.search(r"\b(hi|hello|hey|namaste|help|start)\b", msg_lower):
        return {
            "items": [],
            "raw_query": message,
            "overall_confidence": 0.9,
            "needs_clarification": False,
            "is_greeting": True,
            "intent_type": "greeting",
            "detected_language": "en",
        }

    # ── Unknown ──────────────────────────────────────────────────────────
    return {
        "items": [],
        "raw_query": message,
        "overall_confidence": 0.3,
        "needs_clarification": True,
        "intent_type": "unknown",
        "clarification_question": (
            f"I'm not sure I understood that. Could you tell me:\n"
            f"• The **medicine name** you need, or\n"
            f"• The **symptom** you're experiencing (e.g., headache, fever, acidity)\n\n"
            f"I can recommend the right medicine for you! 💊"
        ),
        "detected_language": "en",
        "is_reference": False,
    }


def mock_supervisor_decision(state: dict) -> dict:
    """Mock supervisor — acts like a professional pharmacist.

    Key behaviors:
    1. Symptom queries → recommend medicines with explanations, ask for choice
    2. Direct orders without quantity → ask for quantity
    3. Direct orders with quantity → confirm before proceeding
    4. Confirmations → proceed to safety/inventory/execution
    """
    intent = state.get("intent", {})
    items = intent.get("items", [])
    intent_type = intent.get("intent_type", "unknown")
    understanding_conf = state.get("understanding_confidence", 0.0)
    user_profile = state.get("user_profile", {})
    user_name = user_profile.get("name", "there")

    # ── GREETING ──────────────────────────────────────────────────────────
    if intent_type == "greeting":
        return {
            "action": "clarify",
            "combined_confidence": 0.9,
            "risk_level": "low",
            "needs_clarification": True,
            "reasoning": "User greeted, awaiting medical query",
            "response_message": (
                f"Hey {user_name}! 👋 Welcome to PharmAI!\n\n"
                "I'm your pharmacy assistant. I can help you with:\n"
                "• **Ordering medicines** — just tell me the name or your symptoms\n"
                "• **Medicine recommendations** — describe what's bothering you\n"
                "• **Prescription uploads** — snap a photo of your prescription\n"
                "• **Refill reminders** — I'll track your regular medicines\n\n"
                "What can I help you with today? 💊"
            ),
        }

    # ── REFERENCE (same as last time) ────────────────────────────────────
    if intent_type == "reference":
        return {
            "action": "clarify",
            "combined_confidence": 0.75,
            "risk_level": "low",
            "needs_clarification": True,
            "reasoning": "User referenced past order, confirming before proceeding",
            "response_message": (
                "Looking up your previous order... 🔍\n\n"
                "I found your last order. Would you like me to reorder the same medicines with the same quantities?\n\n"
                "Reply **yes** to confirm, or tell me if you'd like to change anything."
            ),
        }

    # ── SYMPTOM QUERY → Professional recommendation ──────────────────────
    if intent_type == "symptom_query":
        symptom = intent.get("symptom", "your condition")
        note = intent.get("pharmacist_note", "")

        rec_lines = []
        for i, item in enumerate(items[:3], 1):
            rx_badge = " ⚠️ (Rx required)" if item.get("rx_required") else " ✅ (OTC)"
            rec_lines.append(
                f"**{i}. {item['medicine_name']}** — ₹{item['price']:.0f}/strip{rx_badge}\n"
                f"   {item.get('recommendation_reason', item['dosage'])}"
            )

        recs_text = "\n\n".join(rec_lines)

        return {
            "action": "clarify",
            "combined_confidence": 0.8,
            "risk_level": "low",
            "needs_clarification": True,
            "reasoning": f"Symptom-based query: {symptom} — recommending medicines",
            "response_message": (
                f"I understand you're dealing with **{symptom}**. "
                f"Here's what I'd recommend based on our available medicines:\n\n"
                f"{recs_text}\n\n"
                f"💡 *{note}*\n\n"
                f"Which one would you prefer? Just say the number (1 or 2) or the medicine name, "
                f"and I'll ask about the quantity."
            ),
        }

    # ── DIRECT ORDER (incomplete — no quantity) ──────────────────────────
    if intent_type == "direct_order_incomplete":
        item = items[0]
        med_info = MEDICINE_DB.get(item["medicine_name"], {})
        rx_badge = "⚠️ *Requires prescription*" if item.get("rx_required") else "✅ *Available over the counter*"

        return {
            "action": "clarify",
            "combined_confidence": 0.75,
            "risk_level": "low",
            "needs_clarification": True,
            "reasoning": f"Medicine identified ({item['medicine_name']}) but quantity missing",
            "response_message": (
                f"Great choice! **{item['medicine_name']}** ({item['dosage']})\n"
                f"💰 Price: ₹{item['price']:.0f}/strip | {rx_badge}\n\n"
                f"How many strips would you like to order?\n"
                f"_(Common: 1 strip, 2 strips, or 3 strips)_"
            ),
        }

    # ── DIRECT ORDER (complete — has quantity) → CONFIRM before ordering ─
    if intent_type == "direct_order":
        order_lines = []
        total = 0.0
        for item in items:
            qty = item.get("quantity", 1)
            subtotal = item["price"] * qty
            total += subtotal
            rx_tag = " (Rx)" if item.get("rx_required") else ""
            order_lines.append(
                f"• **{item['medicine_name']}** × {qty} strip(s) — ₹{subtotal:.0f}{rx_tag}"
            )

        order_text = "\n".join(order_lines)

        return {
            "action": "clarify",
            "combined_confidence": understanding_conf,
            "risk_level": "low",
            "needs_clarification": True,
            "reasoning": f"Order ready for confirmation — {len(items)} items, total ₹{total:.0f}",
            "response_message": (
                f"Here's your order summary:\n\n"
                f"{order_text}\n\n"
                f"💰 **Estimated Total: ₹{total:.0f}**\n\n"
                f"Shall I go ahead and place this order? Reply **yes** to confirm."
            ),
        }

    # ── CONFIRMATION → Proceed to order! ─────────────────────────────────
    if intent_type == "confirmation":
        return {
            "action": "proceed",
            "combined_confidence": 0.88,
            "risk_level": "low",
            "needs_clarification": False,
            "reasoning": "User confirmed order, proceeding to safety and inventory checks",
            "response_message": "Processing your order through safety and inventory checks... ⏳",
        }

    # ── SELECTION (user chose option 1 or 2) ─────────────────────────────
    if intent_type == "selection":
        selected = intent.get("selected_option", 1)
        return {
            "action": "clarify",
            "combined_confidence": 0.85,
            "risk_level": "low",
            "needs_clarification": True,
            "reasoning": f"User selected option {selected}, asking for quantity",
            "response_message": (
                f"Good choice! 👍 You've selected option {selected}.\n\n"
                f"How many strips would you like to order?\n"
                f"_(Common: 1 strip, 2 strips, or 3 strips)_"
            ),
        }

    # ── NO ITEMS FOUND ───────────────────────────────────────────────────
    if not items:
        return {
            "action": "clarify",
            "combined_confidence": understanding_conf,
            "risk_level": "low",
            "needs_clarification": True,
            "reasoning": "No medicines or symptoms identified",
            "response_message": intent.get(
                "clarification_question",
                "I couldn't identify a specific medicine or symptom. Could you tell me:\n"
                "• The **medicine name** you need (e.g., Crocin, Dolo, Pantoprazole), or\n"
                "• The **symptom** you're experiencing (e.g., headache, fever, acidity)\n\n"
                "I'll recommend the right medicine for you! 💊"
            ),
        }

    # ── FALLBACK ─────────────────────────────────────────────────────────
    return {
        "action": "clarify",
        "combined_confidence": understanding_conf,
        "risk_level": "low",
        "needs_clarification": True,
        "reasoning": "Ambiguous intent, asking for clarification",
        "response_message": "Could you please clarify what you'd like to order? Tell me the medicine name or describe your symptoms.",
    }
