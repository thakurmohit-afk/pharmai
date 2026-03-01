"""Admin service — alerts, inventory status, restock, prescription queue, overview, orders, users, dispensing logs, traces."""

import logging
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import select, update, func, String as SAString
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.expression import cast

from app.models.refill_alert import RefillAlert
from app.models.inventory import Inventory
from app.models.medicine import Medicine
from app.models.prescription import Prescription
from app.models.user import User
from app.models.order import Order
from app.models.dispensing_log import DispensingLog
from app.models.chat import ChatThread, ChatMessage

logger = logging.getLogger("pharmacy.services.admin")


async def get_all_alerts(db: AsyncSession) -> list[dict]:
    """Get all high-confidence refill alerts for admin review."""
    result = await db.execute(
        select(RefillAlert, Medicine.name, User.name.label("user_name"))
        .join(Medicine, RefillAlert.medicine_id == Medicine.medicine_id, isouter=True)
        .join(User, RefillAlert.user_id == User.user_id, isouter=True)
        .where(RefillAlert.confidence >= 0.5)
        .order_by(RefillAlert.estimated_run_out.asc())
    )
    rows = result.all()

    return [
        {
            "alert_id": str(alert.alert_id),
            "user_id": str(alert.user_id),
            "user_name": user_name or "Unknown",
            "medicine_name": med_name or "Unknown",
            "estimated_run_out": alert.estimated_run_out.isoformat() if alert.estimated_run_out else None,
            "confidence": alert.confidence,
            "status": alert.status,
        }
        for alert, med_name, user_name in rows
    ]


async def get_inventory_status(db: AsyncSession) -> list[dict]:
    """Get all inventory items with color-coded status (ok/low/critical)."""
    result = await db.execute(
        select(Inventory, Medicine.name)
        .join(Medicine, Inventory.medicine_id == Medicine.medicine_id)
        .order_by(Medicine.name)
    )
    rows = result.all()

    items = []
    for inv, med_name in rows:
        threshold = inv.min_stock_threshold or 20
        stock = inv.stock_quantity

        if stock <= 0:
            status = "critical"
        elif stock < threshold:
            status = "low"
        elif stock < threshold * 2:
            status = "low"
        else:
            status = "ok"

        items.append({
            "inventory_id": str(inv.inventory_id),
            "medicine_id": str(inv.medicine_id),
            "medicine_name": med_name,
            "stock_quantity": stock,
            "min_stock_threshold": threshold,
            "unit_type": inv.unit_type,
            "status": status,
        })

    return items


async def restock_medicine(medicine_id: str, quantity: int, db: AsyncSession) -> dict:
    """Add stock for a medicine."""
    result = await db.execute(
        select(Inventory).where(Inventory.medicine_id == medicine_id)
    )
    inv = result.scalar_one_or_none()

    if not inv:
        return {"success": False, "message": "Inventory record not found"}

    inv.stock_quantity += quantity
    await db.flush()

    logger.info(f"Restocked {medicine_id}: +{quantity}, new total={inv.stock_quantity}")
    return {
        "success": True,
        "medicine_id": medicine_id,
        "new_stock": inv.stock_quantity,
        "message": f"Restocked {quantity} units. New total: {inv.stock_quantity}",
    }


async def get_prescription_queue(db: AsyncSession) -> list[dict]:
    """Get prescriptions awaiting admin verification."""
    result = await db.execute(
        select(Prescription, User.name)
        .join(User, Prescription.user_id == User.user_id, isouter=True)
        .where(Prescription.verified == False)
        .order_by(Prescription.upload_date.desc())
    )
    rows = result.all()

    return [
        {
            "prescription_id": str(rx.prescription_id),
            "user_id": str(rx.user_id),
            "user_name": user_name or "Unknown",
            "upload_date": rx.upload_date.isoformat() if rx.upload_date else None,
            "expiry_date": rx.expiry_date.isoformat() if rx.expiry_date else None,
            "extracted_data": rx.extracted_data or {},
            "confidence": (rx.extracted_data or {}).get("confidence", 0),
            "image_url": rx.image_url,
        }
        for rx, user_name in rows
    ]


