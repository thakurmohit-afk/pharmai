"""Medicine search service with hybrid retrieval.

Search order:
1. Lexical exact/fuzzy match (fast, no API round trip)
2. Semantic embeddings fallback (for symptoms/ambiguous text)

This keeps explicit medicine-name queries fast and deterministic while preserving
symptom-based retrieval quality.
"""

import logging
import re
from difflib import SequenceMatcher

import numpy as np
from sqlalchemy import select

from app.config import get_settings
from app.database import async_session_factory
from app.services.openai_client import get_async_openai_client

logger = logging.getLogger("pharmacy.services.medicine_search")

# Module state
_embeddings: np.ndarray | None = None
_medicines: list[dict] = []
_search_index: list[dict] = []
_EMBED_MODEL = "text-embedding-3-small"
_initialized = False

_SYMPTOM_HINTS = {
    "fever",
    "cold",
    "cough",
    "pain",
    "headache",
    "migraine",
    "allergy",
    "acidity",
    "gas",
    "vomiting",
    "nausea",
    "bp",
    "sugar",
    "diabetes",
    "hypertension",
}

_MED_FORM_WORDS = {
    "tablet",
    "tablets",
    "tab",
    "tabs",
    "strip",
    "strips",
    "capsule",
    "capsules",
    "syrup",
    "ointment",
    "cream",
    "injection",
}


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", (text or "").lower())).strip()


def _compact_text(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (text or "").lower())


def _tokenize(text: str) -> set[str]:
    return {tok for tok in _normalize_text(text).split() if len(tok) >= 2}


def _build_embed_text(med: dict) -> str:
    parts = [
        med.get("name", ""),
        med.get("generic_name", "") or "",
        med.get("salt", "") or "",
        med.get("category", "") or "",
        med.get("description", "") or "",
    ]
    return " | ".join(p for p in parts if p)


def _build_index_record(med: dict) -> dict:
    name = med.get("name", "") or ""
    generic = med.get("generic_name", "") or ""
    salt = med.get("salt", "") or ""
    return {
        "name_norm": _normalize_text(name),
        "name_compact": _compact_text(name),
        "name_tokens": _tokenize(name),
        "generic_norm": _normalize_text(generic),
        "generic_compact": _compact_text(generic),
        "generic_tokens": _tokenize(generic),
        "salt_norm": _normalize_text(salt),
        "salt_compact": _compact_text(salt),
        "salt_tokens": _tokenize(salt),
    }


def _is_specific_medicine_query(query: str) -> bool:
    q_norm = _normalize_text(query)
    q_tokens = _tokenize(query)
    if not q_tokens:
        return False

    if any(tok in _SYMPTOM_HINTS for tok in q_tokens):
        return False

    if any(tok in _MED_FORM_WORDS for tok in q_tokens):
        return True

    if re.search(r"\b\d+\s*(mg|ml|mcg|g)\b", q_norm):
        return True

    # Short direct phrases are usually medicine names (e.g. "dolo 650")
    return len(q_tokens) <= 4 and any(len(tok) >= 4 for tok in q_tokens)


