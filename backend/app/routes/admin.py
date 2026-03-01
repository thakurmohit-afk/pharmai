"""Admin routes — alerts, inventory, restock, prescription review, overview, orders, users, dispensing logs, traces."""

from fastapi import APIRouter, Depends, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import require_admin
from app.schemas.admin import RestockRequest
from app.services.admin_service import (
    get_all_alerts,
    get_inventory_status,
    restock_medicine,
    get_prescription_queue,
    get_admin_overview,
    get_admin_orders,
    get_admin_users,
    get_dispensing_logs,
    get_all_threads,
    get_thread_trace,
    get_live_traces,
    get_real_system_health,
)

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/alerts")
async def alerts(db: AsyncSession = Depends(get_db)):
    """High-confidence refill alerts for admin review."""
    return await get_all_alerts(db)


@router.get("/inventory")
async def inventory(db: AsyncSession = Depends(get_db)):
    """Stock levels with color coding (ok/low/critical)."""
    return await get_inventory_status(db)


@router.post("/restock")
async def restock(request: RestockRequest, db: AsyncSession = Depends(get_db)):
    """Add stock for a medicine."""
    return await restock_medicine(request.medicine_id, request.quantity, db)


@router.get("/prescriptions")
async def prescription_queue(db: AsyncSession = Depends(get_db)):
    """Prescriptions awaiting admin verification."""
    return await get_prescription_queue(db)


@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db)):
    """Aggregate metrics for the admin overview dashboard."""
    return await get_admin_overview(db)


@router.get("/orders")
async def orders(
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Recent orders with user names."""
    return await get_admin_orders(db, limit)


@router.get("/users")
async def users(db: AsyncSession = Depends(get_db)):
    """All non-admin users with order/alert counts."""
    return await get_admin_users(db)


@router.get("/dispensing-logs")
async def dispensing_logs(
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Recent dispensing audit trail entries."""
    return await get_dispensing_logs(db, limit)


# ── Traceability endpoints ────────────────────────────────────────────────


@router.get("/threads")
async def admin_threads(
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
):
    """All chat threads across all users for trace view."""
    return await get_all_threads(db, limit)


@router.get("/threads/{thread_id}/trace")
async def thread_trace(thread_id: str, db: AsyncSession = Depends(get_db)):
    """Full conversation trace — messages with per-agent pipeline data."""
    data = await get_thread_trace(db, thread_id)
    if data is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Thread not found")
    return data


@router.get("/traces/live")
async def live_traces(
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Recent pipeline executions across all users — live trace feed."""
    return await get_live_traces(db, limit)


@router.get("/health")
async def system_health(db: AsyncSession = Depends(get_db)):
    """Real system health metrics computed from stored pipeline traces."""
    return await get_real_system_health(db)


@router.get("/langfuse-config")
async def langfuse_config():
    """Return LangFuse host URL for frontend trace links (no secrets exposed)."""
    from app.config import get_settings
    s = get_settings()
    return {"host": s.langfuse_host if s.langfuse_public_key else None}


# ── Analytics & AI endpoints ─────────────────────────────────────────────

@router.get("/forecast")
async def stock_forecast(db: AsyncSession = Depends(get_db)):
    """ML-powered stock depletion predictions for top medicines."""
    from app.services.ml_forecast import get_stock_forecast
    return await get_stock_forecast(db)


@router.get("/seasonal-alerts")
async def seasonal_alerts():
    """Seasonal demand spike predictions based on current month/climate."""
    from app.services.seasonal_forecast import get_seasonal_alerts
    return get_seasonal_alerts()


@router.get("/stock-heatmap")
async def stock_heatmap(db: AsyncSession = Depends(get_db)):
    """Daily dispensing volume for the past 365 days (heatmap data)."""
    from app.services.ml_forecast import get_stock_heatmap
    return await get_stock_heatmap(db)


@router.get("/patient-summary/{user_id}")
async def patient_summary(user_id: str, db: AsyncSession = Depends(get_db)):
    """AI-generated patient health profile from medication history."""
    from app.services.patient_profiler import generate_patient_summary
    return await generate_patient_summary(db, user_id)


@router.get("/patient-ai-insight/{user_id}")
async def patient_ai_insight(user_id: str, db: AsyncSession = Depends(get_db)):
    """GPT-powered clinical narrative insight for a patient."""
    from app.services.patient_profiler import generate_gpt_insight
    return await generate_gpt_insight(db, user_id)


@router.post("/nlp-search")
async def nlp_search(request: dict, db: AsyncSession = Depends(get_db)):
    """Natural language query engine for admin database search."""
    from app.services.admin_nlp_search import admin_nlp_search
    query = request.get("query", "")
    if not query:
        return {"error": "Query is required", "results": []}
    return await admin_nlp_search(db, query)


# ── CSV Medicine Import with AI enrichment ───────────────────────────────

@router.post("/import-medicines")
async def import_medicines(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Import medicines from CSV (name,quantity). AI fills all other fields."""
    import csv
    import io
    import uuid
    from sqlalchemy import select
    from app.models.medicine import Medicine
    from app.models.inventory import Inventory
    from app.services.medicine_enricher import enrich_medicine

    content = await file.read()
    text = content.decode("utf-8-sig")  # handle BOM
    reader = csv.reader(io.StringIO(text))

    imported = []
    skipped = []
    errors = []

    for row_num, row in enumerate(reader, start=1):
        # Skip empty rows and header-like rows
        if not row or not row[0].strip():
            continue
        if row_num == 1 and row[0].strip().lower() in ("name", "medicine", "medicine_name"):
            continue

        name = row[0].strip()
        try:
            quantity = int(row[1].strip()) if len(row) > 1 and row[1].strip() else 0
        except ValueError:
            quantity = 0

        # Check for duplicate
        existing = await db.execute(
            select(Medicine.medicine_id).where(Medicine.name.ilike(name))
        )
        if existing.scalar_one_or_none():
            skipped.append({"name": name, "reason": "already exists"})
            continue

        # AI enrichment
        try:
            data = await enrich_medicine(name)
        except Exception as e:
            errors.append({"name": name, "error": str(e)})
            continue

        # Create Medicine record
        med = Medicine(
            medicine_id=uuid.uuid4(),
            name=name,
            generic_name=data.get("generic_name"),
            salt=data.get("salt"),
            description=data.get("description"),
            dosage=data.get("dosage"),
            pack_sizes=data.get("pack_sizes", []),
            price=data.get("price", 0.0),
            prescription_required=data.get("prescription_required", False),
            category=data.get("category", "Other"),
            manufacturer=data.get("manufacturer"),
            active_ingredients=data.get("active_ingredients", []),
            atc_code=data.get("atc_code"),
            counseling_info=data.get("counseling_info", {}),
            is_active=True,
        )
        db.add(med)
        await db.flush()

        # Create Inventory record
        inv = Inventory(
            inventory_id=uuid.uuid4(),
            medicine_id=med.medicine_id,
            stock_quantity=quantity,
            unit_type="tablets",
            min_stock_threshold=20,
        )
        db.add(inv)
        await db.flush()

        imported.append({
            "name": name,
            "medicine_id": str(med.medicine_id),
            "category": data.get("category"),
            "generic_name": data.get("generic_name"),
            "quantity": quantity,
        })

    await db.commit()

    return {
        "total_processed": len(imported) + len(skipped) + len(errors),
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
    }

