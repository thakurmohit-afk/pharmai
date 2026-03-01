"""Payment verification routes."""

import asyncio
import logging
from datetime import datetime, timezone

import httpx
import razorpay
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies.auth import get_current_user
from app.langfuse_client import get_langfuse
from app.models.inventory import Inventory
from app.models.order import Order, OrderHistory
from app.models.refill_alert import RefillAlert
from app.models.user import User, UserProfile
from app.agents.profiling import _compute_refill_confidence

logger = logging.getLogger("pharmacy.payment")
settings = get_settings()
router = APIRouter(tags=["payment"])


class PaymentVerificationRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    payment_method: str | None = None


@router.post("/api/payment/verify")
async def verify_payment(
    data: PaymentVerificationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Verify Razorpay payment signature and finalize order atomically."""
    if not settings.payment_enabled:
        raise HTTPException(
            status_code=503,
            detail={"code": "payment_disabled", "message": "Payment verification is disabled."},
        )

    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise HTTPException(
            status_code=503,
            detail={"code": "payment_unconfigured", "message": "Razorpay is not configured."},
        )

    try:
        client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
    except Exception as err:
        logger.error("Failed to initialize Razorpay client: %s", err)
        raise HTTPException(
            status_code=502,
            detail={"code": "payment_gateway_unavailable", "message": "Unable to initialize payment gateway."},
        )

    try:
        client.utility.verify_payment_signature(
            {
                "razorpay_order_id": data.razorpay_order_id,
                "razorpay_payment_id": data.razorpay_payment_id,
                "razorpay_signature": data.razorpay_signature,
            }
        )
    except razorpay.errors.SignatureVerificationError:
        logger.warning("Signature verification failed for %s", data.razorpay_order_id)
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_signature", "message": "Invalid payment signature."},
        )
    except Exception as err:
        logger.warning("Signature verification error for %s: %s", data.razorpay_order_id, err)
        raise HTTPException(
            status_code=400,
            detail={"code": "signature_verification_error", "message": "Unable to verify payment signature."},
        )

    result = await db.execute(select(Order).where(Order.razorpay_order_id == data.razorpay_order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(
            status_code=404,
            detail={"code": "order_not_found", "message": "Order not found."},
        )

    if str(order.user_id) != str(current_user.user_id) and current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail={"code": "forbidden_order_access", "message": "You cannot verify this order."},
        )

    if order.status == "confirmed":
        return {"status": "already_confirmed", "order_id": str(order.order_id)}

    if order.status not in ("pending_payment", "pending"):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "invalid_order_state",
                "message": f"Order is in '{order.status}' state and cannot be confirmed.",
            },
        )

    order.status = "confirmed"
    order.razorpay_payment_id = data.razorpay_payment_id
    order.razorpay_signature = data.razorpay_signature
    if data.payment_method:
        order.payment_method = data.payment_method

    items = order.items or []
    try:
        for item in items:
            medicine_id = item.get("medicine_id")
            qty = int(item.get("billing_qty") or item.get("quantity", 1) or 1)
            if not medicine_id or qty <= 0:
                continue

            inv_result = await db.execute(
                select(Inventory)
                .where(Inventory.medicine_id == medicine_id)
                .with_for_update()
            )
            inventory = inv_result.scalar_one_or_none()
            if not inventory or inventory.stock_quantity < qty:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "insufficient_inventory",
                        "message": f"Insufficient inventory for medicine_id={medicine_id}.",
                    },
                )

            inventory.stock_quantity -= qty
            db.add(
                OrderHistory(
                    user_id=order.user_id,
                    medicine_id=medicine_id,
                    quantity=qty,
                    dosage_frequency=item.get("dosage"),
                )
            )

        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception as err:
        await db.rollback()
        logger.error("Payment confirmation failed for %s: %s", data.razorpay_order_id, err, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"code": "payment_finalize_failed", "message": "Failed to finalize payment."},
        )

    logger.info("Payment verified for Order %s (RP: %s)", order.order_id, data.razorpay_order_id)

    # ── Send order confirmation email (fire-and-forget) ──
    from app.services.email_service import send_order_confirmation_email

    asyncio.create_task(send_order_confirmation_email(
        to="mohit.zone.007@gmail.com",
        user_name=current_user.name,
        order_id=str(order.order_id),
        items=items,
        total_amount=order.total_amount,
        payment_method=data.payment_method,
        order_date=order.order_date,
    ))

    # ── Post-payment: re-detect medication patterns + create refill alerts ──
    try:
        await _update_profile_after_payment(str(order.user_id), db)
    except Exception as err:
        logger.warning("Post-payment profile update failed (non-critical): %s", err)

    webhook_triggered = False
    if settings.n8n_webhook_url:
        try:
            async with httpx.AsyncClient(timeout=5.0) as http:
                await http.post(
                    settings.n8n_webhook_url,
                    json={
                        "event": "payment_confirmed",
                        "order_id": str(order.order_id),
                        "user_id": str(order.user_id),
                        "amount": order.total_amount,
                        "payment_id": data.razorpay_payment_id,
                        "items": items,
                    },
                )
                webhook_triggered = True
        except Exception as err:
            logger.warning("Webhook failed for %s: %s", order.order_id, err)

    try:
        langfuse = get_langfuse()
        langfuse.trace(
            name="Payment Verification",
            trace_id=order.trace_id,
            metadata={
                "order_id": str(order.order_id),
                "payment_id": data.razorpay_payment_id,
                "amount": order.total_amount,
                "webhook_triggered": webhook_triggered,
                "status": "success",
            },
        )
    except Exception as err:
        logger.warning("LangFuse log failed: %s", err)

    return {
        "status": "success",
        "order_id": str(order.order_id),
        "message": "Payment verified and order confirmed",
    }


async def _update_profile_after_payment(user_id: str, db: AsyncSession) -> None:
    """Re-detect chronic medication patterns from order history and update user profile.
    Also creates RefillAlert records for high-confidence patterns.
    """
    from app.models.medicine import Medicine

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

    medication_counts: dict = {}
    for order in order_history:
        med_id = str(order.medicine_id)
        if med_id not in medication_counts:
            medication_counts[med_id] = {"count": 0, "dates": [], "medicine_id": med_id}
        medication_counts[med_id]["count"] += 1
        medication_counts[med_id]["dates"].append(order.order_date)

    detected_patterns = []
    now = datetime.now(timezone.utc)

    CHRONIC_CATEGORIES = {
        "Antihypertensive", "Antidiabetic", "Statin", 
        "Antiplatelet", "Multivitamins", "Vitamins", "Supplements"
    }

    for med_id, data in medication_counts.items():
        category = med_categories.get(med_id)
        if category not in CHRONIC_CATEGORIES:
            continue

        if data["count"] < 3:
            continue
        dates = sorted(data["dates"])
        intervals = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        if not intervals:
            continue
        avg_interval = sum(intervals) / len(intervals)
        if avg_interval >= 45:
            continue

        refill_confidence = _compute_refill_confidence(intervals)
        last_order = dates[-1]
        if last_order.tzinfo is None:
            last_order = last_order.replace(tzinfo=timezone.utc)

        pattern = {
            "medicine_id": med_id,
            "order_count": data["count"],
            "avg_interval_days": round(avg_interval, 1),
            "last_order": last_order.isoformat(),
            "type": "continuous",
            "refill_confidence": refill_confidence,
        }
        detected_patterns.append(pattern)

        # Create RefillAlert if not already pending
        if refill_confidence == "high":
            from datetime import timedelta
            estimated_run_out = last_order + timedelta(days=avg_interval)
            existing = await db.execute(
                select(RefillAlert).where(
                    RefillAlert.user_id == user_id,
                    RefillAlert.medicine_id == med_id,
                    RefillAlert.status == "pending",
                )
            )
            if not existing.scalar_one_or_none():
                db.add(RefillAlert(
                    user_id=user_id,
                    medicine_id=med_id,
                    estimated_run_out=estimated_run_out,
                    confidence=0.9,
                    status="pending",
                ))

    # Upsert UserProfile.medication_patterns
    profile_result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == user_id)
    )
    profile = profile_result.scalar_one_or_none()
    if profile:
        await db.execute(
            update(UserProfile)
            .where(UserProfile.user_id == user_id)
            .values(medication_patterns=detected_patterns)
        )
    else:
        db.add(UserProfile(user_id=user_id, medication_patterns=detected_patterns))

    await db.commit()
    logger.info("Post-payment profile updated for user %s: %d patterns", user_id, len(detected_patterns))
