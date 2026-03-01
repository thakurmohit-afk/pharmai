"""Pydantic schemas for user-related endpoints."""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class UserProfileResponse(BaseModel):
    """GET /api/user/{id}/profile response."""
    user_id: str
    name: str
    email: str
    phone: Optional[str] = None
    address: Optional[dict] = None
    chronic_conditions: list = []
    medication_patterns: list = []
    alert_responsiveness: float = 0.5
    preferred_brands: list = []
    side_effects: list = []

    model_config = {"from_attributes": True}


class DashboardResponse(BaseModel):
    """GET /api/user/{id}/dashboard response."""
    order_history: list[dict] = []
    active_alerts: list[dict] = []
    chronic_medications: list[dict] = []
    upcoming_refills: list[dict] = []
    prescriptions: list[dict] = []
