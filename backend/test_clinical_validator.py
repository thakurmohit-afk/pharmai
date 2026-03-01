"""Quick verification: check new columns exist and seed data loaded correctly."""
import asyncio
from app.database import async_session_factory
from sqlalchemy import select
from app.models.medicine import Medicine


async def verify():
    async with async_session_factory() as db:
        result = await db.execute(select(Medicine).limit(3))
        meds = result.scalars().all()
        print(f"Total medicines checked: {len(meds)}")
        for m in meds:
            print(f"  {m.name}:")
            print(f"    active_ingredients = {m.active_ingredients}")
            print(f"    atc_code = {m.atc_code}")
        print("\n--- Clinical Validator Test ---")

    # Test clinical validator independently
    from app.services.clinical_validator import (
        classify_match,
        check_duplicate_ingredients,
        check_known_interactions,
        parse_active_ingredients,
    )

    # Test 1: parse_active_ingredients
    parsed = parse_active_ingredients("Paracetamol 650mg")
    print(f"parse('Paracetamol 650mg') = {parsed}")
    assert parsed[0]["molecule"] == "Paracetamol"
    assert parsed[0]["strength_mg"] == 650
    print("  ✅ PASS")

    # Test 2: classify_match — EXACT
    rx = {"active_ingredients": [{"molecule": "Paracetamol", "strength_mg": 500, "strength_unit": "mg"}]}
    cand = {"active_ingredients": [{"molecule": "Paracetamol", "strength_mg": 500, "strength_unit": "mg"}]}
    result = classify_match(rx, cand)
    print(f"EXACT match test: {result.quality.value}")
    assert result.quality.value == "exact"
    print("  ✅ PASS")

    # Test 3: classify_match — STRENGTH_MISMATCH
    cand2 = {"active_ingredients": [{"molecule": "Paracetamol", "strength_mg": 650, "strength_unit": "mg"}]}
    result2 = classify_match(rx, cand2)
    print(f"STRENGTH_MISMATCH test: {result2.quality.value}")
    assert result2.quality.value == "strength_mismatch"
    print(f"  Warnings: {result2.warnings}")
    print("  ✅ PASS")

    # Test 4: classify_match — PARTIAL (combo drug)
    rx3 = {"active_ingredients": [{"molecule": "Paracetamol", "strength_mg": 500, "strength_unit": "mg"}]}
    cand3 = {"active_ingredients": [
        {"molecule": "Paracetamol", "strength_mg": 500, "strength_unit": "mg"},
        {"molecule": "Caffeine", "strength_mg": 65, "strength_unit": "mg"},
    ]}
    result3 = classify_match(rx3, cand3)
    print(f"PARTIAL match test: {result3.quality.value}")
    assert result3.quality.value == "partial"
    print(f"  Extra ingredients: {result3.extra_ingredients}")
    print("  ✅ PASS")

    # Test 5: check_duplicate_ingredients
    order = [
        {"name": "Crocin 500mg", "active_ingredients": [{"molecule": "Paracetamol", "strength_mg": 500}]},
        {"name": "Dolo 650mg", "active_ingredients": [{"molecule": "Paracetamol", "strength_mg": 650}]},
    ]
    dups = check_duplicate_ingredients(order)
    print(f"Duplicate detection (Crocin + Dolo): {len(dups)} warnings")
    assert len(dups) == 1
    print(f"  {dups[0].warning}")
    print("  ✅ PASS")

    # Test 6: check_known_interactions
    order2 = [
        {"name": "Ecosprin 75mg", "active_ingredients": [{"molecule": "Aspirin", "strength_mg": 75}]},
        {"name": "Metformin 500mg", "active_ingredients": [{"molecule": "Metformin", "strength_mg": 500}]},
    ]
    interactions = check_known_interactions(order2)
    print(f"Interaction check (Aspirin + Metformin): {len(interactions)} warnings")
    assert len(interactions) == 1
    print(f"  {interactions[0].description}")
    print("  ✅ PASS")

    print("\n🎉 ALL TESTS PASSED!")


if __name__ == "__main__":
    asyncio.run(verify())
