"""Chat thread and message history routes."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.chat import ChatMessage, ChatThread, ChatThreadState
from app.models.user import User

router = APIRouter(prefix="/api/chat/threads", tags=["chat-threads"])


class CreateThreadRequest(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    client_session_id: str | None = Field(default=None, max_length=64)


@router.get("")
async def list_threads(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List authenticated user's threads with last message + count."""
    last_message_subq = (
        select(ChatMessage.content)
        .where(ChatMessage.thread_id == ChatThread.thread_id)
        .order_by(desc(ChatMessage.created_at))
        .limit(1)
        .correlate(ChatThread)
        .scalar_subquery()
    )
    message_count_subq = (
        select(func.count(ChatMessage.message_id))
        .where(ChatMessage.thread_id == ChatThread.thread_id)
        .correlate(ChatThread)
        .scalar_subquery()
    )

    result = await db.execute(
        select(
            ChatThread.thread_id,
            ChatThread.title,
            ChatThread.source,
            ChatThread.client_session_id,
            ChatThread.updated_at,
            ChatThread.created_at,
            last_message_subq.label("last_message"),
            message_count_subq.label("message_count"),
        )
        .where(ChatThread.user_id == current_user.user_id)
        .order_by(desc(ChatThread.updated_at))
        .limit(100)
    )
    rows = result.mappings().all()

    payload = []
    for row in rows:
        payload.append(
            {
                "conversation_id": str(row["thread_id"]),
                "title": row["title"],
                "source": row["source"],
                "client_session_id": row["client_session_id"],
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "message_count": int(row["message_count"] or 0),
                "last_message": (row["last_message"] or "")[:120],
            }
        )
    return payload


@router.post("")
async def create_thread(
    body: CreateThreadRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new thread for current user."""
    title = (body.title or "New conversation").strip()[:255] or "New conversation"
    client_session_id = (body.client_session_id or "").strip()[:64] or None
    thread = ChatThread(
        user_id=current_user.user_id,
        title=title,
        source="manual",
        client_session_id=client_session_id,
    )
    db.add(thread)
    await db.flush()
    return {
        "conversation_id": str(thread.thread_id),
        "title": thread.title,
        "source": thread.source,
        "client_session_id": thread.client_session_id,
        "created_at": thread.created_at.isoformat() if thread.created_at else None,
    }


@router.delete("")
async def delete_threads_bulk(
    scope: str = Query(default="all"),
    demo_users: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete thread history in bulk for current user or demo users (admin only)."""
    if scope != "all":
        raise HTTPException(status_code=400, detail="Only scope=all is supported.")

    if demo_users:
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required for demo purge.")
        users_result = await db.execute(select(User.user_id).where(User.email.ilike("%@demo.com")))
        target_user_ids = [row[0] for row in users_result.all()]
    else:
        target_user_ids = [current_user.user_id]

    if not target_user_ids:
        return {"status": "deleted", "deleted_threads": 0, "demo_users": demo_users}

    thread_result = await db.execute(
        select(ChatThread.thread_id).where(ChatThread.user_id.in_(target_user_ids))
    )
    thread_ids = [row[0] for row in thread_result.all()]
    if not thread_ids:
        return {"status": "deleted", "deleted_threads": 0, "demo_users": demo_users}

    await db.execute(delete(ChatThreadState).where(ChatThreadState.thread_id.in_(thread_ids)))
    await db.execute(delete(ChatMessage).where(ChatMessage.thread_id.in_(thread_ids)))
    delete_result = await db.execute(delete(ChatThread).where(ChatThread.thread_id.in_(thread_ids)))
    deleted_threads = int(delete_result.rowcount or len(thread_ids))
    return {
        "status": "deleted",
        "deleted_threads": deleted_threads,
        "demo_users": demo_users,
    }


@router.get("/{conversation_id}/messages")
async def thread_messages(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all messages for a thread owned by current user."""
    thread_result = await db.execute(
        select(ChatThread).where(
            ChatThread.thread_id == conversation_id,
            ChatThread.user_id == current_user.user_id,
        )
    )
    thread = thread_result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    messages_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.thread_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
    )
    messages = messages_result.scalars().all()
    return {
        "conversation_id": conversation_id,
        "title": thread.title,
        "messages": [
            {
                "message_id": str(msg.message_id),
                "role": msg.role,
                "content": msg.content,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
                "prescription": msg.msg_metadata.get("prescription") if msg.msg_metadata and isinstance(msg.msg_metadata, dict) else None,
            }
            for msg in messages
        ],
    }


@router.delete("/{conversation_id}")
async def delete_thread(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a thread and all child messages."""
    thread_result = await db.execute(
        select(ChatThread).where(
            ChatThread.thread_id == conversation_id,
            ChatThread.user_id == current_user.user_id,
        )
    )
    thread = thread_result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    await db.delete(thread)
    return {"status": "deleted", "conversation_id": conversation_id}
