"""Agent 5: inventory checks and negotiation suggestions."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.state import PharmacyState
from app.langfuse_client import observe
from app.models.inventory import Inventory
from app.models.medicine import Medicine
from app.models.waitlist import Waitlist

logger = logging.getLogger("pharmacy.agents.inventory")


async def _find_clinical_alternatives(medicine: Medicine, db: AsyncSession) -> list[dict]:
    """Find molecule-aware alternatives for a medicine using clinical validation.

    Instead of exact salt-string matching, this:
    1. Queries all in-stock medicines in the same category
    2. Runs classify_match() to check molecule-level compatibility
    3. Returns alternatives sorted by match quality (exact > strength_mismatch > partial > therapeutic)
    """
    from app.services.clinical_validator import classify_match, MatchQuality

    if not medicine.salt and not medicine.active_ingredients:
        return []

    # Build a reference dict for the original medicine
    original = {
        "name": medicine.name,
        "active_ingredients": medicine.active_ingredients or [],
        "salt": medicine.salt,
        "atc_code": getattr(medicine, "atc_code", None),
    }

    # Query in-stock medicines, prioritizing same category then same ATC prefix
    alt_result = await db.execute(
        select(Medicine, Inventory)
        .join(Inventory, Inventory.medicine_id == Medicine.medicine_id)
        .where(
            Medicine.medicine_id != medicine.medicine_id,
            Medicine.is_active == True,  # noqa: E712
            Inventory.stock_quantity > 0,
        )
    )

    _QUALITY_PRIORITY = {
        MatchQuality.EXACT: 0,
        MatchQuality.STRENGTH_MISMATCH: 1,
        MatchQuality.PARTIAL_INGREDIENT: 2,
        MatchQuality.THERAPEUTIC_EQUIVALENT: 3,
    }

    candidates = []
    for alt_med, alt_inv in alt_result.all():
        alt_dict = {
            "name": alt_med.name,
            "active_ingredients": alt_med.active_ingredients or [],
            "salt": alt_med.salt,
            "atc_code": getattr(alt_med, "atc_code", None),
        }
        match_result = classify_match(original, alt_dict)

        if match_result.quality == MatchQuality.NO_MATCH:
            continue

        # Build status message based on match quality
        quality_labels = {
            MatchQuality.EXACT: "Same molecule & strength",
            MatchQuality.STRENGTH_MISMATCH: "Same molecule, different strength",
            MatchQuality.PARTIAL_INGREDIENT: "Partial ingredient overlap",
            MatchQuality.THERAPEUTIC_EQUIVALENT: "Same therapeutic class",
        }
        quality_label = quality_labels.get(match_result.quality, "")

        message_parts = [f"{medicine.name} → Try {alt_med.name} ({quality_label})."]
        if match_result.strength_note:
            message_parts.append(f"Note: {match_result.strength_note}.")
        if match_result.warnings:
            message_parts.extend(match_result.warnings)
        message_parts.append(f"{alt_inv.stock_quantity} strips available, Rs.{alt_med.price}/strip.")

        candidates.append({
            "original": medicine.name,
            "alternative": alt_med.name,
            "salt": alt_med.salt,
            "dosage": alt_med.dosage,
            "available": alt_inv.stock_quantity,
            "price": alt_med.price,
            "match_quality": match_result.quality.value,
            "strength_note": match_result.strength_note,
            "match_warnings": match_result.warnings,
            "message": " ".join(message_parts),
            "_sort_key": _QUALITY_PRIORITY.get(match_result.quality, 99),
        })

    # Sort by match quality, then by price (cheaper first)
    candidates.sort(key=lambda c: (c["_sort_key"], c["price"]))

    # Remove sort key and limit to top 3
    for c in candidates:
        c.pop("_sort_key", None)

    return candidates[:3]


@observe(name="Inventory Agent")
async def inventory_agent(state: PharmacyState, db: AsyncSession) -> PharmacyState:
    """Check strip-level stock and propose alternatives when needed."""
    intent = state.get("intent", {})
    items = intent.get("items", [])
    user_profile = state.get("user_profile", {})

    items_status = []
    alternatives = []
    negotiation = {}
    overall_available = True

    for item in items:
        medicine_name = item.get("medicine_name", "")
        matched_id = item.get("matched_medicine_id")
        quantity = int(item.get("billing_qty") or item.get("quantity") or 1)

        medicine = None
        if matched_id:
            result = await db.execute(select(Medicine).where(Medicine.medicine_id == matched_id))
            medicine = result.scalar_one_or_none()

        if not medicine:
            result = await db.execute(select(Medicine).where(Medicine.name.ilike(f"%{medicine_name}%")))
            medicine = result.scalar_one_or_none()

        if not medicine:
            items_status.append(
                {
                    "medicine_name": medicine_name,
                    "status": "not_found",
                    "available": False,
                }
            )
            overall_available = False
            continue

        inv_result = await db.execute(select(Inventory).where(Inventory.medicine_id == medicine.medicine_id))
        inventory = inv_result.scalar_one_or_none()
        stock = int(inventory.stock_quantity if inventory else 0)

        item_status = {
            "medicine_name": medicine.name,
            "medicine_id": str(medicine.medicine_id),
            "requested": quantity,
            "available": stock,
            "status": "ok" if stock >= quantity else "insufficient",
            "billing_unit": "strip",
            "price": medicine.price,
        }

        if stock >= quantity:
            item_status["strategy"] = "fulfill"
            # Pack-size negotiation: warn if quantity doesn't align to available pack sizes
            pack_sizes = [int(p) for p in (medicine.pack_sizes or []) if str(p).isdigit() and int(p) > 0]
            if pack_sizes:
                min_pack = min(pack_sizes)
                if quantity < min_pack:
                    item_status["pack_negotiation"] = {
                        "suggested_qty": min_pack,
                        "note": (
                            f"Smallest available pack is {min_pack} strips. "
                            f"You'll receive {min_pack} strips "
                            f"(₹{round(medicine.price * min_pack, 2)})."
                        ),
                    }
                elif quantity % min_pack != 0:
                    rounded = ((quantity // min_pack) + 1) * min_pack
                    item_status["pack_negotiation"] = {
                        "suggested_qty": rounded,
                        "note": (
                            f"Packs come in multiples of {min_pack}. "
                            f"Rounding up to {rounded} strips "
                            f"(₹{round(medicine.price * rounded, 2)})."
                        ),
                    }
        elif stock > 0:
            overall_available = False
            item_status["strategy"] = "partial"
            negotiation[medicine.name] = {
                "type": "partial_fulfillment",
                "message": (
                    f"We have {stock} strips of {medicine.name}, but you need {quantity} strips. "
                    f"Order {stock} now and the rest when restocked?"
                ),
                "available": stock,
                "shortfall": quantity - stock,
            }

            # Molecule-aware alternative search
            alt_candidates = await _find_clinical_alternatives(medicine, db)
            alternatives.extend(alt_candidates)

        else:
            overall_available = False
            item_status["strategy"] = "out_of_stock"

            # Molecule-aware alternative search
            alt_candidates = await _find_clinical_alternatives(medicine, db)
            alternatives.extend(alt_candidates)

            # ── Auto-subscribe to waitlist ──
            user_id_str = state.get("user_id", "")
            waitlist_subscribed = False
            if user_id_str:
                import uuid as _uuid
                try:
                    uid = _uuid.UUID(user_id_str)
                    existing_wl = await db.execute(
                        select(Waitlist).where(
                            Waitlist.user_id == uid,
                            Waitlist.medicine_id == medicine.medicine_id,
                            Waitlist.status == "pending",
                        )
                    )
                    if not existing_wl.scalar_one_or_none():
                        db.add(Waitlist(
                            user_id=uid,
                            medicine_id=medicine.medicine_id,
                            medicine_name=medicine.name,
                            notification_method="email",
                            status="pending",
                        ))
                        await db.flush()
                        waitlist_subscribed = True
                        logger.info("Auto-subscribed user %s to waitlist for %s", uid, medicine.name)
                except Exception as wl_err:
                    logger.warning("Waitlist auto-subscribe failed: %s", wl_err)

            item_status["waitlist_subscribed"] = waitlist_subscribed

            negotiation[medicine.name] = {
                "type": "restock_alert",
                "message": (
                    f"{medicine.name} is currently out of stock. "
                    + ("I've added you to the notification list — you'll get an email as soon as it's back in stock."
                       if waitlist_subscribed
                       else "You're already on the notification list for this medicine.")
                ),
                "waitlist_subscribed": waitlist_subscribed,
            }

        items_status.append(item_status)

    if overall_available:
        strategy = "fulfill"
    elif any(status.get("strategy") == "partial" for status in items_status):
        strategy = "partial"
    elif alternatives:
        strategy = "alternative"
    else:
        strategy = "restock_alert"

    is_chronic = bool(user_profile.get("detected_patterns"))
    if is_chronic and not overall_available:
        if alternatives:
            strategy = "alternative"
        elif any(status.get("strategy") == "partial" for status in items_status):
            strategy = "partial"

    # Build a flat negotiation_message so the graph can inject it into pharmacist context
    negotiation_parts = []
    for item in items_status:
        pn = item.get("pack_negotiation")
        if pn:
            negotiation_parts.append(pn["note"])
    for neg in negotiation.values():
        negotiation_parts.append(neg.get("message", ""))
    for alt in alternatives[:2]:
        negotiation_parts.append(alt.get("message", ""))
    negotiation_message = " | ".join(p for p in negotiation_parts if p) or None

    state["inventory_check"] = {
        "available": overall_available,
        "items_status": items_status,
        "alternatives": alternatives,
        "negotiation": negotiation,
        "negotiation_message": negotiation_message,
        "strategy": strategy,
    }

    logger.info(
        "Inventory: available=%s strategy=%s alternatives=%d",
        overall_available,
        strategy,
        len(alternatives),
    )
    return state
