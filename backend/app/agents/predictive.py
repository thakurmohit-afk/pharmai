"""Agent 3: Predictive Intelligence Agent.

Estimates medication depletion, triggers proactive refill alerts,
and applies decision matrix based on confidence × responsiveness.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.langfuse_client import observe
from app.agents.state import PharmacyState
from app.models.refill_alert import RefillAlert

logger = logging.getLogger("pharmacy.agents.predictive")

# Days before run-out to trigger a proactive alert
REFILL_TRIGGER_DAYS = 7


@observe(name="Predictive Agent")
async def predictive_agent(state: PharmacyState, db: AsyncSession) -> PharmacyState:
    """Analyze medication patterns and generate proactive refill predictions."""
    user_profile = state.get("user_profile", {})
    user_id = state.get("user_id", "")

    if not user_profile.get("exists"):
        state["prediction"] = {"alerts": [], "refill_suggestions": []}
        return state

    detected_patterns = user_profile.get("detected_patterns", [])
    alert_responsiveness = user_profile.get("alert_responsiveness", 0.5)
    now = datetime.now(timezone.utc)

    alerts = []
    refill_suggestions = []

    for pattern in detected_patterns:
        last_order_str = pattern.get("last_order")
        if not last_order_str:
            continue

        last_order_date = datetime.fromisoformat(last_order_str)
        if last_order_date.tzinfo is None:
            last_order_date = last_order_date.replace(tzinfo=timezone.utc)

        avg_interval = pattern.get("avg_interval_days", 30)
        refill_confidence = pattern.get("refill_confidence", "low")

        # Estimate run-out date
        estimated_run_out = last_order_date + timedelta(days=avg_interval)
        days_until_run_out = (estimated_run_out - now).days

        # ── Decision matrix ──────────────────────────────────────────────
        alert_action = _decide_alert_action(
            refill_confidence=refill_confidence,
            alert_responsiveness=alert_responsiveness,
            days_until_run_out=days_until_run_out,
        )

        if alert_action != "none":
            alert_entry = {
                "medicine_id": pattern["medicine_id"],
                "estimated_run_out": estimated_run_out.isoformat(),
                "days_until_run_out": days_until_run_out,
                "refill_confidence": refill_confidence,
                "action": alert_action,
                "avg_interval_days": avg_interval,
            }
            alerts.append(alert_entry)

            # Persist alert to DB
            try:
                confidence_score = {"high": 0.9, "medium": 0.6, "low": 0.3}.get(
                    refill_confidence, 0.3
                )
                
                existing = await db.execute(
                    select(RefillAlert).where(
                        RefillAlert.user_id == user_id,
                        RefillAlert.medicine_id == pattern["medicine_id"],
                        RefillAlert.status == "pending",
                    )
                )
                
                if not existing.scalars().first():
                    db_alert = RefillAlert(
                        user_id=user_id,
                        medicine_id=pattern["medicine_id"],
                        estimated_run_out=estimated_run_out,
                        confidence=confidence_score,
                        status="pending",
                    )
                    db.add(db_alert)
                    
                    from app.services.notification_service import send_refill_push_notification
                    from app.models.medicine import Medicine
                    
                    user_name = user_profile.get("name", "User")
                    user_email = user_profile.get("email")
                    user_phone = user_profile.get("phone")
                    
                    med_result = await db.execute(select(Medicine).where(Medicine.medicine_id == pattern["medicine_id"]))
                    med_obj = med_result.scalar_one_or_none()
                    med_name = med_obj.name if med_obj else "your medicine"
                    
                    send_refill_push_notification(
                        user_id=user_id,
                        user_name=user_name,
                        user_email=user_email,
                        user_phone=user_phone,
                        medicine_name=med_name,
                        days_left=days_until_run_out,
                    )
            except Exception as e:
                logger.warning(f"Failed to persist alert: {e}")

        # Suggest refill if within trigger window
        if days_until_run_out <= REFILL_TRIGGER_DAYS:
            refill_suggestions.append({
                "medicine_id": pattern["medicine_id"],
                "days_until_run_out": days_until_run_out,
                "suggested_quantity": None,  # could calculate from history
                "urgency": "high" if days_until_run_out <= 3 else "medium",
            })

    state["prediction"] = {
        "alerts": alerts,
        "refill_suggestions": refill_suggestions,
        "total_alerts": len(alerts),
    }

    logger.info(
        f"Predictive: {len(alerts)} alerts, {len(refill_suggestions)} refill suggestions"
    )
    return state


def _decide_alert_action(
    refill_confidence: str,
    alert_responsiveness: float,
    days_until_run_out: int,
) -> str:
    """Apply the decision matrix from the spec.

    Returns: "initiate_chat" | "dashboard_notification" | "silent_alert" | "none"
    """
    if days_until_run_out > REFILL_TRIGGER_DAYS:
        return "none"

    if refill_confidence == "high":
        if alert_responsiveness >= 0.7:
            return "initiate_chat"
        elif alert_responsiveness >= 0.4:
            return "dashboard_notification"
        else:
            return "silent_alert"
    elif refill_confidence == "medium":
        return "silent_alert"
    else:
        return "none"
