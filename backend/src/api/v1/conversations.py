"""Recent conversations derived from activity logs — list and resume."""

from uuid import UUID

from fastapi import APIRouter, Query

from src.api.dependencies import DB, CurrentUser
from src.schemas.conversation import (
    ConversationDetail,
    ConversationListItem,
    ConversationMessage,
    SupportThreadListItem,
)
from src.services.conversation_service import ConversationService

router = APIRouter()


@router.get("", response_model=list[ConversationListItem])
async def list_conversations(db: DB, user: CurrentUser, limit: int = Query(30, ge=1, le=100)):
    return await ConversationService(db).list_for_user(user, limit=limit)


@router.get("/support-threads", response_model=list[SupportThreadListItem])
async def list_support_threads(
    db: DB,
    user: CurrentUser,
    agent_id: UUID = Query(...),
    limit: int = Query(40, ge=1, le=100),
):
    """Distinct support-assistant chat threads for the current user (not in sidebar list)."""
    return await ConversationService(db).list_support_threads(user, agent_id, limit=limit)


@router.get("/thread/messages", response_model=list[ConversationMessage])
async def get_thread_messages(
    db: DB,
    user: CurrentUser,
    agent_id: UUID = Query(...),
    thread_id: str = Query(..., min_length=8),
):
    """Full thread history for a user-owned chat (e.g. platform support assistant)."""
    return await ConversationService(db).get_thread_messages_for_user(user, agent_id, thread_id)


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(conversation_id: UUID, db: DB, user: CurrentUser):
    """Full message history + thread_id so the client can continue the chat."""
    return await ConversationService(db).get_for_user(conversation_id, user)
