"""Agent repository."""

from sqlalchemy import select

from src.models.agent import Agent
from src.repositories.base import BaseRepository


class AgentRepository(BaseRepository[Agent]):
    model = Agent

    async def get_by_slug(self, slug: str) -> Agent | None:
        stmt = select(Agent).where(Agent.slug == slug)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_filtered(
        self,
        *,
        offset: int = 0,
        limit: int = 50,
        department: str | None = None,
        status: str | None = None,
        search: str | None = None,
        catalog_only: bool = False,
    ) -> tuple[list[Agent], int]:
        from sqlalchemy import func, or_

        from src.core.catalog import CATALOG_SLUGS
        from src.models.agent import AgentStatus

        stmt = select(Agent)
        count_stmt = select(func.count()).select_from(Agent)

        if department:
            stmt = stmt.where(Agent.department == department)
            count_stmt = count_stmt.where(Agent.department == department)
        if status:
            stmt = stmt.where(Agent.status == status)
            count_stmt = count_stmt.where(Agent.status == status)
        elif catalog_only:
            stmt = stmt.where(Agent.status == AgentStatus.ACTIVE)
            count_stmt = count_stmt.where(Agent.status == AgentStatus.ACTIVE)
        if catalog_only:
            stmt = stmt.where(Agent.slug.in_(CATALOG_SLUGS))
            count_stmt = count_stmt.where(Agent.slug.in_(CATALOG_SLUGS))
        if search:
            pattern = f"%{search}%"
            cond = or_(Agent.name.ilike(pattern), Agent.description.ilike(pattern))
            stmt = stmt.where(cond)
            count_stmt = count_stmt.where(cond)

        order = Agent.name.asc() if catalog_only else Agent.created_at.desc()
        stmt = stmt.order_by(order).offset(offset).limit(limit)

        items = list((await self.db.execute(stmt)).scalars().all())
        total = int((await self.db.execute(count_stmt)).scalar_one())
        return items, total