def _lexical_candidate_score(query: str, idx: dict) -> float:
    q_norm = _normalize_text(query)
    q_compact = _compact_text(query)
    q_tokens = _tokenize(query)

    if not q_norm:
        return 0.0

    score = 0.0

    # Strong exact/contains signals on brand name.
    if q_compact and q_compact == idx["name_compact"]:
        score = max(score, 1.0)
    elif q_compact and q_compact in idx["name_compact"]:
        score = max(score, 0.96)
    elif idx["name_compact"] and idx["name_compact"] in q_compact:
        score = max(score, 0.9)

    # Exact generic/salt lookup support (e.g. "paracetamol").
    if q_compact and idx["generic_compact"] and q_compact in idx["generic_compact"]:
        score = max(score, 0.92)
    if q_compact and idx["salt_compact"] and q_compact in idx["salt_compact"]:
        score = max(score, 0.9)

    if q_tokens:
        name_overlap = len(q_tokens & idx["name_tokens"]) / len(q_tokens)
        generic_overlap = len(q_tokens & idx["generic_tokens"]) / len(q_tokens)
        salt_overlap = len(q_tokens & idx["salt_tokens"]) / len(q_tokens)
        overlap_score = (0.72 * name_overlap) + (0.16 * generic_overlap) + (0.12 * salt_overlap)
        score = max(score, overlap_score)

    # Mild fuzzy support for typos.
    if len(q_norm) <= 48:
        name_ratio = SequenceMatcher(None, q_norm, idx["name_norm"]).ratio()
        score = max(score, name_ratio * 0.9)
        if len(q_tokens) <= 2 and idx["generic_norm"]:
            generic_ratio = SequenceMatcher(None, q_norm, idx["generic_norm"]).ratio()
            score = max(score, generic_ratio * 0.82)

    return min(score, 1.0)


def _lexical_search(query: str, top_k: int, category: str | None = None) -> list[dict]:
    if not _medicines:
        return []

    cat_lower = (category or "").lower().strip()
    hits = []

    for med, idx in zip(_medicines, _search_index):
        if cat_lower and (med.get("category") or "").lower() != cat_lower:
            continue

        score = _lexical_candidate_score(query, idx)
        if score < 0.62:
            continue

        item = med.copy()
        item["relevance_score"] = round(float(score), 3)
        item["search_mode"] = "lexical"
        hits.append(item)

    if not hits:
        return []

    hits.sort(
        key=lambda r: (r.get("relevance_score", 0), 1 if r.get("in_stock") else 0),
        reverse=True,
    )

    best = hits[0]["relevance_score"]
    if _is_specific_medicine_query(query):
        threshold = max(0.72, best - 0.12)
    else:
        threshold = max(0.65, best - 0.2)

    filtered = [h for h in hits if h["relevance_score"] >= threshold]
    return filtered[:top_k]


async def _semantic_search(query: str, top_k: int = 5, category: str | None = None) -> list[dict]:
    if _embeddings is None or len(_medicines) == 0:
        return []

    try:
        resp = await get_async_openai_client(force_refresh=True).embeddings.create(
            model=_EMBED_MODEL,
            input=[query],
        )
        q_vec = np.array(resp.data[0].embedding, dtype=np.float32)
    except Exception as err:
        logger.error("Query embedding failed: %s", err)
        return []

    norms = np.linalg.norm(_embeddings, axis=1) * np.linalg.norm(q_vec)
    norms = np.where(norms == 0, 1e-10, norms)
    similarities = _embeddings @ q_vec / norms

    if category:
        cat_lower = category.lower()
        for i, med in enumerate(_medicines):
            if (med.get("category") or "").lower() != cat_lower:
                similarities[i] = -1.0

    top_indices = np.argsort(similarities)[::-1][:top_k]

    results = []
    for idx in top_indices:
        score = float(similarities[idx])
        if score < 0.1:
            continue
        med = _medicines[idx].copy()
        med["relevance_score"] = round(score, 3)
        med["search_mode"] = "semantic"
        results.append(med)

    return results


def _merge_results(lexical_results: list[dict], semantic_results: list[dict], top_k: int) -> list[dict]:
    merged: dict[str, dict] = {}

    for item in lexical_results:
        med_id = str(item.get("medicine_id"))
        merged[med_id] = item

    for item in semantic_results:
        med_id = str(item.get("medicine_id"))
        current = merged.get(med_id)
        if current is None or item.get("relevance_score", 0) > current.get("relevance_score", 0):
            merged[med_id] = item

    ranked = sorted(
        merged.values(),
        key=lambda r: (r.get("relevance_score", 0), 1 if r.get("in_stock") else 0),
        reverse=True,
    )
    return ranked[:top_k]


