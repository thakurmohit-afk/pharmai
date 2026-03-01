"""
Refill Call Routes — ElevenLabs Conversational AI Outbound Calls

Flow:
1. Admin triggers POST /api/admin/refill-call
2. Backend calls ElevenLabs API to initiate outbound call
3. ElevenLabs connects to Twilio, calls the patient
4. ElevenLabs AI agent handles the ENTIRE conversation naturally
5. Patient confirms/modifies/declines refill
6. Call logged automatically

Also retains Twilio Polly.Aditi fallback if ElevenLabs is unavailable.
"""

import logging
import re
import httpx
from urllib.parse import quote_plus

from fastapi import APIRouter, Request, Form, Query
from fastapi.responses import Response
from twilio.twiml.voice_response import VoiceResponse, Gather

from app.config import get_settings
from app.services.refill_caller import initiate_refill_call

logger = logging.getLogger("pharmacy.refill_calls")
router = APIRouter()


# ─────────────────────────────────────────────
# Admin Trigger Endpoint (ElevenLabs primary)
# ─────────────────────────────────────────────

@router.post("/api/admin/refill-call")
async def trigger_refill_call(request: Request):
    """
    Trigger an outbound refill call to a patient.

    Tries ElevenLabs Conversational AI first (natural voice).
    Falls back to Twilio + Polly if ElevenLabs fails.

    Body JSON:
    {
        "to_phone": "+91XXXXXXXXXX",
        "patient_name": "Aarav",
        "medicine_name": "Amlodipine",
        "days_left": 3,
        "suggested_qty": 30,
        "alert_id": 1,
        "user_id": "uuid-string",
        "webhook_base_url": "https://xxxx.ngrok-free.app"  (optional, only for Polly fallback)
    }
    """
    body = await request.json()

    to_phone = body.get("to_phone")
    patient_name = body.get("patient_name", "there")
    medicine_name = body.get("medicine_name", "your medication")
    days_left = int(body.get("days_left", 5))
    suggested_qty = int(body.get("suggested_qty", 30))
    alert_id = int(body.get("alert_id", 0))
    user_id = body.get("user_id", "")
    webhook_base_url = body.get("webhook_base_url", "")

    if not to_phone:
        return {"error": "to_phone is required"}

    s = get_settings()

    # ── Try ElevenLabs first ──
    if s.elevenlabs_api_key and s.elevenlabs_agent_id:
        try:
            result = await _elevenlabs_outbound_call(
                to_phone=to_phone,
                patient_name=patient_name,
                medicine_name=medicine_name,
                days_left=days_left,
                suggested_qty=suggested_qty,
                alert_id=alert_id,
                user_id=user_id,
            )
            return {"success": True, "method": "elevenlabs", **result}
        except Exception as e:
            logger.warning("ElevenLabs call failed, falling back to Polly: %s", e)

    # ── Fallback: Twilio + Polly ──
    if not webhook_base_url:
        return {"error": "ElevenLabs call failed and webhook_base_url not provided for Polly fallback"}

    result = initiate_refill_call(
        to_phone=to_phone,
        patient_name=patient_name,
        medicine_name=medicine_name,
        days_left=days_left,
        suggested_qty=suggested_qty,
        alert_id=alert_id,
        user_id=user_id,
        webhook_base_url=webhook_base_url,
    )
    return {"success": True, "method": "polly_fallback", **result}


# ─────────────────────────────────────────────
# ElevenLabs Webhook: Refill Order Confirmed
# ─────────────────────────────────────────────

