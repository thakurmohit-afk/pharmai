"""AI Patient Profiler — generates health summaries from medication history."""

import logging
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserProfile
from app.models.order import Order
from app.models.prescription import Prescription
from app.models.dispensing_log import DispensingLog

logger = logging.getLogger("pharmacy.services.patient_profiler")

# ── Drug-condition inference rules ────────────────────────────────────────
# Maps active ingredients / drug categories → probable conditions.
DRUG_CONDITION_MAP = {
    "metformin": "Type 2 Diabetes",
    "glimepiride": "Type 2 Diabetes",
    "insulin": "Diabetes (Insulin-dependent)",
    "amlodipine": "Hypertension",
    "losartan": "Hypertension",
    "telmisartan": "Hypertension",
    "atorvastatin": "Hyperlipidemia / High Cholesterol",
    "rosuvastatin": "Hyperlipidemia / High Cholesterol",
    "omeprazole": "GERD / Acid Reflux",
    "pantoprazole": "GERD / Acid Reflux",
    "levothyroxine": "Hypothyroidism",
    "salbutamol": "Asthma / COPD",
    "montelukast": "Asthma / Allergic Rhinitis",
    "cetirizine": "Allergies",
    "sertraline": "Depression / Anxiety",
    "alprazolam": "Anxiety Disorder",
    "aspirin": "Cardiovascular Risk Prevention",
    "clopidogrel": "Cardiovascular Risk / Post-Stent",
    "warfarin": "Thrombosis / Anticoagulation Therapy",
    "gabapentin": "Neuropathic Pain / Epilepsy",
    "paracetamol": None,  # Too common to infer
    "ibuprofen": None,
}


def _infer_conditions_from_meds(medicines: list[dict]) -> list[dict]:
    """Infer probable conditions from medication history."""
    conditions: dict[str, list[str]] = {}

    for med in medicines:
        name_lower = (med.get("medicine_name") or med.get("name") or "").lower()
        ingredients = med.get("active_ingredients") or []

        # Check drug name
        for drug_key, condition in DRUG_CONDITION_MAP.items():
            if condition and drug_key in name_lower:
                if condition not in conditions:
                    conditions[condition] = []
                conditions[condition].append(name_lower.split("(")[0].strip().title())

        # Check active ingredients
        for ing in ingredients:
            mol = (ing.get("molecule") or "").lower()
            for drug_key, condition in DRUG_CONDITION_MAP.items():
                if condition and drug_key in mol:
                    if condition not in conditions:
                        conditions[condition] = []

    return [
        {"condition": cond, "supporting_medications": list(set(meds))[:3], "confidence": "high" if len(meds) >= 2 else "medium"}
        for cond, meds in conditions.items()
    ]


def _assess_risks(medicines: list[dict], conditions: list[dict]) -> list[dict]:
    """Assess patient risks from medication profile."""
    risks = []
    unique_meds = set()

    for med in medicines:
        name = (med.get("medicine_name") or med.get("name") or "").lower()
        unique_meds.add(name)

    # Polypharmacy risk
    if len(unique_meds) >= 5:
        risks.append({
            "risk": "Polypharmacy",
            "severity": "high" if len(unique_meds) >= 8 else "medium",
            "detail": f"Patient takes {len(unique_meds)} different medications — increased risk of drug interactions",
            "recommendation": "Review for unnecessary medications and potential interactions",
        })

    # Chronic condition burden
    chronic_count = len([c for c in conditions if c["confidence"] == "high"])
    if chronic_count >= 3:
        risks.append({
            "risk": "High Chronic Disease Burden",
            "severity": "high",
            "detail": f"{chronic_count} chronic conditions identified — requires coordinated care",
            "recommendation": "Consider referral for comprehensive disease management",
        })

    # High-risk drug combinations
    has_anticoag = any(d in " ".join(unique_meds) for d in ["warfarin", "clopidogrel", "aspirin"])
    has_nsaid = any(d in " ".join(unique_meds) for d in ["ibuprofen", "diclofenac", "naproxen"])
    if has_anticoag and has_nsaid:
        risks.append({
            "risk": "Bleeding Risk",
            "severity": "high",
            "detail": "Concurrent use of anticoagulant/antiplatelet with NSAID — elevated bleeding risk",
            "recommendation": "Evaluate NSAID necessity; consider safer alternatives like paracetamol",
        })

    return risks


