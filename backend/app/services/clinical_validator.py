"""Clinical validation engine — rule-based, LLM-free drug safety logic.

Provides:
- Active-ingredient parsing from legacy salt strings
- Molecule-level match classification (exact / strength mismatch / partial / therapeutic)
- Duplicate-ingredient detection across multi-item orders
- Known drug-interaction checks (catalog-scoped)
- Patient flag checks (pregnancy, allergy)
"""

import logging
import re
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger("pharmacy.services.clinical_validator")


# ── Match quality classification ─────────────────────────────────────────────


class MatchQuality(str, Enum):
    EXACT = "exact"
    STRENGTH_MISMATCH = "strength_mismatch"
    PARTIAL_INGREDIENT = "partial"
    THERAPEUTIC_EQUIVALENT = "therapeutic"
    NO_MATCH = "none"


@dataclass
class MatchResult:
    quality: MatchQuality
    warnings: list[str] = field(default_factory=list)
    strength_note: str = ""
    extra_ingredients: list[str] = field(default_factory=list)
    missing_ingredients: list[str] = field(default_factory=list)


@dataclass
class DuplicateWarning:
    molecule: str
    medicines_involved: list[str]
    total_mg: float
    warning: str


@dataclass
class InteractionWarning:
    pair: list[str]
    description: str
    severity: str  # "high" | "medium"


@dataclass
class PatientWarning:
    medicine: str
    flag_type: str  # "pregnancy" | "allergy" | "pediatric" | "elderly"
    description: str
    severity: str


# ── Active ingredient parsing ────────────────────────────────────────────────

_STRENGTH_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*(mg|mcg|ml|g|iu)\b",
    re.IGNORECASE,
)

_SALT_SPLITTER_RE = re.compile(r"\s*\+\s*")


def parse_active_ingredients(salt_string: str | None) -> list[dict]:
    """Parse a legacy salt string like 'Paracetamol 650mg' or
    'Metformin 500mg + Glimepiride 2mg' into structured ingredient dicts.

    Returns: [{"molecule": str, "strength_mg": float, "strength_unit": str}]
    """
    if not salt_string:
        return []

    parts = _SALT_SPLITTER_RE.split(salt_string.strip())
    ingredients = []

    for part in parts:
        part = part.strip()
        if not part:
            continue

        strength_match = _STRENGTH_RE.search(part)
        if strength_match:
            value = float(strength_match.group(1))
            unit = strength_match.group(2).lower()
            molecule = part[: strength_match.start()].strip()
            # Normalize to mg
            if unit == "g":
                strength_mg = value * 1000
            elif unit == "mcg":
                strength_mg = value / 1000
            else:
                strength_mg = value
            ingredients.append({
                "molecule": molecule or part,
                "strength_mg": strength_mg,
                "strength_unit": unit,
            })
        else:
            # No strength found — just the molecule name
            ingredients.append({
                "molecule": part,
                "strength_mg": 0,
                "strength_unit": "",
            })

    return ingredients


def _get_ingredients(med: dict) -> list[dict]:
    """Get active ingredients from a medicine dict, with fallback to salt parsing."""
    ingredients = med.get("active_ingredients") or []
    if ingredients and isinstance(ingredients, list):
        return ingredients
    # Fallback: parse from salt string
    return parse_active_ingredients(med.get("salt") or med.get("dosage") or "")


def _normalize_molecule(name: str) -> str:
    """Normalize molecule name for comparison."""
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def _molecule_set(ingredients: list[dict]) -> set[str]:
    """Extract normalized molecule name set from ingredient list."""
    return {_normalize_molecule(i.get("molecule", "")) for i in ingredients if i.get("molecule")}


def _strength_map(ingredients: list[dict]) -> dict[str, float]:
    """Map normalized molecule -> strength_mg."""
    result = {}
    for i in ingredients:
        mol = _normalize_molecule(i.get("molecule", ""))
        if mol:
            result[mol] = float(i.get("strength_mg") or 0)
    return result


# ── Match classification ─────────────────────────────────────────────────────


