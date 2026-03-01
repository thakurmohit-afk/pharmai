"""Cart models — persistent shopping cart for multi-item orders."""

import uuid
from datetime import datetime

from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.compat import DBUUID


class Cart(Base):
    """One active cart per user — persists across sessions."""

    __tablename__ = "carts"

    cart_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, ForeignKey("users.user_id", ondelete="CASCADE"), unique=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    items: Mapped[list["CartItem"]] = relationship(
        back_populates="cart", cascade="all, delete-orphan", lazy="selectin"
    )
    user: Mapped["User"] = relationship()  # noqa: F821


class CartItem(Base):
    """A single item in a user's cart."""

    __tablename__ = "cart_items"

    item_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, primary_key=True, default=uuid.uuid4
    )
    cart_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, ForeignKey("carts.cart_id", ondelete="CASCADE"), index=True
    )
    medicine_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, ForeignKey("medicines.medicine_id", ondelete="CASCADE")
    )
    medicine_name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    cart: Mapped["Cart"] = relationship(back_populates="items")
    medicine: Mapped["Medicine"] = relationship()  # noqa: F821
