"""Webhook routes — triggered by execution agent to notify n8n."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.webhook_service import trigger_order_finalized

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/order-finalized")
async def order_finalized(payload: dict, db: AsyncSession = Depends(get_db)):
    """Receive order-finalized event and forward to n8n."""
    result = await trigger_order_finalized(payload, db)
    return result