def classify_match(prescribed: dict, candidate: dict) -> MatchResult:
    """Classify the quality of a candidate medicine match against a prescribed one.

    Args:
        prescribed: Dict with at least 'active_ingredients' or 'salt' field
        candidate: Dict with at least 'active_ingredients' or 'salt' field,
                   plus optional 'atc_code'

    Returns:
        MatchResult with quality level and any warnings.
    """
    rx_ingredients = _get_ingredients(prescribed)
    cand_ingredients = _get_ingredients(candidate)

    if not rx_ingredients or not cand_ingredients:
        return MatchResult(quality=MatchQuality.NO_MATCH, warnings=["Cannot determine active ingredients"])

    rx_molecules = _molecule_set(rx_ingredients)
    cand_molecules = _molecule_set(cand_ingredients)

    if not rx_molecules or not cand_molecules:
        return MatchResult(quality=MatchQuality.NO_MATCH)

    # Exact molecule set match
    if rx_molecules == cand_molecules:
        # Same molecules — check strengths
        rx_strengths = _strength_map(rx_ingredients)
        cand_strengths = _strength_map(cand_ingredients)

        mismatches = []
        for mol in rx_molecules:
            rx_str = rx_strengths.get(mol, 0)
            cand_str = cand_strengths.get(mol, 0)
            if rx_str and cand_str and abs(rx_str - cand_str) > 0.01:
                mismatches.append(
                    f"{mol}: prescribed {rx_str}mg vs available {cand_str}mg"
                )

        if not mismatches:
            return MatchResult(quality=MatchQuality.EXACT)

        return MatchResult(
            quality=MatchQuality.STRENGTH_MISMATCH,
            warnings=[f"⚠️ Different strength: {m}" for m in mismatches],
            strength_note="; ".join(mismatches),
        )

    # Partial overlap — candidate has extra or fewer ingredients
    common = rx_molecules & cand_molecules
    if common:
        extra = cand_molecules - rx_molecules
        missing = rx_molecules - cand_molecules
        warnings = []
        if extra:
            extra_names = [i.get("molecule", "") for i in cand_ingredients
                          if _normalize_molecule(i.get("molecule", "")) in extra]
            warnings.append(f"⚠️ Contains extra ingredient(s) not prescribed: {', '.join(extra_names)}")
        if missing:
            missing_names = [i.get("molecule", "") for i in rx_ingredients
                           if _normalize_molecule(i.get("molecule", "")) in missing]
            warnings.append(f"⚠️ Missing prescribed ingredient(s): {', '.join(missing_names)}")

        return MatchResult(
            quality=MatchQuality.PARTIAL_INGREDIENT,
            warnings=warnings,
            extra_ingredients=[i.get("molecule", "") for i in cand_ingredients
                              if _normalize_molecule(i.get("molecule", "")) in extra],
            missing_ingredients=[i.get("molecule", "") for i in rx_ingredients
                                if _normalize_molecule(i.get("molecule", "")) in missing],
        )

    # No molecule overlap — check therapeutic class via ATC
    rx_atc = (prescribed.get("atc_code") or "")[:5]  # Compare at 5-char level
    cand_atc = (candidate.get("atc_code") or "")[:5]

    if rx_atc and cand_atc and rx_atc == cand_atc:
        return MatchResult(
            quality=MatchQuality.THERAPEUTIC_EQUIVALENT,
            warnings=["ℹ️ Same therapeutic class but different active ingredient. Confirm with prescribing doctor."],
        )

    return MatchResult(quality=MatchQuality.NO_MATCH)


# ── Duplicate ingredient detection ───────────────────────────────────────────


def check_duplicate_ingredients(items: list[dict]) -> list[DuplicateWarning]:
    """Check for overlapping active ingredients across all items in an order.

    E.g. ordering Crocin 500mg + Dolo 650mg = double Paracetamol.
    """
    if len(items) < 2:
        return []

    # molecule -> [(medicine_name, strength_mg)]
    molecule_sources: dict[str, list[tuple[str, float]]] = {}

    for item in items:
        med_name = item.get("name") or item.get("medicine_name") or item.get("matched_medicine_name", "Unknown")
        ingredients = _get_ingredients(item)
        for ing in ingredients:
            mol = _normalize_molecule(ing.get("molecule", ""))
            if not mol:
                continue
            display_mol = ing.get("molecule", mol)
            strength = float(ing.get("strength_mg") or 0)
            if mol not in molecule_sources:
                molecule_sources[mol] = []
            molecule_sources[mol].append((med_name, strength, display_mol))

    warnings = []
    for mol, sources in molecule_sources.items():
        if len(sources) < 2:
            continue
        med_names = [s[0] for s in sources]
        total_mg = sum(s[1] for s in sources)
        display_mol = sources[0][2]
        warnings.append(DuplicateWarning(
            molecule=display_mol,
            medicines_involved=med_names,
            total_mg=total_mg,
            warning=(
                f"⚠️ Duplicate active ingredient: {display_mol} found in "
                f"{', '.join(med_names)}. Combined dose: {total_mg}mg per dose. "
                f"Risk of overdose — confirm with doctor."
            ),
        ))

    return warnings