def _apply_result_filters(
    results: list[dict],
    *,
    otc_only: bool = False,
    in_stock_only: bool = False,
    top_k: int = 5,
) -> list[dict]:
    filtered: list[dict] = []
    for med in results:
        if otc_only and bool(med.get("prescription_required", False)):
            continue
        if in_stock_only and not bool(med.get("in_stock", False)):
            continue
        filtered.append(med)
        if len(filtered) >= max(1, top_k):
            break
    return filtered


async def init_medicine_search() -> None:
    """Load medicine catalog and build hybrid search indexes."""
    global _embeddings, _medicines, _search_index, _initialized

    if _initialized:
        logger.info("Medicine search already initialized - skipping")
        return

    from app.models.inventory import Inventory
    from app.models.medicine import Medicine

    async with async_session_factory() as session:
        result = await session.execute(select(Medicine).where(Medicine.is_active == True))  # noqa: E712
        db_medicines = result.scalars().all()

        inv_result = await session.execute(select(Inventory))
        inventory_map = {}
        for inv in inv_result.scalars().all():
            inventory_map[str(inv.medicine_id)] = {
                "stock": inv.stock_quantity,
                "unit": inv.unit_type,
            }

    if not db_medicines:
        logger.warning("No medicines found in database - search will be empty")
        _initialized = True
        return

    _medicines.clear()
    _search_index.clear()
    texts = []

    for med in db_medicines:
        med_id = str(med.medicine_id)
        stock_info = inventory_map.get(med_id, {"stock": 0, "unit": "tablets"})
        med_dict = {
            "medicine_id": med_id,
            "name": med.name,
            "generic_name": med.generic_name,
            "salt": med.salt,
            "description": med.description,
            "dosage": med.dosage,
            "pack_sizes": med.pack_sizes if isinstance(med.pack_sizes, list) else [],
            "price": med.price,
            "category": med.category,
            "prescription_required": med.prescription_required,
            "manufacturer": med.manufacturer,
            "max_per_order": med.max_per_order,
            "stock": stock_info["stock"],
            "unit": stock_info["unit"],
            "in_stock": stock_info["stock"] > 0,
            "active_ingredients": med.active_ingredients if isinstance(getattr(med, "active_ingredients", None), list) else [],
            "atc_code": getattr(med, "atc_code", None),
            "counseling_info": med.counseling_info if isinstance(getattr(med, "counseling_info", None), dict) else {},
        }
        _medicines.append(med_dict)
        _search_index.append(_build_index_record(med_dict))
        texts.append(_build_embed_text(med_dict))

    logger.info("Embedding %d medicines with %s...", len(texts), _EMBED_MODEL)
    try:
        resp = await get_async_openai_client(force_refresh=True).embeddings.create(
            model=_EMBED_MODEL,
            input=texts,
        )
        vecs = [item.embedding for item in resp.data]
        _embeddings = np.array(vecs, dtype=np.float32)
        _initialized = True
        logger.info(
            "Medicine search ready - %d medicines embedded (%dD)",
            len(_medicines),
            _embeddings.shape[1],
        )
    except Exception as err:
        logger.error("Failed to embed medicines: %s", err)
        _initialized = True


