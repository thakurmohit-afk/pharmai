"""Order & OrderHistory ORM models."""

import uuid
from datetime import datetime

from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.compat import DBUUID, DBJSON


class Order(Base):
    """A finalized pharmacy order."""

    __tablename__ = "orders"

    order_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, ForeignKey("users.user_id", ondelete="CASCADE")
    )
    order_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    status: Mapped[str] = mapped_column(String(50), default="pending")
    total_amount: Mapped[float] = mapped_column(Float, default=0.0)
    items: Mapped[dict | None] = mapped_column(DBJSON, default=list)
    trace_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Razorpay Payment Details
    razorpay_order_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    razorpay_signature: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="orders")  # noqa: F821


class OrderHistory(Base):
    """Granular order-item rows for predictive analysis by Agent 3."""

    __tablename__ = "order_history"

    id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, ForeignKey("users.user_id", ondelete="CASCADE"), index=True
    )
    medicine_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, ForeignKey("medicines.medicine_id", ondelete="CASCADE"), index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    order_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    dosage_frequency: Mapped[str | None] = mapped_column(String(100), nullable=True)
