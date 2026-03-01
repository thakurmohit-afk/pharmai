import asyncio
import sys
sys.path.insert(0, ".")
from app.database import engine, Base
from app.models import user, chat

async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created OK")

asyncio.run(init())