async def search_medicines(
    query: str,
    top_k: int = 5,
    category: str | None = None,
    otc_only: bool = False,
    in_stock_only: bool = False,
) -> list[dict]:
    """Search medicines using lexical fast path + semantic fallback."""
    if len(_medicines) == 0:
        logger.warning("Medicine search not initialized - returning empty")
        return []

    lexical_results = _lexical_search(query=query, top_k=top_k, category=category)
    if lexical_results:
        best = lexical_results[0].get("relevance_score", 0.0)
        # For explicit medicine names, avoid embedding calls to reduce latency.
        if _is_specific_medicine_query(query):
            logger.info(
                "Search '%s' -> lexical explicit fast path %d results (top: %s)",
                query,
                len(lexical_results),
                lexical_results[0].get("name", "none"),
            )
            return _apply_result_filters(
                lexical_results,
                otc_only=otc_only,
                in_stock_only=in_stock_only,
                top_k=top_k,
            )
        # Strong lexical match also skips embedding fallback.
        if best >= 0.86:
            logger.info(
                "Search '%s' -> lexical fast path %d results (top: %s)",
                query,
                len(lexical_results),
                lexical_results[0].get("name", "none"),
            )
            return _apply_result_filters(
                lexical_results,
                otc_only=otc_only,
                in_stock_only=in_stock_only,
                top_k=top_k,
            )

    semantic_results = await _semantic_search(query=query, top_k=top_k, category=category)
    if not semantic_results:
        logger.info(
            "Search '%s' -> lexical only %d results (top: %s)",
            query,
            len(lexical_results),
            lexical_results[0].get("name", "none") if lexical_results else "none",
        )
        return _apply_result_filters(
            lexical_results,
            otc_only=otc_only,
            in_stock_only=in_stock_only,
            top_k=top_k,
        )

    if lexical_results and lexical_results[0].get("relevance_score", 0.0) >= 0.74:
        merged = _merge_results(lexical_results, semantic_results, top_k=top_k)
        mode = "hybrid"
    else:
        merged = semantic_results[:top_k]
        mode = "semantic"

    logger.info(
        "Search '%s' -> %s %d results (top: %s)",
        query,
        mode,
        len(merged),
        merged[0].get("name", "none") if merged else "none",
    )
    return _apply_result_filters(
        merged,
        otc_only=otc_only,
        in_stock_only=in_stock_only,
        top_k=top_k,
    )


async def get_medicine_by_name(name: str) -> dict | None:
    """Resolve medicine by name using lexical fast path first."""
    if not name:
        return None

    lexical = _lexical_search(name, top_k=1)
    if lexical and lexical[0].get("relevance_score", 0.0) >= 0.72:
        return lexical[0].copy()

    results = await search_medicines(name, top_k=1)
    return results[0] if results else None


async def resolve_medicine_candidates(query: str, top_k: int = 3) -> dict:
    """Resolve likely medicine candidates with confidence bands for confirm-first flows."""
    clean = str(query or "").strip()
    if not clean:
        return {"status": "none", "best_confidence": 0.0, "candidates": []}

    results = await search_medicines(clean, top_k=max(1, min(top_k, 5)))
    candidates: list[dict] = []
    for med in results:
        try:
            confidence = float(med.get("relevance_score", 0.0) or 0.0)
        except (TypeError, ValueError):
            confidence = 0.0
        if confidence < 0.55:
            continue
        candidates.append(
            {
                "medicine_id": str(med.get("medicine_id", "") or ""),
                "name": med.get("name", ""),
                "generic_name": med.get("generic_name", ""),
                "dosage": med.get("dosage", ""),
                "price": float(med.get("price", 0) or 0),
                "prescription_required": bool(med.get("prescription_required", False)),
                "in_stock": bool(med.get("in_stock", False)),
                "confidence": round(confidence, 3),
            }
        )

    if not candidates:
        return {"status": "none", "best_confidence": 0.0, "candidates": []}

    candidates.sort(key=lambda item: float(item.get("confidence", 0.0)), reverse=True)
    best_confidence = float(candidates[0].get("confidence", 0.0))
    if best_confidence >= 0.86:
        status = "high_confidence"
    elif best_confidence >= 0.65:
        status = "low_confidence"
    else:
        status = "none"

    return {
        "status": status,
        "best_confidence": round(best_confidence, 3),
        "candidates": candidates[: max(1, min(top_k, 5))],
    }


async def check_stock(medicine_name: str) -> dict:
    """Check inventory for a specific medicine."""
    med = await get_medicine_by_name(medicine_name)
    if not med:
        return {
            "found": False,
            "medicine": medicine_name,
            "message": f"Medicine '{medicine_name}' not found",
        }
    return {
        "found": True,
        "medicine": med["name"],
        "in_stock": med["in_stock"],
        "stock_quantity": med["stock"],
        "unit": med["unit"],
        "price": med["price"],
    }
