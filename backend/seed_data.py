"""Reset and seed local database with demo users, inventory, and history."""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.database import Base
from app.models.chat import UserMemory
from app.models.inventory import Inventory
from app.models.medicine import Medicine
from app.models.order import Order, OrderHistory
from app.models.prescription import Prescription
from app.models.refill_alert import RefillAlert
from app.models.user import User, UserProfile
from app.security import hash_password

settings = get_settings()

DEMO_PASSWORD = "Demo@1234"

USERS = [
    {
        "name": "Aarav Sharma",
        "email": "aarav@demo.com",
        "phone": "+919876543210",
        "role": "user",
        "user_id": "72bbd3a6-f61d-4e85-849c-2fb3364ee71e",
    },
    {
        "name": "Priya Patel",
        "email": "priya@demo.com",
        "phone": "+919876543211",
        "role": "user",
        "user_id": "fddcb7b6-2995-4eb7-a2e3-2df541d62fc6",
    },
    {
        "name": "Rahul Gupta",
        "email": "rahul@demo.com",
        "phone": "+919876543212",
        "role": "user",
        "user_id": "7a7189fb-f225-4e24-aac4-be387c9b697a",
    },
    {
        "name": "Admin User",
        "email": "admin@demo.com",
        "phone": "+919876543299",
        "role": "admin",
        "user_id": "9f4b3f2b-8ec8-4d88-b95b-19d8d7f6f100",
    },
]

