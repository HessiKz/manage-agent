"""User endpoints (admin)."""

import secrets

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from src.api.dependencies import DB, CurrentSuperuser
from src.core.security import hash_password
from src.models.permission import Role
from src.repositories.user_repo import UserRepository
from src.schemas.user import UserAdminCreate, UserCreate, UserRead
from src.services.auth_service import AuthService

router = APIRouter()


@router.get("", response_model=list[UserRead])
async def list_users(
    db: DB,
    _admin: CurrentSuperuser,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    repo = UserRepository(db)
    users = await repo.list_with_roles(offset=(page - 1) * page_size, limit=page_size)
    return users


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserAdminCreate, db: DB, _admin: CurrentSuperuser):
    password = (payload.password or "").strip() or secrets.token_urlsafe(12)
    user = await AuthService(db).register(
        UserCreate(
            email=payload.email,
            password=password,
            full_name=payload.full_name,
            locale=payload.locale,
            department=payload.department,
            title=payload.title,
            phone=payload.phone,
            address=payload.address,
            is_superuser=payload.is_superuser,
        )
    )
    role_name = (payload.role_name or "").strip()
    if role_name:
        result = await db.execute(select(Role).where(Role.name == role_name))
        role = result.scalar_one_or_none()
        if not role:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Role '{role_name}' not found",
            )
        user.roles.append(role)
        await db.commit()
        await db.refresh(user)
    return user
