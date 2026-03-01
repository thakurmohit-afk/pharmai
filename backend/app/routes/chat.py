"""Chat route — main conversation endpoint invoking the LangGraph workflow."""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.errors import ServiceError
from app.schemas.chat import ChatRequest, ChatResponse
from app.models.user import User
from app.services.chat_service import process_chat_message
from app.agents.watcher import extract_and_store_facts

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Accept a user message, run it through the agent pipeline, return response."""
    try:
        result = await process_chat_message(
            user_id=str(current_user.user_id),
            message=request.message,
            conversation_id=request.conversation_id,
            db=db,
        )
        # Run Fact Extraction in the background so it doesn't block the user
        background_tasks.add_task(
            extract_and_store_facts,
            str(current_user.user_id),
            request.message
        )
        return result
    except ServiceError as err:
        raise HTTPException(status_code=err.status_code, detail=err.to_detail()) from err