MEDICINES = [
    {
        "name": "Crocin 500mg",
        "generic_name": "Paracetamol",
        "salt": "Paracetamol 500mg",
        "dosage": "500mg",
        "pack_sizes": [10, 15, 30],
        "price": 30.0,
        "prescription_required": False,
        "category": "Analgesic",
        "max_per_order": 60,
        "manufacturer": "GSK",
        "description": "Effective analgesic and antipyretic for reducing fever and mild to moderate pain.",
        "active_ingredients": [{"molecule": "Paracetamol", "strength_mg": 500, "strength_unit": "mg"}],
        "atc_code": "N02BE01",
        "counseling_info": {
            "food_timing": "any",
            "food_note": "Can be taken with or without food",
            "drowsiness": False,
            "alcohol_warning": True,
            "alcohol_note": "Avoid alcohol — increases risk of liver damage with Paracetamol",
            "storage": "Store below 25°C, protect from moisture",
            "common_side_effects": ["nausea", "allergic skin rash (rare)"],
            "missed_dose_action": "Take as soon as you remember. Skip if next dose is near. Do not double dose.",
            "is_antibiotic": False,
            "course_completion_critical": False,
        },
    },
    {
        "name": "Dolo 650mg",
        "generic_name": "Paracetamol",
        "salt": "Paracetamol 650mg",
        "dosage": "650mg",
        "pack_sizes": [10, 15],
        "price": 35.0,
        "prescription_required": False,
        "category": "Analgesic",
        "max_per_order": 60,
        "manufacturer": "Micro Labs",
        "description": "High-strength paracetamol for high fever and body aches.",
        "active_ingredients": [{"molecule": "Paracetamol", "strength_mg": 650, "strength_unit": "mg"}],
        "atc_code": "N02BE01",
        "counseling_info": {
            "food_timing": "any",
            "food_note": "Can be taken with or without food",
            "drowsiness": False,
            "alcohol_warning": True,
            "alcohol_note": "Avoid alcohol — increases risk of liver damage with Paracetamol",
            "storage": "Store below 25°C, protect from moisture",
            "common_side_effects": ["nausea", "allergic skin rash (rare)"],
            "missed_dose_action": "Take as soon as you remember. Skip if next dose is near. Do not double dose.",
            "is_antibiotic": False,
            "course_completion_critical": False,
        },
    },
    {
        "name": "Amlodipine 5mg",
        "generic_name": "Amlodipine Besylate",
        "salt": "Amlodipine 5mg",
        "dosage": "5mg",
        "pack_sizes": [10, 30, 60],
        "price": 45.0,
        "prescription_required": True,
        "category": "Antihypertensive",
        "max_per_order": 90,
        "manufacturer": "Cipla",
        "description": "Calcium channel blocker for high blood pressure (hypertension).",
        "active_ingredients": [{"molecule": "Amlodipine", "strength_mg": 5, "strength_unit": "mg"}],
        "atc_code": "C08CA01",
        "counseling_info": {
            "food_timing": "any",
            "food_note": "Can be taken with or without food, at the same time each day",
            "drowsiness": True,
            "drowsiness_note": "May cause dizziness. Rise slowly from sitting or lying position.",
            "alcohol_warning": True,
            "alcohol_note": "Alcohol may increase the blood pressure lowering effect — avoid or limit",
            "storage": "Store below 30°C, protect from light",
            "common_side_effects": ["ankle swelling", "dizziness", "flushing", "headache"],
            "missed_dose_action": "Take as soon as you remember. Skip if less than 12 hours to next dose.",
            "is_antibiotic": False,
            "course_completion_critical": False,
        },
    },
    {
        "name": "Telma 40mg",
        "generic_name": "Telmisartan",
        "salt": "Telmisartan 40mg",
        "dosage": "40mg",
        "pack_sizes": [10, 30],
        "price": 120.0,
        "prescription_required": True,
        "category": "Antihypertensive",
        "max_per_order": 90,
        "manufacturer": "Glenmark",
        "description": "Angiotensin receptor blocker (ARB) for hypertension and heart failure.",
        "active_ingredients": [{"molecule": "Telmisartan", "strength_mg": 40, "strength_unit": "mg"}],
        "atc_code": "C09CA07",
        "counseling_info": {
            "food_timing": "any",
            "food_note": "Can be taken with or without food, at the same time each day",
            "drowsiness": True,
            "drowsiness_note": "May cause dizziness, especially when starting. Avoid driving until you know how it affects you.",
            "alcohol_warning": True,
            "alcohol_note": "Alcohol may worsen dizziness and blood pressure drop",
            "storage": "Store below 25°C",
            "common_side_effects": ["dizziness", "diarrhea", "back pain", "sinus infection"],
            "missed_dose_action": "Take as soon as you remember. Skip if almost time for next dose.",
            "is_antibiotic": False,
            "course_completion_critical": False,
        },
    },
    {
        "name": "Metformin 500mg",
        "generic_name": "Metformin Hydrochloride",
        "salt": "Metformin 500mg",
        "dosage": "500mg",
        "pack_sizes": [10, 30, 60, 100],
        "price": 25.0,
        "prescription_required": True,
        "category": "Antidiabetic",
        "max_per_order": 120,
        "manufacturer": "USV",
        "description": "First-line medication for Type 2 Diabetes to control blood sugar.",
        "active_ingredients": [{"molecule": "Metformin", "strength_mg": 500, "strength_unit": "mg"}],
        "atc_code": "A10BA02",
        "counseling_info": {
            "food_timing": "with_food",
            "food_note": "Take with meals to reduce stomach upset and improve absorption",
            "drowsiness": False,
            "alcohol_warning": True,
            "alcohol_note": "Avoid alcohol — risk of lactic acidosis (a serious condition) with Metformin",
            "storage": "Store below 25°C, protect from moisture",
            "common_side_effects": ["nausea", "diarrhea", "stomach upset", "metallic taste"],
            "missed_dose_action": "Take with your next meal. Do not double up.",
            "is_antibiotic": False,
            "course_completion_critical": False,
        },
    },
    {
        "name": "Glycomet GP 2",
        "generic_name": "Metformin + Glimepiride",
        "salt": "Metformin 500mg + Glimepiride 2mg",
        "dosage": "500mg/2mg",
        "pack_sizes": [10, 30],
        "price": 95.0,
        "prescription_required": True,
        "category": "Antidiabetic",
        "max_per_order": 90,
        "manufacturer": "USV",
        "description": "Combination therapy for Type 2 Diabetes.",
        "active_ingredients": [
            {"molecule": "Metformin", "strength_mg": 500, "strength_unit": "mg"},
            {"molecule": "Glimepiride", "strength_mg": 2, "strength_unit": "mg"},
        ],
        "atc_code": "A10BD02",
        "counseling_info": {
            "food_timing": "with_food",
            "food_note": "Take with breakfast or first main meal of the day",
            "drowsiness": True,
            "drowsiness_note": "May cause low blood sugar (shakiness, sweating). Carry sugar/candy.",
            "alcohol_warning": True,
            "alcohol_note": "Avoid alcohol — increases risk of low blood sugar and lactic acidosis",
            "storage": "Store below 25°C, protect from moisture",
            "common_side_effects": ["low blood sugar", "nausea", "weight gain", "diarrhea"],
            "missed_dose_action": "Take with your next meal. Never take double dose.",
            "is_antibiotic": False,
            "course_completion_critical": False,
        },
    },
    {
        "name": "Azithromycin 500mg",
        "generic_name": "Azithromycin",
        "salt": "Azithromycin 500mg",
        "dosage": "500mg",
        "pack_sizes": [3, 5, 10],
        "price": 85.0,
        "prescription_required": True,
        "category": "Antibiotic",
        "max_per_order": 15,
        "manufacturer": "Alkem",
        "description": "Antibiotic for bacterial infections of throat, chest and ears.",
        "active_ingredients": [{"molecule": "Azithromycin", "strength_mg": 500, "strength_unit": "mg"}],
        "atc_code": "J01FA10",
        "counseling_info": {
            "food_timing": "before_food",
            "food_note": "Take 1 hour before OR 2 hours after meals for best absorption",
            "drowsiness": False,
            "alcohol_warning": True,
            "alcohol_note": "Avoid alcohol while on antibiotic course — may worsen side effects",
            "storage": "Store below 25°C, protect from moisture",
            "common_side_effects": ["diarrhea", "nausea", "stomach pain", "headache"],
            "missed_dose_action": "Take as soon as you remember. If nearly time for next dose, skip the missed one.",
            "is_antibiotic": True,
            "course_completion_critical": True,
        },
    },
    {
        "name": "Cetirizine 10mg",
        "generic_name": "Cetirizine",
        "salt": "Cetirizine 10mg",
        "dosage": "10mg",
        "pack_sizes": [10, 30],
        "price": 20.0,
        "prescription_required": False,
        "category": "Antihistamine",
        "max_per_order": 60,
        "manufacturer": "Dr Reddy's",
        "description": "Antihistamine for allergy symptoms like runny nose, sneezing, and hives. Non-sedative.",
        "active_ingredients": [{"molecule": "Cetirizine", "strength_mg": 10, "strength_unit": "mg"}],
        "atc_code": "R06AE07",
        "counseling_info": {
            "food_timing": "any",
            "food_note": "Can be taken with or without food, preferably at bedtime",
            "drowsiness": True,
            "drowsiness_note": "May cause mild drowsiness. Avoid driving until you know how it affects you.",
            "alcohol_warning": True,
            "alcohol_note": "Alcohol increases drowsiness — avoid while taking Cetirizine",
            "storage": "Store below 25°C",
            "common_side_effects": ["drowsiness", "dry mouth", "headache", "fatigue"],
            "missed_dose_action": "Take as soon as you remember. Skip if next dose is near.",
            "is_antibiotic": False,
            "course_completion_critical": False,
        },
    },
    {
        "name": "Pantoprazole 40mg",
        "generic_name": "Pantoprazole",
        "salt": "Pantoprazole 40mg",
        "dosage": "40mg",
        "pack_sizes": [10, 15, 30],
        "price": 55.0,
        "prescription_required": False,
        "category": "Antacid",
        "max_per_order": 60,
        "manufacturer": "Sun Pharma",
        "description": "Proton pump inhibitor (PPI) for acidity, heartburn, and GERD.",
        "active_ingredients": [{"molecule": "Pantoprazole", "strength_mg": 40, "strength_unit": "mg"}],
        "atc_code": "A02BC02",
        "counseling_info": {
            "food_timing": "before_food",
            "food_note": "Take 30-60 minutes before breakfast on an empty stomach for maximum effect",
            "drowsiness": False,
            "alcohol_warning": True,
            "alcohol_note": "Alcohol increases stomach acid — counteracts the medicine's effect",
            "storage": "Store below 25°C, protect from moisture",
            "common_side_effects": ["headache", "diarrhea", "nausea", "stomach pain"],
            "missed_dose_action": "Take as soon as you remember. Skip if almost time for next dose.",
            "is_antibiotic": False,
            "course_completion_critical": False,
        },
    },
    {
        "name": "Atorvastatin 10mg",
        "generic_name": "Atorvastatin",
        "salt": "Atorvastatin 10mg",
        "dosage": "10mg",
        "pack_sizes": [10, 30],
        "price": 70.0,
        "prescription_required": True,
        "category": "Statin",
        "max_per_order": 90,
        "manufacturer": "Zydus",
        "description": "Statin to lower bad cholesterol (LDL) and reduce heart risk.",
        "active_ingredients": [{"molecule": "Atorvastatin", "strength_mg": 10, "strength_unit": "mg"}],
        "atc_code": "C10AA05",
        "counseling_info": {
            "food_timing": "any",
            "food_note": "Take at the same time each day, preferably at night (cholesterol production peaks at night)",
            "drowsiness": False,
            "alcohol_warning": True,
            "alcohol_note": "Limit alcohol — both alcohol and statins affect the liver",
            "storage": "Store below 25°C, protect from moisture and light",
            "common_side_effects": ["muscle pain", "joint pain", "headache", "nausea"],
            "missed_dose_action": "Take as soon as you remember. Skip if less than 12 hours to next dose.",
            "is_antibiotic": False,
            "course_completion_critical": False,
        },
    },
    {
        "name": "Ecosprin 75mg",
        "generic_name": "Aspirin",
        "salt": "Aspirin 75mg",
        "dosage": "75mg",
        "pack_sizes": [14, 30, 60],
        "price": 15.0,
        "prescription_required": False,
        "category": "Antiplatelet",
        "max_per_order": 120,
        "manufacturer": "USV",
        "description": "Blood thinner (antiplatelet) to prevent heart attacks and strokes.",
        "active_ingredients": [{"molecule": "Aspirin", "strength_mg": 75, "strength_unit": "mg"}],
        "atc_code": "B01AC06",
        "counseling_info": {
            "food_timing": "after_food",
            "food_note": "Take after meals to reduce stomach irritation",
            "drowsiness": False,
            "alcohol_warning": True,
            "alcohol_note": "Alcohol increases bleeding risk — avoid or strictly limit",
            "storage": "Store below 25°C, protect from moisture",
            "common_side_effects": ["stomach upset", "heartburn", "easy bruising"],
            "missed_dose_action": "Take as soon as you remember. Skip if next dose is near. Do not double dose.",
            "is_antibiotic": False,
            "course_completion_critical": False,
        },
    },
    {
        "name": "Montair LC",
        "generic_name": "Montelukast + Levocetirizine",
        "salt": "Montelukast 10mg + Levocetirizine 5mg",
        "dosage": "10mg/5mg",
        "pack_sizes": [10, 15, 30],
        "price": 140.0,
        "prescription_required": True,
        "category": "Antiallergic",
        "max_per_order": 60,
        "manufacturer": "Cipla",
        "description": "Combination for allergic rhinitis and asthma maintenance.",
        "active_ingredients": [
            {"molecule": "Montelukast", "strength_mg": 10, "strength_unit": "mg"},
            {"molecule": "Levocetirizine", "strength_mg": 5, "strength_unit": "mg"},
        ],
        "atc_code": "R03DC03",
        "counseling_info": {
            "food_timing": "any",
            "food_note": "Take at bedtime for best effect. Can be taken with or without food.",
            "drowsiness": True,
            "drowsiness_note": "Levocetirizine may cause drowsiness. Take at bedtime. Avoid driving after taking.",
            "alcohol_warning": True,
            "alcohol_note": "Alcohol increases drowsiness — avoid while taking this combination",
            "storage": "Store below 25°C, protect from moisture and light",
            "common_side_effects": ["drowsiness", "dry mouth", "headache", "stomach pain"],
            "missed_dose_action": "Take as soon as you remember. Skip if next dose is near.",
            "is_antibiotic": False,
            "course_completion_critical": False,
        },
    },
]