@router.post("/api/webhooks/elevenlabs/refill-confirmed")
async def elevenlabs_refill_confirmed(request: Request):
    """
    Called by ElevenLabs agent (via webhook tool) when patient confirms a refill.
    Creates a Razorpay order and sends a payment link email to the patient.
    """
    import uuid
    import razorpay
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.database import async_session_factory
    from app.models.order import Order
    from app.services.email_service import _send_email, _base_template

    body = await request.json()
    logger.info("ElevenLabs refill confirmed webhook: %s", body)

    patient_name = body.get("patient_name", "Patient")
    medication_name = body.get("medication_name", "Medication")
    quantity = body.get("quantity", "30")
    patient_email = body.get("patient_email", "")

    # Fallback email for demo
    if not patient_email:
        patient_email = "mohit.zone.007@gmail.com"

    s = get_settings()

    # ── Create Razorpay Order ──
    rp_order_id = None
    order_id = str(uuid.uuid4())
    amount = 110.00  # default refill price for demo (₹110)

    try:
        if s.razorpay_key_id and s.razorpay_key_secret:
            client = razorpay.Client(auth=(s.razorpay_key_id, s.razorpay_key_secret))
            rp_order = client.order.create(data={
                "amount": int(round(amount * 100)),  # paise
                "currency": "INR",
                "receipt": order_id[:40],
                "notes": {
                    "patient_name": patient_name,
                    "medication": medication_name,
                    "source": "refill_call",
                },
            })
            rp_order_id = rp_order.get("id")
            logger.info("Razorpay order created: %s for ₹%.2f", rp_order_id, amount)

            # Save pending order to DB
            try:
                async with async_session_factory() as db:
                    order = Order(
                        order_id=order_id,
                        user_id="refill-call",  # system-generated
                        status="pending_payment",
                        total_amount=amount,
                        items=[{
                            "name": medication_name,
                            "quantity": int(quantity) if str(quantity).isdigit() else 30,
                            "unit_price": amount,
                            "subtotal": amount,
                            "billing_qty": 1,
                            "billing_unit": "strip",
                        }],
                        razorpay_order_id=rp_order_id,
                    )
                    db.add(order)
                    await db.commit()
                    logger.info("Pending order saved: %s", order_id)
            except Exception as db_err:
                logger.warning("Failed to save pending order (non-fatal): %s", db_err)
        else:
            logger.warning("Razorpay not configured, sending email without payment link")
    except Exception as rp_err:
        logger.error("Razorpay order creation failed: %s", rp_err)

    # ── Build payment URL ──
    if rp_order_id:
        pay_url = f"http://127.0.0.1:5173/payment?razorpay_order_id={rp_order_id}&amount={amount}&key_id={s.razorpay_key_id}&medicine={medication_name}"
        pay_button_text = f"Pay ₹{int(amount)} Now"
        status_text = "Awaiting Payment"
        amount_row = f"""
  <tr>
    <td style="font-size:14px;color:#334155;padding:8px 0;border-bottom:1px solid #f1f5f9;">Amount</td>
    <td align="right" style="font-size:14px;font-weight:700;color:#10b981;padding:8px 0;border-bottom:1px solid #f1f5f9;">₹{int(amount)}</td>
  </tr>"""
    else:
        pay_url = "http://127.0.0.1:5173/"
        pay_button_text = "Complete Payment on PharmAI"
        status_text = "Awaiting Payment"
        amount_row = ""

    content = f"""\
<!-- Phone icon -->
<div style="text-align:center;margin-bottom:20px;">
  <div style="display:inline-block;width:56px;height:56px;border-radius:50%;background-color:#ecfdf5;line-height:56px;text-align:center;">
    <span style="font-size:28px;color:#10b981;">&#128222;</span>
  </div>
</div>

<h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0f172a;text-align:center;">Refill Order Placed via Call</h1>
<p style="margin:0 0 24px;font-size:14px;color:#64748b;text-align:center;">
  Hi {patient_name}, as discussed during our phone call, your refill order has been placed.
</p>

<!-- Order details -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;overflow:hidden;margin-bottom:20px;">
<tr>
<td style="padding:16px 20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="font-size:14px;color:#334155;padding:8px 0;border-bottom:1px solid #f1f5f9;">Medication</td>
    <td align="right" style="font-size:14px;font-weight:600;color:#0f172a;padding:8px 0;border-bottom:1px solid #f1f5f9;">{medication_name}</td>
  </tr>
  <tr>
    <td style="font-size:14px;color:#334155;padding:8px 0;border-bottom:1px solid #f1f5f9;">Quantity</td>
    <td align="right" style="font-size:14px;font-weight:600;color:#0f172a;padding:8px 0;border-bottom:1px solid #f1f5f9;">{quantity} day supply</td>
  </tr>{amount_row}
  <tr>
    <td style="font-size:14px;color:#334155;padding:8px 0;">Status</td>
    <td align="right" style="font-size:14px;font-weight:600;color:#f59e0b;padding:8px 0;">{status_text}</td>
  </tr>
  </table>
</td>
</tr>
</table>

<div style="background-color:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;text-align:center;margin-bottom:20px;">
  <p style="margin:0;font-size:14px;font-weight:600;color:#92400e;">
    &#9201; Please complete payment within 1 hour
  </p>
  <p style="margin:8px 0 0;font-size:13px;color:#a16207;">
    Your order will be dispatched immediately after payment confirmation.
  </p>
</div>

<div style="text-align:center;margin-bottom:16px;">
  <a href="{pay_url}" style="display:inline-block;background:linear-gradient(135deg,#0d9488,#14b8a6);color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">
    {pay_button_text}
  </a>
</div>

<p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;">
  If you did not authorize this, please contact us immediately.
</p>"""

    subject = f"Refill Order: {medication_name} — Complete Payment | PharmAI"
    preview = f"Your {medication_name} refill order is ready for payment."
    html = _base_template(content, preview)

    email_sent = await _send_email(patient_email, subject, html)

    logger.info(
        "Refill order email sent=%s to=%s medicine=%s qty=%s razorpay=%s",
        email_sent, patient_email, medication_name, quantity, rp_order_id,
    )

    return {
        "success": True,
        "message": f"Order placed for {quantity} day supply of {medication_name}. Payment link sent to {patient_email}.",
        "email_sent": email_sent,
        "razorpay_order_id": rp_order_id,
        "order_id": order_id,
    }


