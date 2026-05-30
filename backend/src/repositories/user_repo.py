"""User repository."""

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.models.user import User
from src.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User

    async def get_by_email(self, email: str) -> User | None:
        stmt = (
            select(User)
            .where(User.email == email.lower())
            .options(selectinload(User.roles))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_with_roles(self, offset: int = 0, limit: int = 50) -> list[User]:
        stmt = (
            select(User)
            .options(selectinload(User.roles))
            .offset(offset)
            .limit(limit)
            .order_by(User.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
