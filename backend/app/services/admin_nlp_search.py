"""Admin NLP Search — translates natural language queries into structured DB queries."""

import logging
import re
from datetime import datetime, timezone

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserProfile
from app.models.order import Order
from app.models.medicine import Medicine
from app.models.inventory import Inventory
from app.models.prescription import Prescription
from app.models.refill_alert import RefillAlert

logger = logging.getLogger("pharmacy.services.admin_nlp")

# ── Query templates ───────────────────────────────────────────────────────
QUERY_PATTERNS = [
    {"pattern": r"low\s*stock|out\s*of\s*stock|running\s*low", "intent": "low_stock"},
    {"pattern": r"refill\s*risk|need\s*refill|running\s*out", "intent": "high_refill_risk"},
    {"pattern": r"expired?\s*prescription|prescription.*expir", "intent": "expired_prescriptions"},
    {"pattern": r"polypharmacy|many\s*med|multiple\s*drug|drug\s*interaction", "intent": "polypharmacy"},
    {"pattern": r"inactive|dormant|haven.t\s*order|no\s*order", "intent": "inactive_users"},
    {"pattern": r"top\s*sell|most\s*order|popular|best\s*sell", "intent": "top_selling"},
    {"pattern": r"high\s*spend|expensive|big\s*order", "intent": "high_spenders"},
    {"pattern": r"new\s*user|recent.*register|just\s*joined", "intent": "new_users"},
    {"pattern": r"pending\s*order|unprocessed|awaiting", "intent": "pending_orders"},
]


def _classify_query(query: str) -> str:
    """Classify a natural language query into an intent."""
    q = query.lower().strip()
    for qp in QUERY_PATTERNS:
        if re.search(qp["pattern"], q):
            return qp["intent"]
    return "general_search"