async def _elevenlabs_outbound_call(
    to_phone: str,
    patient_name: str,
    medicine_name: str,
    days_left: int,
    suggested_qty: int,
    alert_id: int,
    user_id: str,
) -> dict:
    """Make an outbound call using ElevenLabs Conversational AI API."""
    s = get_settings()

    # First, get the phone number ID from ElevenLabs
    phone_number_id = await _get_elevenlabs_phone_number_id()

    # Build the first message with patient context
    first_message = (
        f"Hello {patient_name}! This is PharmAI, your pharmacy assistant. "
        f"I'm calling because your supply of {medicine_name} is running low, "
        f"with about {days_left} days remaining. "
        f"We'd recommend ordering a {suggested_qty} day supply. "
        f"Would you like me to place that refill order for you?"
    )

    # Make the outbound call via ElevenLabs API
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
            headers={
                "xi-api-key": s.elevenlabs_api_key,
                "Content-Type": "application/json",
            },
            json={
                "agent_id": s.elevenlabs_agent_id,
                "agent_phone_number_id": phone_number_id,
                "to_number": to_phone,
                "conversation_initiation_client_data": {
                    "dynamic_variables": {
                        "patient_name": patient_name,
                        "medication_name": medicine_name,
                        "days_left": str(days_left),
                        "refill_quantity": str(suggested_qty),
                    },
                },
            },
        )

        if response.status_code >= 400:
            error_text = response.text
            logger.error("ElevenLabs API error: %s %s", response.status_code, error_text)
            raise RuntimeError(f"ElevenLabs API error {response.status_code}: {error_text}")

        data = response.json()
        logger.info(
            "ElevenLabs call initiated: to=%s medicine=%s response=%s",
            to_phone, medicine_name, data,
        )
        return {
            "call_id": data.get("call_id", data.get("conversation_id", "")),
            "status": "initiated",
            "to": to_phone,
            "medicine_name": medicine_name,
        }


