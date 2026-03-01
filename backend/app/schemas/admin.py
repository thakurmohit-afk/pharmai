"""Pydantic schemas for admin endpoints."""

from pydantic import BaseModel
from typing import Optional


class InventoryItemResponse(BaseModel):
    inventory_id: str
    medicine_id: str
    medicine_name: str
    stock_quantity: int
    min_stock_threshold: int
    unit_type: str = "tablets"
    status: str = "ok"  # ok | low | critical


class RestockRequest(BaseModel):
    medicine_id: str
    quantity: int


class AlertResponse(BaseModel):
    alert_id: str
    user_id: str
    user_name: str
    medicine_name: str
    estimated_run_out: Optional[str] = None
    confidence: float = 0.0
    status: str = "pending"