# ── Known drug interactions ──────────────────────────────────────────────────

# Curated interaction rules for the catalog.
# Format: (molecule_a, molecule_b, description, severity)
_KNOWN_INTERACTIONS: list[tuple[str, str, str, str]] = [
    (
        "aspirin", "metformin",
        "Aspirin may enhance the hypoglycemic (blood sugar lowering) effect of Metformin. "
        "Monitor blood sugar closely.",
        "medium",
    ),
    (
        "aspirin", "amlodipine",
        "NSAIDs/Aspirin may reduce the antihypertensive effect of Amlodipine.",
        "medium",
    ),
    (
        "aspirin", "telmisartan",
        "NSAIDs/Aspirin may reduce the antihypertensive effect of Telmisartan "
        "and increase risk of kidney impairment.",
        "high",
    ),
    (
        "atorvastatin", "azithromycin",
        "Azithromycin may increase Atorvastatin levels, raising the risk of "
        "muscle damage (rhabdomyolysis).",
        "medium",
    ),
    (
        "metformin", "glimepiride",
        "Combination of Metformin + Glimepiride increases hypoglycemia risk. "
        "This is expected in combination products but flagged if ordered as separate items.",
        "medium",
    ),
    # ── New interactions ──
    (
        "amlodipine", "simvastatin",
        "Amlodipine increases Simvastatin blood levels, raising risk of "
        "rhabdomyolysis (muscle damage). Max recommended Simvastatin dose is 20mg "
        "when taken with Amlodipine. Requires pharmacist review.",
        "high",
    ),
    (
        "warfarin", "aspirin",
        "Concurrent use of Warfarin and Aspirin significantly increases "
        "risk of major bleeding events. Requires physician supervision.",
        "high",
    ),
    (
        "warfarin", "paracetamol",
        "High-dose or chronic Paracetamol use may enhance the anticoagulant "
        "effect of Warfarin. Monitor INR closely.",
        "medium",
    ),
    (
        "ciprofloxacin", "theophylline",
        "Ciprofloxacin inhibits Theophylline metabolism, potentially causing "
        "toxic Theophylline levels (seizures, arrhythmias).",
        "high",
    ),
    (
        "amlodipine", "atorvastatin",
        "Amlodipine may slightly increase Atorvastatin exposure. Monitor for "
        "muscle pain or weakness.",
        "medium",
    ),
    (
        "ibuprofen", "aspirin",
        "Ibuprofen may interfere with Aspirin's antiplatelet effect. If both "
        "are needed, take Aspirin at least 30 minutes before Ibuprofen.",
        "medium",
    ),
    (
        "metoprolol", "amlodipine",
        "Both lower heart rate and blood pressure. Combined use may cause "
        "excessive bradycardia or hypotension. Monitor blood pressure.",
        "medium",
    ),
]

# Build lookup set
_INTERACTION_LOOKUP: dict[tuple[str, str], tuple[str, str]] = {}
for _a, _b, _desc, _sev in _KNOWN_INTERACTIONS:
    _na, _nb = _normalize_molecule(_a), _normalize_molecule(_b)
    _INTERACTION_LOOKUP[(_na, _nb)] = (_desc, _sev)
    _INTERACTION_LOOKUP[(_nb, _na)] = (_desc, _sev)


