"""Agent 2: User Context & Profiling Agent.

Maintains behavioral profiles, auto-detects chronic conditions,
classifies medication patterns, and computes refill confidence.
"""

import json
import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.langfuse_client import observe
from app.agents.state import PharmacyState
from app.models.user import User, UserProfile
from app.models.order import OrderHistory
from app.models.chat import UserMemory

logger = logging.getLogger("pharmacy.agents.profiling")
settings = get_settings()


@observe(name="Profiling Agent")
async def profiling_agent(state: PharmacyState, db: AsyncSession) -> PharmacyState:
    """Fetch & enrich user profile. Resolve history-based references."""
    user_id = state.get("user_id", "")

    try:
        # ── Fetch user + profile ─────────────────────────────────────────
        result = await db.execute(
            select(User).where(User.user_id == user_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            state["user_profile"] = {"exists": False, "user_id": user_id}
            logger.warning(f"User {user_id} not found in DB")
            return state

        # Fetch profile
        profile_result = await db.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        )
        profile = profile_result.scalar_one_or_none()

        # ── Fetch order history for pattern analysis ─────────────────────
        from app.models.medicine import Medicine
        history_result = await db.execute(
            select(OrderHistory, Medicine.category)
            .join(Medicine, OrderHistory.medicine_id == Medicine.medicine_id)
            .where(OrderHistory.user_id == user_id)
            .order_by(OrderHistory.order_date.desc())
            .limit(50)
        )
        orders = history_result.all()
        order_history = [row.OrderHistory for row in orders]
        med_categories = {str(row.OrderHistory.medicine_id): row.category for row in orders}

        # ── Build profile dict ───────────────────────────────────────────
        user_profile = {
            "exists": True,
            "user_id": str(user.user_id),
            "name": user.name,
            "email": user.email,
            "phone": user.phone,
            "address": user.address or {},
            "chronic_conditions": (profile.chronic_conditions or []) if profile else [],
            "medication_patterns": (profile.medication_patterns or []) if profile else [],
            "alert_responsiveness": profile.alert_responsiveness if profile else 0.5,
            "preferred_brands": (profile.preferred_brands or []) if profile else [],
            "side_effects": (profile.side_effects or []) if profile else [],
        }

        memory_result = await db.execute(select(UserMemory).where(UserMemory.user_id == user_id))
        memory = memory_result.scalar_one_or_none()
        if memory and memory.summary_text:
            user_profile["memory_summary"] = memory.summary_text

        # ── Auto-detect chronic conditions from order patterns ───────────
        medication_counts = {}
        for order in order_history:
            med_id = str(order.medicine_id)
            if med_id not in medication_counts:
                medication_counts[med_id] = {
                    "count": 0,
                    "dates": [],
                    "medicine_id": med_id,
                }
            medication_counts[med_id]["count"] += 1
            medication_counts[med_id]["dates"].append(order.order_date)

        # Chronic = 3+ orders with < 45 day avg intervals
        detected_chronic = []
        CHRONIC_CATEGORIES = {
            "Antihypertensive", "Antidiabetic", "Statin", 
            "Antiplatelet", "Multivitamins", "Vitamins", "Supplements"
        }
        for med_id, data in medication_counts.items():
            category = med_categories.get(med_id)
            if category not in CHRONIC_CATEGORIES:
                continue

            if data["count"] >= 3:
                dates = sorted(data["dates"])
                intervals = [
                    (dates[i + 1] - dates[i]).days
                    for i in range(len(dates) - 1)
                ]
                avg_interval = sum(intervals) / len(intervals) if intervals else 999
                if avg_interval < 45:
                    detected_chronic.append({
                        "medicine_id": med_id,
                        "order_count": data["count"],
                        "avg_interval_days": round(avg_interval, 1),
                        "last_order": dates[-1].isoformat() if dates else None,
                        "type": "continuous",
                        "refill_confidence": _compute_refill_confidence(intervals),
                    })

        user_profile["detected_patterns"] = detected_chronic

        # ── Extract allergies from medical_facts ─────────────────────────
        medical_facts = (profile.medical_facts or []) if profile else []
        user_profile["medical_facts"] = medical_facts
        user_profile["allergies"] = [
            f.get("value", "")
            for f in medical_facts
            if f.get("fact_type") == "allergy" and f.get("status") == "active" and f.get("value")
        ]

        # ── Build active medicines list from recent orders ───────────────
        from app.models.medicine import Medicine as MedicineModel
        active_medicines = []
        seen_med_ids = set()
        for order in order_history[:20]:
            mid = str(order.medicine_id)
            if mid in seen_med_ids:
                continue
            seen_med_ids.add(mid)
            try:
                med_result = await db.execute(
                    select(MedicineModel).where(MedicineModel.medicine_id == mid)
                )
                med_obj = med_result.scalar_one_or_none()
                if med_obj:
                    active_medicines.append({
                        "name": med_obj.name,
                        "generic_name": med_obj.generic_name or "",
                        "dosage": med_obj.dosage or "",
                        "category": med_obj.category or "",
                        "rx_required": bool(med_obj.prescription_required),
                    })
            except Exception:
                pass
        user_profile["active_medicines"] = active_medicines[:10]

        state["user_profile"] = user_profile
        intent = state.get("intent", {})
        if intent.get("resolve_from_history") and order_history:
            last_order = order_history[0]
            user_profile["last_order_context"] = {
                "medicine_id": str(last_order.medicine_id),
                "quantity": last_order.quantity,
                "dosage_frequency": last_order.dosage_frequency,
                "order_date": last_order.order_date.isoformat(),
            }

        state["user_profile"] = user_profile
        logger.info(
            f"Profile loaded for {user.name}: "
            f"{len(detected_chronic)} chronic patterns detected"
        )

    except Exception as e:
        logger.error(f"Profiling agent error: {e}")
        state["user_profile"] = {"exists": False, "error": str(e)}
        state["error"] = f"Profiling agent error: {e}"

    return state


def _compute_refill_confidence(intervals: list[int]) -> str:
    """Classify refill confidence based on interval consistency.

    - high: std dev < 5 days (very regular)
    - medium: std dev < 10 days
    - low: std dev >= 10 days or too few data points
    """
    if len(intervals) < 2:
        return "low"
    mean = sum(intervals) / len(intervals)
    variance = sum((x - mean) ** 2 for x in intervals) / len(intervals)
    std_dev = variance ** 0.5
    if std_dev < 5:
        return "high"
    elif std_dev < 10:
        return "medium"
    return "low"
