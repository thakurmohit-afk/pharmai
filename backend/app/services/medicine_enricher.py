"""AI-powered medicine enrichment — fills all Medicine model fields from just a name."""

import json
import logging
from typing import Any

from app.services.openai_client import get_async_openai_client

logger = logging.getLogger("pharmacy.services.medicine_enricher")

# ── System prompt for GPT-4o ────────────────────────────────────────────────

ENRICHMENT_PROMPT = """You are a pharmaceutical database expert. Given a medicine name (possibly with dosage), return a complete JSON object with accurate pharmacological data for the Indian market.

Return ONLY a valid JSON object with these exact fields:

{
  "generic_name": "INN/generic name (e.g. Amoxicillin)",
  "salt": "full salt/ester form (e.g. Amoxicillin Trihydrate)",
  "description": "1-2 sentence clinical description",
  "dosage": "strength as written on pack (e.g. 500mg)",
  "pack_sizes": [{"unit": "strip", "count": 10}],
  "price": 0.00,
  "prescription_required": true,
  "category": "one of: Analgesic, Antibiotic, Antihistamine, Cardiac, Antidiabetic, Gastrointestinal, Antihypertensive, Respiratory, Dermatological, Neurological, Ophthalmic, Vitamin, Other",
  "manufacturer": "most common Indian manufacturer",
  "active_ingredients": [{"molecule": "name", "strength_mg": 500, "strength_unit": "mg"}],
  "atc_code": "WHO ATC code (e.g. J01CA04)",
  "counseling_info": {
    "food_timing": "before_food | after_food | any_time",
    "drowsiness": false,
    "alcohol_warning": false,
    "is_antibiotic": false,
    "common_side_effects": ["nausea", "diarrhea"],
    "storage": "Store below 25°C"
  }
}

Rules:
- price should be estimated MRP in Indian Rupees for the most common pack size
- prescription_required: true for Rx drugs, false for OTC
- Be accurate with ATC codes — use real WHO classification
- For combination drugs (e.g. "Augmentin"), list ALL active ingredients
- Return ONLY the JSON object, no markdown, no explanation"""


async def enrich_medicine(medicine_name: str) -> dict[str, Any]:
    """Call GPT-4o to fill all Medicine fields from just a name string.

    Args:
        medicine_name: e.g. "Amoxicillin 500mg", "Crocin Advance", "Pan-D"

    Returns:
        Dict with all enriched fields, ready to merge into Medicine model.
        On failure, returns a minimal dict with just the name.
    """
    client = get_async_openai_client()

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": ENRICHMENT_PROMPT},
                {"role": "user", "content": f"Medicine: {medicine_name}"},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=800,
        )

        raw = response.choices[0].message.content or "{}"
        data = json.loads(raw)

        # Validate essential fields exist
        if not data.get("generic_name"):
            data["generic_name"] = medicine_name

        logger.info(f"Enriched '{medicine_name}': category={data.get('category')}, "
                     f"salt={data.get('salt')}, atc={data.get('atc_code')}")
        return data

    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error enriching '{medicine_name}': {e}")
        return _fallback(medicine_name)
    except Exception as e:
        logger.error(f"GPT enrichment failed for '{medicine_name}': {e}")
        return _fallback(medicine_name)


def _fallback(medicine_name: str) -> dict[str, Any]:
    """Minimal fallback when AI enrichment fails."""
    return {
        "generic_name": medicine_name,
        "salt": None,
        "description": None,
        "dosage": None,
        "pack_sizes": [],
        "price": 0.0,
        "prescription_required": False,
        "category": "Other",
        "manufacturer": None,
        "active_ingredients": [],
        "atc_code": None,
        "counseling_info": {},
    }
