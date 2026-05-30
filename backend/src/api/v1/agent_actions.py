"""Agent action endpoints."""

from uuid import UUID

from fastapi import APIRouter, status

from src.api.dependencies import DB, CurrentUser
from src.schemas.agent import AgentInvokeResponse
from src.schemas.agent_action import (
    AgentActionCreate,
    AgentActionRead,
    AgentActionRunRequest,
    AgentActionUpdate,
)
from src.services.agent_action_service import AgentActionService

router = APIRouter()


@router.get("/agents/{agent_id}/actions", response_model=list[AgentActionRead])
async def list_actions(agent_id: UUID, db: DB, _user: CurrentUser):
    return await AgentActionService(db).list_actions(agent_id)


@router.post(
    "/agents/{agent_id}/actions",
    response_model=AgentActionRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_action(
    agent_id: UUID, payload: AgentActionCreate, db: DB, _user: CurrentUser
):
    action = await AgentActionService(db).create(agent_id, payload)
    await db.commit()
    return action


@router.patch("/agents/{agent_id}/actions/{action_id}", response_model=AgentActionRead)
async def update_action(
    agent_id: UUID,
    action_id: UUID,
    payload: AgentActionUpdate,
    db: DB,
    _user: CurrentUser,
):
    action = await AgentActionService(db).update(agent_id, action_id, payload)
    await db.commit()
    return action


@router.delete("/agents/{agent_id}/actions/{action_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_action(agent_id: UUID, action_id: UUID, db: DB, _user: CurrentUser):
    await AgentActionService(db).delete(agent_id, action_id)
    await db.commit()


@router.post(
    "/agents/{agent_id}/actions/{slug}/run",
    response_model=AgentInvokeResponse,
)
async def run_action(
    agent_id: UUID,
    slug: str,
    payload: AgentActionRunRequest,
    db: DB,
    user: CurrentUser,
):
    return await AgentActionService(db).run(agent_id, slug, payload, user)
