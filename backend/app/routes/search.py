"""Semantic search route — context-aware medicine search for patients."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.services.semantic_search import semantic_search


router = APIRouter(prefix="/api/search", tags=["search"])


class SearchRequest(BaseModel):
    query: str
    limit: int = 12


@router.post("")
async def search_medicines(
    request: SearchRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Context-aware semantic medicine search with explainability."""
    user_id = str(user.user_id) if user else None
    return await semantic_search(db, request.query, user_id=user_id, limit=request.limit)
