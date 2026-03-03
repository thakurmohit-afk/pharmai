"""Reset and seed local database with demo users, inventory, and history."""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.database import Base
from app.models.chat import UserMemory
from app.models.dispensing_log import DispensingLog
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
            "food_note": "Take at bedtime for best effect.",
            "drowsiness": True,
            "drowsiness_note": "Levocetirizine may cause drowsiness.",
            "alcohol_warning": True,
            "alcohol_note": "Alcohol increases drowsiness",
            "storage": "Store below 25°C",
            "common_side_effects": ["drowsiness", "dry mouth", "headache"],
            "missed_dose_action": "Take as soon as you remember. Skip if next dose is near.",
            "is_antibiotic": False,
            "course_completion_critical": False,
        },
    },
    # ── NEW: OTC Medicines ──
    {
        "name": "Ibuprofen 400mg",
        "generic_name": "Ibuprofen",
        "salt": "Ibuprofen 400mg",
        "dosage": "400mg",
        "pack_sizes": [10, 15],
        "price": 32.0,
        "prescription_required": False,
        "category": "NSAID",
        "max_per_order": 30,
        "manufacturer": "Cipla",
        "description": "Non-steroidal anti-inflammatory drug for pain, fever, and inflammation.",
        "active_ingredients": [{"molecule": "Ibuprofen", "strength_mg": 400, "strength_unit": "mg"}],
        "atc_code": "M01AE01",
        "counseling_info": {"food_timing": "after_food", "food_note": "Take after meals to reduce stomach irritation", "drowsiness": False, "alcohol_warning": True, "alcohol_note": "Alcohol increases stomach bleeding risk", "storage": "Store below 25°C", "common_side_effects": ["stomach upset", "heartburn", "dizziness"], "missed_dose_action": "Take as soon as you remember.", "is_antibiotic": False, "course_completion_critical": False},
    },
    {
        "name": "Allegra 120mg",
        "generic_name": "Fexofenadine",
        "salt": "Fexofenadine 120mg",
        "dosage": "120mg",
        "pack_sizes": [10, 30],
        "price": 160.0,
        "prescription_required": False,
        "category": "Antihistamine",
        "max_per_order": 30,
        "manufacturer": "Sanofi",
        "description": "Non-drowsy antihistamine for allergies, hay fever, and hives.",
        "active_ingredients": [{"molecule": "Fexofenadine", "strength_mg": 120, "strength_unit": "mg"}],
        "atc_code": "R06AX26",
        "counseling_info": {"food_timing": "any", "food_note": "Can be taken with or without food", "drowsiness": False, "alcohol_warning": False, "storage": "Store below 25°C", "common_side_effects": ["headache", "nausea"], "missed_dose_action": "Take as soon as you remember.", "is_antibiotic": False, "course_completion_critical": False},
    },
    {
        "name": "ORS Electral Powder",
        "generic_name": "Oral Rehydration Salts",
        "salt": "Sodium + Potassium + Glucose",
        "dosage": "21.8g sachet",
        "pack_sizes": [1, 5, 10],
        "price": 22.0,
        "prescription_required": False,
        "category": "Rehydration",
        "max_per_order": 50,
        "manufacturer": "FDC",
        "description": "Oral Rehydration Salt for dehydration from diarrhea, vomiting and heat.",
        "active_ingredients": [{"molecule": "Oral Rehydration Salts", "strength_mg": None, "strength_unit": None}],
        "atc_code": "A07CA",
        "counseling_info": {"food_timing": "any", "food_note": "Dissolve in 1 litre of clean water and sip", "drowsiness": False, "alcohol_warning": False, "storage": "Store in cool dry place", "common_side_effects": ["mild nausea"], "missed_dose_action": "Not applicable — use as needed.", "is_antibiotic": False, "course_completion_critical": False},
    },
    {
        "name": "Vicks Action 500",
        "generic_name": "Paracetamol + Phenylephrine + Caffeine",
        "salt": "Paracetamol 500mg + Phenylephrine 10mg + Caffeine 25mg",
        "dosage": "500/10/25mg",
        "pack_sizes": [10, 20],
        "price": 40.0,
        "prescription_required": False,
        "category": "Cold & Flu",
        "max_per_order": 30,
        "manufacturer": "P&G Health",
        "description": "Multi-symptom relief for cold, headache, body ache and nasal congestion.",
        "active_ingredients": [{"molecule": "Paracetamol", "strength_mg": 500, "strength_unit": "mg"}, {"molecule": "Phenylephrine", "strength_mg": 10, "strength_unit": "mg"}],
        "atc_code": "N02BE51",
        "counseling_info": {"food_timing": "any", "food_note": "Can be taken with or without food", "drowsiness": True, "drowsiness_note": "May cause mild drowsiness", "alcohol_warning": True, "alcohol_note": "Avoid alcohol", "storage": "Store below 30°C", "common_side_effects": ["drowsiness", "nausea", "dry mouth"], "missed_dose_action": "Take as needed.", "is_antibiotic": False, "course_completion_critical": False},
    },
    {
        "name": "Strepsils Lozenges",
        "generic_name": "Dichlorobenzyl Alcohol + Amylmetacresol",
        "salt": "2,4-Dichlorobenzyl alcohol 1.2mg + Amylmetacresol 0.6mg",
        "dosage": "1 lozenge",
        "pack_sizes": [8, 24],
        "price": 50.0,
        "prescription_required": False,
        "category": "Throat Care",
        "max_per_order": 48,
        "manufacturer": "Reckitt",
        "description": "Medicated lozenges for sore throat and throat infection relief.",
        "active_ingredients": [{"molecule": "Amylmetacresol", "strength_mg": 0.6, "strength_unit": "mg"}],
        "atc_code": "R02AA20",
        "counseling_info": {"food_timing": "any", "food_note": "Dissolve slowly in the mouth", "drowsiness": False, "alcohol_warning": False, "storage": "Store below 25°C", "common_side_effects": [], "missed_dose_action": "Use as needed, max 8 per day.", "is_antibiotic": False, "course_completion_critical": False},
    },
    {
        "name": "Betadine 10% Ointment",
        "generic_name": "Povidone Iodine",
        "salt": "Povidone Iodine 10%",
        "dosage": "15g tube",
        "pack_sizes": [1],
        "price": 75.0,
        "prescription_required": False,
        "category": "Antiseptic",
        "max_per_order": 5,
        "manufacturer": "Win Medicare",
        "description": "Antiseptic ointment for wound care, cuts, and minor infections.",
        "active_ingredients": [{"molecule": "Povidone Iodine", "strength_mg": None, "strength_unit": "%"}],
        "atc_code": "D08AG02",
        "counseling_info": {"food_timing": "any", "food_note": "For external use only", "drowsiness": False, "alcohol_warning": False, "storage": "Store below 25°C", "common_side_effects": ["skin irritation (rare)"], "missed_dose_action": "Apply as needed.", "is_antibiotic": False, "course_completion_critical": False},
    },
    {
        "name": "Volini Spray",
        "generic_name": "Diclofenac Diethylamine",
        "salt": "Diclofenac Diethylamine 1.16%",
        "dosage": "55g spray",
        "pack_sizes": [1],
        "price": 215.0,
        "prescription_required": False,
        "category": "Topical Pain Relief",
        "max_per_order": 3,
        "manufacturer": "Sun Pharma",
        "description": "Topical spray for muscle pain, sprains, back pain and joint pain.",
        "active_ingredients": [{"molecule": "Diclofenac", "strength_mg": None, "strength_unit": "%"}],
        "atc_code": "M02AA15",
        "counseling_info": {"food_timing": "any", "food_note": "For external use only. Do not apply on broken skin.", "drowsiness": False, "alcohol_warning": False, "storage": "Store below 30°C", "common_side_effects": ["skin redness", "tingling"], "missed_dose_action": "Apply when needed.", "is_antibiotic": False, "course_completion_critical": False},
    },
    {
        "name": "Loperamide 2mg",
        "generic_name": "Loperamide",
        "salt": "Loperamide Hydrochloride 2mg",
        "dosage": "2mg",
        "pack_sizes": [4, 10],
        "price": 28.0,
        "prescription_required": False,
        "category": "Anti-Diarrheal",
        "max_per_order": 20,
        "manufacturer": "Johnson & Johnson",
        "description": "Stops acute diarrhea and reduces stool frequency.",
        "active_ingredients": [{"molecule": "Loperamide", "strength_mg": 2, "strength_unit": "mg"}],
        "atc_code": "A07DA03",
        "counseling_info": {"food_timing": "any", "food_note": "Can be taken with or without food", "drowsiness": True, "drowsiness_note": "May cause slight dizziness", "alcohol_warning": True, "alcohol_note": "Avoid alcohol", "storage": "Store below 25°C", "common_side_effects": ["constipation", "dizziness", "nausea"], "missed_dose_action": "Take as needed.", "is_antibiotic": False, "course_completion_critical": False},
    },
    # ── NEW: Vitamins & Supplements ──
    {
        "name": "Shelcal 500mg",
        "generic_name": "Calcium Carbonate + Vitamin D3",
        "salt": "Calcium 500mg + Vitamin D3 250IU",
        "dosage": "500mg",
        "pack_sizes": [15, 30],
        "price": 130.0,
        "prescription_required": False,
        "category": "Supplement",
        "max_per_order": 90,
        "manufacturer": "Torrent",
        "description": "Calcium and Vitamin D supplement for bone health.",
        "active_ingredients": [{"molecule": "Calcium Carbonate", "strength_mg": 500, "strength_unit": "mg"}, {"molecule": "Vitamin D3", "strength_mg": 250, "strength_unit": "IU"}],
        "atc_code": "A12AX",
        "counseling_info": {"food_timing": "after_food", "food_note": "Take after meals for better absorption", "drowsiness": False, "alcohol_warning": False, "storage": "Store below 25°C", "common_side_effects": ["constipation", "gas"], "missed_dose_action": "Take as soon as you remember.", "is_antibiotic": False, "course_completion_critical": False},
    },
    {
        "name": "Becosules Capsules",
        "generic_name": "B-Complex + Vitamin C",
        "salt": "B-Complex with Vitamin C",
        "dosage": "1 capsule",
        "pack_sizes": [20, 30],
        "price": 35.0,
        "prescription_required": False,
        "category": "Supplement",
        "max_per_order": 60,
        "manufacturer": "Pfizer",
        "description": "Daily B-vitamin complex with Vitamin C for energy and immunity.",
        "active_ingredients": [{"molecule": "Vitamin B Complex", "strength_mg": None, "strength_unit": None}, {"molecule": "Vitamin C", "strength_mg": 150, "strength_unit": "mg"}],
        "atc_code": "A11BA",
        "counseling_info": {"food_timing": "after_food", "food_note": "Take after breakfast", "drowsiness": False, "alcohol_warning": False, "storage": "Store below 25°C", "common_side_effects": ["bright yellow urine (harmless)"], "missed_dose_action": "Take the next day.", "is_antibiotic": False, "course_completion_critical": False},
    },
    {
        "name": "Limcee 500mg",
        "generic_name": "Vitamin C (Ascorbic Acid)",
        "salt": "Ascorbic Acid 500mg",
        "dosage": "500mg",
        "pack_sizes": [15, 30],
        "price": 25.0,
        "prescription_required": False,
        "category": "Supplement",
        "max_per_order": 60,
        "manufacturer": "Abbott",
        "description": "Chewable Vitamin C tablet for immunity and antioxidant support.",
        "active_ingredients": [{"molecule": "Ascorbic Acid", "strength_mg": 500, "strength_unit": "mg"}],
        "atc_code": "A11GA01",
        "counseling_info": {"food_timing": "any", "food_note": "Chew and swallow. Can be taken any time.", "drowsiness": False, "alcohol_warning": False, "storage": "Store below 25°C", "common_side_effects": ["stomach upset at high doses"], "missed_dose_action": "Take the next day.", "is_antibiotic": False, "course_completion_critical": False},
    },
    {
        "name": "Zincovit Tablets",
        "generic_name": "Multivitamin + Multimineral + Zinc",
        "salt": "Zinc + Vitamins + Minerals",
        "dosage": "1 tablet",
        "pack_sizes": [15, 30],
        "price": 95.0,
        "prescription_required": False,
        "category": "Supplement",
        "max_per_order": 60,
        "manufacturer": "Apex Labs",
        "description": "Complete multivitamin with zinc for daily nutritional support.",
        "active_ingredients": [{"molecule": "Zinc", "strength_mg": 22, "strength_unit": "mg"}, {"molecule": "Multivitamin", "strength_mg": None, "strength_unit": None}],
        "atc_code": "A11AA04",
        "counseling_info": {"food_timing": "after_food", "food_note": "Take after lunch or dinner", "drowsiness": False, "alcohol_warning": False, "storage": "Store below 25°C", "common_side_effects": ["nausea on empty stomach"], "missed_dose_action": "Take the next day.", "is_antibiotic": False, "course_completion_critical": False},
    },
    {
        "name": "Supradyn Daily Multivitamin",
        "generic_name": "Multivitamin + Mineral",
        "salt": "Vitamins A, B, C, D, E + Iron + Zinc",
        "dosage": "1 tablet",
        "pack_sizes": [15, 30],
        "price": 50.0,
        "prescription_required": False,
        "category": "Supplement",
        "max_per_order": 60,
        "manufacturer": "Abbott",
        "description": "Effervescent multivitamin for energy, immunity and overall health.",
        "active_ingredients": [{"molecule": "Multivitamin + Minerals", "strength_mg": None, "strength_unit": None}],
        "atc_code": "A11AA02",
        "counseling_info": {"food_timing": "any", "food_note": "Dissolve in water and drink", "drowsiness": False, "alcohol_warning": False, "storage": "Store below 25°C", "common_side_effects": ["mild stomach upset"], "missed_dose_action": "Take the next day.", "is_antibiotic": False, "course_completion_critical": False},
    },
    # ── NEW: Skincare / Non-Medicinal ──
    {
        "name": "Neutrogena Ultra Sheer SPF 50+",
        "generic_name": "Sunscreen SPF 50+",
        "salt": "Avobenzone + Homosalate + Octisalate",
        "dosage": "88ml",
        "pack_sizes": [1],
        "price": 650.0,
        "prescription_required": False,
        "category": "Skincare",
        "max_per_order": 3,
        "manufacturer": "Johnson & Johnson",
        "description": "Lightweight, non-greasy sunscreen with SPF 50+ and PA+++ for daily sun protection.",
        "active_ingredients": [{"molecule": "Avobenzone", "strength_mg": None, "strength_unit": "%"}],
        "atc_code": "D02BA",
        "counseling_info": {"food_timing": "any", "food_note": "Apply generously 15 min before sun exposure. Reapply every 2 hours.", "drowsiness": False, "alcohol_warning": False, "storage": "Store below 30°C", "common_side_effects": ["skin sensitivity (rare)"], "missed_dose_action": "Apply whenever going outdoors.", "is_antibiotic": False, "course_completion_critical": False},
    },
    {
        "name": "Lacto Calamine Lotion",
        "generic_name": "Calamine + Zinc + Aloe",
        "salt": "Calamine + Zinc Oxide",
        "dosage": "120ml",
        "pack_sizes": [1],
        "price": 150.0,
        "prescription_required": False,
        "category": "Skincare",
        "max_per_order": 5,
        "manufacturer": "Piramal",
        "description": "Oil-control lotion for acne, pimples and oily skin. Soothes and moisturises.",
        "active_ingredients": [{"molecule": "Calamine", "strength_mg": None, "strength_unit": None}, {"molecule": "Zinc Oxide", "strength_mg": None, "strength_unit": None}],
        "atc_code": "D02AB",
        "counseling_info": {"food_timing": "any", "food_note": "For external use only. Apply on clean face.", "drowsiness": False, "alcohol_warning": False, "storage": "Store below 30°C", "common_side_effects": [], "missed_dose_action": "Apply as part of routine.", "is_antibiotic": False, "course_completion_critical": False},
    },
    {
        "name": "Cipla Rivela SPF 50 Sunscreen",
        "generic_name": "Sunscreen SPF 50",
        "salt": "Titanium Dioxide + Zinc Oxide",
        "dosage": "50ml",
        "pack_sizes": [1],
        "price": 520.0,
        "prescription_required": False,
        "category": "Skincare",
        "max_per_order": 3,
        "manufacturer": "Cipla",
        "description": "Dermat-recommended mineral sunscreen with broad spectrum UVA/UVB protection.",
        "active_ingredients": [{"molecule": "Titanium Dioxide", "strength_mg": None, "strength_unit": "%"}, {"molecule": "Zinc Oxide", "strength_mg": None, "strength_unit": "%"}],
        "atc_code": "D02BA",
        "counseling_info": {"food_timing": "any", "food_note": "Apply 20 min before sun exposure", "drowsiness": False, "alcohol_warning": False, "storage": "Store below 30°C", "common_side_effects": ["white cast"], "missed_dose_action": "Apply whenever outdoors.", "is_antibiotic": False, "course_completion_critical": False},
    },
    # ── NEW: Prescription Specialties ──
    {
        "name": "Thyronorm 50mcg",
        "generic_name": "Levothyroxine",
        "salt": "Levothyroxine Sodium 50mcg",
        "dosage": "50mcg",
        "pack_sizes": [30, 100],
        "price": 110.0,
        "prescription_required": True,
        "category": "Thyroid",
        "max_per_order": 100,
        "manufacturer": "Abbott",
        "description": "Thyroid hormone replacement for hypothyroidism.",
        "active_ingredients": [{"molecule": "Levothyroxine", "strength_mg": 0.05, "strength_unit": "mg"}],
        "atc_code": "H03AA01",
        "counseling_info": {"food_timing": "before_food", "food_note": "Take on empty stomach 30 min before breakfast", "drowsiness": False, "alcohol_warning": False, "storage": "Store below 25°C, protect from light", "common_side_effects": ["palpitations", "weight changes", "sweating"], "missed_dose_action": "Take as soon as you remember. Skip if almost time for next dose.", "is_antibiotic": False, "course_completion_critical": False},
    },
    {
        "name": "Losartan 50mg",
        "generic_name": "Losartan Potassium",
        "salt": "Losartan 50mg",
        "dosage": "50mg",
        "pack_sizes": [10, 30],
        "price": 80.0,
        "prescription_required": True,
        "category": "Antihypertensive",
        "max_per_order": 90,
        "manufacturer": "Zydus",
        "description": "ARB for hypertension and diabetic kidney protection.",
        "active_ingredients": [{"molecule": "Losartan", "strength_mg": 50, "strength_unit": "mg"}],
        "atc_code": "C09CA01",
        "counseling_info": {"food_timing": "any", "food_note": "Take at the same time daily", "drowsiness": True, "drowsiness_note": "May cause dizziness initially", "alcohol_warning": True, "alcohol_note": "Alcohol may worsen dizziness", "storage": "Store below 25°C", "common_side_effects": ["dizziness", "fatigue", "cough"], "missed_dose_action": "Take as soon as you remember.", "is_antibiotic": False, "course_completion_critical": False},
    },
    {
        "name": "Rosuvastatin 10mg",
        "generic_name": "Rosuvastatin",
        "salt": "Rosuvastatin 10mg",
        "dosage": "10mg",
        "pack_sizes": [10, 30],
        "price": 135.0,
        "prescription_required": True,
        "category": "Statin",
        "max_per_order": 90,
        "manufacturer": "AstraZeneca",
        "description": "Statin for lowering cholesterol and reducing cardiovascular risk.",
        "active_ingredients": [{"molecule": "Rosuvastatin", "strength_mg": 10, "strength_unit": "mg"}],
        "atc_code": "C10AA07",
        "counseling_info": {"food_timing": "any", "food_note": "Take at night for best effect", "drowsiness": False, "alcohol_warning": True, "alcohol_note": "Limit alcohol — affects the liver", "storage": "Store below 25°C", "common_side_effects": ["muscle pain", "headache", "nausea"], "missed_dose_action": "Take as soon as you remember.", "is_antibiotic": False, "course_completion_critical": False},
    },
    {
        "name": "Clopidogrel 75mg",
        "generic_name": "Clopidogrel",
        "salt": "Clopidogrel 75mg",
        "dosage": "75mg",
        "pack_sizes": [10, 30],
        "price": 60.0,
        "prescription_required": True,
        "category": "Antiplatelet",
        "max_per_order": 90,
        "manufacturer": "Sun Pharma",
        "description": "Blood thinner to prevent clots, heart attacks and strokes.",
        "active_ingredients": [{"molecule": "Clopidogrel", "strength_mg": 75, "strength_unit": "mg"}],
        "atc_code": "B01AC04",
        "counseling_info": {"food_timing": "any", "food_note": "Take at the same time each day", "drowsiness": False, "alcohol_warning": True, "alcohol_note": "Alcohol increases bleeding risk", "storage": "Store below 25°C", "common_side_effects": ["easy bruising", "stomach pain", "diarrhea"], "missed_dose_action": "Take as soon as you remember. Do not double.", "is_antibiotic": False, "course_completion_critical": False},
    },
]

