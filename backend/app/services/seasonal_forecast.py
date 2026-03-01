"""Seasonal demand prediction based on month/weather patterns and historical data."""

import logging
from datetime import datetime, timezone

logger = logging.getLogger("pharmacy.services.seasonal")

# ── Seasonal risk matrix ─────────────────────────────────────────────────
# Maps month ranges to medicine categories with demand multipliers.
# Based on Indian climate patterns.

SEASONAL_PROFILES = {
    "winter": {
        "months": [11, 12, 1, 2],
        "label": "Winter Season",
        "emoji": "❄️",
        "categories": {
            "Antipyretic": {"multiplier": 1.3, "reason": "Cold & flu season — increased fever cases"},
            "Antihistamine": {"multiplier": 1.2, "reason": "Dry air triggers allergic rhinitis"},
            "Cough Suppressant": {"multiplier": 1.5, "reason": "Dry cough prevalence rises sharply"},
            "Bronchodilator": {"multiplier": 1.3, "reason": "Asthma exacerbations in cold weather"},
            "Vitamin D": {"multiplier": 1.4, "reason": "Reduced sunlight exposure"},
        },
    },
    "summer": {
        "months": [3, 4, 5, 6],
        "label": "Summer Season",
        "emoji": "☀️",
        "categories": {
            "ORS": {"multiplier": 1.6, "reason": "Dehydration and heat stroke risk"},
            "Antidiarrheal": {"multiplier": 1.4, "reason": "Foodborne illness peaks"},
            "Sunscreen": {"multiplier": 1.5, "reason": "UV exposure protection"},
            "Antihistamine": {"multiplier": 1.2, "reason": "Heat rashes and allergies"},
            "Electrolyte": {"multiplier": 1.5, "reason": "Electrolyte imbalance from sweating"},
        },
    },
    "monsoon": {
        "months": [7, 8, 9],
        "label": "Monsoon Season",
        "emoji": "🌧️",
        "categories": {
            "Antipyretic": {"multiplier": 1.5, "reason": "Dengue, malaria, viral fever surge"},
            "Antibiotic": {"multiplier": 1.4, "reason": "Waterborne bacterial infections"},
            "Antimalarial": {"multiplier": 1.8, "reason": "Mosquito-borne disease spike"},
            "Antifungal": {"multiplier": 1.6, "reason": "Fungal skin infections from humidity"},
            "Antihistamine": {"multiplier": 1.5, "reason": "Mold allergies and rhinitis"},
            "Cough Suppressant": {"multiplier": 1.3, "reason": "Wet cough from infections"},
        },
    },
    "post_monsoon": {
        "months": [10],
        "label": "Post-Monsoon / Autumn",
        "emoji": "🍂",
        "categories": {
            "Antipyretic": {"multiplier": 1.2, "reason": "Lingering viral infections"},
            "Antihistamine": {"multiplier": 1.3, "reason": "Post-monsoon pollen and dust"},
            "Vitamin C": {"multiplier": 1.2, "reason": "Immune system recovery period"},
        },
    },
}


def get_current_season() -> dict:
    """Determine current season based on month."""
    current_month = datetime.now(timezone.utc).month
    for season_key, profile in SEASONAL_PROFILES.items():
        if current_month in profile["months"]:
            return {"key": season_key, **profile}
    return {"key": "general", "label": "General", "emoji": "📋", "months": [], "categories": {}}


def get_seasonal_alerts() -> dict:
    """Generate seasonal demand alerts for the current period."""
    season = get_current_season()
    alerts = []

    for category, data in season.get("categories", {}).items():
        multiplier = data["multiplier"]
        pct_increase = round((multiplier - 1.0) * 100)
        urgency = "high" if multiplier >= 1.5 else "medium" if multiplier >= 1.3 else "low"

        alerts.append({
            "category": category,
            "predicted_multiplier": multiplier,
            "pct_increase": pct_increase,
            "reason": data["reason"],
            "urgency": urgency,
            "recommendation": f"Consider stocking {pct_increase}% more {category} products",
        })

    # Sort by urgency (high first)
    urgency_order = {"high": 0, "medium": 1, "low": 2}
    alerts.sort(key=lambda a: urgency_order.get(a["urgency"], 3))

    return {
        "season": season["label"],
        "season_key": season["key"],
        "emoji": season["emoji"],
        "current_month": datetime.now(timezone.utc).strftime("%B %Y"),
        "alerts": alerts,
        "total_categories_affected": len(alerts),
    }
