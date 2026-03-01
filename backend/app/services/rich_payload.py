"""Shared serializers for quote/payment/recommendation UI payloads."""

from __future__ import annotations

from typing import Any

_UI_NONE = {"type": "none", "data": {}}


def build_payment_payload(action: str, execution_result: dict | None) -> dict | None:
    result = execution_result if isinstance(execution_result, dict) else {}
    if action != "request_payment" or not result.get("success"):
        return None
    required = ("order_id", "razorpay_order_id", "amount", "key_id")
    if not all(result.get(key) not in (None, "") for key in required):
        return None
    return {
        "order_id": result.get("order_id"),
        "razorpay_order_id": result.get("razorpay_order_id"),
        "amount": result.get("amount"),
        "currency": result.get("currency", "INR"),
        "key_id": result.get("key_id"),
        "items": result.get("items", []),
    }


def build_quote_payload(raw_quote: object) -> dict | None:
    if not isinstance(raw_quote, dict) or not raw_quote.get("lines"):
        return None
    clean_lines: list[dict[str, Any]] = []
    for line in raw_quote.get("lines", []):
        if not isinstance(line, dict):
            continue
        clean_lines.append(
            {
                "medicine_id": str(line.get("medicine_id", "")),
                "name": line.get("name", ""),
                "requested_qty": int(line.get("requested_qty", 1) or 1),
                "requested_unit": line.get("requested_unit", "strip"),
                "strip_size": int(line.get("strip_size", 10) or 10),
                "billing_qty": int(line.get("billing_qty", 1) or 1),
                "billing_unit": "strip",
                "unit_price": float(line.get("unit_price", 0) or 0),
                "subtotal": float(line.get("subtotal", 0) or 0),
                "generic_name": line.get("generic_name"),
                "salt": line.get("salt"),
                "dosage": line.get("dosage"),
                "category": line.get("category"),
                "manufacturer": line.get("manufacturer"),
                "prescription_required": bool(line.get("prescription_required", False)),
                "active_ingredients": line.get("active_ingredients") or [],
                "counseling_info": line.get("counseling_info") or {},
                "in_stock": line.get("in_stock", True),
                "stock_quantity": line.get("stock_quantity", 0),
            }
        )
    if not clean_lines:
        return None
    return {
        "currency": raw_quote.get("currency", "INR"),
        "display_unit": raw_quote.get("display_unit", "strip"),
        "total_amount": float(raw_quote.get("total_amount", 0) or 0),
        "conversion_note": raw_quote.get("conversion_note"),
        "quantity_status": raw_quote.get("quantity_status", "resolved"),
        "quantity_options": [
            int(value)
            for value in (raw_quote.get("quantity_options") or [])
            if isinstance(value, int) or (isinstance(value, str) and value.isdigit())
        ],
        "lines": clean_lines,
    }


def build_recommendations_payload(raw_recommendations: object) -> list[dict]:
    recommendations: list[dict] = []
    if not isinstance(raw_recommendations, list):
        return recommendations
    for med in raw_recommendations:
        if not isinstance(med, dict):
            continue
        recommendations.append(
            {
                "name": med.get("name", ""),
                "generic_name": med.get("generic_name") or med.get("generic", ""),
                "price": float(med.get("price", 0) or 0),
                "category": med.get("category", ""),
                "dosage": med.get("dosage", ""),
                "prescription_required": bool(
                    med.get("prescription_required") or med.get("rx_required", False)
                ),
            }
        )
    return recommendations


def _collect_prescription_required_names(safety_check: dict | None) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()

    if isinstance(safety_check, dict):
        blocked = safety_check.get("blocked_items", [])
        if isinstance(blocked, list):
            for item in blocked:
                if not isinstance(item, dict):
                    continue
                if str(item.get("type", "")) != "prescription_required":
                    continue
                name = str(item.get("item", "")).strip()
                if name and name.lower() not in seen:
                    seen.add(name.lower())
                    names.append(name)
    return names


def build_ui_payload(
    *,
    action: str,
    quote: dict | None = None,
    payment: dict | None = None,
    recommendations: list[dict] | None = None,
    safety_check: dict | None = None,
    order_id: str | None = None,
    waitlist_items: list[dict] | None = None,
    cart: dict | None = None,
) -> dict:
    safe_action = str(action or "chat")

    # Actions where the user already acted on the quote (added to cart, etc.)
    # — the quote is stale, so skip order_summary for these.
    _CART_ACTIONS = {
        "add_to_cart", "added_to_cart", "confirm_cart",
        "cart_updated", "cart_add", "chat",
    }

    # 1. Payment — highest priority
    if safe_action == "request_payment" and payment:
        return {"type": "payment", "data": {"payment": payment}}

    # 2. Prescription upload prompt
    if safe_action == "request_prescription_upload":
        return {"type": "prescription_upload", "data": {}}

    # 3. Prescription enforcement (blocked items)
    rx_names = _collect_prescription_required_names(safety_check)
    if rx_names:
        return {"type": "prescription_required", "data": {"medicine_names": rx_names}}

    # 4. Waitlist — out-of-stock auto-notification confirmation
    if waitlist_items and len(waitlist_items) > 0:
        return {"type": "waitlist_subscribed", "data": {"items": waitlist_items}}

    # 5. Cart summary — show when the action indicates cart was just updated
    #    This MUST come before order_summary so stale quotes don't override
    #    a successful "add to cart" action.
    if cart and isinstance(cart, dict) and cart.get("items"):
        return {"type": "cart_summary", "data": {"cart": cart}}

    # 6. Order summary — only when a quote exists AND the user hasn't already
    #    acted on it (e.g. by adding to cart)
    if quote and isinstance(quote, dict) and quote.get("lines"):
        if safe_action not in _CART_ACTIONS:
            return {"type": "order_summary", "data": {"quote": quote}}

    # 7. Medicine recommendations (only when no quote/order exists)
    if recommendations and len(recommendations) > 0:
        return {"type": "recommendations", "data": {"items": recommendations}}

    # 8. Delivery tracker
    if safe_action == "delivery_confirmed" and order_id:
        return {"type": "delivery_status", "data": {"order_id": order_id, "status": "confirmed"}}

    return dict(_UI_NONE)
