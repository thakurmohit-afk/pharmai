"""Async email service — Gmail SMTP with professional HTML templates."""

import asyncio
import logging
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from app.config import get_settings

logger = logging.getLogger("pharmacy.email")


# ── Low-level sender ────────────────────────────────────────────────────────

async def _send_email(to: str, subject: str, html_body: str) -> bool:
    """Send an HTML email via Gmail SMTP.  Returns True on success."""
    settings = get_settings()
    if not settings.smtp_email or not settings.smtp_app_password:
        logger.debug("SMTP not configured — skipping email to %s", to)
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = f"PharmAI <{settings.smtp_email}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_email,
            password=settings.smtp_app_password,
            start_tls=True,
        )
        logger.info("Email sent to %s: %s", to, subject)
        return True
    except Exception as exc:
        logger.warning("Email send failed to %s: %s", to, exc)
        return False


# ── Base HTML template ───────────────────────────────────────────────────────

def _base_template(content_html: str, preview_text: str = "") -> str:
    """Wrap content in the PharmAI branded email layout (teal/green theme)."""
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>PharmAI</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f0fdfa;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<!-- Preview text (hidden) -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">{preview_text}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdfa;">
<tr><td align="center" style="padding:24px 16px;">

<!-- Main card -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(13,148,136,0.10);">

<!-- Header -->
<tr>
<td style="background:linear-gradient(135deg,#0d9488,#14b8a6);padding:28px 32px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td>
      <span style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">PharmAI</span>
    </td>
    <td align="right">
      <span style="font-size:12px;color:#ccfbf1;background:rgba(255,255,255,0.15);padding:4px 10px;border-radius:20px;">Pharmacy Assistant</span>
    </td>
  </tr>
  </table>
</td>
</tr>

<!-- Body content -->
<tr>
<td style="padding:32px 32px 24px;">
{content_html}
</td>
</tr>

<!-- Footer -->
<tr>
<td style="padding:0 32px 28px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding-top:20px;"></td></tr>
  <tr>
    <td style="font-size:11px;color:#94a3b8;line-height:1.5;">
      This is a dispensing assistance system.<br/>
      Final dispensing is subject to pharmacist verification.<br/>
      Not a substitute for medical advice.
    </td>
    <td align="right" valign="bottom" style="font-size:11px;color:#94a3b8;">
      &copy; 2026 PharmAI<br/>Do not reply
    </td>
  </tr>
  </table>
</td>
</tr>

</table>
<!-- /Main card -->

</td></tr>
</table>
</body>
</html>"""


# ── Order Confirmation Email ─────────────────────────────────────────────────

def _format_payment_method(method: str | None) -> str:
    return {
        "upi": "UPI",
        "card": "Credit / Debit Card",
        "netbanking": "Net Banking",
    }.get((method or "").lower(), method or "Online")


async def send_order_confirmation_email(
    to: str,
    user_name: str,
    order_id: str,
    items: list[dict],
    total_amount: float,
    payment_method: str | None = None,
    order_date: datetime | None = None,
) -> bool:
    """Build and send the order confirmation email."""
    short_id = order_id[:8].upper()
    date_str = (order_date or datetime.now()).strftime("%d %b %Y, %I:%M %p")
    method_label = _format_payment_method(payment_method)

    # Build item rows
    item_rows = ""
    for item in items:
        name = item.get("name", "Medicine")
        qty = item.get("billing_qty") or item.get("quantity", 1)
        unit = item.get("billing_unit", "strip")
        unit_price = item.get("unit_price") or item.get("price", 0)
        subtotal = item.get("subtotal") or (float(unit_price) * int(qty))
        item_rows += f"""\
<tr>
  <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#334155;">{name}</td>
  <td align="center" style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#64748b;">{qty} {unit}</td>
  <td align="right" style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#334155;font-weight:500;">&#8377;{subtotal:,.2f}</td>
