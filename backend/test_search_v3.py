
import asyncio
import sys
import os

# Add backend directory to sys.path
sys.path.append(os.getcwd())

from app.services.medicine_search import search_medicines, init_medicine_search

async def test():
    print("Initializing Search...")
    # init_medicine_search manages DB session internally
    try:
        await init_medicine_search()
        print("Search initialized.")
    except Exception as e:
        print(f"Initialization failed: {e}")
        return

    query = "fever"
    print(f"Searching for '{query}'...")
    results = await search_medicines(query, top_k=5)
    
    print(f"Found {len(results)} results.")
    for r in results:
        print(f" - {r['name']} (Score: {r.get('relevance_score')}, Stock: {r.get('in_stock')})")

if __name__ == "__main__":
    asyncio.run(test())