async def generate_patient_summary(db: AsyncSession, user_id: str) -> dict:
    """Generate a comprehensive AI-driven patient profile summary."""
    try:
        # Fetch user
        user_result = await db.execute(select(User).where(User.user_id == user_id))
        user = user_result.scalar_one_or_none()
        if not user:
            return {"error": "User not found"}

        # Fetch profile
        profile_result = await db.execute(select(UserProfile).where(UserProfile.user_id == user_id))
        profile = profile_result.scalar_one_or_none()

        # Fetch orders
        orders_result = await db.execute(
            select(Order)
            .where(Order.user_id == user_id)
            .order_by(Order.order_date.desc())
            .limit(50)
        )
        orders = orders_result.scalars().all()

        # Fetch dispensing logs
        try:
            logs_result = await db.execute(
                select(DispensingLog)
                .where(DispensingLog.user_id == str(user_id))
                .order_by(DispensingLog.timestamp.desc())
                .limit(50)
            )
            logs = logs_result.scalars().all()
        except Exception as e:
            logger.warning("Could not fetch dispensing logs for %s: %s", user_id, e)
            logs = []

        # Fetch prescriptions
        try:
            rx_result = await db.execute(
                select(Prescription)
                .where(Prescription.user_id == user_id)
                .order_by(Prescription.upload_date.desc())
            )
            prescriptions = rx_result.scalars().all()
        except Exception as e:
            logger.warning("Could not fetch prescriptions for %s: %s", user_id, e)
            prescriptions = []

        # Collect all medicines from orders + dispensing logs
        all_meds: list[dict] = []
        for order in orders:
            items = order.items if isinstance(order.items, list) else []
            all_meds.extend(items)
        for log in logs:
            if log.medicines_dispensed:
                all_meds.extend(log.medicines_dispensed)

        # Infer conditions
        inferred_conditions = _infer_conditions_from_meds(all_meds)

        # Merge with profile chronic conditions
        known_conditions = (profile.chronic_conditions if profile else []) or []

        # Assess risks
        risk_factors = _assess_risks(all_meds, inferred_conditions)

        # Build medication frequency summary
        med_freq: dict[str, int] = {}
        for med in all_meds:
            name = (med.get("medicine_name") or med.get("name") or "Unknown").title()
            med_freq[name] = med_freq.get(name, 0) + 1
        top_medications = sorted(med_freq.items(), key=lambda x: x[1], reverse=True)[:10]

        # Adherence score (based on order regularity)
        adherence_score = 0.5  # default
        if profile and profile.alert_responsiveness:
            adherence_score = profile.alert_responsiveness
        if len(orders) >= 3:
            adherence_score = min(1.0, adherence_score + 0.1 * min(len(orders), 5) / 5)

        # Prescription status — handle naive/aware datetime mix
        now = datetime.now(timezone.utc)
        active_rx = 0
        expired_rx = 0
        for rx in prescriptions:
            if rx.expiry_date:
                try:
                    exp = rx.expiry_date if rx.expiry_date.tzinfo else rx.expiry_date.replace(tzinfo=timezone.utc)
                    if exp > now:
                        active_rx += 1
                    else:
                        expired_rx += 1
                except Exception:
                    pass

        return {
            "user_id": str(user.user_id),
            "user_name": user.name,
            "user_email": user.email,
            "age": user.age,
            "gender": user.gender,
            "inferred_conditions": inferred_conditions,
            "known_conditions": known_conditions,
            "risk_factors": risk_factors,
            "top_medications": [{"name": name, "frequency": freq} for name, freq in top_medications],
            "total_orders": len(orders),
            "total_unique_meds": len(med_freq),
            "adherence_score": round(adherence_score, 2),
            "prescriptions": {
                "active": active_rx,
                "expired": expired_rx,
                "total": len(prescriptions),
            },
            "ai_insights": _generate_insights(inferred_conditions, risk_factors, top_medications, adherence_score),
        }
    except Exception as e:
        logger.exception("Error generating patient summary for %s: %s", user_id, e)
        return {
            "user_id": str(user_id),
            "user_name": "Unknown",
            "user_email": "",
            "age": None,
            "gender": None,
            "inferred_conditions": [],
            "known_conditions": [],
            "risk_factors": [],
            "top_medications": [],
            "total_orders": 0,
            "total_unique_meds": 0,
            "adherence_score": 0.5,
            "prescriptions": {"active": 0, "expired": 0, "total": 0},
            "ai_insights": [f"Error generating summary: {str(e)}"],
        }


def _generate_insights(conditions: list, risks: list, top_meds: list, adherence: float) -> list[str]:
    """Generate human-readable AI insights."""
    insights = []

    if conditions:
        cond_names = [c["condition"] for c in conditions[:3]]
        insights.append(f"Based on medication history, this patient likely has: {', '.join(cond_names)}")

    if any(r["severity"] == "high" for r in risks):
        insights.append("⚠️ High-risk factors detected — review medication regimen for safety")

    if adherence >= 0.8:
        insights.append("✅ Good medication adherence — patient follows prescribed regimen consistently")
    elif adherence <= 0.3:
        insights.append("⚠️ Low adherence score — consider simplifying regimen or follow-up reminders")

    if top_meds and len(top_meds) >= 5:
        insights.append(f"Patient uses {len(top_meds)}+ distinct medications — monitor for interactions")

    if not insights:
        insights.append("Insufficient data for detailed analysis — more order history needed")

    return insights


