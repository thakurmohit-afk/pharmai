"""Inventory model — real-time stock tracking."""

import uuid

from sqlalchemy import Integer, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.compat import DBUUID


class Inventory(Base):
    """Stock levels per medicine — queried by Agent 5 (Inventory)."""

    __tablename__ = "inventory"

    inventory_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, primary_key=True, default=uuid.uuid4
    )
    medicine_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, ForeignKey("medicines.medicine_id", ondelete="CASCADE"), unique=True
    )
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0)
    unit_type: Mapped[str] = mapped_column(String(50), default="tablets")
    min_stock_threshold: Mapped[int] = mapped_column(Integer, default=20)

    # Relationships
    medicine: Mapped["Medicine"] = relationship()  # noqa: F821
