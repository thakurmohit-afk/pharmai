"""Prescription service — OpenAI Vision OCR + clinical-grade medicine DB matching."""

import base64
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.prescription import Prescription

logger = logging.getLogger("pharmacy.services.prescription")
settings = get_settings()

# Relevance score threshold — search results below this are discarded
# to prevent irrelevant matches (e.g. "steam inhalation" → "Montair LC")
_MATCH_RELEVANCE_THRESHOLD = 0.45

OCR_PROMPT = """Analyze this prescription image and extract structured data.

IMPORTANT: Distinguish between actual medicines and general health advice/instructions.

Return as JSON:
{
  "medicines": [
    {
      "name": "medicine name as written on prescription",
      "dosage": "dosage string as written",
      "frequency": "how often to take",
      "type": "medicine",
      "active_ingredients": [
        {"molecule": "active molecule name", "strength_mg": number_or_null, "strength_unit": "mg|mcg|ml|null"}
      ]
    }
  ],
  "advice": [
    {"instruction": "e.g. steam inhalation, warm saline gargles, bed rest, drink fluids"}
  ],
  "doctor_name": "doctor's name or null",
  "prescription_date": "date or null",
  "hospital_clinic": "hospital/clinic name or null",
  "patient_name": "patient name or null",
  "notes": "any additional instructions"
}

Rules:
- Only include actual pharmaceutical drugs/tablets/syrups/capsules in "medicines"
- Home remedies, lifestyle advice, and non-drug instructions go in "advice"
- Be thorough — extract every medicine even if handwriting is difficult
- If you cannot read something clearly, include it with a best guess and note low confidence in the name
- For each medicine, identify its active pharmaceutical ingredients (API/salt composition).
  Examples:
    "Dolo 650" → [{"molecule": "Paracetamol", "strength_mg": 650, "strength_unit": "mg"}]
    "Montair LC" → [{"molecule": "Montelukast", "strength_mg": 10, "strength_unit": "mg"}, {"molecule": "Levocetirizine", "strength_mg": 5, "strength_unit": "mg"}]
    "Crocin" → [{"molecule": "Paracetamol", "strength_mg": 500, "strength_unit": "mg"}]
- If you cannot determine the active ingredient, set active_ingredients to an empty list []
- Return ONLY the JSON object, no markdown, no explanation
"""


async def _ocr_with_gemini(image_bytes: bytes, filename: str) -> dict:
    """Use Google Gemini 2.5 Flash for prescription OCR (new google-genai SDK)."""
    from google import genai
    from google.genai import types

    s = get_settings()
    client = genai.Client(api_key=s.gemini_api_key)

    # Detect mime type
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpeg"
    mime_map = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
        "webp": "image/webp", "pdf": "application/pdf",
    }
    mime_type = mime_map.get(ext, "image/jpeg")

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_text(text=OCR_PROMPT),
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1,
            max_output_tokens=8192,
        ),
    )

    content = response.text.strip()
    logger.info("Gemini OCR raw response (first 500 chars): %s", content[:500])

    # Strip markdown code fences if Gemini wraps the JSON
    if content.startswith("```"):
        # Remove ```json ... ``` or ``` ... ```
        lines = content.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        content = "\n".join(lines).strip()

    # Try parsing directly
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        # Try to find a JSON object in the response
        import re
        match = re.search(r'\{[\s\S]*\}', content)
        if match:
            return json.loads(match.group())
        logger.error("Cannot parse Gemini response as JSON: %s", content[:1000])
        raise


async def _ocr_with_openai(image_bytes: bytes, filename: str) -> dict:
    """Fallback: use GPT-4.1 Vision for prescription OCR."""
    from app.services.openai_client import get_async_openai_client

    b64_image = base64.b64encode(image_bytes).decode("utf-8")
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpeg"
    mime_map = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png", "webp": "webp"}
    mime_type = f"image/{mime_map.get(ext, 'jpeg')}"

    response = await get_async_openai_client(force_refresh=True).chat.completions.create(
        model="gpt-4.1",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": OCR_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{b64_image}",
                            "detail": "high",
                        },
                    },
                ],
            }
        ],
        response_format={"type": "json_object"},
        max_completion_tokens=1500,
        temperature=0.1,
    )

    content = response.choices[0].message.content
    return json.loads(content)