async def _get_elevenlabs_phone_number_id() -> str:
    """Get the first phone number ID from ElevenLabs account."""
    s = get_settings()

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            "https://api.elevenlabs.io/v1/convai/phone-numbers",
            headers={"xi-api-key": s.elevenlabs_api_key},
        )

        if response.status_code >= 400:
            raise RuntimeError(f"Failed to get phone numbers: {response.status_code} {response.text}")

        data = response.json()
        # ElevenLabs returns a list of phone numbers
        numbers = data if isinstance(data, list) else data.get("phone_numbers", data.get("data", []))

        if not numbers:
            raise RuntimeError("No phone numbers configured in ElevenLabs. Add your Twilio number in the ElevenLabs dashboard.")

        phone_id = numbers[0].get("phone_number_id") or numbers[0].get("id", "")
        logger.info("Using ElevenLabs phone number ID: %s", phone_id)
        return phone_id


# ─────────────────────────────────────────────
# Twilio Polly Fallback Webhooks (kept for backup)
# ─────────────────────────────────────────────

@router.post("/api/webhooks/twilio/refill-voice")
async def refill_voice_webhook(
    request: Request,
    patient_name: str = Query("there"),
    medicine_name: str = Query("your medication"),
    days_left: int = Query(5),
    suggested_qty: int = Query(30),
    alert_id: int = Query(0),
    user_id: str = Query(""),
):
    """Polly fallback: greeting + gather."""
    logger.info("Polly fallback voice webhook: patient=%s medicine=%s", patient_name, medicine_name)

    response = VoiceResponse()
    response.pause(length=1)

    action_url = (
        f"/api/webhooks/twilio/refill-gather"
        f"?patient_name={quote_plus(patient_name)}"
        f"&medicine_name={quote_plus(medicine_name)}"
        f"&suggested_qty={suggested_qty}"
        f"&alert_id={alert_id}"
        f"&user_id={user_id}"
    )

    gather = Gather(
        input="speech dtmf", action=action_url, method="POST",
        language="en-IN", speech_timeout="3", timeout=8, num_digits=1,
    )
    gather.say(
        f"Hello {patient_name}! This is PharmAI. "
        f"Your supply of {medicine_name} is running low with {days_left} days left. "
        f"We recommend a {suggested_qty} day refill. "
        f"Press 1 to confirm, 2 to decline, or say a quantity.",
        voice="Polly.Aditi", language="en-IN",
    )
    response.append(gather)
    response.say("Goodbye!", voice="Polly.Aditi", language="en-IN")
    response.hangup()

    return Response(content=str(response), media_type="application/xml")


@router.post("/api/webhooks/twilio/refill-gather")
async def refill_gather_webhook(
    request: Request,
    patient_name: str = Query("there"),
    medicine_name: str = Query("your medication"),
    suggested_qty: int = Query(30),
    alert_id: int = Query(0),
    user_id: str = Query(""),
):
    """Polly fallback: process speech/DTMF."""
    form = await request.form()
    speech = (form.get("SpeechResult") or "").lower().strip()
    digits = (form.get("Digits") or "").strip()

    response = VoiceResponse()
    confirm_words = {"yes", "yeah", "yep", "sure", "okay", "ok", "please", "go ahead", "confirm"}
    decline_words = {"no", "nah", "nope", "not now", "later", "cancel", "stop"}

    is_confirm = digits == "1" or any(w in speech for w in confirm_words)
    is_decline = digits == "2" or any(w in speech for w in decline_words)
    numbers = re.findall(r'\d+', speech)

    if is_decline and not is_confirm:
        response.say(f"No problem {patient_name}! We'll check back later. Take care!", voice="Polly.Aditi", language="en-IN")
    elif numbers and not is_confirm:
        response.say(f"Got it! Ordering {numbers[0]} units of {medicine_name}. Payment link via email. Thank you!", voice="Polly.Aditi", language="en-IN")
    else:
        response.say(f"Placing a {suggested_qty} day supply of {medicine_name}. Payment link via email. Stay healthy {patient_name}!", voice="Polly.Aditi", language="en-IN")

    response.hangup()
    return Response(content=str(response), media_type="application/xml")


@router.post("/api/webhooks/twilio/call-status")
async def call_status_webhook(request: Request):
    """Log call completion status."""
    form = await request.form()
    logger.info("Call status: sid=%s status=%s duration=%ss",
        form.get("CallSid", ""), form.get("CallStatus", ""), form.get("CallDuration", "0"))
    return Response(content="<Response/>", media_type="application/xml")
