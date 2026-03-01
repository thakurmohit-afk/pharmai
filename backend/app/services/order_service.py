"""Order service — order-related business logic."""

import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order

logger = logging.getLogger("pharmacy.services.order")


async def get_order_by_id(order_id: str, db: AsyncSession) -> dict | None:
    """Retrieve a single order by ID."""
    result = await db.execute(select(Order).where(Order.order_id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        return None

    return {
        "order_id": str(order.order_id),
        "user_id": str(order.user_id),
        "order_date": order.order_date.isoformat() if order.order_date else None,
        "status": order.status,
        "total_amount": order.total_amount,
        "items": order.items or [],
        "trace_id": order.trace_id,
    }
