"""Medicine master model — single source of truth for the Safety Agent."""

import uuid

from sqlalchemy import String, Boolean, Float
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.compat import DBUUID, DBJSON


class Medicine(Base):
    """Medicine catalogue — mirrors the Medicine Master Excel."""

    __tablename__ = "medicines"

    medicine_id: Mapped[uuid.UUID] = mapped_column(
        DBUUID, primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    generic_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    salt: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    dosage: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pack_sizes: Mapped[dict | None] = mapped_column(DBJSON, default=list)
    price: Mapped[float] = mapped_column(Float, default=0.0)
    prescription_required: Mapped[bool] = mapped_column(Boolean, default=False)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    max_per_order: Mapped[int | None] = mapped_column(default=100)
    manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Structured active ingredients for clinical validation
    # e.g. [{"molecule": "Paracetamol", "strength_mg": 650, "strength_unit": "mg"}]
    active_ingredients: Mapped[list | None] = mapped_column(DBJSON, default=list)
    # WHO ATC classification code for therapeutic-class fallback
    atc_code: Mapped[str | None] = mapped_column(String(10), nullable=True, index=True)
    # Structured patient counseling data for dispensing instructions
    # e.g. {"food_timing": "after_food", "drowsiness": true, "alcohol_warning": true, ...}
    counseling_info: Mapped[dict | None] = mapped_column(DBJSON, default=dict)
