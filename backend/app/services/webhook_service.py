"""Webhook service — triggers n8n workflows on order finalization."""

import logging

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings

logger = logging.getLogger("pharmacy.services.webhook")
settings = get_settings()


async def trigger_order_finalized(payload: dict, db: AsyncSession) -> dict:
    """Forward order-finalized event to n8n webhook.

    The n8n workflow handles:
    - Email confirmation (SendGrid/Resend)
    - WhatsApp notification (Twilio)
    - Mock warehouse fulfillment
    - Status update
    """
    if not settings.n8n_webhook_url:
        logger.warning("n8n webhook URL not configured — skipping")
        return {"success": False, "message": "Webhook URL not configured"}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                settings.n8n_webhook_url,
                json=payload,
            )
            response.raise_for_status()

        logger.info(f"Webhook triggered: status={response.status_code}")
        return {
            "success": True,
            "status_code": response.status_code,
            "message": "Webhook triggered successfully",
        }

    except httpx.TimeoutException:
        logger.warning("Webhook timed out — will retry later")
        return {"success": False, "message": "Webhook timed out"}

    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"success": False, "message": str(e)}
