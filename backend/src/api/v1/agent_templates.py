"""Agent prompt template endpoints."""

from uuid import UUID

from fastapi import APIRouter, status

from src.api.dependencies import DB, CurrentUser
from src.schemas.agent_template import (
    AgentPromptTemplateCreate,
    AgentPromptTemplateRead,
    AgentPromptTemplateUpdate,
)
from src.services.agent_template_service import AgentTemplateService

router = APIRouter()


@router.get("/agents/{agent_id}/templates", response_model=list[AgentPromptTemplateRead])
async def list_templates(agent_id: UUID, db: DB, _user: CurrentUser):
    return await AgentTemplateService(db).list_templates(agent_id)


@router.post(
    "/agents/{agent_id}/templates",
    response_model=AgentPromptTemplateRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_template(
    agent_id: UUID, payload: AgentPromptTemplateCreate, db: DB, _user: CurrentUser
):
    tpl = await AgentTemplateService(db).create(agent_id, payload)
    await db.commit()
    return tpl


@router.patch(
    "/agents/{agent_id}/templates/{template_id}",
    response_model=AgentPromptTemplateRead,
)
async def update_template(
    agent_id: UUID,
    template_id: UUID,
    payload: AgentPromptTemplateUpdate,
    db: DB,
    _user: CurrentUser,
):
    tpl = await AgentTemplateService(db).update(agent_id, template_id, payload)
    await db.commit()
    return tpl


@router.delete(
    "/agents/{agent_id}/templates/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_template(agent_id: UUID, template_id: UUID, db: DB, _user: CurrentUser):
    await AgentTemplateService(db).delete(agent_id, template_id)
    await db.commit()
