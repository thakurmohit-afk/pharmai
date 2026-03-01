"""Deterministic quote utilities shared by graph.py and chat_service.py.

All price math, unit conversion, and quote resolution logic lives here.
These functions are pure and stateless — no DB or Redis access.
"""

from __future__ import annotations

import hashlib
import json


def safe_float(value: object, default: float = 0.0) -> float:
    """Safely convert any value to float."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def format_inr(amount: float) -> str:
    """Format an INR amount: strip trailing .00 for whole numbers."""
    rounded = round(float(amount or 0.0), 2)
    if abs(rounded - int(rounded)) < 1e-9:
        return str(int(rounded))
    return f"{rounded:.2f}"


def quote_lines(quote: dict | None) -> list[dict]:
    """Extract the lines array from a quote dict, defensively."""
    if not isinstance(quote, dict):
        return []
    lines = quote.get("lines", [])
    return lines if isinstance(lines, list) else []


def quote_quantity_status(quote: dict | None) -> str:
    """Return the quantity_status field from a quote, defaulting to 'missing'."""
    if not isinstance(quote, dict):
        return "missing"
    return str(quote.get("quantity_status") or "missing")


def line_quantity_explicit(line: dict) -> bool:
    """Return True if a quote line has an explicitly-set quantity."""
    if not isinstance(line, dict):
        return False
    if "quantity_explicit" in line:
        return bool(line.get("quantity_explicit"))
    requested_unit = str(line.get("requested_unit", "") or "").strip().lower()
    if requested_unit in {"strip", "pack", "tablet"}:
        return True
    try:
        billing_qty = int(line.get("billing_qty", 0) or 0)
    except (TypeError, ValueError):
        billing_qty = 0
    return billing_qty > 0


def quote_is_resolved(quote: dict | None) -> bool:
    """A quote is resolved when all lines have explicit quantities and status == 'resolved'."""
    lines = quote_lines(quote)
    if not lines:
        return False
    if quote_quantity_status(quote) != "resolved":
        return False
    return all(line_quantity_explicit(line) for line in lines)


def build_quote_signature(quote: dict | None) -> str:
    """SHA-256 fingerprint (first 16 hex chars) of deterministic quote content."""
    if not isinstance(quote, dict):
        return ""
    lines = []
    for line in quote_lines(quote):
        lines.append(
            {
                "medicine_id": str(line.get("medicine_id", "")),
                "name": line.get("name", ""),
                "billing_qty": int(line.get("billing_qty", 1) or 1),
                "billing_unit": str(line.get("billing_unit", "strip") or "strip"),
                "unit_price": round(float(line.get("unit_price", 0) or 0.0), 2),
                "subtotal": round(float(line.get("subtotal", 0) or 0.0), 2),
            }
        )
    payload = {
        "currency": str(quote.get("currency", "INR")),
        "display_unit": str(quote.get("display_unit", "strip")),
        "total_amount": round(float(quote.get("total_amount", 0) or 0.0), 2),
        "quantity_status": str(quote.get("quantity_status", "missing")),
        "lines": lines,
    }
    digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return digest[:16]


def canonical_medicines_from_quote(quote: dict | None) -> list[dict]:
    """Convert quote lines into the canonical medicines format used by the pipeline."""
    canonical: list[dict] = []
    for line in quote_lines(quote):
        canonical.append(
            {
                "name": line.get("name", ""),
                "quantity": line.get("billing_qty", 1),
                "requested_qty": line.get("requested_qty", 1),
                "requested_unit": line.get("requested_unit", "strip"),
                "billing_qty": line.get("billing_qty", 1),
                "billing_unit": line.get("billing_unit", "strip"),
                "strip_size": line.get("strip_size", 10),
                "price": line.get("unit_price", 0),
                "matched_medicine_id": line.get("medicine_id", ""),
                "matched_medicine_name": line.get("name", ""),
                "quantity_explicit": line_quantity_explicit(line),
            }
        )
    return canonical


def build_intent_items_from_quote(quote: dict, confidence: float) -> list[dict]:
    """Build intent items from a resolved quote for the order pipeline."""
    intent_items = []
    for line in quote_lines(quote):
        if not line_quantity_explicit(line):
            continue
        intent_items.append(
            {
                "medicine_name": line.get("name", ""),
                "matched_medicine_name": line.get("name", ""),
                "matched_medicine_id": line.get("medicine_id", ""),
                "requested_qty": line.get("requested_qty", 1),
                "requested_unit": line.get("requested_unit", "strip"),
                "strip_size": line.get("strip_size", 10),
                "billing_qty": line.get("billing_qty", 1),
                "billing_unit": "strip",
                "quantity": line.get("billing_qty", 1),
                "price": line.get("unit_price", 0),
                "confidence": confidence,
            }
        )
    return intent_items


def canonical_unit_for_prompt(quote: dict | None) -> str:
    """Return pluralized display unit for user-facing prompts."""
    if not isinstance(quote, dict):
        return "strips"
    unit = str(quote.get("display_unit") or "strip").strip().lower()
    if unit == "strip":
        return "strips"
    if unit == "pack":
        return "packs"
    if unit == "tablet":
        return "tablets"
    return "strips"
