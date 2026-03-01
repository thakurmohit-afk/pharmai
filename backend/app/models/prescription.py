"""Prescription model — stores uploaded images + GPT-4 Vision OCR data."""

import uuid
from datetime import datetime, timedelta

from sqlalchemy import String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.compat import DBUUID, DBJSON


def _default_expiry() -> datetime:
    """Prescriptions are valid for 30 days from upload."""
    return datetime.utcnow() + timedelta(days=30)


class Prescription(Base):
    """Uploaded prescription with OCR-extracted data."""

    __tablename__ = "prescriptions"

    prescription_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, ForeignKey("users.user_id", ondelete="CASCADE")
    )
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    extracted_data: Mapped[dict | None] = mapped_column(DBJSON, default=dict)
    upload_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expiry_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_default_expiry
    )
    verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="prescriptions")  # noqa: F821