def check_known_interactions(items: list[dict]) -> list[InteractionWarning]:
    """Check for known drug interactions across items in an order."""
    if len(items) < 2:
        return []

    # Collect all distinct molecules per item, so we can check
    # inter-item interactions (not intra-item, since combos are intentional).
    item_molecules: list[tuple[str, set[str]]] = []
    for item in items:
        med_name = item.get("name") or item.get("medicine_name") or "Unknown"
        ingredients = _get_ingredients(item)
        mols = _molecule_set(ingredients)
        item_molecules.append((med_name, mols))

    warnings = []
    seen_pairs: set[tuple[str, str]] = set()

    for i in range(len(item_molecules)):
        for j in range(i + 1, len(item_molecules)):
            name_i, mols_i = item_molecules[i]
            name_j, mols_j = item_molecules[j]

            for mol_a in mols_i:
                for mol_b in mols_j:
                    if mol_a == mol_b:
                        continue  # Same molecule = duplicate, handled separately
                    pair_key = tuple(sorted([mol_a, mol_b]))
                    if pair_key in seen_pairs:
                        continue
                    seen_pairs.add(pair_key)

                    interaction = _INTERACTION_LOOKUP.get((mol_a, mol_b))
                    if interaction:
                        desc, severity = interaction
                        warnings.append(InteractionWarning(
                            pair=[name_i, name_j],
                            description=desc,
                            severity=severity,
                        ))

    return warnings


# ── Patient flag checks ──────────────────────────────────────────────────────

# Molecules contraindicated / cautioned in specific conditions.
# Format: molecule -> [(flag_type, description, severity)]
_PATIENT_FLAG_RULES: dict[str, list[tuple[str, str, str]]] = {
    "aspirin": [
        ("pregnancy", "Aspirin is contraindicated in pregnancy, especially third trimester. "
                      "Risk of bleeding complications.", "high"),
    ],
    "metformin": [
        ("pregnancy", "Metformin use during pregnancy requires careful medical supervision. "
                      "Discuss with your doctor.", "medium"),
    ],
    "atorvastatin": [
        ("pregnancy", "Statins are contraindicated in pregnancy due to risk of birth defects.", "high"),
    ],
    "azithromycin": [
        ("pregnancy", "Azithromycin: Use during pregnancy only if clearly needed. "
                      "Consult your doctor.", "medium"),
    ],
    "glimepiride": [
        ("pregnancy", "Glimepiride is not recommended during pregnancy. "
                      "Switch to insulin under medical supervision.", "high"),
    ],
    "montelukast": [
        ("pregnancy", "Montelukast: Limited data in pregnancy. "
                      "Use only if benefit outweighs risk.", "medium"),
    ],
    "levocetirizine": [
        ("pregnancy", "Levocetirizine: Use during pregnancy only if clearly needed.", "medium"),
    ],
}


# ── Allergy cross-class mapping ──────────────────────────────────────────────
# Maps a user-reported allergy to all cross-reactive molecules.
# If a user says "I'm allergic to Penicillin", we also block Amoxicillin, Ampicillin, etc.
_ALLERGY_CLASS_MAP: dict[str, set[str]] = {
    "penicillin": {"amoxicillin", "ampicillin", "piperacillin", "flucloxacillin",
                   "cloxacillin", "nafcillin", "oxacillin", "dicloxacillin"},
    "sulfa": {"sulfamethoxazole", "sulfasalazine", "sulfadiazine", "sulfacetamide"},
    "sulfonamide": {"sulfamethoxazole", "sulfasalazine", "sulfadiazine", "sulfacetamide"},
    "nsaid": {"aspirin", "ibuprofen", "diclofenac", "naproxen", "piroxicam",
              "indomethacin", "ketorolac", "mefenamic acid"},
    "cephalosporin": {"cefalexin", "cefuroxime", "ceftriaxone", "cefixime",
                      "cefpodoxime", "cefadroxil", "cephalexin"},
    "statin": {"atorvastatin", "rosuvastatin", "simvastatin", "pravastatin", "fluvastatin"},
    "ace inhibitor": {"enalapril", "lisinopril", "ramipril", "captopril", "perindopril"},
    "aceinhibitor": {"enalapril", "lisinopril", "ramipril", "captopril", "perindopril"},
}



