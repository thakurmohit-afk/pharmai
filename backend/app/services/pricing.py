"""Deterministic pricing and quantity normalization for medicine orders.

Canonical billing unit in this phase is `strip`.
"""

from __future__ import annotations

import math
import re
from typing import Awaitable, Callable, Literal, TypedDict

_QTY_UNIT_PATTERN = re.compile(
    r"\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(strip|strips|strp|strps|pack|packs|tablet|tablets|tab|tabs)\b",
    re.IGNORECASE,
)
_QTY_RANGE_PATTERN = re.compile(
    r"\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:-|to)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(strip|strips|strp|strps|pack|packs|tablet|tablets|tab|tabs)?\b",
    re.IGNORECASE,
)

def _parse_num(val: str) -> int:
    v = val.lower()
    mapping = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10
    }
    return mapping.get(v, int(val) if val.isdigit() else 1)
_ORDER_QTY_HINT_PATTERN = re.compile(
    r"\b(?:want|need|order|buy|get|take|for|qty|quantity|confirm)\s+(\d{1,3})\b",
    re.IGNORECASE,
)
_STANDALONE_QTY_PATTERN = re.compile(r"^\s*(\d{1,3})\s*$")
_DOSAGE_PATTERN = re.compile(r"\b\d+\s*(?:mg|ml|mcg|gm|g)\b", re.IGNORECASE)

_STRIP_UNITS = {"strip", "strips", "strp", "strps"}
_PACK_UNITS = {"pack", "packs"}
_TABLET_UNITS = {"tablet", "tablets", "tab", "tabs"}


QuantityKind = Literal["exact", "range", "none"]
QuantityUnit = Literal["strip", "pack", "tablet", "unknown"]


class QuantityParseResult(TypedDict):
    """Structured quantity parse result used by quote building."""

    kind: QuantityKind
    exact_qty: int | None
    range_min: int | None
    range_max: int | None
    unit: QuantityUnit


def _none_parse_result() -> QuantityParseResult:
    return {
        "kind": "none",
        "exact_qty": None,
        "range_min": None,
        "range_max": None,
        "unit": "unknown",
    }


def _normalize_unit(value: str | None) -> QuantityUnit:
    raw = (value or "").strip().lower()
    if raw in _TABLET_UNITS:
        return "tablet"
    if raw in _PACK_UNITS:
        return "pack"
    if raw in _STRIP_UNITS:
        return "strip"
    return "unknown"


def parse_quantity_and_unit(message: str) -> QuantityParseResult:
    """Extract exact/range quantity and requested unit from user message."""
    text = (message or "").strip().lower()
    if not text:
        return _none_parse_result()

    range_match = _QTY_RANGE_PATTERN.search(text)
    if range_match:
        try:
            start = max(1, _parse_num(range_match.group(1)))
            end = max(1, _parse_num(range_match.group(2)))
        except ValueError:
            return _none_parse_result()
        low = min(start, end)
        high = max(start, end)
        return {
            "kind": "range",
            "exact_qty": None,
            "range_min": low,
            "range_max": high,
            "unit": _normalize_unit(range_match.group(3)),
        }

    match = _QTY_UNIT_PATTERN.search(text)
    if match:
        try:
            qty = max(1, _parse_num(match.group(1)))
        except ValueError:
            return _none_parse_result()
        return {
            "kind": "exact",
            "exact_qty": qty,
            "range_min": None,
            "range_max": None,
            "unit": _normalize_unit(match.group(2)),
        }

    # Accept quantity-only follow-ups such as "3" or "want 3 crocin", but
    # keep unit as unknown so the graph can ask for explicit unit when needed.
    standalone_match = _STANDALONE_QTY_PATTERN.fullmatch(text)
    if standalone_match:
        qty = int(standalone_match.group(1))
        if 1 <= qty <= 99:
            return {
                "kind": "exact",
                "exact_qty": qty,
                "range_min": None,
                "range_max": None,
                "unit": "unknown",
            }

    if not _DOSAGE_PATTERN.search(text):
        hinted_match = _ORDER_QTY_HINT_PATTERN.search(text)
        if hinted_match:
            qty = int(hinted_match.group(1))
            if 1 <= qty <= 99:
                return {
                    "kind": "exact",
                    "exact_qty": qty,
                    "range_min": None,
                    "range_max": None,
                    "unit": "unknown",
                }

    return _none_parse_result()


def normalize_to_strip_quantity(
    requested_qty: int,
    requested_unit: str,
    strip_size: int,
) -> tuple[int, str | None]:
    """Normalize requested quantity to canonical strip billing quantity."""
    qty = max(1, int(requested_qty or 1))
    normalized_unit = (requested_unit or "strip").strip().lower()
    strip_size = max(1, int(strip_size or 1))

    if normalized_unit == "tablet":
        billing_qty = max(1, math.ceil(qty / strip_size))
        note = f"{qty} tablets converted to {billing_qty} strips (1 strip = {strip_size} tablets)."
        return billing_qty, note

    # In this phase `pack` and `strip` are treated equivalently.
    return qty, None


def _strip_size_from_pack_sizes(pack_sizes: object) -> int:
    if not isinstance(pack_sizes, list):
        return 10

    valid_sizes = []
    for value in pack_sizes:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            continue
        if parsed > 0:
            valid_sizes.append(parsed)

    if not valid_sizes:
        return 10
    return min(valid_sizes)


