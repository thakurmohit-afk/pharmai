import json
import logging
from app.services.openai_client import get_async_openai_client
from app.services.user_service import get_user_profile, update_user_profile
from app.database import async_session_factory

logger = logging.getLogger(__name__)

def build_watcher_prompt() -> str:
    return """You are the 'Watcher Agent', an orchestrator running silently in the background of a pharmacy AI chat.
Your job is to read the conversation transcript and extract any implicitly stated 'Medical Facts' about the user.
Ignore explicitly filled out form data, focus only on what the user says in natural language.

A 'Medical Fact' is:
- An allergy ("I'm allergic to peanuts")
- A physical condition ("I am pregnant", "I have asthma", "I just had surgery")
- A lifestyle factor ("I smoke everyday", "I am a vegan")

If you find ANY facts, return them in a JSON list format. 
If there are no new facts, return an empty list `[]`.

Format EXPECTED (JSON array of objects):
[
  {
    "fact_type": "allergy|condition|lifestyle",
    "value": "string",
    "confidence": 0.0-1.0,
    "status": "active"
  }
]
"""

async def extract_and_store_facts(user_id: str, transcript: str):
    """Runs in the background. Analyzes transcript, finds facts, updates DB."""
    try:
        if not transcript.strip():
            return
            
        system_prompt = build_watcher_prompt()
        prompt = f"Transcript:\n{transcript}\n\nOutput JSON list ONLY:"
        
        # We can use a faster/cheaper model for this if desired, but we'll stick to our default LLM service
        client = get_async_openai_client()
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            temperature=0.0
        )
        response_text = response.choices[0].message.content or "[]"
        
        try:
            extracted_facts = json.loads(response_text)
            if not isinstance(extracted_facts, list) or len(extracted_facts) == 0:
                return # Nothing found
        except json.JSONDecodeError:
            logger.error(f"Watcher Agent failed to parse JSON: {response_text}")
            return
            
        async with async_session_factory() as db:
            # Load existing facts
            profile = await get_user_profile(user_id, db)
            existing_facts = profile.get("medical_facts", []) or []
            
            # Simple deduplication (don't add if value already exists)
            existing_values = {f.get("value", "").lower() for f in existing_facts}
            
            new_facts_added = False
            for fact in extracted_facts:
                val = fact.get("value", "").lower()
                if val and val not in existing_values:
                    fact["source"] = "watcher_agent"
                    existing_facts.append(fact)
                    new_facts_added = True
                    
            if new_facts_added:
                logger.info(f"Watcher Agent found new facts for user {user_id}: {extracted_facts}")
                await update_user_profile(user_id, {"medical_facts": existing_facts}, db)
                
    except Exception as e:
        logger.error(f"Watcher Agent Error: {e}")
