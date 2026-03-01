"""Agent 7: execution boundary control.

Creates a pending order and starts Razorpay checkout.
Stock deduction is finalized in /api/payment/verify.
"""

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.state import PharmacyState
from app.config import get_settings
from app.langfuse_client import observe
from app.models.order import Order

logger = logging.getLogger("pharmacy.agents.execution")
settings = get_settings()


def _build_order_items_from_quote(quote: dict) -> list[dict]:
    order_items: list[dict] = []
    for line in quote.get("lines", []):
        billing_qty = int(line.get("billing_qty") or 1)
        unit_price = float(line.get("unit_price") or 0.0)
        subtotal = float(line.get("subtotal") or round(unit_price * billing_qty, 2))
        order_items.append(
            {
                "medicine_id": line.get("medicine_id") or None,
                "name": line.get("name", ""),
                "requested_qty": int(line.get("requested_qty") or billing_qty),
                "requested_unit": line.get("requested_unit", "strip"),
                "strip_size": int(line.get("strip_size") or 10),
                "billing_qty": billing_qty,
                "billing_unit": "strip",
                "quantity": billing_qty,
                "unit_price": round(unit_price, 2),
                "subtotal": round(subtotal, 2),
            }
        )
    return order_items


def _build_order_items_from_intent(intent_items: list[dict]) -> list[dict]:
    order_items: list[dict] = []
    for item in intent_items:
        billing_qty = int(item.get("billing_qty") or item.get("quantity") or 1)
        unit_price = float(item.get("price") or 0.0)
        subtotal = round(unit_price * billing_qty, 2)
        order_items.append(
            {
                "medicine_id": item.get("matched_medicine_id") or None,
                "name": item.get("matched_medicine_name", item.get("medicine_name", "")),
                "requested_qty": int(item.get("requested_qty") or billing_qty),
                "requested_unit": item.get("requested_unit", "strip"),
                "strip_size": int(item.get("strip_size") or 10),
                "billing_qty": billing_qty,
                "billing_unit": "strip",
                "quantity": billing_qty,
                "unit_price": round(unit_price, 2),
                "subtotal": subtotal,
            }
        )
    return order_items


@observe(name="Execution Agent")
async def execution_agent(state: PharmacyState, db: AsyncSession) -> PharmacyState:
    """Create pending order + Razorpay order."""
    final_decision = state.get("final_decision", {})
    intent = state.get("intent", {})
    user_id = state.get("user_id", "")
    action = final_decision.get("action", "")

    if action != "proceed":
        state["execution_result"] = {
            "success": False,
            "message": f"Not executing: action={action}",
            "order_id": None,
        }
        return state

    if not settings.payment_enabled:
        state["execution_result"] = {
            "success": False,
            "message": "Payments are currently disabled.",
            "payment_enabled": False,
        }
        state["response_message"] = "Payment checkout is currently unavailable."
        state["final_decision"]["action"] = "clarify"
        return state

    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        state["execution_result"] = {
            "success": False,
            "message": "Payment gateway is not configured.",
            "payment_enabled": True,
        }
        state["response_message"] = "Payment service is not configured yet. Please try again later."
        state["final_decision"]["action"] = "clarify"
        return state

    combined_confidence = float(final_decision.get("combined_confidence", 0.0))
    if combined_confidence < 0.5:
        state["execution_result"] = {
            "success": False,
            "message": f"Confidence too low: {combined_confidence:.2f}",
        }
        state["response_message"] = "Let me double-check your order details before proceeding."
        state["final_decision"]["action"] = "clarify"
        return state

    quote = state.get("quote", {})
    quote_lines = quote.get("lines", []) if isinstance(quote, dict) else []
    if quote_lines:
        order_items = _build_order_items_from_quote(quote)
        total_amount = round(float(quote.get("total_amount") or 0.0), 2)
    else:
        items = intent.get("items", [])
        if not items:
            state["execution_result"] = {"success": False, "message": "No items to execute"}
            return state
        order_items = _build_order_items_from_intent(items)
        total_amount = round(sum(item["subtotal"] for item in order_items), 2)

    if not order_items or total_amount <= 0:
        state["execution_result"] = {"success": False, "message": "Invalid order payload"}
        state["response_message"] = "I could not prepare this order. Please try again."
        state["final_decision"]["action"] = "clarify"
        return state

    order_id = str(uuid.uuid4())
    trace_id = state.get("trace_id", str(uuid.uuid4()))

    try:
        import razorpay

        client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
        rp_order = client.order.create(
            data={
                "amount": int(round(total_amount * 100)),
                "currency": "INR",
                "receipt": order_id[:40],
                "notes": {"user_id": user_id, "trace_id": trace_id},
            }
        )
        rp_order_id = rp_order.get("id")
    except Exception as e:
        logger.error("Razorpay order creation failed: %s", e)
        state["execution_result"] = {"success": False, "message": f"Payment gateway error: {e}"}
        state["response_message"] = (
            "I'm having trouble connecting to the payment gateway to generate your checkout link. "
            "Please try again in a moment."
        )
        state["final_decision"]["action"] = "clarify"
        return state

    try:
        order = Order(
            order_id=order_id,
            user_id=user_id,
            status="pending_payment",
            total_amount=total_amount,
            items=order_items,
            trace_id=trace_id,
            razorpay_order_id=rp_order_id,
        )
        db.add(order)
        await db.commit()
    except Exception as err:
        await db.rollback()
        logger.error("Execution failed while saving pending order: %s", err, exc_info=True)
        state["execution_result"] = {
            "success": False,
            "message": "Failed to create payment order. Please try again.",
        }
        state["response_message"] = "I'm having trouble connecting to the payment gateway. Please try again."
        state["final_decision"]["action"] = "clarify"
        return state

    state["execution_result"] = {
        "success": True,
        "order_id": order_id,
        "razorpay_order_id": rp_order_id,
        "amount": total_amount,
        "currency": "INR",
        "key_id": settings.razorpay_key_id,
        "items": order_items,
    }

    items_summary = ", ".join(f"{item['name']} x{item['billing_qty']}" for item in order_items)
    state["response_message"] = (
        f"I've prepared your order for {items_summary}.\n\n"
        f"**Total: Rs.{total_amount:.2f}**\n\n"
        "Please complete the payment below to confirm."
    )
    state["final_decision"]["action"] = "request_payment"
    logger.info("Execution: pending order %s created with Razorpay ID %s", order_id, rp_order_id)

    # Write dispensing audit log (non-fatal if this fails).
    try:
        from app.models.dispensing_log import DispensingLog

        safety = state.get("safety_check", {})
        all_warnings = safety.get("blocked_items", []) + safety.get("soft_blocks", [])

        log_entry = DispensingLog(
            order_id=order_id,
            user_id=user_id,
            thread_id=state.get("trace_id"),
            medicines_dispensed=[
                {"name": item["name"], "qty": item["billing_qty"], "unit_price": item["unit_price"]}
                for item in order_items
            ],
            safety_decision=safety.get("decision", "unknown"),
            safety_warnings_surfaced=[w.get("reason", str(w)) for w in all_warnings],
            clinical_checks_passed={
                "checks_run": safety.get("checks_run", 0),
                "all_clear": safety.get("all_clear", True),
            },
            counseling_provided=[],  # Will be populated by graph.py post-processing
            pharmacist_escalation_required=safety.get("decision") == "hard_block",
            trace_id=trace_id,
        )
        db.add(log_entry)
        await db.commit()
    except Exception as audit_err:
        logger.warning("Dispensing audit log write failed (non-fatal): %s", audit_err)

    return state