async def _match_medicines_to_db(extracted_medicines: list[dict]) -> list[dict]:
    """Match each OCR-extracted medicine against the medicine database.

    Uses the existing search_medicines() hybrid search (lexical + semantic),
    then runs clinical_validator.classify_match() on each result to attach
    molecule-level match quality labels and safety warnings.
    Returns the enriched list with `db_matches` for each medicine.
    """
    from app.services.medicine_search import search_medicines
    from app.services.clinical_validator import classify_match, MatchQuality

    # Match-quality sort priority (best first)
    _QUALITY_PRIORITY = {
        MatchQuality.EXACT: 0,
        MatchQuality.STRENGTH_MISMATCH: 1,
        MatchQuality.PARTIAL_INGREDIENT: 2,
        MatchQuality.THERAPEUTIC_EQUIVALENT: 3,
        MatchQuality.NO_MATCH: 4,
    }

    enriched = []
    for med in extracted_medicines:
        name = med.get("name", "").strip()
        if not name:
            enriched.append({**med, "db_matches": []})
            continue

        try:
            results = await search_medicines(query=name, top_k=5)
            db_matches = []
            for r in results:
                if r.get("relevance_score", 0) < _MATCH_RELEVANCE_THRESHOLD:
                    continue

                match_result = classify_match(med, r)

                db_matches.append({
                    "medicine_id": str(r.get("medicine_id", "")),
                    "name": r.get("name", ""),
                    "generic_name": r.get("generic_name", ""),
                    "price": r.get("price", 0),
                    "rx_required": r.get("prescription_required", False),
                    "in_stock": r.get("in_stock", False),
                    "relevance_score": r.get("relevance_score", 0),
                    "match_quality": match_result.quality.value,
                    "match_warnings": match_result.warnings,
                    "strength_note": match_result.strength_note,
                    "extra_ingredients": match_result.extra_ingredients,
                    "missing_ingredients": match_result.missing_ingredients,
                })

            db_matches.sort(key=lambda m: (
                _QUALITY_PRIORITY.get(MatchQuality(m["match_quality"]), 99),
                0 if m.get("in_stock") else 1,
                -m.get("relevance_score", 0),
            ))

        except Exception as e:
            logger.warning("Medicine DB match failed for '%s': %s", name, e)
            db_matches = []

        enriched.append({**med, "db_matches": db_matches})

    return enriched