</tr>"""

    content = f"""\
<!-- Success icon -->
<div style="text-align:center;margin-bottom:20px;">
  <div style="display:inline-block;width:56px;height:56px;border-radius:50%;background-color:#ecfdf5;line-height:56px;text-align:center;">
    <span style="font-size:28px;color:#10b981;">&#10003;</span>
  </div>
</div>

<h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0f172a;text-align:center;">Order Confirmed!</h1>
<p style="margin:0 0 24px;font-size:14px;color:#64748b;text-align:center;">
  Hi {user_name}, your order has been confirmed and is being processed.
</p>

<!-- Order details card -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;overflow:hidden;margin-bottom:20px;">
<tr>
<td style="padding:16px 20px;">

  <!-- Order meta -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
  <tr>
    <td style="font-size:14px;font-weight:600;color:#0f766e;">Order #{short_id}</td>
    <td align="right" style="font-size:12px;color:#94a3b8;">{date_str}</td>
  </tr>
  </table>

  <!-- Items table -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="padding:0 0 8px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Medicine</td>
    <td align="center" style="padding:0 0 8px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Qty</td>
    <td align="right" style="padding:0 0 8px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Price</td>
  </tr>
  {item_rows}
  </table>

  <!-- Total -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
  <tr>
    <td style="font-size:15px;font-weight:700;color:#0f172a;">Total</td>
    <td align="right" style="font-size:18px;font-weight:700;color:#0d9488;">&#8377;{total_amount:,.2f}</td>
  </tr>
  <tr>
    <td colspan="2" style="padding-top:6px;font-size:12px;color:#94a3b8;">Paid via {method_label}</td>
  </tr>
  </table>

</td>
</tr>
</table>

<p style="margin:0;font-size:14px;color:#475569;text-align:center;">
  Thank you for choosing <strong style="color:#0d9488;">PharmAI</strong>.<br/>
  <span style="font-size:12px;color:#94a3b8;">Your medicines will be ready for dispatch shortly.</span>
</p>"""

    subject = f"Order Confirmed — #{short_id} | PharmAI"
    preview = f"Your order #{short_id} for Rs.{total_amount:,.2f} has been confirmed."
    html = _base_template(content, preview)

    return await _send_email(to, subject, html)


# ── Refill Alert Email ───────────────────────────────────────────────────────

async def send_refill_alert_email(
    to: str,
    user_name: str,
    medicine_name: str,
    days_left: int,
) -> bool:
    """Send a refill reminder email."""
    urgency = "soon" if days_left > 3 else "very soon"

    content = f"""\
<!-- Alert icon -->
<div style="text-align:center;margin-bottom:20px;">
  <div style="display:inline-block;width:56px;height:56px;border-radius:50%;background-color:#fef3c7;line-height:56px;text-align:center;">
    <span style="font-size:28px;color:#f59e0b;">&#9888;</span>
  </div>
</div>

<h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0f172a;text-align:center;">Refill Reminder</h1>
<p style="margin:0 0 24px;font-size:14px;color:#64748b;text-align:center;">
  Hi {user_name}, your supply of <strong style="color:#0f172a;">{medicine_name}</strong>
  is estimated to run out {urgency} — in about <strong>{days_left} day{"s" if days_left != 1 else ""}</strong>.
</p>

<div style="background-color:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:16px 20px;text-align:center;margin-bottom:20px;">
  <p style="margin:0;font-size:14px;color:#0f766e;">
    Open <strong>PharmAI</strong> and say <em>"refill {medicine_name}"</em> to reorder quickly.
  </p>
</div>

<p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;">
  This reminder is based on your past ordering pattern.
</p>"""

    subject = f"Refill Reminder: {medicine_name} | PharmAI"
    preview = f"Your {medicine_name} supply runs out in ~{days_left} days."
    html = _base_template(content, preview)

    return await _send_email(to, subject, html)
