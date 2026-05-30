"""User endpoints (admin)."""

from fastapi import APIRouter, Query

from src.api.dependencies import DB, CurrentSuperuser
from src.repositories.user_repo import UserRepository
from src.schemas.user import UserRead

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
