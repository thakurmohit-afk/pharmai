"""Pydantic schemas for order endpoints."""

from pydantic import BaseModel
from typing import Optional


class OrderItemSchema(BaseModel):
    medicine_id: str
    name: str
    dosage: Optional[str] = None
    quantity: int
    unit_price: float = 0.0
    subtotal: float = 0.0


class OrderResponse(BaseModel):
    order_id: str
    status: str
    total_amount: float
    items: list[OrderItemSchema] = []
    trace_id: Optional[str] = None

    model_config = {"from_attributes": True}
