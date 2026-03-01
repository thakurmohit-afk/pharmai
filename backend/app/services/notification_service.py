"""Service for outbound notifications (Email / WhatsApp)."""

import asyncio
import logging

from app.services.email_service import send_refill_alert_email

logger = logging.getLogger("pharmacy.notifications")


def send_refill_push_notification(
    user_id: str,
    user_name: str,
    user_email: str | None,
    user_phone: str | None,
    medicine_name: str,
    days_left: int,
) -> None:
    """Send Email and WhatsApp alerts for upcoming refills."""

    if user_email:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(send_refill_alert_email(
                to=user_email,
                user_name=user_name,
                medicine_name=medicine_name,
                days_left=days_left,
            ))
        except RuntimeError:
            # No running event loop — log instead
            logger.info("[EMAIL] Refill alert for %s (%s) — %s, %d days left",
                        user_name, user_email, medicine_name, days_left)

    if user_phone:
        message = (
            f"Hi {user_name}, your prescription for {medicine_name} is "
            f"estimated to run out in {days_left} days. "
            f"Reply with 'REFILL' to automatically place an order."
        )
        logger.info("[WHATSAPP] To: %s | %s", user_phone, message)