async def build_order_quote(
    matched_medicines: list[dict],
    message: str,
    db_lookup: Callable[[str], Awaitable[dict | None]],
) -> dict | None:
    """Build deterministic quote lines and total for the current turn."""
    if not matched_medicines:
        return None

    quantity_parse = parse_quantity_and_unit(message)
    lines: list[dict] = []
    conversion_notes: list[str] = []
    has_resolved_quantity = False

    for item in matched_medicines:
        source_name = (item.get("name") or item.get("medicine_name") or "").strip()
        if not source_name:
            continue

        med = await db_lookup(source_name)
        med_name = source_name
        med_id = item.get("matched_medicine_id") or ""
        pack_sizes = item.get("pack_sizes") or []
        unit_price = float(item.get("price", 0.0) or 0.0)

        if med:
            med_name = med.get("name", med_name)
            med_id = str(med.get("medicine_id", med_id) or med_id)
            pack_sizes = med.get("pack_sizes") or pack_sizes
            unit_price = float(med.get("price", unit_price) or unit_price)

        strip_size = _strip_size_from_pack_sizes(pack_sizes)

        item_qty_raw = item.get("requested_qty", item.get("quantity"))
        try:
            item_qty = max(1, int(item_qty_raw)) if item_qty_raw not in (None, "", 0) else None
        except (TypeError, ValueError):
            item_qty = None
        item_unit = _normalize_unit(item.get("requested_unit") or item.get("unit"))

        requested_qty = 1
        requested_unit: str = "unknown"
        quantity_explicit = False

        if quantity_parse["kind"] == "range":
            requested_qty = int(quantity_parse["range_min"] or 1)
            requested_unit = quantity_parse["unit"]
            quantity_explicit = False
        elif quantity_parse["kind"] == "exact":
            parse_qty = int(quantity_parse["exact_qty"] or 1)
            requested_unit = quantity_parse["unit"]
            # When the message didn't contain an explicit unit (e.g. "i want 2 dolo"),
            # fall back to the unit provided by the GPT pharmacist in matched_medicines.
            if requested_unit == "unknown" and item_unit in {"strip", "pack", "tablet"}:
                requested_unit = item_unit
            quantity_explicit = requested_unit in {"strip", "pack", "tablet"}
            # Prefer GPT-provided quantity (item_qty) over regex parse when available.
            # Regex can misfire on dosage numbers, e.g. "2 dolo 650 tablets" → regex
            # picks up 650 instead of 2; GPT correctly returns quantity=2.
            if item_qty is not None and quantity_explicit:
                requested_qty = item_qty
            else:
                requested_qty = parse_qty
        elif item_qty is not None and item_unit in {"strip", "pack", "tablet"}:
            requested_qty = item_qty
            requested_unit = item_unit
            quantity_explicit = True
        elif item_qty is not None:
            requested_qty = item_qty
            requested_unit = "unknown"
            quantity_explicit = False

        conversion_note = None
        if quantity_explicit:
            billing_qty, conversion_note = normalize_to_strip_quantity(
                requested_qty=requested_qty,
                requested_unit=requested_unit,
                strip_size=strip_size,
            )
            subtotal = round(unit_price * billing_qty, 2)
            has_resolved_quantity = True
        else:
            billing_qty = 0
            subtotal = 0.0

        line = {
            "medicine_id": med_id,
            "name": med_name,
            "requested_qty": requested_qty,
            "requested_unit": requested_unit,
            "strip_size": strip_size,
            "billing_qty": billing_qty,
            "billing_unit": "strip",
            "unit_price": round(unit_price, 2),
            "subtotal": subtotal,
            "quantity_explicit": quantity_explicit,
            # Enriched medicine metadata for frontend cards
            "generic_name": med.get("generic_name") if med else None,
            "salt": med.get("salt") if med else None,
            "dosage": med.get("dosage") if med else None,
            "category": med.get("category") if med else None,
            "manufacturer": med.get("manufacturer") if med else None,
            "prescription_required": bool(med.get("prescription_required", False)) if med else False,
            "active_ingredients": (med.get("active_ingredients") or []) if med else [],
            "counseling_info": (med.get("counseling_info") or {}) if med else {},
            "in_stock": med.get("in_stock", True) if med else True,
            "stock_quantity": med.get("stock", 0) if med else 0,
        }
        lines.append(line)

        if conversion_note:
            conversion_notes.append(f"{med_name}: {conversion_note}")

    if not lines:
        return None

    quantity_status: Literal["resolved", "range_needs_choice", "missing"] = "resolved"
    quantity_options: list[int] = []
    if quantity_parse["kind"] == "range":
        quantity_status = "range_needs_choice"
        range_min = int(quantity_parse["range_min"] or 1)
        range_max = int(quantity_parse["range_max"] or range_min)
        quantity_options = sorted({range_min, range_max})
    elif quantity_parse["kind"] == "exact" and quantity_parse["unit"] == "unknown" and not has_resolved_quantity:
        quantity_status = "missing"
    elif not has_resolved_quantity:
        quantity_status = "missing"

    total_amount = round(sum(float(line["subtotal"] or 0.0) for line in lines), 2)
    conversion_note = " ".join(conversion_notes) if conversion_notes else None

    return {
        "currency": "INR",
        "display_unit": "strip",
        "total_amount": total_amount,
        "conversion_note": conversion_note,
        "quantity_status": quantity_status,
        "quantity_options": quantity_options,
        "lines": lines,
    }
