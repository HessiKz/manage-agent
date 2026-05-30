"""Agent user permission endpoints."""

from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import select

from src.api.dependencies import DB, CurrentSuperuser
from src.models.agent import Agent
from src.models.agent_permission import AgentUserPermission
from src.models.user import User
from src.schemas.agent_permission import AgentPermissionCreate, AgentPermissionMatrix, AgentPermissionRead

router = APIRouter()


@router.get("", response_model=list[AgentPermissionMatrix])
async def permission_matrix(db: DB, _admin: CurrentSuperuser):
    stmt = (
        select(
            AgentUserPermission,
            User.full_name,
            Agent.name,
        )
        .join(User, User.id == AgentUserPermission.user_id)
        .join(Agent, Agent.id == AgentUserPermission.agent_id)
    )
    rows = (await db.execute(stmt)).all()
    return [
        AgentPermissionMatrix(
            user_id=p.user_id,
            user_name=full_name,
            agent_id=p.agent_id,
            agent_name=agent_name,
            can_invoke=p.can_invoke,
            can_configure=p.can_configure,
        )
        for p, full_name, agent_name in rows
    ]


@router.post("", response_model=AgentPermissionRead, status_code=status.HTTP_201_CREATED)
async def grant_permission(payload: AgentPermissionCreate, db: DB, _admin: CurrentSuperuser):
    perm = AgentUserPermission(**payload.model_dump())
    db.add(perm)
    await db.commit()
    await db.refresh(perm)
    return perm


@router.delete("/{permission_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_permission(permission_id: UUID, db: DB, _admin: CurrentSuperuser):
    perm = await db.get(AgentUserPermission, permission_id)
    if perm:
        await db.delete(perm)
        await db.commit()
