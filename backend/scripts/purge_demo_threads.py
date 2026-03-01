"""Purge demo-user chat threads/messages/state without resetting full database.

Usage:
  python scripts/purge_demo_threads.py
  python scripts/purge_demo_threads.py --include-memory
  python scripts/purge_demo_threads.py --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from sqlalchemy import delete, func, select

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.database import async_session_factory
from app.models.chat import ChatMessage, ChatThread, ChatThreadState, UserMemory
from app.models.user import User
from app.redis_client import check_redis_and_fallback, clear_runtime_cache, close_redis


async def _count_rows_for_threads(db, thread_ids: list) -> dict[str, int]:
    if not thread_ids:
        return {"threads": 0, "messages": 0, "thread_state": 0}

    message_count = await db.scalar(
        select(func.count(ChatMessage.message_id)).where(ChatMessage.thread_id.in_(thread_ids))
    )
    state_count = await db.scalar(
        select(func.count(ChatThreadState.thread_id)).where(ChatThreadState.thread_id.in_(thread_ids))
    )
    thread_count = await db.scalar(
        select(func.count(ChatThread.thread_id)).where(ChatThread.thread_id.in_(thread_ids))
    )
    return {
        "threads": int(thread_count or 0),
        "messages": int(message_count or 0),
        "thread_state": int(state_count or 0),
    }


async def purge_demo_threads(include_memory: bool, dry_run: bool) -> None:
    async with async_session_factory() as db:
        users_result = await db.execute(
            select(User.user_id, User.email).where(User.email.ilike("%@demo.com"))
        )
        demo_users = users_result.all()
        demo_user_ids = [row[0] for row in demo_users]
        demo_user_emails = [row[1] for row in demo_users]

        if not demo_user_ids:
            print("No demo users found. Nothing to purge.")
            return

        thread_result = await db.execute(
            select(ChatThread.thread_id).where(ChatThread.user_id.in_(demo_user_ids))
        )
        thread_ids = [row[0] for row in thread_result.all()]

        counts = await _count_rows_for_threads(db, thread_ids)
        memory_count = 0
        if include_memory:
            memory_count = int(
                await db.scalar(
                    select(func.count(UserMemory.memory_id)).where(UserMemory.user_id.in_(demo_user_ids))
                )
                or 0
            )

        print("Demo users:")
        for email in demo_user_emails:
            print(f"- {email}")
        print(
            f"Rows targeted: threads={counts['threads']} messages={counts['messages']} "
            f"thread_state={counts['thread_state']} user_memories={memory_count if include_memory else 0}"
        )

        if dry_run:
            print("Dry run complete. No rows deleted.")
            return

        if thread_ids:
            await db.execute(delete(ChatThreadState).where(ChatThreadState.thread_id.in_(thread_ids)))
            await db.execute(delete(ChatMessage).where(ChatMessage.thread_id.in_(thread_ids)))
            await db.execute(delete(ChatThread).where(ChatThread.thread_id.in_(thread_ids)))

        if include_memory and demo_user_ids:
            await db.execute(delete(UserMemory).where(UserMemory.user_id.in_(demo_user_ids)))

        await db.commit()

    await check_redis_and_fallback()
    cache_result = await clear_runtime_cache()
    await close_redis()

    print("Purge complete.")
    print(f"Cache clear result: {cache_result}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Purge demo-user chat thread data.")
    parser.add_argument(
        "--include-memory",
        action="store_true",
        help="Also purge user_memories rows for demo users.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only print what would be deleted.",
    )
    args = parser.parse_args()
    asyncio.run(purge_demo_threads(include_memory=args.include_memory, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
