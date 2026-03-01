import asyncio
import json
from app.database import async_session_maker
from app.services.user_service import get_user_profile
from app.agents.pharmacist import pharmacist_chat

async def test_agent():
    async with async_session_maker() as db:
        # Use Priya's ID (she has Pregnant medical fact from seed data)
        user_id = "fddcb7b6-2995-4eb7-a2e3-2df541d62fc6"
        
        # Load profile
        profile = await get_user_profile(user_id, db)
        profile["exists"] = True
        
        print("--- Loaded Profile Facts ---")
        for f in profile.get('medical_facts', []):
            print(f)
            
        print("\n--- Testing Agent Interaction ---")
        # Ask for something contrainidicated in pregnancy, like strong NSAIDs (Ecosprin)
        message = "Can I order 1 strip of Ecosprin 75mg? I want to buy it."
        
        response = await pharmacist_chat(
            message=message,
            conversation_history=[],
            user_profile=profile,
            db=db,
            user_id=user_id
        )
        
        print("\n--- Agent Response ---")
        print(json.dumps(response, indent=2))

if __name__ == "__main__":
    asyncio.run(test_agent())