# ── GPT-powered patient insight ──────────────────────────────────────────

async def generate_gpt_insight(db: AsyncSession, user_id: str) -> dict:
    """Generate a GPT-powered narrative insight for a patient, plus structured summary data."""
    # Reuse the existing summary pipeline for structured data
    summary = await generate_patient_summary(db, user_id)
    if summary.get("error"):
        return summary

    # Build context text for GPT
    lines = [
        f"Patient: {summary['user_name']}",
        f"Age: {summary.get('age') or 'Unknown'}, Gender: {summary.get('gender') or 'Unknown'}",
        f"Total orders: {summary['total_orders']}, Unique medications: {summary['total_unique_meds']}",
        f"Adherence score: {summary['adherence_score']} (0-1 scale)",
        f"Active prescriptions: {summary['prescriptions']['active']}, Expired: {summary['prescriptions']['expired']}",
    ]

    if summary["known_conditions"]:
        lines.append(f"Known chronic conditions: {', '.join(str(c) for c in summary['known_conditions'])}")

    if summary["inferred_conditions"]:
        for c in summary["inferred_conditions"]:
            meds = ", ".join(c.get("supporting_medications", []))
            lines.append(f"Inferred condition: {c['condition']} (from: {meds}, confidence: {c.get('confidence', 'medium')})")

    if summary["risk_factors"]:
        for r in summary["risk_factors"]:
            lines.append(f"Risk: {r['risk']} — severity: {r['severity']} — {r['detail']}")

    if summary["top_medications"]:
        med_list = ", ".join(f"{m['name']} (×{m['frequency']})" for m in summary["top_medications"][:10])
        lines.append(f"Top medications: {med_list}")

    # Fetch recent order dates for temporal context
    from app.models.order import Order
    orders_result = await db.execute(
        select(Order)
        .where(Order.user_id == user_id)
        .order_by(Order.order_date.desc())
        .limit(10)
    )
    recent_orders = orders_result.scalars().all()
    for order in recent_orders:
        items = order.items if isinstance(order.items, list) else []
        med_names = [i.get("medicine_name") or i.get("name") or "Unknown" for i in items]
        date_str = order.order_date.strftime("%Y-%m-%d") if order.order_date else "Unknown date"
        if med_names:
            lines.append(f"Order on {date_str}: {', '.join(med_names)}")

    # Fetch medical_facts from profile
    profile_result = await db.execute(select(UserProfile).where(UserProfile.user_id == user_id))
    profile = profile_result.scalar_one_or_none()
    if profile:
        if profile.medical_facts:
            lines.append(f"Medical facts (from conversations): {', '.join(str(f) for f in profile.medical_facts)}")
        if profile.side_effects:
            lines.append(f"Reported side effects: {', '.join(str(s) for s in profile.side_effects)}")
        if profile.preferred_brands:
            lines.append(f"Preferred brands: {', '.join(str(b) for b in profile.preferred_brands)}")

    patient_context = "\n".join(lines)

    # Call GPT
    gpt_narrative = ""
    try:
        from app.services.openai_client import get_async_openai_client
        client = get_async_openai_client()
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a clinical intelligence assistant for a pharmacy admin dashboard. "
                        "Given a patient's complete medication history, profile, and order data, generate a rich, "
                        "insightful narrative analysis in 2-3 short paragraphs. Be conversational but clinical. "
                        "Infer likely current conditions from recent purchases (e.g., if they bought paracetamol/Dolo "
                        "recently, note they may have had fever or pain). Flag risks, note adherence patterns, "
                        "highlight anything unusual or noteworthy. Mention specific medicine names and dates when relevant. "
                        "Do NOT use markdown headers, bullet points, or emojis — write flowing prose paragraphs."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Generate a clinical narrative for this patient:\n\n{patient_context}",
                },
            ],
            temperature=0.7,
            max_tokens=600,
        )
        gpt_narrative = response.choices[0].message.content or ""
    except Exception as e:
        logger.warning("GPT insight generation failed for %s: %s", user_id, e)
        # Fallback to deterministic insights
        gpt_narrative = " ".join(summary.get("ai_insights", ["Unable to generate AI narrative."]))

    return {
        "user_id": summary["user_id"],
        "user_name": summary["user_name"],
        "user_email": summary["user_email"],
        "age": summary.get("age"),
        "gender": summary.get("gender"),
        "gpt_narrative": gpt_narrative,
        "summary": summary,
    }
