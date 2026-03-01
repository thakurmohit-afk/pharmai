"""Conversation persistence models for thread history and user memory."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.compat import DBJSON, DBUUID


class ChatThread(Base):
    """A user-owned chat thread."""

    __tablename__ = "chat_threads"

    thread_id: Mapped[uuid.UUID] = mapped_column(DBUUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, ForeignKey("users.user_id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(255), default="New conversation")
    source: Mapped[str] = mapped_column(String(32), default="manual")
    client_session_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="chat_threads")  # noqa: F821
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="thread", cascade="all, delete-orphan", order_by="ChatMessage.created_at"
    )
    state: Mapped["ChatThreadState"] = relationship(
        back_populates="thread", uselist=False, cascade="all, delete-orphan"
    )


class ChatMessage(Base):
    """A single chat message within a thread."""

    __tablename__ = "chat_messages"

    message_id: Mapped[uuid.UUID] = mapped_column(DBUUID, primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, ForeignKey("chat_threads.thread_id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    msg_metadata: Mapped[dict | None] = mapped_column(DBJSON, nullable=True, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    thread: Mapped["ChatThread"] = relationship(back_populates="messages")


class UserMemory(Base):
    """Compact long-term summary context for a user."""

    __tablename__ = "user_memories"

    memory_id: Mapped[uuid.UUID] = mapped_column(DBUUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, ForeignKey("users.user_id", ondelete="CASCADE"), unique=True, index=True
    )
    summary_text: Mapped[str] = mapped_column(Text, default="")
    turns_since_refresh: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="memory")


class ChatThreadState(Base):
    """Thread-scoped pending order state for deterministic confirmations."""

    __tablename__ = "chat_thread_state"

    thread_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID,
        ForeignKey("chat_threads.thread_id", ondelete="CASCADE"),
        primary_key=True,
    )
    pending_quote: Mapped[dict] = mapped_column(DBJSON, default=dict)
    pending_medicines: Mapped[list] = mapped_column(DBJSON, default=list)
    quantity_resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    thread: Mapped["ChatThread"] = relationship(back_populates="state")