def _build_prescription_summary(
    enriched_medicines: list[dict],
    advice: list,
    doctor_name: str | None,
    prescription_date: str | None,
    confidence: float,
    meta_warnings: list[str],
) -> str:
    """Build a TTS-friendly, natural spoken summary of the prescription analysis."""
    parts = []

    # Natural opening
    if doctor_name and prescription_date:
        parts.append(f"I've analyzed the prescription from Doctor {doctor_name}, dated {prescription_date}.")
    elif doctor_name:
        parts.append(f"I've analyzed the prescription from Doctor {doctor_name}.")
    elif prescription_date:
        parts.append(f"I've analyzed your prescription dated {prescription_date}.")
    else:
        parts.append("I've analyzed your prescription.")

    # Medicines — natural spoken list
    if enriched_medicines:
        count = len(enriched_medicines)
        parts.append(f"I found {count} {'medicine' if count == 1 else 'medicines'} on it.")

        available = []
        unavailable = []
        not_found = []

        for med in enriched_medicines:
            name = med.get("name", "Unknown")
            dosage = med.get("dosage", "")
            frequency = med.get("frequency", "")

            # Build description
            desc = name
            if dosage:
                desc += f" {dosage}"

            db_matches = med.get("db_matches", [])
            if db_matches:
                best = db_matches[0]
                in_stock = best.get("in_stock", False)
                price = best.get("price", 0)
                match_quality = best.get("match_quality", "no_match")

                freq_part = f", to be taken {frequency}" if frequency else ""

                if in_stock:
                    price_part = f" at {price} rupees" if price else ""
                    if match_quality == "exact":
                        available.append(f"{desc}{freq_part}, and it's available in our store{price_part}")
                    elif match_quality == "strength_mismatch":
                        available.append(f"{desc}{freq_part}. We have a similar strength available{price_part}")
                    elif match_quality == "therapeutic_equivalent":
                        available.append(f"{desc}{freq_part}. We have a therapeutic equivalent available{price_part}")
                    else:
                        available.append(f"{desc}{freq_part}, available{price_part}")
                else:
                    unavailable.append(f"{desc}{freq_part}, but it's currently out of stock")
            else:
                freq_part = f", to be taken {frequency}" if frequency else ""
                not_found.append(f"{desc}{freq_part}, but we don't have it in our inventory")

        # Speak available first
        all_items = available + unavailable + not_found
        for i, item in enumerate(all_items):
            if len(all_items) == 1:
                parts.append(f"That's {item}.")
            elif i == 0:
                parts.append(f"First, {item}.")
            elif i == len(all_items) - 1:
                parts.append(f"And lastly, {item}.")
            else:
                parts.append(f"Next, {item}.")

        # Stock summary
        if available and not unavailable and not not_found:
            parts.append(f"All {'medicines are' if count > 1 else 'medicine is'} available. Would you like me to add them to your cart?")
        elif unavailable or not_found:
            avail_count = len(available)
            if avail_count > 0:
                parts.append(f"{avail_count} out of {count} medicines are available. Would you like me to add the available ones to your cart?")
    else:
        parts.append("I couldn't extract any medicines from this prescription. Could you try uploading a clearer image?")

    # Advice — spoken naturally
    if advice:
        parts.append("The doctor also advises")
        advice_texts = []
        for item in advice:
            if isinstance(item, dict):
                advice_texts.append(item.get("text", item.get("advice", str(item))))
            else:
                advice_texts.append(str(item))
        if len(advice_texts) == 1:
            parts[-1] += f" {advice_texts[0]}."
        else:
            parts[-1] += f" the following: {', and '.join(advice_texts)}."

    # Warnings — spoken naturally
    if meta_warnings:
        parts.append("Just a heads up, " + ". Also, ".join(meta_warnings) + ".")

    return " ".join(parts)


async def process_prescription_upload(
    user_id: str,
    image_bytes: bytes,
    filename: str,
    db: AsyncSession,
) -> dict:
    """Process uploaded prescription image via OpenAI Vision OCR (fallback: Gemini).

    1. Send image to GPT-4.1 Vision / Gemini for extraction (medicines + advice separated)
    2. Match each extracted medicine against the medicine database
    3. Store in prescriptions table
    4. Return enriched medicines + advice + confidence
    """
    try:
        # Use OpenAI as primary OCR, fall back to Gemini
        s = get_settings()
        logger.info("Using OpenAI GPT-4.1 Vision for prescription OCR")
        extracted = await _ocr_with_openai(image_bytes, filename)

        # Match only actual medicines against the DB (skip advice items)
        raw_medicines = extracted.get("medicines", [])
        enriched_medicines = await _match_medicines_to_db(raw_medicines)

        # Calculate confidence based on completeness
        confidence = _calculate_ocr_confidence(extracted)
        extracted["confidence"] = confidence
        extracted["medicines"] = enriched_medicines  # store enriched version

        # ── Store in DB ──────────────────────────────────────────────────
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpeg"
        prescription_id = str(uuid.uuid4())
        prescription = Prescription(
            prescription_id=prescription_id,
            user_id=user_id,
            image_url=f"/uploads/prescriptions/{prescription_id}.{ext}",
            extracted_data=extracted,
            verified=False,
        )
        db.add(prescription)
        await db.commit()

        matched_count = sum(1 for m in enriched_medicines if m.get("db_matches"))
        advice_count = len(extracted.get("advice", []))

        # Validate prescription metadata (date, completeness)
        meta_warnings = validate_prescription_meta(extracted)

        logger.info(
            "Prescription %s: %d medicines (%d matched), %d advice items, %d meta warnings, confidence=%.2f",
            prescription_id,
            len(raw_medicines),
            matched_count,
            advice_count,
            len(meta_warnings),
            confidence,
        )

        # Build natural language summary
        summary_text = _build_prescription_summary(
            enriched_medicines, extracted.get("advice", []),
            extracted.get("doctor_name"), extracted.get("prescription_date"),
            confidence, meta_warnings,
        )

        return {
            "prescription_id": prescription_id,
            "extracted_medicines": enriched_medicines,
            "advice": extracted.get("advice", []),
            "doctor_name": extracted.get("doctor_name"),
            "prescription_date": extracted.get("prescription_date"),
            "prescription_warnings": meta_warnings,
            "confidence": confidence,
            "summary": summary_text,
            "success": True,
        }

    except Exception as e:
        import traceback
        logger.error("Prescription OCR error: %s\n%s", e, traceback.format_exc())
        return {
            "prescription_id": None,
            "extracted_medicines": [],
            "advice": [],
            "confidence": 0.0,
            "error": str(e),
            "success": False,
        }