INVENTORY_STOCK = {
    "Crocin 500mg": 200,
    "Dolo 650mg": 150,
    "Amlodipine 5mg": 30,
    "Telma 40mg": 80,
    "Metformin 500mg": 100,
    "Glycomet GP 2": 50,
    "Azithromycin 500mg": 40,
    "Cetirizine 10mg": 300,
    "Pantoprazole 40mg": 120,
    "Atorvastatin 10mg": 60,
    "Ecosprin 75mg": 250,
    "Montair LC": 0,
}


async def seed_database():
    """Drop and recreate all tables, then seed deterministic demo data."""
    engine = create_async_engine(settings.database_url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        medicine_map: dict[str, uuid.UUID] = {}
        for med_data in MEDICINES:
            med_id = uuid.uuid4()
            medicine_map[med_data["name"]] = med_id
            db.add(Medicine(medicine_id=med_id, **med_data))

        for med_name, stock in INVENTORY_STOCK.items():
            db.add(
                Inventory(
                    medicine_id=medicine_map[med_name],
                    stock_quantity=stock,
                    unit_type="strips",
                    min_stock_threshold=20,
                )
            )

        user_ids: dict[str, uuid.UUID] = {}
        for user_data in USERS:
            user_id = uuid.UUID(user_data["user_id"])
            user_ids[user_data["email"]] = user_id
            db.add(
                User(
                    user_id=user_id,
                    name=user_data["name"],
                    email=user_data["email"],
                    password_hash=hash_password(DEMO_PASSWORD),
                    role=user_data["role"],
                    phone=user_data["phone"],
                    address={"city": "Mumbai", "state": "Maharashtra", "pin": "400001"},
                )
            )

        await db.flush()
        now = datetime.now(timezone.utc)

        # Aarav profile/history
        db.add(
            UserProfile(
                user_id=user_ids["aarav@demo.com"],
                chronic_conditions=["hypertension"],
                medication_patterns=[
                    {
                        "medicine_id": str(medicine_map["Amlodipine 5mg"]),
                        "type": "continuous",
                        "avg_interval_days": 30,
                        "order_count": 6,
                        "last_order": (now - timedelta(days=25)).isoformat(),
                        "refill_confidence": "high",
                    }
                ],
                alert_responsiveness=0.85,
                preferred_brands=["Cipla", "Sun Pharma"],
                side_effects=[],
                medical_facts=[
                    {
                        "fact_type": "allergy",
                        "value": "Penicillin",
                        "confidence": 0.95,
                        "status": "active",
                        "source": "seed"
                    }
                ],
            )
        )
        for months_ago in [6, 5, 4, 3, 2, 1]:
            db.add(
                OrderHistory(
                    user_id=user_ids["aarav@demo.com"],
                    medicine_id=medicine_map["Amlodipine 5mg"],
                    quantity=30,
                    order_date=now - timedelta(days=months_ago * 30),
                    dosage_frequency="once_daily",
                )
            )

        # Priya profile/history
        db.add(
            UserProfile(
                user_id=user_ids["priya@demo.com"],
                chronic_conditions=["diabetes_type_2"],
                medication_patterns=[
                    {
                        "medicine_id": str(medicine_map["Metformin 500mg"]),
                        "type": "continuous",
                        "avg_interval_days": 28,
                        "order_count": 5,
                        "last_order": (now - timedelta(days=22)).isoformat(),
                        "refill_confidence": "high",
                    }
                ],
                alert_responsiveness=0.7,
                preferred_brands=["USV"],
                side_effects=["mild_nausea"],
                medical_facts=[
                    {
                        "fact_type": "condition",
                        "value": "Pregnant (2nd Trimester)",
                        "confidence": 0.90,
                        "status": "active",
                        "source": "seed"
                    }
                ],
            )
        )
        for months_ago in [5, 4, 3, 2, 1]:
            db.add(
                OrderHistory(
                    user_id=user_ids["priya@demo.com"],
                    medicine_id=medicine_map["Metformin 500mg"],
                    quantity=60,
                    order_date=now - timedelta(days=months_ago * 28),
                    dosage_frequency="twice_daily",
                )
            )

        # Rahul profile/history
        db.add(
            UserProfile(
                user_id=user_ids["rahul@demo.com"],
                chronic_conditions=[],
                medication_patterns=[
                    {
                        "medicine_name": "Crocin 500mg",
                        "type": "as-needed",
                        "avg_refill_interval_days": 90,
                        "last_order_date": (now - timedelta(days=45)).isoformat(),
                        "refill_confidence": "low",
                    }
                ],
                alert_responsiveness=0.3,
                preferred_brands=[],
                side_effects=[],
                medical_facts=[],
            )
        )
        db.add(
            OrderHistory(
                user_id=user_ids["rahul@demo.com"],
                medicine_id=medicine_map["Crocin 500mg"],
                quantity=10,
                order_date=now - timedelta(days=45),
                dosage_frequency="as_needed",
            )
        )

        db.add(
            UserMemory(
                user_id=user_ids["aarav@demo.com"],
                summary_text="Prefers concise medicine options, tracks BP meds, usually reorders monthly.",
                turns_since_refresh=0,
            )
        )

        db.add(
            Order(
                user_id=user_ids["aarav@demo.com"],
                status="confirmed",
                total_amount=1350.0,
                items=[
                    {
                        "name": "Amlodipine 5mg",
                        "medicine_id": str(medicine_map["Amlodipine 5mg"]),
                        "quantity": 30,
                        "billing_qty": 30,
                        "unit_price": 45.0,
                        "subtotal": 1350.0,
                    }
                ],
                trace_id="demo-trace-001",
                payment_method="upi",
                razorpay_payment_id="pay_demo_001",
            )
        )
        db.add(
            Order(
                user_id=user_ids["priya@demo.com"],
                status="confirmed",
                total_amount=1500.0,
                items=[
                    {
                        "name": "Metformin 500mg",
                        "medicine_id": str(medicine_map["Metformin 500mg"]),
                        "quantity": 60,
                        "billing_qty": 60,
                        "unit_price": 25.0,
                        "subtotal": 1500.0,
                    }
                ],
                trace_id="demo-trace-002",
                payment_method="card",
                razorpay_payment_id="pay_demo_002",
            )
        )

        db.add_all(
            [
                RefillAlert(
                    user_id=user_ids["aarav@demo.com"],
                    medicine_id=medicine_map["Amlodipine 5mg"],
                    estimated_run_out=now + timedelta(days=5),
                    confidence=0.92,
                    status="pending",
                ),
                RefillAlert(
                    user_id=user_ids["priya@demo.com"],
                    medicine_id=medicine_map["Metformin 500mg"],
                    estimated_run_out=now + timedelta(days=6),
                    confidence=0.88,
                    status="pending",
                ),
            ]
        )

        db.add(
            Prescription(
                user_id=user_ids["aarav@demo.com"],
                image_url="/uploads/prescriptions/demo-rx.jpg",
                extracted_data={
                    "medicines": [
                        {"name": "Amlodipine 5mg", "dosage": "5mg", "frequency": "once daily"},
                        {"name": "Ecosprin 75mg", "dosage": "75mg", "frequency": "once daily"},
                    ],
                    "doctor_name": "Dr. Mehra",
                    "prescription_date": (now - timedelta(days=10)).strftime("%Y-%m-%d"),
                    "confidence": 0.95,
                },
                verified=True,
            )
        )

        await db.commit()

    await engine.dispose()

    print("\nDatabase seeded successfully.")
    print(f"   - {len(USERS)} users created (3 users + 1 admin)")
    print(f"   - {len(MEDICINES)} medicines loaded")
    print(f"   - {len(INVENTORY_STOCK)} inventory records")
    print("\nSeed credentials (local only):")
    print(f"   Password for all accounts: {DEMO_PASSWORD}")
    for user in USERS:
        print(f"   {user['email']} ({user['role']}) -> {user['user_id']}")


if __name__ == "__main__":
    asyncio.run(seed_database())