INVENTORY_STOCK = {
    # Original medicines
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
    # OTC Medicines
    "Ibuprofen 400mg": 180,
    "Allegra 120mg": 90,
    "ORS Electral Powder": 500,
    "Vicks Action 500": 200,
    "Strepsils Lozenges": 350,
    "Betadine 10% Ointment": 60,
    "Volini Spray": 40,
    "Loperamide 2mg": 150,
    # Vitamins & Supplements
    "Shelcal 500mg": 120,
    "Becosules Capsules": 200,
    "Limcee 500mg": 250,
    "Zincovit Tablets": 100,
    "Supradyn Daily Multivitamin": 80,
    # Skincare / Non-Medicinal
    "Neutrogena Ultra Sheer SPF 50+": 25,
    "Lacto Calamine Lotion": 45,
    "Cipla Rivela SPF 50 Sunscreen": 30,
    # Prescription Specialties
    "Thyronorm 50mcg": 70,
    "Losartan 50mg": 55,
    "Rosuvastatin 10mg": 40,
    "Clopidogrel 75mg": 65,
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
        # ── Mock DispensingLog data (90 days) for ML predictions ──
        import random
        random.seed(42)  # deterministic

        # Top dispensed medicines with base daily volumes
        dispensing_meds = [
            ("Crocin 500mg", 8),
            ("Dolo 650mg", 6),
            ("Cetirizine 10mg", 5),
            ("Pantoprazole 40mg", 4),
            ("Amlodipine 5mg", 3),
            ("Metformin 500mg", 4),
            ("Ecosprin 75mg", 3),
            ("Ibuprofen 400mg", 5),
            ("ORS Electral Powder", 7),
            ("Vicks Action 500", 4),
            ("Azithromycin 500mg", 2),
            ("Limcee 500mg", 3),
            ("Becosules Capsules", 3),
            ("Shelcal 500mg", 2),
            ("Neutrogena Ultra Sheer SPF 50+", 1),
            ("Volini Spray", 2),
            ("Strepsils Lozenges", 4),
            ("Thyronorm 50mcg", 2),
            ("Losartan 50mg", 2),
            ("Atorvastatin 10mg", 2),
        ]

        demo_users = list(user_ids.values())
        for days_ago in range(90, 0, -1):
            log_time = now - timedelta(days=days_ago, hours=random.randint(8, 18))
            # Pick a random subset of medicines dispensed that day
            day_meds = []
            for med_name, base_vol in dispensing_meds:
                if med_name not in medicine_map:
                    continue
                # Randomize daily volume (0 to 2x base)
                qty = random.randint(0, base_vol * 2)
                if qty > 0:
                    day_meds.append({
                        "medicine_id": str(medicine_map[med_name]),
                        "medicine_name": med_name,
                        "quantity": qty,
                        "billing_qty": qty,
                    })

            if day_meds:
                db.add(DispensingLog(
                    order_id=f"seed-disp-{days_ago:03d}",
                    user_id=str(random.choice(demo_users)),
                    timestamp=log_time,
                    medicines_dispensed=day_meds,
                    safety_decision="allow",
                    safety_warnings_surfaced=[],
                    clinical_checks_passed={"interaction_check": True, "allergy_check": True},
                    counseling_provided=[],
                    pharmacist_escalation_required=False,
                    trace_id=f"seed-trace-{days_ago:03d}",
                ))

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
