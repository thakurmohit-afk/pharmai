"""User service — profile and dashboard data retrieval."""

import logging
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserProfile
from app.models.order import Order, OrderHistory
from app.models.prescription import Prescription
from app.models.refill_alert import RefillAlert
from app.models.medicine import Medicine

logger = logging.getLogger("pharmacy.services.user")


async def get_user_profile(user_id: str, db: AsyncSession) -> dict:
    """Retrieve full user profile with behavioral data."""
    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        return {"error": "User not found", "user_id": user_id}

    profile_result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == user_id)
    )
    profile = profile_result.scalar_one_or_none()

    return {
        "user_id": str(user.user_id),
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "gender": user.gender,
        "age": user.age,
        "avatar_url": user.avatar_url,
        "address": user.address or {},
        "chronic_conditions": (profile.chronic_conditions or []) if profile else [],
        "medication_patterns": (profile.medication_patterns or []) if profile else [],
        "medical_facts": (profile.medical_facts or []) if profile else [],
        "alert_responsiveness": profile.alert_responsiveness if profile else 0.5,
        "preferred_brands": (profile.preferred_brands or []) if profile else [],
        "side_effects": (profile.side_effects or []) if profile else [],
    }


async def get_user_dashboard(user_id: str, db: AsyncSession) -> dict:
    """Dashboard data: order history, alerts, chronic meds, upcoming refills, prescriptions,
    active medicines, and payment history."""
    now = datetime.now(timezone.utc)

    # ── Order history ────────────────────────────────────────────────────
    orders_result = await db.execute(
        select(Order)
        .where(Order.user_id == user_id)
        .order_by(Order.order_date.desc())
        .limit(20)
    )
    orders = orders_result.scalars().all()
    order_history = [
        {
            "order_id": str(o.order_id),
            "order_date": o.order_date.isoformat() if o.order_date else None,
            "status": o.status,
            "total_amount": o.total_amount,
            "items": o.items or [],
            "trace_id": o.trace_id,
            "payment_method": o.payment_method,
            "razorpay_payment_id": o.razorpay_payment_id,
        }
        for o in orders
    ]

    # ── Payment history (completed/confirmed orders) ─────────────────────
    payment_history = [
        {
            "order_id": o["order_id"],
            "amount": o["total_amount"],
            "payment_method": o["payment_method"],
            "razorpay_payment_id": o["razorpay_payment_id"],
            "status": o["status"],
            "date": o["order_date"],
            "items": o["items"],
        }
        for o in order_history
        if o["status"] in ("confirmed", "delivered", "completed")
    ]

    # ── Active refill alerts ─────────────────────────────────────────────
    alerts_result = await db.execute(
        select(RefillAlert, Medicine.name)
        .join(Medicine, RefillAlert.medicine_id == Medicine.medicine_id, isouter=True)
        .where(
            RefillAlert.user_id == user_id,
            RefillAlert.status.in_(["pending", "engaged"]),
        )
        .order_by(RefillAlert.estimated_run_out.asc())
    )
    alerts_rows = alerts_result.all()
    active_alerts = []
    for a, med_name in alerts_rows:
        days_until = None
        if a.estimated_run_out:
            run_out = a.estimated_run_out
            if run_out.tzinfo is None:
                run_out = run_out.replace(tzinfo=timezone.utc)
            days_until = (run_out - now).days
        active_alerts.append({
            "alert_id": str(a.alert_id),
            "medicine_name": med_name or "Unknown",
            "estimated_run_out": a.estimated_run_out.isoformat() if a.estimated_run_out else None,
            "days_until_run_out": days_until,
            "confidence": a.confidence,
            "status": a.status,
        })

    # ── Chronic medications (from profile) ───────────────────────────────
    profile_result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == user_id)
    )
    profile = profile_result.scalar_one_or_none()
    medication_patterns = (profile.medication_patterns or []) if profile else []
    chronic_medications = [
        m for m in medication_patterns if m.get("type") == "continuous"
    ]

    # ── Active medicines (from medication_patterns + order_history) ───────
    active_medicines = []
    for pattern in medication_patterns:
        med_id = pattern.get("medicine_id", "")
        last_order_str = pattern.get("last_order")
        avg_interval = pattern.get("avg_interval_days", 30)
        # Look up medicine name
        med_name = pattern.get("medicine_name", "")
        if not med_name and med_id:
            try:
                med_result = await db.execute(
                    select(Medicine.name).where(Medicine.medicine_id == med_id)
                )
                med_name = med_result.scalar_one_or_none() or "Unknown"
            except Exception:
                med_name = "Unknown"

        next_refill_est = None
        if last_order_str:
            try:
                last_dt = datetime.fromisoformat(last_order_str)
                if last_dt.tzinfo is None:
                    last_dt = last_dt.replace(tzinfo=timezone.utc)
                from datetime import timedelta
                next_refill_est = (last_dt + timedelta(days=avg_interval)).isoformat()
            except Exception:
                pass

        active_medicines.append({
            "medicine_id": med_id,
            "medicine_name": med_name,
            "pattern": pattern.get("type", "unknown"),
            "avg_interval_days": avg_interval,
            "refill_confidence": pattern.get("refill_confidence", "low"),
            "last_ordered": last_order_str,
            "next_refill_est": next_refill_est,
            "order_count": pattern.get("order_count", 0),
        })

    # ── Upcoming refills ─────────────────────────────────────────────────
    upcoming_refills = [
        {
            "medicine_name": a.get("medicine_name", "Unknown"),
            "estimated_run_out": a.get("estimated_run_out"),
            "days_until_run_out": a.get("days_until_run_out"),
            "confidence": a.get("confidence", 0),
        }
        for a in active_alerts
        if a.get("confidence", 0) >= 0.5
    ]

    # ── Prescriptions ────────────────────────────────────────────────────
    rx_result = await db.execute(
        select(Prescription)
        .where(Prescription.user_id == user_id)
        .order_by(Prescription.upload_date.desc())
        .limit(10)
    )
    prescriptions = rx_result.scalars().all()
    prescription_list = [
        {
            "prescription_id": str(p.prescription_id),
            "upload_date": p.upload_date.isoformat() if p.upload_date else None,
            "expiry_date": p.expiry_date.isoformat() if p.expiry_date else None,
            "verified": p.verified,
            "medicines": (p.extracted_data or {}).get("medicines", []),
            "confidence": (p.extracted_data or {}).get("confidence", 0),
        }
        for p in prescriptions
    ]

    return {
        "order_history": order_history,
        "payment_history": payment_history,
        "active_alerts": active_alerts,
        "chronic_medications": chronic_medications,
        "active_medicines": active_medicines,
        "upcoming_refills": upcoming_refills,
        "prescriptions": prescription_list,
    }


async def update_user_profile(user_id: str, updates: dict, db: AsyncSession) -> dict:
    """Update user profile details (name, phone, gender, age, conditions, preferences)."""
    # 1. Update User table (basic info)
    user_updates = {}
    for field in ("name", "phone", "gender", "age", "avatar_url", "address"):
        if field in updates:
            user_updates[field] = updates[field]

    if user_updates:
        await db.execute(
            update(User).where(User.user_id == user_id).values(**user_updates)
        )

    # 2. Update UserProfile table (behavioral data)
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == user_id))
    profile = result.scalar_one_or_none()

    if not profile:
        profile = UserProfile(user_id=user_id)
        db.add(profile)
        await db.flush()

    profile_updates = {}
    for field in ("chronic_conditions", "preferred_brands", "medication_patterns",
                  "alert_responsiveness", "side_effects", "medical_facts"):
        if field in updates:
            profile_updates[field] = updates[field]

    if profile_updates:
        await db.execute(
            update(UserProfile)
            .where(UserProfile.user_id == user_id)
            .values(**profile_updates)
        )

    await db.commit()
    return {"status": "success", "updated": list(user_updates.keys()) + list(profile_updates.keys())}
