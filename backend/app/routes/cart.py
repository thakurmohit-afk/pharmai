"""Cart routes — CRUD for persistent shopping cart."""

import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.cart import Cart, CartItem
from app.models.medicine import Medicine
from app.models.inventory import Inventory
from app.models.order import Order
from app.models.user import User
from app.dependencies.auth import get_current_user

logger = logging.getLogger("pharmacy.cart")
router = APIRouter(prefix="/api/cart", tags=["cart"])


# ── Schemas ──────────────────────────────────────────────────────────────

class AddItemRequest(BaseModel):
    medicine_name: str
    quantity: int = 1


class UpdateItemRequest(BaseModel):
    quantity: int


class CartItemOut(BaseModel):
    item_id: str
    medicine_id: str
    medicine_name: str
    quantity: int
    unit_price: float
    subtotal: float


class CartOut(BaseModel):
    cart_id: str
    item_count: int
    total_amount: float
    items: list[CartItemOut]


# ── Helpers ──────────────────────────────────────────────────────────────

async def _get_or_create_cart(user_id: uuid.UUID, db: AsyncSession) -> Cart:
    result = await db.execute(select(Cart).where(Cart.user_id == user_id))
    cart = result.scalar_one_or_none()
    if not cart:
        cart = Cart(user_id=user_id)
        db.add(cart)
        await db.flush()
    return cart


def _serialize_cart(cart: Cart) -> CartOut:
    items_out = []
    total = 0.0
    for item in (cart.items or []):
        subtotal = round(item.quantity * item.unit_price, 2)
        total += subtotal
        items_out.append(CartItemOut(
            item_id=str(item.item_id),
            medicine_id=str(item.medicine_id),
            medicine_name=item.medicine_name,
            quantity=item.quantity,
            unit_price=item.unit_price,
            subtotal=subtotal,
        ))
    return CartOut(
        cart_id=str(cart.cart_id),
        item_count=len(items_out),
        total_amount=round(total, 2),
        items=items_out,
    )


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("")
async def get_cart(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's cart."""
    cart = await _get_or_create_cart(current_user.user_id, db)
    await db.commit()
    return _serialize_cart(cart)


@router.post("/items")
async def add_item(
    body: AddItemRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a medicine to the cart (or increment if already present)."""
    user_id = current_user.user_id
    # Find the medicine
    result = await db.execute(
        select(Medicine).where(Medicine.name.ilike(f"%{body.medicine_name}%"))
    )
    medicine = result.scalar_one_or_none()
    if not medicine:
        raise HTTPException(status_code=404, detail=f"Medicine '{body.medicine_name}' not found")

    cart = await _get_or_create_cart(user_id, db)

    # Check if already in cart — increment quantity
    existing = None
    for item in (cart.items or []):
        if item.medicine_id == medicine.medicine_id:
            existing = item
            break

    if existing:
        existing.quantity += body.quantity
        existing.unit_price = medicine.price
    else:
        new_item = CartItem(
            cart_id=cart.cart_id,
            medicine_id=medicine.medicine_id,
            medicine_name=medicine.name,
            quantity=body.quantity,
            unit_price=medicine.price,
        )
        db.add(new_item)

    cart.updated_at = datetime.now(timezone.utc)
    await db.commit()

    # Refresh to get updated items
    result = await db.execute(select(Cart).where(Cart.cart_id == cart.cart_id))
    cart = result.scalar_one()
    return _serialize_cart(cart)


@router.patch("/items/{item_id}")
async def update_item(
    item_id: str,
    body: UpdateItemRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update quantity of a cart item."""
    user_id = current_user.user_id
    result = await db.execute(
        select(CartItem)
        .join(Cart)
        .where(CartItem.item_id == uuid.UUID(item_id), Cart.user_id == user_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")

    if body.quantity <= 0:
        await db.delete(item)
    else:
        item.quantity = body.quantity

    await db.commit()

    cart = await _get_or_create_cart(user_id, db)
    return _serialize_cart(cart)


@router.delete("/items/{item_id}")
async def remove_item(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove an item from the cart."""
    user_id = current_user.user_id
    result = await db.execute(
        select(CartItem)
        .join(Cart)
        .where(CartItem.item_id == uuid.UUID(item_id), Cart.user_id == user_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")

    await db.delete(item)
    await db.commit()

    cart = await _get_or_create_cart(user_id, db)
    return _serialize_cart(cart)


@router.delete("/clear")
async def clear_cart(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Clear all items from the cart."""
    cart = await _get_or_create_cart(current_user.user_id, db)
    for item in list(cart.items or []):
        await db.delete(item)
    await db.commit()
    return {"success": True, "message": "Cart cleared"}


@router.post("/checkout")
async def checkout_cart(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Convert cart items into a pending Order + Razorpay order."""
    from app.config import get_settings
    settings = get_settings()

    user_id = current_user.user_id
    cart = await _get_or_create_cart(user_id, db)
    if not cart.items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    # Build order items and calculate total
    order_items = []
    total = 0.0
    for ci in cart.items:
        subtotal = round(ci.quantity * ci.unit_price, 2)
        total += subtotal
        order_items.append({
            "medicine_id": str(ci.medicine_id),
            "medicine_name": ci.medicine_name,
            "quantity": ci.quantity,
            "unit_price": ci.unit_price,
            "subtotal": subtotal,
        })

    total = round(total, 2)

    # Create the Order
    order = Order(
        user_id=user_id,
        status="pending",
        total_amount=total,
        items=order_items,
    )
    db.add(order)
    await db.flush()

    # Create Razorpay order (if configured)
    razorpay_order_id = None
    key_id = settings.razorpay_key_id if hasattr(settings, "razorpay_key_id") else None
    if key_id:
        try:
            import razorpay
            client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
            rz_order = client.order.create({
                "amount": int(total * 100),
                "currency": "INR",
                "receipt": str(order.order_id),
            })
            razorpay_order_id = rz_order["id"]
            order.razorpay_order_id = razorpay_order_id
        except Exception as e:
            logger.warning("Razorpay order creation failed: %s", e)

    # Clear the cart
    for ci in list(cart.items):
        await db.delete(ci)

    await db.commit()

    return {
        "success": True,
        "order_id": str(order.order_id),
        "razorpay_order_id": razorpay_order_id,
        "amount": total,
        "currency": "INR",
        "key_id": key_id or "",
        "items": order_items,
    }
