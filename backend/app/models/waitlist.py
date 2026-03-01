"""Waitlist model — tracks users waiting for out-of-stock medicines."""

import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.compat import DBUUID


class Waitlist(Base):
    """A user's subscription to be notified when a medicine is restocked."""

    __tablename__ = "waitlist"

    waitlist_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, ForeignKey("users.user_id", ondelete="CASCADE"), index=True
    )
    medicine_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, ForeignKey("medicines.medicine_id", ondelete="CASCADE"), index=True
    )
    medicine_name: Mapped[str] = mapped_column(String(255), nullable=False)
    notification_method: Mapped[str] = mapped_column(String(50), default="email")
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending | notified
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship()  # noqa: F821
    medicine: Mapped["Medicine"] = relationship()  # noqa: F821