async def get_admin_overview(db: AsyncSession) -> dict:
    """Aggregate metrics for the admin overview dashboard."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    orders_today = (await db.execute(
        select(func.count(Order.order_id)).where(Order.order_date >= today_start)
    )).scalar() or 0

    total_orders = (await db.execute(
        select(func.count(Order.order_id))
    )).scalar() or 0

    active_alerts = (await db.execute(
        select(func.count(RefillAlert.alert_id)).where(
            RefillAlert.confidence >= 0.5,
            RefillAlert.status.in_(["pending", "engaged"]),
        )
    )).scalar() or 0

    inv_rows = (await db.execute(select(Inventory))).scalars().all()
    low_stock_count = sum(
        1 for inv in inv_rows
        if inv.stock_quantity < (inv.min_stock_threshold or 20)
    )

    pending_prescriptions = (await db.execute(
        select(func.count(Prescription.prescription_id)).where(
            Prescription.verified == False  # noqa: E712
        )
    )).scalar() or 0

    active_users = (await db.execute(
        select(func.count(User.user_id)).where(
            User.role == "user", User.is_active == True  # noqa: E712
        )
    )).scalar() or 0

    return {
        "orders_today": orders_today,
        "total_orders": total_orders,
        "active_alerts": active_alerts,
        "low_stock_count": low_stock_count,
        "pending_prescriptions": pending_prescriptions,
        "active_users": active_users,
    }


async def get_admin_orders(db: AsyncSession, limit: int = 50) -> list[dict]:
    """Recent orders with user names for admin activity feed."""
    result = await db.execute(
        select(Order, User.name.label("user_name"))
        .join(User, Order.user_id == User.user_id, isouter=True)
        .order_by(Order.order_date.desc())
        .limit(limit)
    )
    rows = result.all()

    return [
        {
            "order_id": str(order.order_id),
            "user_id": str(order.user_id),
            "user_name": user_name or "Unknown",
            "order_date": order.order_date.isoformat() if order.order_date else None,
            "status": order.status,
            "total_amount": order.total_amount,
            "items": order.items or [],
            "payment_method": order.payment_method,
        }
        for order, user_name in rows
    ]


async def get_admin_users(db: AsyncSession) -> list[dict]:
    """All non-admin users with order/alert counts.

    TODO: Optimize with subqueries for production scale.
    Currently uses N+1 queries — acceptable for demo (4 seeded users).
    """
    users_result = await db.execute(
        select(User).where(User.role == "user").order_by(User.name)
    )
    users = users_result.scalars().all()

    user_list = []
    for u in users:
        order_count = (await db.execute(
            select(func.count(Order.order_id)).where(Order.user_id == u.user_id)
        )).scalar() or 0

        alert_count = (await db.execute(
            select(func.count(RefillAlert.alert_id)).where(
                RefillAlert.user_id == u.user_id,
                RefillAlert.status.in_(["pending", "engaged"]),
            )
        )).scalar() or 0

        user_list.append({
            "user_id": str(u.user_id),
            "name": u.name,
            "email": u.email,
            "phone": u.phone,
            "age": u.age,
            "gender": u.gender,
            "is_active": u.is_active,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "order_count": order_count,
            "alert_count": alert_count,
            "avatar_url": u.avatar_url,
        })

    return user_list


async def get_dispensing_logs(db: AsyncSession, limit: int = 50) -> list[dict]:
    """Recent dispensing audit trail entries."""
    result = await db.execute(
        select(DispensingLog, User.name.label("user_name"))
        .join(User, DispensingLog.user_id == cast(User.user_id, SAString), isouter=True)
        .order_by(DispensingLog.timestamp.desc())
        .limit(limit)
    )
    rows = result.all()

    return [
        {
            "log_id": str(log.log_id),
            "order_id": log.order_id,
            "user_id": log.user_id,
            "user_name": user_name or "Unknown",
            "thread_id": log.thread_id,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None,
            "medicines_dispensed": log.medicines_dispensed or [],
            "safety_decision": log.safety_decision,
            "safety_warnings_surfaced": log.safety_warnings_surfaced or [],
            "clinical_checks_passed": log.clinical_checks_passed or {},
            "counseling_provided": log.counseling_provided or [],
            "pharmacist_escalation_required": log.pharmacist_escalation_required,
            "trace_id": log.trace_id,
        }
        for log, user_name in rows
    ]


# ── Traceability APIs ────────────────────────────────────────────────────


async def get_all_threads(db: AsyncSession, limit: int = 50) -> list[dict]:
    """All chat threads across all users for admin trace view."""
    # Subquery: message count per thread
    msg_count_sq = (
        select(
            ChatMessage.thread_id,
            func.count(ChatMessage.message_id).label("msg_count"),
        )
        .group_by(ChatMessage.thread_id)
        .subquery()
    )

    result = await db.execute(
        select(
            ChatThread,
            User.name.label("user_name"),
            User.email.label("user_email"),
            msg_count_sq.c.msg_count,
        )
        .join(User, ChatThread.user_id == User.user_id, isouter=True)
        .outerjoin(msg_count_sq, ChatThread.thread_id == msg_count_sq.c.thread_id)
        .order_by(ChatThread.updated_at.desc())
        .limit(limit)
    )
    rows = result.all()

    threads = []
    for thread, user_name, user_email, msg_count in rows:
        # Fetch last assistant message for preview
        last_msg_result = await db.execute(
            select(ChatMessage.content, ChatMessage.msg_metadata)
            .where(
                ChatMessage.thread_id == thread.thread_id,
                ChatMessage.role == "assistant",
            )
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        )
        last_msg = last_msg_result.first()

        threads.append({
            "thread_id": str(thread.thread_id),
            "user_name": user_name or "Unknown",
            "user_email": user_email or "",
            "title": thread.title,
            "message_count": msg_count or 0,
            "last_message_preview": (last_msg[0] or "")[:120] if last_msg else "",
            "last_action": (last_msg[1] or {}).get("action") if last_msg else None,
            "created_at": thread.created_at.isoformat() if thread.created_at else None,
            "updated_at": thread.updated_at.isoformat() if thread.updated_at else None,
        })

    return threads


async def get_thread_trace(db: AsyncSession, thread_id: str) -> dict | None:
    """Full conversation trace for a single thread — messages with pipeline data."""
    thread_result = await db.execute(
        select(ChatThread, User.name.label("user_name"), User.email.label("user_email"))
        .join(User, ChatThread.user_id == User.user_id, isouter=True)
        .where(cast(ChatThread.thread_id, SAString) == thread_id)
    )
    row = thread_result.first()
    if not row:
        return None

    thread, user_name, user_email = row

    messages_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread.thread_id)
        .order_by(ChatMessage.created_at.asc())
    )
    messages = messages_result.scalars().all()

    msg_list = []
    for msg in messages:
        entry = {
            "message_id": str(msg.message_id),
            "role": msg.role,
            "content": msg.content,
            "created_at": msg.created_at.isoformat() if msg.created_at else None,
        }
        if msg.role == "assistant" and msg.msg_metadata and isinstance(msg.msg_metadata, dict):
            meta = msg.msg_metadata
            entry["trace_id"] = meta.get("trace_id")
            entry["action"] = meta.get("action")
            entry["confidence"] = meta.get("confidence")
            entry["safety_decision"] = meta.get("safety_decision")
            entry["pipeline_steps"] = meta.get("pipeline_steps", [])
        msg_list.append(entry)

    return {
        "thread_id": str(thread.thread_id),
        "user_name": user_name or "Unknown",
        "user_email": user_email or "",
        "title": thread.title,
        "message_count": len(msg_list),
        "messages": msg_list,
    }


async def get_live_traces(db: AsyncSession, limit: int = 50) -> list[dict]:
    """Recent pipeline executions across all users for live trace feed."""
    result = await db.execute(
        select(
            ChatMessage,
            ChatThread.thread_id.label("t_thread_id"),
            User.name.label("user_name"),
        )
        .join(ChatThread, ChatMessage.thread_id == ChatThread.thread_id)
        .join(User, ChatThread.user_id == User.user_id, isouter=True)
        .where(
            ChatMessage.role == "assistant",
            ChatMessage.msg_metadata.isnot(None),
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    rows = result.all()

    traces = []
    for msg, thread_id, user_name in rows:
        meta = msg.msg_metadata if isinstance(msg.msg_metadata, dict) else {}
        if not meta.get("trace_id"):
            continue

        pipeline_steps = meta.get("pipeline_steps", [])
        total_duration = sum(s.get("duration_ms", 0) for s in pipeline_steps)
        step_summary = f"{sum(1 for s in pipeline_steps if s.get('status') == 'completed')}/{len(pipeline_steps)}"

        traces.append({
            "trace_id": meta.get("trace_id"),
            "thread_id": str(thread_id),
            "user_name": user_name or "Unknown",
            "message_preview": (msg.content or "")[:100],
            "action": meta.get("action", "chat"),
            "confidence": meta.get("confidence", 0),
            "safety_decision": meta.get("safety_decision"),
            "needs_clarification": meta.get("needs_clarification", False),
            "total_duration_ms": total_duration,
            "step_summary": step_summary,
            "pipeline_steps": pipeline_steps,
            "timestamp": msg.created_at.isoformat() if msg.created_at else None,
        })

    return traces


async def get_real_system_health(db: AsyncSession) -> dict:
    """Real system health metrics computed from stored pipeline traces."""
    # Fetch recent assistant messages with trace data
    result = await db.execute(
        select(ChatMessage.msg_metadata)
        .where(
            ChatMessage.role == "assistant",
            ChatMessage.msg_metadata.isnot(None),
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(200)
    )
    rows = result.scalars().all()

    # Filter to dicts with trace_id
    traced = [m for m in rows if isinstance(m, dict) and m.get("trace_id")]
    total = len(traced)

    if total == 0:
        return {
            "total_traces": 0,
            "avg_confidence": 0,
            "clarification_rate": 0,
            "error_rate": 0,
            "blocked_rate": 0,
            "agent_stats": [],
            "overview": await get_admin_overview(db),
        }

    # Aggregate metrics
    confidences = [m.get("confidence", 0) for m in traced if m.get("confidence") is not None]
    avg_confidence = round(sum(confidences) / len(confidences), 3) if confidences else 0

    clarify_count = sum(1 for m in traced if m.get("action") == "clarify")
    clarification_rate = round(clarify_count / total, 3)

    error_count = sum(
        1 for m in traced
        if any(s.get("status") == "error" for s in m.get("pipeline_steps", []))
    )
    error_rate = round(error_count / total, 3)

    blocked_count = sum(
        1 for m in traced
        if m.get("safety_decision") in ("soft_block", "hard_block")
    )
    blocked_rate = round(blocked_count / total, 3)

    # Per-agent stats
    agent_durations = defaultdict(list)
    agent_successes = defaultdict(lambda: [0, 0])  # [success, total]
    for m in traced:
        for step in m.get("pipeline_steps", []):
            sid = step.get("id", "unknown")
            if step.get("duration_ms"):
                agent_durations[sid].append(step["duration_ms"])
            if step.get("status") in ("completed", "blocked", "error", "skipped"):
                agent_successes[sid][1] += 1
                if step["status"] == "completed":
                    agent_successes[sid][0] += 1

    agent_stats = []
    for sid in sorted(agent_durations.keys()):
        durations = agent_durations[sid]
        succ, tot = agent_successes.get(sid, (0, 0))
        agent_stats.append({
            "agent_id": sid,
            "name": step_id_to_name(sid),
            "avg_latency_ms": round(sum(durations) / len(durations)) if durations else 0,
            "success_rate": round(succ / tot, 3) if tot > 0 else 0,
            "total_runs": tot,
        })

    return {
        "total_traces": total,
        "avg_confidence": avg_confidence,
        "clarification_rate": clarification_rate,
        "error_rate": error_rate,
        "blocked_rate": blocked_rate,
        "agent_stats": agent_stats,
        "overview": await get_admin_overview(db),
    }


def step_id_to_name(sid: str) -> str:
    """Map agent step ID to human-readable name."""
    names = {
        "medicine_search": "Medicine Search",
        "pharmacist": "Pharmacist AI",
        "profiling": "Profiling",
        "predictive": "Predictive",
        "safety": "Safety",
        "inventory": "Inventory",
        "execution": "Execution",
        "understanding": "Understanding",
        "supervisor": "Supervisor",
    }
    return names.get(sid, sid.replace("_", " ").title())
