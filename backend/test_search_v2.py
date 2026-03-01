
import asyncio
from app.services.medicine_search import search_medicines, init_search_engine

async def test():
    print("Initializing search engine...")
    await init_search_engine()
    
    print("Searching for 'fever'...")
    results = await search_medicines("fever", top_k=1)
    for r in results:
        print(f"Name: {r['name']}, Relevance: {r['relevance_score']}")

    print("\nSearching for 'im feeling feverish'...")
    results = await search_medicines("im feeling feverish", top_k=1)
    for r in results:
        print(f"Name: {r['name']}, Relevance: {r['relevance_score']}")

if __name__ == "__main__":
    asyncio.run(test())