def check_patient_flags(
    items: list[dict],
    medical_facts: list[dict] | None = None,
) -> list[PatientWarning]:
    """Check order items against patient medical profile flags.

    Medical facts format from user profile:
    [{"fact_type": "allergy", "value": "Penicillin", "status": "active"}, ...]

    Allergy checking includes cross-class expansion:
    e.g. Penicillin allergy also blocks Amoxicillin, Ampicillin, etc.
    """
    if not medical_facts:
        return []

    active_facts = [f for f in medical_facts if f.get("status") == "active"]
    if not active_facts:
        return []

    warnings = []

    # Extract active conditions
    is_pregnant = any(
        "pregnant" in (f.get("value") or "").lower()
        for f in active_facts
        if f.get("fact_type") == "condition"
    )

    # Build expanded allergy set with cross-class mapping
    raw_allergies: dict[str, str] = {}  # normalized_mol -> original display name
    for fact in active_facts:
        if fact.get("fact_type") == "allergy":
            display = fact.get("value", "")
            norm = _normalize_molecule(display)
            raw_allergies[norm] = display

    # Expand each allergy via cross-class map
    expanded_allergy_molecules: set[str] = set()
    allergy_class_source: dict[str, str] = {}  # expanded_mol -> original allergy name
    for norm_allergy, display_allergy in raw_allergies.items():
        # Direct match
        expanded_allergy_molecules.add(norm_allergy)
        allergy_class_source[norm_allergy] = display_allergy
        # Cross-class expansion
        cross_class = _ALLERGY_CLASS_MAP.get(norm_allergy, set())
        for related_mol in cross_class:
            norm_related = _normalize_molecule(related_mol)
            expanded_allergy_molecules.add(norm_related)
            allergy_class_source[norm_related] = display_allergy

    for item in items:
        med_name = item.get("name") or item.get("medicine_name") or "Unknown"
        ingredients = _get_ingredients(item)

        for ing in ingredients:
            mol = _normalize_molecule(ing.get("molecule", ""))
            display_mol = ing.get("molecule", mol)

            # Allergy check (with cross-class expansion)
            if mol in expanded_allergy_molecules:
                source_allergy = allergy_class_source.get(mol, display_mol)
                if _normalize_molecule(source_allergy) == mol:
                    # Direct allergy match
                    desc = f"🚨 ALLERGY ALERT: Patient has a documented allergy to {display_mol}."
                else:
                    # Cross-class match — explain the relationship
                    desc = (
                        f"🚨 ALLERGY ALERT: Patient has a documented {source_allergy} allergy. "
                        f"{display_mol} belongs to the {source_allergy} class and may cause "
                        f"a severe cross-reactive allergic reaction."
                    )
                warnings.append(PatientWarning(
                    medicine=med_name,
                    flag_type="allergy",
                    description=desc,
                    severity="high",
                ))

            # Pregnancy-specific rules
            if is_pregnant and mol in _PATIENT_FLAG_RULES:
                for flag_type, desc, severity in _PATIENT_FLAG_RULES[mol]:
                    if flag_type == "pregnancy":
                        warnings.append(PatientWarning(
                            medicine=med_name,
                            flag_type="pregnancy",
                            description=f"⚠️ PREGNANCY WARNING for {med_name}: {desc}",
                            severity=severity,
                        ))

    return warnings


# ── Age-appropriate dose guardrails ──────────────────────────────────────────

@dataclass
class DoseWarning:
    medicine: str
    molecule: str
    description: str
    severity: str  # "high" | "medium"


# Curated safe dose ranges per molecule per age bracket (mg per single dose).
# Format: molecule → [(age_min, age_max, max_single_dose_mg, max_daily_mg)]
_DOSE_RANGES: dict[str, list[tuple[int, int, float, float]]] = {
    "paracetamol": [
        (0, 2, 120, 480),      # Infants: max 120mg/dose, 480mg/day
        (2, 6, 240, 960),      # Young children
        (6, 12, 500, 2000),    # Older children
        (12, 65, 1000, 4000),  # Adults
        (65, 200, 650, 2000),  # Elderly — reduced max
    ],
    "azithromycin": [
        (0, 12, 250, 250),     # Children: 10mg/kg, approx max 250mg
        (12, 200, 500, 500),   # Adults
    ],
    "metformin": [
        (0, 18, 0, 0),         # Not for children
        (18, 200, 1000, 2500), # Adults
    ],
    "amlodipine": [
        (0, 18, 5, 5),         # Pediatric: max 5mg
        (18, 200, 10, 10),     # Adults
    ],
    "cetirizine": [
        (0, 6, 5, 5),          # Young children: half dose
        (6, 200, 10, 10),      # Older children + adults
    ],
    "aspirin": [
        (0, 16, 0, 0),         # Contraindicated in children (Reye's syndrome risk)
        (16, 200, 325, 4000),  # Adults
    ],
}