def _calculate_ocr_confidence(extracted: dict) -> float:
    """Heuristic confidence score based on extracted data completeness."""
    score = 0.0
    medicines = extracted.get("medicines", [])

    if medicines:
        score += 0.4  # Has at least one medicine
        # Each medicine with name + dosage adds confidence
        complete = sum(
            1 for m in medicines
            if m.get("name") and m.get("dosage")
        )
        score += 0.2 * min(complete / max(len(medicines), 1), 1.0)

    if extracted.get("doctor_name"):
        score += 0.15
    if extracted.get("prescription_date"):
        score += 0.15
    if extracted.get("patient_name"):
        score += 0.1

    return min(round(score, 2), 1.0)


_QUALITY_LABELS = {
    "exact": "✅ EXACT MATCH",
    "strength_mismatch": "⚠️ STRENGTH MISMATCH",
    "partial": "⚠️ PARTIAL INGREDIENT MATCH",
    "therapeutic": "ℹ️ THERAPEUTIC ALTERNATIVE",
    "none": "❌ NO MATCH",
}


# ── Prescription meta-validation ─────────────────────────────────────────────

_DATE_FORMATS = [
    "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y",
    "%d %b %Y", "%d %B %Y", "%b %d, %Y", "%B %d, %Y",
    "%d.%m.%Y", "%Y/%m/%d",
]


def _parse_date_flexible(date_str: str | None) -> datetime | None:
    """Try multiple date formats to parse a prescription date string."""
    if not date_str or not date_str.strip():
        return None
    cleaned = date_str.strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(cleaned, fmt)
        except ValueError:
            continue
    return None


def validate_prescription_meta(extracted: dict) -> list[dict]:
    """Validate prescription metadata: date recency, completeness.

    Returns a list of warning dicts:
    [{"type": "EXPIRED_PRESCRIPTION", "severity": "high", "message": "..."}]
    """
    warnings: list[str] = []
    result: list[dict] = []

    # ── Date validation ──────────────────────────────────────────────
    raw_date = extracted.get("prescription_date")
    parsed_date = _parse_date_flexible(raw_date)

    if parsed_date:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        age_days = (now - parsed_date).days

        if age_days > 180:  # >6 months
            months = age_days // 30
            result.append({
                "type": "EXPIRED_PRESCRIPTION",
                "severity": "high",
                "message": (
                    f"⚠️ This prescription is {months} months old (dated {raw_date}). "
                    f"Prescriptions older than 6 months may not be valid. "
                    f"Please obtain a fresh prescription from your doctor."
                ),
            })
        elif age_days > 90:  # >3 months — warn but don't block
            months = age_days // 30
            result.append({
                "type": "OLD_PRESCRIPTION",
                "severity": "medium",
                "message": (
                    f"ℹ️ This prescription is {months} months old (dated {raw_date}). "
                    f"Consider consulting your doctor for a current prescription."
                ),
            })
    elif raw_date:
        result.append({
            "type": "DATE_UNPARSEABLE",
            "severity": "low",
            "message": f"Could not parse prescription date: '{raw_date}'. Unable to verify recency.",
        })
    else:
        result.append({
            "type": "DATE_MISSING",
            "severity": "medium",
            "message": "⚠️ No date found on prescription. Cannot verify if prescription is current.",
        })

    # ── Completeness check ───────────────────────────────────────────
    completeness_fields = {
        "doctor_name": "Doctor's name",
        "prescription_date": "Prescription date",
        "patient_name": "Patient name",
        "hospital_clinic": "Hospital / clinic name",
    }
    present = sum(1 for k in completeness_fields if extracted.get(k))
    total = len(completeness_fields)
    missing = [label for key, label in completeness_fields.items() if not extracted.get(key)]

    if present < 2:  # Very incomplete
        result.append({
            "type": "INCOMPLETE_PRESCRIPTION",
            "severity": "high",
            "message": (
                f"⚠️ Prescription is incomplete ({present}/{total} fields present). "
                f"Missing: {', '.join(missing)}. "
                f"A valid prescription should include doctor's name, date, and patient details."
            ),
        })
    elif missing:
        result.append({
            "type": "PARTIAL_PRESCRIPTION",
            "severity": "low",
            "message": f"ℹ️ Prescription completeness: {present}/{total}. Missing: {', '.join(missing)}.",
        })

    return result


