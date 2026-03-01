"""Agent 4: Safety & Policy Enforcement Agent.

Uses the Medicine Master DB as single source of truth.
Checks for hard blocks (prescription required, expired, blacklisted)
and soft blocks (quantity limits, stock issues, unusual patterns).
"""

import json
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.langfuse_client import observe
from app.agents.state import PharmacyState
from app.models.medicine import Medicine
from app.models.inventory import Inventory
from app.models.prescription import Prescription

logger = logging.getLogger("pharmacy.agents.safety")


@observe(name="Safety Agent")
async def safety_agent(state: PharmacyState, db: AsyncSession) -> PharmacyState:
    """Enforce safety & policy rules. Precedence: Stock → Prescription → Quantity."""
    intent = state.get("intent", {})
    items = intent.get("items", [])
    user_id = state.get("user_id", "")

    if not items:
        state["safety_check"] = {
            "decision": "allow",
            "reason": "No items to check",
            "severity": "low",
            "blocked_items": [],
            "details": {},
        }
        return state

    blocked_items = []
    soft_blocks = []
    all_clear = True

    for item in items:
        medicine_name = item.get("medicine_name", "")
        quantity = item.get("quantity", 1)

        # ── Look up medicine in DB ───────────────────────────────────────
        result = await db.execute(
            select(Medicine).where(
                Medicine.name.ilike(f"%{medicine_name}%")
            )
        )
        medicine = result.scalar_one_or_none()

        if not medicine:
            # Try generic name / salt
            result = await db.execute(
                select(Medicine).where(
                    Medicine.generic_name.ilike(f"%{medicine_name}%")
                )
            )
            medicine = result.scalar_one_or_none()

        if not medicine:
            # Try salt field
            result = await db.execute(
                select(Medicine).where(
                    Medicine.salt.ilike(f"%{medicine_name}%")
                )
            )
            medicine = result.scalar_one_or_none()

        if not medicine:
            soft_blocks.append({
                "item": medicine_name,
                "reason": "Medicine not found in our database",
                "type": "not_found",
            })
            all_clear = False
            continue

        item["matched_medicine_id"] = str(medicine.medicine_id)
        item["matched_medicine_name"] = medicine.name

        # ── Check 1: Stock availability (FIRST in precedence) ────────────
        inv_result = await db.execute(
            select(Inventory).where(Inventory.medicine_id == medicine.medicine_id)
        )
        inventory = inv_result.scalar_one_or_none()
        stock = inventory.stock_quantity if inventory else 0

        if stock == 0:
            soft_blocks.append({
                "item": medicine.name,
                "reason": f"{medicine.name} is currently out of stock",
                "type": "out_of_stock",
                "stock_available": 0,
                "requested": quantity,
            })
            all_clear = False
            continue
        elif stock < quantity:
            soft_blocks.append({
                "item": medicine.name,
                "reason": f"Only {stock} available, you requested {quantity}",
                "type": "insufficient_stock",
                "stock_available": stock,
                "requested": quantity,
            })
            all_clear = False

        # ── Check 2: Prescription required (HARD BLOCK) ──────────────────
        if medicine.prescription_required:
            # Check if user has a valid (non-expired, verified) prescription
            rx_result = await db.execute(
                select(Prescription).where(
                    Prescription.user_id == user_id,
                    Prescription.verified == True,
                    Prescription.expiry_date >= datetime.now(timezone.utc),
                )
            )
            valid_rx = rx_result.scalars().all()

            # Check if prescription covers this medicine
            has_valid_rx = False
            for rx in valid_rx:
                extracted = rx.extracted_data or {}
                rx_medicines = extracted.get("medicines", [])
                for rx_med in rx_medicines:
                    rx_name = rx_med.get("name", "").lower()
                    if (
                        medicine_name.lower() in rx_name
                        or medicine.name.lower() in rx_name
                        or (medicine.generic_name and medicine.generic_name.lower() in rx_name)
                    ):
                        has_valid_rx = True
                        break
                if has_valid_rx:
                    break

            if not has_valid_rx:
                blocked_items.append({
                    "item": medicine.name,
                    "reason": "Prescription required but no valid prescription found",
                    "type": "prescription_required",
                    "medicine_id": str(medicine.medicine_id),
                })
                all_clear = False
                continue

        # ── Check 3: Quantity limits ─────────────────────────────────────
        max_per_order = medicine.max_per_order or 100
        if quantity > max_per_order:
            soft_blocks.append({
                "item": medicine.name,
                "reason": f"Maximum {max_per_order} per order, you requested {quantity}",
                "type": "quantity_limit",
                "max_allowed": max_per_order,
                "requested": quantity,
            })
            all_clear = False

        # ── Check 4: Inactive / expired medicine ─────────────────────────
        if not medicine.is_active:
            blocked_items.append({
                "item": medicine.name,
                "reason": "This medicine has been discontinued",
                "type": "discontinued",
            })
            all_clear = False

    # ── Check 5: Duplicate ingredient detection ──────────────────────
    # Build enriched item list with active_ingredients for clinical checks
    from app.services.clinical_validator import (
        check_duplicate_ingredients,
        check_known_interactions,
        check_patient_flags,
    )

    enriched_items = []
    for item in items:
        matched_id = item.get("matched_medicine_id")
        if not matched_id:
            continue
        try:
            result = await db.execute(
                select(Medicine).where(Medicine.medicine_id == matched_id)
            )
            med = result.scalar_one_or_none()
        except Exception:
            med = None
        if med:
            enriched_items.append({
                "name": med.name,
                "medicine_name": med.name,
                "active_ingredients": med.active_ingredients or [],
                "salt": med.salt,
                "atc_code": med.atc_code,
            })

    duplicates = check_duplicate_ingredients(enriched_items)
    for dup in duplicates:
        soft_blocks.append({
            "item": ", ".join(dup.medicines_involved),
            "reason": dup.warning,
            "type": "duplicate_ingredient",
            "molecule": dup.molecule,
            "total_mg": dup.total_mg,
        })
        all_clear = False

    # ── Check 6: Known drug interactions ─────────────────────────────
    interactions = check_known_interactions(enriched_items)
    for inter in interactions:
        soft_blocks.append({
            "item": " + ".join(inter.pair),
            "reason": f"⚠️ Drug interaction: {inter.description}",
            "type": "drug_interaction",
            "severity": inter.severity,
        })
        all_clear = False

    # ── Check 7: Patient safety flags (pregnancy, allergy) ───────────
    user_profile_result = None
    if user_id:
        from app.models.user import UserProfile
        try:
            prof_result = await db.execute(
                select(UserProfile).where(UserProfile.user_id == user_id)
            )
            user_profile_result = prof_result.scalar_one_or_none()
        except Exception:
            pass

    if user_profile_result:
        medical_facts = user_profile_result.medical_facts or []
        patient_warnings = check_patient_flags(enriched_items, medical_facts)
        for pw in patient_warnings:
            if pw.severity == "high":
                blocked_items.append({
                    "item": pw.medicine,
                    "reason": pw.description,
                    "type": f"patient_flag_{pw.flag_type}",
                })
            else:
                soft_blocks.append({
                    "item": pw.medicine,
                    "reason": pw.description,
                    "type": f"patient_flag_{pw.flag_type}",
                })
            all_clear = False

    # ── Check 8: Age-appropriate dose guardrails ─────────────────────────
    from app.services.clinical_validator import check_dose_appropriateness

    patient_age = None
    if user_profile_result and hasattr(user_profile_result, "age"):
        try:
            patient_age = int(user_profile_result.age) if user_profile_result.age else None
        except (TypeError, ValueError):
            patient_age = None

    if patient_age is not None:
        dose_warnings = check_dose_appropriateness(enriched_items, patient_age)
        for dw in dose_warnings:
            if dw.severity == "high":
                blocked_items.append({
                    "item": dw.medicine,
                    "reason": dw.description,
                    "type": "dose_inappropriate",
                })
            else:
                soft_blocks.append({
                    "item": dw.medicine,
                    "reason": dw.description,
                    "type": "dose_warning",
                })
            all_clear = False

    # ── Check 9: Antibiotic stewardship ──────────────────────────────────
    from app.services.clinical_validator import check_antibiotic_stewardship

    has_prescription = bool(state.get("prescription_context", {}).get("medicines"))
    antibiotic_warnings = check_antibiotic_stewardship(enriched_items, has_prescription)
    for aw in antibiotic_warnings:
        if aw.severity == "high":
            soft_blocks.append({
                "item": aw.medicine,
                "reason": aw.description,
                "type": f"antibiotic_{aw.warning_type}",
            })
        else:
            soft_blocks.append({
                "item": aw.medicine,
                "reason": aw.description,
                "type": f"antibiotic_{aw.warning_type}",
            })
        all_clear = False

    # ── Determine overall decision ───────────────────────────────────────
    if blocked_items:
        decision = "hard_block"
        severity = "high"
        reason = "; ".join(b["reason"] for b in blocked_items)
    elif soft_blocks:
        decision = "soft_block"
        severity = "medium"
        reason = "; ".join(s["reason"] for s in soft_blocks)
    else:
        decision = "allow"
        severity = "low"
        reason = "All safety checks passed"

    state["safety_check"] = {
        "decision": decision,
        "reason": reason,
        "severity": severity,
        "blocked_items": blocked_items,
        "soft_blocks": soft_blocks,
        "details": {
            "checked_items": len(items),
            "hard_blocks": len(blocked_items),
            "soft_blocks_count": len(soft_blocks),
            "duplicate_ingredients": len(duplicates),
            "drug_interactions": len(interactions),
        },
    }

    logger.info(
        f"Safety: decision={decision}, severity={severity}, "
        f"hard_blocks={len(blocked_items)}, soft_blocks={len(soft_blocks)}, "
        f"duplicates={len(duplicates)}, interactions={len(interactions)}"
    )
    return state
