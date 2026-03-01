import httpx
import asyncio

async def test():
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post('http://127.0.0.1:8000/api/chat', json={
            'message': 'Okay, I want Cetirizine 10 mg and Dolo 650 mg, four strips of both.',
            'history': [],
            'conversation_id': 'test'
        })
        print(resp.json())

asyncio.run(test())
