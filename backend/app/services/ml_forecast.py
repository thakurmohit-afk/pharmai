"""ML Stock Forecast — lightweight time-series prediction for medicine demand."""

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dispensing_log import DispensingLog
from app.models.medicine import Medicine
from app.models.inventory import Inventory

logger = logging.getLogger("pharmacy.services.ml_forecast")


def _build_forecast(daily_volumes: list[float], days_ahead: int = 30) -> list[float]:
    """Simple moving-average + linear-trend forecast (no heavy deps)."""
    n = len(daily_volumes)
    if n == 0:
        return [0.0] * days_ahead

    # Moving average (window=7 or full history if shorter)
    window = min(7, n)
    ma = sum(daily_volumes[-window:]) / window

    # Simple linear trend from first half vs second half
    if n >= 6:
        first_half = daily_volumes[: n // 2]
        second_half = daily_volumes[n // 2 :]
        avg_first = sum(first_half) / len(first_half) if first_half else 0
        avg_second = sum(second_half) / len(second_half) if second_half else 0
        daily_trend = (avg_second - avg_first) / max(n // 2, 1)
    else:
        daily_trend = 0.0

    forecast = []
    for i in range(1, days_ahead + 1):
        pred = max(0.0, ma + daily_trend * i)
        forecast.append(round(pred, 2))
    return forecast


async def get_stock_forecast(db: AsyncSession, top_n: int = 10) -> list[dict]:
    """Return demand forecast + depletion predictions for top medicines."""
    # Fetch all dispensing logs from the last 90 days
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    result = await db.execute(
        select(DispensingLog)
        .where(DispensingLog.timestamp >= cutoff)
        .order_by(DispensingLog.timestamp)
    )
    logs = result.scalars().all()

    # Aggregate daily volumes per medicine
    med_daily: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    med_names: dict[str, str] = {}

    for log in logs:
        if not log.medicines_dispensed:
            continue
        day_key = log.timestamp.strftime("%Y-%m-%d")
        for item in log.medicines_dispensed:
            mid = item.get("medicine_id", "")
            qty = item.get("quantity", item.get("billing_qty", 1))
            if mid:
                med_daily[mid][day_key] += qty
                if mid not in med_names:
                    med_names[mid] = item.get("medicine_name", item.get("name", mid))

    if not med_daily:
        # No dispensing data — return demo forecast for all inventory
        inv_result = await db.execute(
            select(Medicine, Inventory)
            .outerjoin(Inventory, Medicine.medicine_id == Inventory.medicine_id)
            .where(Medicine.is_active == True)
            .limit(top_n)
        )
        rows = inv_result.all()
        return [
            {
                "medicine_id": str(m.medicine_id),
                "medicine_name": m.name,
                "current_stock": inv.stock_quantity if inv else 0,
                "daily_avg": 0,
                "predicted_depletion_date": None,
                "forecast_30d": [{"date": (datetime.now(timezone.utc) + timedelta(days=i)).strftime("%Y-%m-%d"), "predicted_demand": 0} for i in range(1, 31)],
            }
            for m, inv in rows
        ]

    # Build forecasts for top medicines by volume
    total_volume = {mid: sum(days.values()) for mid, days in med_daily.items()}
    top_meds = sorted(total_volume.keys(), key=lambda m: total_volume[m], reverse=True)[:top_n]

    # Get current stock
    if top_meds:
        inv_result = await db.execute(
            select(Inventory).where(Inventory.medicine_id.in_(top_meds))
        )
        stock_map = {str(inv.medicine_id): inv.stock_quantity for inv in inv_result.scalars().all()}
    else:
        stock_map = {}

    now = datetime.now(timezone.utc)
    all_days = [(cutoff + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(91)]

    forecasts = []
    for mid in top_meds:
        daily_data = [med_daily[mid].get(d, 0.0) for d in all_days]
        daily_avg = sum(daily_data) / max(len([v for v in daily_data if v > 0]), 1)
        forecast_values = _build_forecast(daily_data, 30)

        current_stock = stock_map.get(mid, 0)
        # Predict depletion
        cumulative = 0.0
        depletion_date = None
        for i, fv in enumerate(forecast_values):
            cumulative += fv
            if cumulative >= current_stock and current_stock > 0:
                depletion_date = (now + timedelta(days=i + 1)).strftime("%Y-%m-%d")
                break

        forecasts.append({
            "medicine_id": mid,
            "medicine_name": med_names.get(mid, mid),
            "current_stock": current_stock,
            "daily_avg": round(daily_avg, 2),
            "predicted_depletion_date": depletion_date,
            "forecast_30d": [
                {
                    "date": (now + timedelta(days=i + 1)).strftime("%Y-%m-%d"),
                    "predicted_demand": fv,
                }
                for i, fv in enumerate(forecast_values)
            ],
        })

    return forecasts


async def get_stock_heatmap(db: AsyncSession) -> list[dict]:
    """Return daily dispensing volumes for the last 365 days (heatmap data)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=365)
    result = await db.execute(
        select(DispensingLog)
        .where(DispensingLog.timestamp >= cutoff)
        .order_by(DispensingLog.timestamp)
    )
    logs = result.scalars().all()

    daily_counts: dict[str, int] = defaultdict(int)
    for log in logs:
        day_key = log.timestamp.strftime("%Y-%m-%d")
        count = len(log.medicines_dispensed) if log.medicines_dispensed else 0
        daily_counts[day_key] += count

    # Fill all 365 days
    now = datetime.now(timezone.utc)
    heatmap = []
    for i in range(365):
        day = now - timedelta(days=364 - i)
        day_key = day.strftime("%Y-%m-%d")
        heatmap.append({
            "date": day_key,
            "count": daily_counts.get(day_key, 0),
            "weekday": day.weekday(),
        })

    return heatmap
