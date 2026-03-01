"""Dispensing audit trail — every safety decision and counseling action logged."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.compat import DBUUID, DBJSON


class DispensingLog(Base):
    """Audit log for every order processed through the safety pipeline."""

    __tablename__ = "dispensing_logs"

    log_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    user_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    thread_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # What was dispensed
    medicines_dispensed: Mapped[list | None] = mapped_column(DBJSON, default=list)

    # Safety decisions made
    safety_decision: Mapped[str | None] = mapped_column(String(50), nullable=True)  # allow / soft_block / hard_block
    safety_warnings_surfaced: Mapped[list | None] = mapped_column(DBJSON, default=list)
    clinical_checks_passed: Mapped[dict | None] = mapped_column(DBJSON, default=dict)

    # Counseling provided
    counseling_provided: Mapped[list | None] = mapped_column(DBJSON, default=list)

    # Escalation flag
    pharmacist_escalation_required: Mapped[bool] = mapped_column(Boolean, default=False)

    # Trace for debugging
    trace_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
