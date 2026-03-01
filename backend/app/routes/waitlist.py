"""Waitlist routes — subscription + admin restock notifications."""

import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.waitlist import Waitlist
from app.models.medicine import Medicine
from app.models.inventory import Inventory
from app.models.user import User
from app.dependencies.auth import get_current_user

logger = logging.getLogger("pharmacy.waitlist")
router = APIRouter(tags=["waitlist"])


# ── Schemas ──────────────────────────────────────────────────────────────

class SubscribeRequest(BaseModel):
    medicine_name: str
    notification_method: str = "email"


class RestockRequest(BaseModel):
    medicine_name: str
    new_stock: int = 100


class WaitlistItemOut(BaseModel):
    waitlist_id: str
    medicine_name: str
    notification_method: str
    status: str
    created_at: str


# ── User endpoints ───────────────────────────────────────────────────────

@router.get("/api/waitlist")
async def get_waitlist(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user's active waitlist subscriptions."""
    result = await db.execute(
        select(Waitlist)
        .where(Waitlist.user_id == current_user.user_id, Waitlist.status == "pending")
        .order_by(Waitlist.created_at.desc())
    )
    items = result.scalars().all()
    return [
        WaitlistItemOut(
            waitlist_id=str(w.waitlist_id),
            medicine_name=w.medicine_name,
            notification_method=w.notification_method,
            status=w.status,
            created_at=w.created_at.isoformat() if w.created_at else "",
        )
        for w in items
    ]


@router.post("/api/waitlist/subscribe")
async def subscribe_waitlist(
    body: SubscribeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually subscribe to restock notification for a medicine."""
    user_id = current_user.user_id

    # Find the medicine
    result = await db.execute(
        select(Medicine).where(Medicine.name.ilike(f"%{body.medicine_name}%"))
    )
    medicine = result.scalar_one_or_none()
    if not medicine:
        raise HTTPException(status_code=404, detail=f"Medicine '{body.medicine_name}' not found")

    # Check if already subscribed
    existing = await db.execute(
        select(Waitlist).where(
            and_(
                Waitlist.user_id == user_id,
                Waitlist.medicine_id == medicine.medicine_id,
                Waitlist.status == "pending",
            )
        )
    )
    if existing.scalar_one_or_none():
        return {"success": True, "message": "Already subscribed for notifications", "already_subscribed": True}

    # Create subscription
    entry = Waitlist(
        user_id=user_id,
        medicine_id=medicine.medicine_id,
        medicine_name=medicine.name,
        notification_method=body.notification_method,
        status="pending",
    )
    db.add(entry)
    await db.commit()

    logger.info("User %s subscribed to restock alerts for %s", user_id, medicine.name)
    return {"success": True, "message": f"You'll be notified when {medicine.name} is back in stock"}


@router.delete("/api/waitlist/{waitlist_id}")
async def unsubscribe_waitlist(
    waitlist_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a pending stock alert subscription."""
    result = await db.execute(
        select(Waitlist).where(
            and_(
                Waitlist.waitlist_id == waitlist_id,
                Waitlist.user_id == current_user.user_id,
                Waitlist.status == "pending",
            )
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Subscription not found")

    await db.delete(entry)
    return {"success": True, "message": "Unsubscribed from stock notifications"}


@router.get("/api/waitlist/check")
async def check_waitlist_status(
    medicine_name: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check if the current user is already subscribed for a specific medicine.

    Used by the QuoteCard to decide whether to show "Notify Me" or "✔ Subscribed".
    """
    result = await db.execute(
        select(Medicine).where(Medicine.name.ilike(f"%{medicine_name}%"))
    )
    medicine = result.scalar_one_or_none()
    if not medicine:
        return {"subscribed": False, "medicine_name": medicine_name}

    existing = await db.execute(
        select(Waitlist).where(
            and_(
                Waitlist.user_id == current_user.user_id,
                Waitlist.medicine_id == medicine.medicine_id,
                Waitlist.status == "pending",
            )
        )
    )
    entry = existing.scalar_one_or_none()
    return {
        "subscribed": entry is not None,
        "waitlist_id": str(entry.waitlist_id) if entry else None,
        "medicine_name": medicine.name if medicine else medicine_name,
    }


# ── Admin endpoint ───────────────────────────────────────────────────────

@router.post("/api/admin/restock")
async def admin_restock(
    body: RestockRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Admin triggers a restock — updates inventory and notifies all waitlisted users.

    In production this would send real emails/WhatsApp messages.
    For the hackathon demo, it logs notifications and marks entries as notified.
    """
    # Find the medicine
    result = await db.execute(
        select(Medicine).where(Medicine.name.ilike(f"%{body.medicine_name}%"))
    )
    medicine = result.scalar_one_or_none()
    if not medicine:
        raise HTTPException(status_code=404, detail=f"Medicine '{body.medicine_name}' not found")

    # Update inventory
    inv_result = await db.execute(
        select(Inventory).where(Inventory.medicine_id == medicine.medicine_id)
    )
    inventory = inv_result.scalar_one_or_none()
    if inventory:
        inventory.stock_quantity = body.new_stock
    else:
        inventory = Inventory(
            medicine_id=medicine.medicine_id,
            stock_quantity=body.new_stock,
        )
        db.add(inventory)

    # Find and notify all pending waitlist entries
    waitlist_result = await db.execute(
        select(Waitlist).where(
            and_(
                Waitlist.medicine_id == medicine.medicine_id,
                Waitlist.status == "pending",
            )
        )
    )
    waitlist_entries = waitlist_result.scalars().all()

    notifications_sent = 0
    for entry in waitlist_entries:
        # In production: send actual email/WhatsApp using SendGrid/Twilio
        # For demo: log and mark as notified
        logger.info(
            "NOTIFICATION SENT: User %s notified via %s that %s is back in stock!",
            entry.user_id,
            entry.notification_method,
            medicine.name,
        )
        entry.status = "notified"
        entry.notified_at = datetime.now(timezone.utc)
        notifications_sent += 1

    await db.commit()

    return {
        "success": True,
        "medicine": medicine.name,
        "new_stock": body.new_stock,
        "notifications_sent": notifications_sent,
        "message": f"Restocked {medicine.name} ({body.new_stock} units). {notifications_sent} user(s) notified.",
    }