def check_dose_appropriateness(
    items: list[dict],
    patient_age: int | None = None,
) -> list[DoseWarning]:
    """Check if medicine doses are appropriate for the patient's age.

    Only fires when patient age is known from profile.
    """
    if patient_age is None:
        return []

    warnings = []
    for item in items:
        med_name = item.get("name") or item.get("medicine_name") or "Unknown"
        ingredients = _get_ingredients(item)

        for ing in ingredients:
            mol = _normalize_molecule(ing.get("molecule", ""))
            strength = float(ing.get("strength_mg") or 0)
            if not mol or not strength:
                continue

            ranges = _DOSE_RANGES.get(mol)
            if not ranges:
                continue

            for age_min, age_max, max_single, max_daily in ranges:
                if age_min <= patient_age < age_max:
                    display_mol = ing.get("molecule", mol)

                    if max_single == 0:
                        warnings.append(DoseWarning(
                            medicine=med_name,
                            molecule=display_mol,
                            description=(
                                f"🚨 {display_mol} is not recommended for patients "
                                f"under {age_max} years old."
                            ),
                            severity="high",
                        ))
                    elif strength > max_single:
                        warnings.append(DoseWarning(
                            medicine=med_name,
                            molecule=display_mol,
                            description=(
                                f"⚠️ {display_mol} dose ({strength}mg) exceeds the "
                                f"recommended max single dose ({max_single}mg) for "
                                f"age {patient_age}. Consult your doctor."
                            ),
                            severity="high" if strength > max_single * 1.5 else "medium",
                        ))
                    break  # Found matching age bracket

    return warnings


# ── Antibiotic stewardship ───────────────────────────────────────────────────

@dataclass
class AntibioticWarning:
    medicine: str
    warning_type: str  # "course_completion" | "polytherapy" | "no_prescription"
    description: str
    severity: str


def check_antibiotic_stewardship(
    items: list[dict],
    has_prescription: bool = False,
) -> list[AntibioticWarning]:
    """Check antibiotic-related safety rules.

    - Course completion reminder for all antibiotics
    - Polytherapy warning if >1 antibiotic in same order
    - Prescription enforcement for antibiotics
    """
    warnings = []
    antibiotics = []

    for item in items:
        med_name = item.get("name") or item.get("medicine_name") or "Unknown"
        category = (item.get("category") or "").lower()
        counseling = item.get("counseling_info") or {}
        rx_required = item.get("prescription_required", False)

        is_antibiotic = (
            category == "antibiotic"
            or counseling.get("is_antibiotic", False)
        )

        if is_antibiotic:
            antibiotics.append(med_name)

            # Course completion reminder
            if counseling.get("course_completion_critical", False):
                warnings.append(AntibioticWarning(
                    medicine=med_name,
                    warning_type="course_completion",
                    description=(
                        f"💊 {med_name}: Complete the FULL antibiotic course even "
                        f"if you feel better. Stopping early promotes antibiotic resistance."
                    ),
                    severity="medium",
                ))

            # Prescription enforcement
            if rx_required and not has_prescription:
                warnings.append(AntibioticWarning(
                    medicine=med_name,
                    warning_type="no_prescription",
                    description=(
                        f"📋 {med_name} is an antibiotic that requires a valid prescription. "
                        f"Please upload your prescription to proceed."
                    ),
                    severity="high",
                ))

    # Polytherapy
    if len(antibiotics) > 1:
        warnings.append(AntibioticWarning(
            medicine=", ".join(antibiotics),
            warning_type="polytherapy",
            description=(
                f"⚠️ Multiple antibiotics in one order ({', '.join(antibiotics)}). "
                f"This is unusual — please confirm with your doctor that both are needed."
            ),
            severity="medium",
        ))

    return warnings

