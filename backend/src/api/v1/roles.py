"""Role endpoints."""

from fastapi import APIRouter
from sqlalchemy import select

from src.api.dependencies import DB, CurrentSuperuser
from src.models.permission import Role
from src.schemas.user import RoleRead

router = APIRouter()


@router.get("", response_model=list[RoleRead])
async def list_roles(db: DB, _admin: CurrentSuperuser):
    result = await db.execute(select(Role).order_by(Role.name))
    return list(result.scalars().all())
