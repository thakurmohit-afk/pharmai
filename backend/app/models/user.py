"""User and profile ORM models."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.compat import DBJSON, DBUUID


class User(Base):
    """Core user account."""

    __tablename__ = "users"

    user_id: Mapped[uuid.UUID] = mapped_column(DBUUID, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(10), nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    address: Mapped[dict | None] = mapped_column(DBJSON, nullable=True, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    profile: Mapped["UserProfile"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    orders: Mapped[list["Order"]] = relationship(back_populates="user")  # noqa: F821
    prescriptions: Mapped[list["Prescription"]] = relationship(back_populates="user")  # noqa: F821
    sessions: Mapped[list["UserSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )  # noqa: F821
    chat_threads: Mapped[list["ChatThread"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )  # noqa: F821
    memory: Mapped["UserMemory"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )  # noqa: F821


class UserProfile(Base):
    """Behavioral profile built by the profiling agent."""

    __tablename__ = "user_profiles"

    profile_id: Mapped[uuid.UUID] = mapped_column(DBUUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, ForeignKey("users.user_id", ondelete="CASCADE"), unique=True
    )
    chronic_conditions: Mapped[dict | None] = mapped_column(DBJSON, default=list)
    medication_patterns: Mapped[dict | None] = mapped_column(DBJSON, default=list)
    medical_facts: Mapped[dict | None] = mapped_column(DBJSON, default=list)
    alert_responsiveness: Mapped[float | None] = mapped_column(default=0.5)
    preferred_brands: Mapped[dict | None] = mapped_column(DBJSON, default=list)
    side_effects: Mapped[dict | None] = mapped_column(DBJSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="profile")
