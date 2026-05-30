"""Generic base repository with common CRUD operations."""

from typing import Generic, TypeVar
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.base import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    """Generic async repository."""

    model: type[ModelT]

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, id_: UUID) -> ModelT | None:
        return await self.db.get(self.model, id_)

    async def list(
        self,
        *,
        offset: int = 0,
        limit: int = 50,
        **filters,
    ) -> list[ModelT]:
        stmt = select(self.model)
        for k, v in filters.items():
            if v is not None:
                stmt = stmt.where(getattr(self.model, k) == v)
        stmt = stmt.offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count(self, **filters) -> int:
        stmt = select(func.count()).select_from(self.model)
        for k, v in filters.items():
            if v is not None:
                stmt = stmt.where(getattr(self.model, k) == v)
        result = await self.db.execute(stmt)
        return int(result.scalar_one())

    async def create(self, obj: ModelT) -> ModelT:
        self.db.add(obj)
        await self.db.flush()
        await self.db.refresh(obj)
        return obj

    async def delete(self, obj: ModelT) -> None:
        await self.db.delete(obj)
        await self.db.flush()
