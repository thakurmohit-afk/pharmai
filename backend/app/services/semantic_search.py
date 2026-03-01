"""Semantic Search — LLM-free context-aware medicine search with explainability."""

import logging
import re
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.medicine import Medicine
from app.models.inventory import Inventory
from app.models.user import UserProfile

logger = logging.getLogger("pharmacy.services.semantic_search")

# ── Condition → useful drug categories mapping ────────────────────────────
CONDITION_CATEGORIES = {
    "headache": ["Analgesic", "Antipyretic", "NSAID"],
    "fever": ["Antipyretic", "Analgesic"],
    "cough": ["Cough Suppressant", "Antitussive", "Expectorant", "Mucolytic"],
    "cold": ["Antihistamine", "Decongestant", "Antipyretic", "Analgesic"],
    "allergy": ["Antihistamine", "Corticosteroid"],
    "diabetes": ["Antidiabetic", "Hypoglycemic"],
    "blood pressure": ["Antihypertensive", "ACE Inhibitor", "ARB", "Calcium Channel Blocker"],
    "hypertension": ["Antihypertensive", "ACE Inhibitor", "ARB"],
    "pain": ["Analgesic", "NSAID", "Antipyretic"],
    "stomach": ["Antacid", "PPI", "H2 Blocker"],
    "acid": ["Antacid", "PPI", "H2 Blocker"],
    "infection": ["Antibiotic", "Antimicrobial"],
    "anxiety": ["Anxiolytic", "SSRI", "Benzodiazepine"],
    "depression": ["Antidepressant", "SSRI"],
    "asthma": ["Bronchodilator", "Inhaler", "Corticosteroid"],
    "cholesterol": ["Statin", "Lipid-lowering"],
    "thyroid": ["Thyroid Hormone"],
    "skin": ["Antifungal", "Dermatological", "Corticosteroid"],
    "diarrhea": ["Antidiarrheal", "ORS"],
}

# ── Avoidance keywords → fields to check ──────────────────────────────────
AVOIDANCE_MAP = {
    "drowsiness": "drowsiness",
    "drowsy": "drowsiness",
    "sleepy": "drowsiness",
    "alcohol": "alcohol_warning",
    "stomach": "food_timing",
}

# ── Safety rules for context-aware filtering ──────────────────────────────
CONDITION_DRUG_CAUTION = {
    "Diabetes": ["ibuprofen", "corticosteroid", "prednisolone"],
    "Hypertension": ["pseudoephedrine", "phenylephrine", "ibuprofen", "diclofenac"],
    "Asthma": ["aspirin", "ibuprofen", "propranolol"],
    "Liver Disease": ["paracetamol", "acetaminophen"],
    "Kidney Disease": ["ibuprofen", "diclofenac", "naproxen"],
}


def _parse_intent(query: str) -> dict:
    """Parse user search query into structured intent (no LLM needed)."""
    q = query.lower().strip()
    intent = {
        "raw_query": query,
        "conditions": [],
        "avoidances": [],
        "otc_only": False,
        "keywords": [],
    }

    # Detect conditions
    for condition, categories in CONDITION_CATEGORIES.items():
        if condition in q:
            intent["conditions"].append(condition)

    # Detect avoidance preferences
    avoidance_phrases = ["without", "no ", "avoid", "not ", "free from"]
    for phrase in avoidance_phrases:
        if phrase in q:
            for avoid_key, field in AVOIDANCE_MAP.items():
                if avoid_key in q:
                    intent["avoidances"].append({"keyword": avoid_key, "field": field})

    # OTC detection
    if any(w in q for w in ["otc", "over the counter", "without prescription", "no prescription"]):
        intent["otc_only"] = True

    # Extract search keywords (remove stop words)
    stop_words = {"for", "a", "the", "and", "or", "with", "without", "that", "which", "is",
                  "safe", "good", "best", "medicine", "tablet", "drug", "patient", "me", "my",
                  "no", "not", "avoid", "free", "from", "of", "in", "to", "can", "i", "need"}
    intent["keywords"] = [w for w in re.split(r'\s+', q) if w not in stop_words and len(w) > 2]

    return intent