def build_prescription_context(
    enriched_medicines: list[dict],
    advice: list[dict] | None = None,
    clinical_warnings: list[str] | None = None,
    prescription_meta_warnings: list[dict] | None = None,
) -> str:
    """Build a structured clinical context string from enriched prescription data.

    This is injected into the pharmacist's system prompt so GPT can respond
    with accurate match quality labels, risk warnings, and stock status.
    """
    if not enriched_medicines and not advice:
        return ""

    lines: list[str] = []

    # Prescription-level warnings (date, completeness)
    if prescription_meta_warnings:
        lines.append("── Prescription Validation ──")
        for w in prescription_meta_warnings:
            lines.append(f"  {w['message']}")
        lines.append("")

    if enriched_medicines:
        lines.append("── Prescription Review Summary ──")
        lines.append("")
        for med in enriched_medicines:
            name = med.get("name", "Unknown")
            dosage = med.get("dosage", "")
            frequency = med.get("frequency", "")
            db_matches = med.get("db_matches", [])

            prescribed = f"{name}"
            if dosage:
                prescribed += f" ({dosage}"
                if frequency:
                    prescribed += f", {frequency}"
                prescribed += ")"

            if db_matches:
                best = db_matches[0]
                quality = best.get("match_quality", "none")
                label = _QUALITY_LABELS.get(quality, "UNKNOWN")

                match_info = f"{best['name']}"
                if best.get("generic_name"):
                    match_info += f" (generic: {best['generic_name']})"
                match_info += f", Rs.{best.get('price', 0):.0f}/strip"
                if best.get("rx_required"):
                    match_info += ", Rx REQUIRED"
                match_info += ", in stock" if best.get("in_stock") else ", OUT OF STOCK"

                lines.append(f"  Prescribed: {prescribed}")
                lines.append(f"  → {label}: {match_info}")

                # Surface clinical warnings
                for warning in best.get("match_warnings", []):
                    lines.append(f"    {warning}")
                if best.get("strength_note"):
                    lines.append(f"    Note: {best['strength_note']}. Confirm with prescribing doctor.")
                if best.get("extra_ingredients"):
                    lines.append(f"    Contains extra ingredient(s): {', '.join(best['extra_ingredients'])}")
                if best.get("missing_ingredients"):
                    lines.append(f"    Missing prescribed ingredient(s): {', '.join(best['missing_ingredients'])}")

                # Show alternative matches if any
                for alt in db_matches[1:3]:
                    alt_quality = alt.get("match_quality", "none")
                    alt_label = _QUALITY_LABELS.get(alt_quality, "")
                    stock = "in stock" if alt.get("in_stock") else "OUT OF STOCK"
                    lines.append(f"    Also available: {alt['name']} ({alt_label}, Rs.{alt.get('price', 0):.0f}/strip, {stock})")

                lines.append("")
            else:
                lines.append(f"  Prescribed: {prescribed}")
                lines.append(f"  → ❌ No match found in our inventory")
                lines.append("")

    # Clinical warnings (duplicates, interactions, patient flags)
    if clinical_warnings:
        lines.append("── Clinical Warnings ──")
        for w in clinical_warnings:
            lines.append(f"  {w}")
        lines.append("")

    if advice:
        lines.append("── Doctor's Advice/Instructions ──")
        for item in advice:
            instruction = item.get("instruction", "")
            if instruction:
                lines.append(f"  - {instruction}")

    return "\n".join(lines)
