"""Pydantic schemas for chat endpoints."""

from pydantic import BaseModel, Field
from typing import Optional
from typing_extensions import Literal


class ChatRequest(BaseModel):
    """POST /api/chat request body."""
    message: str
    conversation_id: Optional[str] = None


class PipelineStep(BaseModel):
    """A single step in the agent pipeline trace."""
    id: str
    name: str
    icon: str = ""
    description: str = ""
    status: str = "pending"  # pending | running | completed | skipped | blocked | error
    duration_ms: int = 0
    output: dict = Field(default_factory=dict)


class PaymentPayload(BaseModel):
    order_id: str
    razorpay_order_id: str
    amount: float
    currency: str
    key_id: str
    items: list[dict] = Field(default_factory=list)


class QuoteLine(BaseModel):
    medicine_id: str
    name: str
    requested_qty: int
    requested_unit: str
    strip_size: int
    billing_qty: int
    billing_unit: str = "strip"
    unit_price: float
    subtotal: float
    # Enriched medicine metadata for frontend cards
    generic_name: Optional[str] = None
    salt: Optional[str] = None
    dosage: Optional[str] = None
    category: Optional[str] = None
    manufacturer: Optional[str] = None
    prescription_required: bool = False
    active_ingredients: list[dict] = Field(default_factory=list)
    counseling_info: dict = Field(default_factory=dict)
    in_stock: bool = True
    stock_quantity: int = 0


class QuotePayload(BaseModel):
    currency: str = "INR"
    display_unit: str = "strip"
    total_amount: float
    conversion_note: Optional[str] = None
    quantity_status: str = "resolved"
    quantity_options: list[int] = Field(default_factory=list)
    lines: list[QuoteLine] = Field(default_factory=list)


class RecommendationPayload(BaseModel):
    name: str
    generic_name: Optional[str] = None
    price: float = 0.0
    category: Optional[str] = None
    dosage: Optional[str] = None
    prescription_required: bool = False


class UiPayload(BaseModel):
    type: Literal[
        "recommendations",
        "order_summary",
        "payment",
        "prescription_required",
        "prescription_upload",
        "delivery_status",
        "waitlist_subscribed",
        "cart_summary",
        "none",
    ] = "none"
    data: dict = Field(default_factory=dict)


class ChatResponse(BaseModel):
    """POST /api/chat response body."""
    message: str
    conversation_id: str
    trace_id: Optional[str] = None
    action: str = "chat"
    needs_clarification: bool = False
    confidence: float = 0.0
    payment: Optional[PaymentPayload] = None
    quote: Optional[QuotePayload] = None
    prescription: Optional[dict] = None
    recommendations: Optional[list[RecommendationPayload]] = Field(default_factory=list)
    ui_payload: UiPayload = Field(default_factory=UiPayload)
    agent_actions: Optional[list[dict]] = Field(default_factory=list)
    pipeline_steps: Optional[list[PipelineStep]] = Field(default_factory=list)