async def semantic_search(
    db: AsyncSession,
    query: str,
    user_id: str | None = None,
    limit: int = 12,
) -> dict:
    """Perform context-aware semantic search with explainability."""
    intent = _parse_intent(query)

    # Get user profile for context
    user_conditions: list[str] = []
    if user_id:
        profile_result = await db.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        )
        profile = profile_result.scalar_one_or_none()
        if profile and profile.chronic_conditions:
            if isinstance(profile.chronic_conditions, list):
                user_conditions = profile.chronic_conditions
            elif isinstance(profile.chronic_conditions, dict):
                user_conditions = list(profile.chronic_conditions.keys())

    # Build medicine query
    filters = []
    if intent["keywords"]:
        for kw in intent["keywords"]:
            filters.append(or_(
                Medicine.name.ilike("%" + kw + "%"),
                Medicine.generic_name.ilike("%" + kw + "%"),
                Medicine.salt.ilike("%" + kw + "%"),
                Medicine.description.ilike("%" + kw + "%"),
                Medicine.category.ilike("%" + kw + "%"),
            ))

    if intent["otc_only"]:
        filters.append(Medicine.prescription_required == False)

    stmt = select(Medicine, Inventory).outerjoin(
        Inventory, Medicine.medicine_id == Inventory.medicine_id
    ).where(Medicine.is_active == True)

    if filters:
        stmt = stmt.where(*filters)

    stmt = stmt.limit(limit * 2)  # fetch more for ranking

    result = await db.execute(stmt)
    rows = result.all()

    # Score and rank results
    scored_results = []
    for med, inv in rows:
        score = 50  # base score
        explanations = []
        risk_level = "low"
        caution_flags = []

        # Name match bonus
        q_lower = query.lower()
        if med.name and med.name.lower() in q_lower:
            score += 30
            explanations.append("Exact name match")
        elif med.generic_name and med.generic_name.lower() in q_lower:
            score += 25
            explanations.append("Generic name match")

        # Category relevance
        for condition in intent["conditions"]:
            relevant_cats = CONDITION_CATEGORIES.get(condition, [])
            if med.category and any(cat.lower() in med.category.lower() for cat in relevant_cats):
                score += 20
                explanations.append("Matches your condition: " + condition.title())

        # Stock availability
        stock = inv.stock_quantity if inv else 0
        in_stock = stock > 0
        if in_stock:
            score += 10
            explanations.append("In stock")
        else:
            score -= 20

        # Avoidance check
        counseling = med.counseling_info or {}
        for avoidance in intent["avoidances"]:
            field = avoidance["field"]
            if counseling.get(field):
                score -= 30
                caution_flags.append("Contains " + avoidance["keyword"] + " risk")

        # Context-aware safety (check user conditions against caution drugs)
        med_name_lower = (med.name or "").lower()
        for user_cond in user_conditions:
            caution_drugs = CONDITION_DRUG_CAUTION.get(user_cond, [])
            for cd in caution_drugs:
                if cd in med_name_lower:
                    score -= 25
                    risk_level = "high"
                    caution_flags.append("Caution with " + user_cond)

        if not explanations:
            explanations.append("Keyword match")

        # Prescription flag
        rx_required = med.prescription_required

        # OTC bonus
        if not rx_required:
            score += 5
            explanations.append("Available without prescription")

        if caution_flags:
            risk_level = "high" if any("Caution" in f for f in caution_flags) else "medium"
        elif rx_required:
            risk_level = "medium"

        scored_results.append({
            "medicine_id": str(med.medicine_id),
            "name": med.name,
            "generic_name": med.generic_name,
            "category": med.category,
            "price": med.price,
            "dosage": med.dosage,
            "prescription_required": rx_required,
            "in_stock": in_stock,
            "stock_quantity": stock,
            "score": score,
            "risk_level": risk_level,
            "explanations": explanations,
            "caution_flags": caution_flags,
            "manufacturer": med.manufacturer,
        })

    # Sort by score descending
    scored_results.sort(key=lambda x: x["score"], reverse=True)

    return {
        "query": query,
        "intent": {
            "conditions": intent["conditions"],
            "avoidances": [a["keyword"] for a in intent["avoidances"]],
            "otc_only": intent["otc_only"],
        },
        "user_context": {
            "conditions": user_conditions,
            "context_applied": len(user_conditions) > 0,
        },
        "results": scored_results[:limit],
        "total_found": len(scored_results),
    }
