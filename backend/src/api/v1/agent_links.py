"""Agent link endpoints."""

from uuid import UUID

from fastapi import APIRouter, status

from src.api.dependencies import DB, CurrentSuperuser, CurrentUser
from src.schemas.agent_link import AgentLinkCreate, AgentLinkGraph, AgentLinkRead
from src.services.agent_link_service import AgentLinkService

router = APIRouter()


@router.get("/agents/{agent_id}/links", response_model=list[AgentLinkRead])
async def list_links(agent_id: UUID, db: DB, _user: CurrentUser):
    return await AgentLinkService(db).list_links(agent_id)


@router.get("/agents/{agent_id}/links/graph", response_model=AgentLinkGraph)
async def link_graph(agent_id: UUID, db: DB, _user: CurrentUser):
    return await AgentLinkService(db).graph(agent_id)


@router.post(
    "/agents/{agent_id}/links",
    response_model=AgentLinkRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_link(
    agent_id: UUID, payload: AgentLinkCreate, db: DB, _admin: CurrentSuperuser
):
    link = await AgentLinkService(db).create(agent_id, payload)
    await db.commit()
    result = await AgentLinkService(db).list_links(agent_id)
    return next((r for r in result if r.id == link.id), AgentLinkRead.model_validate(link))


@router.delete("/agents/{agent_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_link(agent_id: UUID, link_id: UUID, db: DB, _admin: CurrentSuperuser):
    await AgentLinkService(db).delete(link_id)
    await db.commit()