async def admin_nlp_search(db: AsyncSession, query: str) -> dict:
    """Execute natural language query as a structured database search."""
    intent = _classify_query(query)
    results = []
    result_type = "table"
    title = ""

    if intent == "low_stock":
        title = "Low Stock Medicines"
        stmt = (
            select(Medicine, Inventory)
            .outerjoin(Inventory, Medicine.medicine_id == Inventory.medicine_id)
            .where(Medicine.is_active == True)
        )
        rows = (await db.execute(stmt)).all()
        for med, inv in rows:
            stock = inv.stock_quantity if inv else 0
            if stock < 20:
                results.append({
                    "medicine_name": med.name,
                    "category": med.category,
                    "current_stock": stock,
                    "status": "Critical" if stock < 5 else "Low",
                    "price": med.price,
                })
        results.sort(key=lambda x: x["current_stock"])

    elif intent == "high_refill_risk":
        title = "Users at High Refill Risk"
        stmt = (
            select(RefillAlert, User)
            .join(User, RefillAlert.user_id == User.user_id)
            .where(RefillAlert.status == "pending")
            .order_by(RefillAlert.estimated_run_out)
            .limit(20)
        )
        rows = (await db.execute(stmt)).all()
        for alert, user in rows:
            results.append({
                "user_name": user.name,
                "email": user.email,
                "medicine_id": str(alert.medicine_id),
                "estimated_run_out": alert.estimated_run_out.strftime("%Y-%m-%d") if alert.estimated_run_out else "N/A",
                "confidence": round(alert.confidence * 100) if alert.confidence else 0,
            })

    elif intent == "expired_prescriptions":
        title = "Users with Expired Prescriptions"
        now = datetime.now(timezone.utc)
        stmt = (
            select(Prescription, User)
            .join(User, Prescription.user_id == User.user_id)
            .where(Prescription.expiry_date < now)
            .order_by(Prescription.expiry_date.desc())
            .limit(20)
        )
        rows = (await db.execute(stmt)).all()
        for rx, user in rows:
            results.append({
                "user_name": user.name,
                "email": user.email,
                "prescription_id": str(rx.prescription_id),
                "expired_on": rx.expiry_date.strftime("%Y-%m-%d"),
                "days_expired": (now - rx.expiry_date).days,
            })

    elif intent == "polypharmacy":
        title = "High Polypharmacy Cases"
        # Find users with 5+ distinct medications in orders
        users_result = await db.execute(
            select(User).where(User.role == "user", User.is_active == True)
        )
        all_users = users_result.scalars().all()
        for user in all_users:
            orders_result = await db.execute(
                select(Order).where(Order.user_id == user.user_id).limit(30)
            )
            orders = orders_result.scalars().all()
            med_set = set()
            for order in orders:
                if isinstance(order.items, list):
                    for item in order.items:
                        med_set.add(item.get("medicine_name", item.get("name", "Unknown")))
            if len(med_set) >= 5:
                results.append({
                    "user_name": user.name,
                    "email": user.email,
                    "unique_medications": len(med_set),
                    "medications": list(med_set)[:8],
                    "risk": "High" if len(med_set) >= 8 else "Medium",
                })
        results.sort(key=lambda x: x["unique_medications"], reverse=True)

    elif intent == "inactive_users":
        title = "Inactive Users (No recent orders)"
        users_result = await db.execute(
            select(User).where(User.role == "user", User.is_active == True)
        )
        for user in users_result.scalars().all():
            order_count = (await db.execute(
                select(func.count()).select_from(Order).where(Order.user_id == user.user_id)
            )).scalar() or 0
            if order_count == 0:
                results.append({
                    "user_name": user.name,
                    "email": user.email,
                    "joined": user.created_at.strftime("%Y-%m-%d") if user.created_at else "N/A",
                    "total_orders": 0,
                })

    elif intent == "top_selling":
        title = "Top Selling Medicines"
        stmt = (
            select(Medicine, Inventory)
            .outerjoin(Inventory, Medicine.medicine_id == Inventory.medicine_id)
            .where(Medicine.is_active == True)
            .limit(20)
        )
        rows = (await db.execute(stmt)).all()
        for med, inv in rows:
            results.append({
                "medicine_name": med.name,
                "category": med.category,
                "price": med.price,
                "current_stock": inv.stock_quantity if inv else 0,
            })

    elif intent == "new_users":
        title = "Recently Registered Users"
        stmt = (
            select(User)
            .where(User.role == "user")
            .order_by(User.created_at.desc())
            .limit(10)
        )
        for user in (await db.execute(stmt)).scalars().all():
            results.append({
                "user_name": user.name,
                "email": user.email,
                "joined": user.created_at.strftime("%Y-%m-%d %H:%M") if user.created_at else "N/A",
            })

    elif intent == "pending_orders":
        title = "Pending Orders"
        stmt = (
            select(Order, User)
            .join(User, Order.user_id == User.user_id)
            .where(Order.status == "pending")
            .order_by(Order.created_at.desc())
            .limit(20)
        )
        for order, user in (await db.execute(stmt)).all():
            results.append({
                "order_id": str(order.order_id),
                "user_name": user.name,
                "amount": order.total_amount,
                "created": order.created_at.strftime("%Y-%m-%d %H:%M") if order.created_at else "N/A",
            })

    else:
        title = "Search Results"
        # General keyword search across medicines
        keywords = [w for w in re.split(r'\s+', query.lower()) if len(w) > 2]
        if keywords:
            filters = []
            for kw in keywords:
                filters.append(Medicine.name.ilike("%" + kw + "%"))
            stmt = (
                select(Medicine, Inventory)
                .outerjoin(Inventory, Medicine.medicine_id == Inventory.medicine_id)
                .where(Medicine.is_active == True, *filters)
                .limit(20)
            )
            for med, inv in (await db.execute(stmt)).all():
                results.append({
                    "medicine_name": med.name,
                    "category": med.category,
                    "price": med.price,
                    "stock": inv.stock_quantity if inv else 0,
                })

    return {
        "query": query,
        "intent": intent,
        "title": title,
        "result_type": result_type,
        "count": len(results),
        "results": results,
        "suggested_queries": [
            "Low stock meds",
            "Users at high refill risk",
            "Users with expired prescriptions",
            "High polypharmacy cases",
            "Top selling medicines",
            "Inactive users",
            "Pending orders",
            "New users",
        ],
    }
