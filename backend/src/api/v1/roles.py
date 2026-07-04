"""Role endpoints."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from src.api.dependencies import DB, CurrentSuperuser
from src.models.permission import Role
from src.schemas.user import RoleCreate, RoleRead

router = APIRouter()


@router.get("", response_model=list[RoleRead])
async def list_roles(db: DB, _admin: CurrentSuperuser):
    result = await db.execute(select(Role).order_by(Role.name))
    return list(result.scalars().all())


@router.post("", response_model=RoleRead, status_code=status.HTTP_201_CREATED)
async def create_role(payload: RoleCreate, db: DB, _admin: CurrentSuperuser):
    existing = await db.execute(select(Role).where(Role.name == payload.name.strip()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Role already exists")
    role = Role(name=payload.name.strip(), description=payload.description)
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return role
