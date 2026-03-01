"""PharmacyState shared state passed between pipeline agents."""

from enum import Enum
from typing import Optional, TypedDict


class ConversationPhase(str, Enum):
    """Voice conversation phases for turn-taking and agent routing."""
    GREETING = "greeting"
    BROWSE = "browse"
    CART_BUILD = "cart_build"
    CART_REVIEW = "cart_review"
    CONFIRM = "confirm"
    PAYMENT = "payment"
    POST_PAYMENT = "post_payment"
    CLOSURE = "closure"


class IntentItem(TypedDict, total=False):
    """A single medicine item extracted from user input."""

    medicine_name: str
    dosage: str
    quantity: int
    confidence: float
    matched_medicine_id: str
    matched_medicine_name: str
    requested_qty: int
    requested_unit: str
    billing_qty: int
    billing_unit: str
    strip_size: int
    price: float


class SafetyResult(TypedDict, total=False):
    """Output of the Safety Agent."""

    decision: str
    reason: str
    severity: str
    blocked_items: list
    details: dict


class InventoryResult(TypedDict, total=False):
    """Output of the Inventory Agent."""

    available: bool
    items_status: list
    alternatives: list
    negotiation: dict
    strategy: str


class FinalDecision(TypedDict, total=False):
    """Output of the final decision stage."""

    action: str
    combined_confidence: float
    risk_level: str
    needs_clarification: bool
    reasoning: str


class ExecutionResult(TypedDict, total=False):
    """Output of the execution stage."""

    order_id: str
    success: bool
    message: str
    webhook_triggered: bool
    trace_url: str


class QuoteLine(TypedDict, total=False):
    """Canonical quote line for deterministic billing."""

    medicine_id: str
    name: str
    requested_qty: int
    requested_unit: str
    strip_size: int
    billing_qty: int
    billing_unit: str
    unit_price: float
    subtotal: float
    quantity_explicit: bool


class QuoteResult(TypedDict, total=False):
    """Deterministic quote object returned to client."""

    currency: str
    display_unit: str
    total_amount: float
    conversion_note: Optional[str]
    quantity_status: str
    quantity_options: list[int]
    lines: list[QuoteLine]


class PendingOrderState(TypedDict, total=False):
    """Thread-scoped pending order context used for confirmation turns."""

    pending_quote: QuoteResult
    pending_medicines: list[dict]
    quantity_resolved: bool
    awaiting_confirmation: bool
    confirmation_prompted_once: bool
    quote_signature: str
    last_confirmation_intent: str
    last_confirmation_confidence: float


class PharmacyState(TypedDict, total=False):
    """Shared graph state for the entire pharmacy workflow."""

    user_id: str
    message: str
    conversation_history: list

    intent: dict
    understanding_confidence: float
    user_profile: dict
    prediction: dict
    safety_check: dict
    inventory_check: dict
    final_decision: dict
    execution_result: dict
    quote: dict
    pending_state: dict
    error_code: str
    error_status: int
    error_message: str

    prescription_context: dict

    response_message: str
    trace_id: str
    error: str
    pipeline_steps: list
