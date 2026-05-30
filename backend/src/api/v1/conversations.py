"""Recent conversations derived from activity logs — list and resume."""

from uuid import UUID

from fastapi import APIRouter, Query

from src.api.dependencies import DB, CurrentUser
from src.schemas.conversation import ConversationDetail, ConversationListItem
from src.services.conversation_service import ConversationService

router = APIRouter()


@router.get("", response_model=list[ConversationListItem])
async def list_conversations(db: DB, user: CurrentUser, limit: int = Query(30, ge=1, le=100)):
    return await ConversationService(db).list_for_user(user, limit=limit)


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(conversation_id: UUID, db: DB, user: CurrentUser):
    """Full message history + thread_id so the client can continue the chat."""
    return await ConversationService(db).get_for_user(conversation_id, user)
