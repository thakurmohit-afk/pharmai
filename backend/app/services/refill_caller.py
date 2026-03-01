"""
Outbound Refill Call Service — Twilio + ElevenLabs TTS

Makes automated phone calls to patients about low medication supply.
Uses ElevenLabs for natural AI voice and Twilio for telephony.
"""

import logging
from twilio.rest import Client as TwilioClient
from app.config import get_settings

logger = logging.getLogger("pharmacy.refill_caller")


def get_twilio_client() -> TwilioClient:
    """Create Twilio client from settings."""
    s = get_settings()
    if not s.twilio_account_sid or not s.twilio_auth_token:
        raise RuntimeError("Twilio credentials not configured")
    return TwilioClient(s.twilio_account_sid, s.twilio_auth_token)


def initiate_refill_call(
    to_phone: str,
    patient_name: str,
    medicine_name: str,
    days_left: int,
    suggested_qty: int,
    alert_id: int,
    user_id: str,
    webhook_base_url: str,
) -> dict:
    """
    Initiate an outbound call to a patient about a medication refill.

    Args:
        to_phone: Patient phone number in E.164 format (+91...)
        patient_name: Patient's first name
        medicine_name: Name of the medication running low
        days_left: Estimated days of supply remaining
        suggested_qty: Suggested refill quantity
        alert_id: Refill alert ID for tracking
        user_id: User ID for order placement
        webhook_base_url: Public base URL for Twilio webhooks (e.g. ngrok URL)

    Returns:
        dict with call_sid and status
    """
    s = get_settings()
    client = get_twilio_client()

    # Build the webhook URL with context params
    status_callback = f"{webhook_base_url}/api/webhooks/twilio/call-status"
    voice_url = (
        f"{webhook_base_url}/api/webhooks/twilio/refill-voice"
        f"?patient_name={patient_name}"
        f"&medicine_name={medicine_name}"
        f"&days_left={days_left}"
        f"&suggested_qty={suggested_qty}"
        f"&alert_id={alert_id}"
        f"&user_id={user_id}"
    )

    call = client.calls.create(
        to=to_phone,
        from_=s.twilio_phone_number,
        url=voice_url,
        status_callback=status_callback,
        status_callback_event=["completed", "busy", "no-answer", "failed"],
        method="POST",
        timeout=30,
    )

    logger.info(
        "Refill call initiated: sid=%s to=%s medicine=%s",
        call.sid, to_phone, medicine_name,
    )

    return {
        "call_sid": call.sid,
        "status": call.status,
        "to": to_phone,
        "medicine_name": medicine_name,
    }
