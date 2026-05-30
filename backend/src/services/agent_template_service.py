"""Agent prompt template CRUD."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.agent import Agent
from src.models.agent_prompt_template import AgentPromptTemplate
from src.schemas.agent_template import AgentPromptTemplateCreate, AgentPromptTemplateUpdate


class AgentTemplateService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_agent(self, agent_id: UUID) -> Agent:
        agent = await self.db.get(Agent, agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        return agent

    async def list_templates(self, agent_id: UUID) -> list[AgentPromptTemplate]:
        await self._get_agent(agent_id)
        result = await self.db.execute(
            select(AgentPromptTemplate)
            .where(AgentPromptTemplate.agent_id == agent_id)
            .order_by(AgentPromptTemplate.order_index, AgentPromptTemplate.created_at)
        )
        return list(result.scalars().all())

    async def create(
        self, agent_id: UUID, payload: AgentPromptTemplateCreate
    ) -> AgentPromptTemplate:
        await self._get_agent(agent_id)
        existing = await self.db.execute(
            select(AgentPromptTemplate).where(
                AgentPromptTemplate.agent_id == agent_id,
                AgentPromptTemplate.slug == payload.slug,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Template slug already exists")
        tpl = AgentPromptTemplate(agent_id=agent_id, **payload.model_dump())
        self.db.add(tpl)
        await self.db.flush()
        return tpl

    async def update(
        self, agent_id: UUID, template_id: UUID, payload: AgentPromptTemplateUpdate
    ) -> AgentPromptTemplate:
        tpl = await self._get_template(agent_id, template_id)
        for k, v in payload.model_dump(exclude_unset=True).items():
            setattr(tpl, k, v)
        await self.db.flush()
        return tpl

    async def delete(self, agent_id: UUID, template_id: UUID) -> None:
        tpl = await self._get_template(agent_id, template_id)
        await self.db.delete(tpl)

    async def _get_template(self, agent_id: UUID, template_id: UUID) -> AgentPromptTemplate:
        result = await self.db.execute(
            select(AgentPromptTemplate).where(
                AgentPromptTemplate.id == template_id,
                AgentPromptTemplate.agent_id == agent_id,
            )
        )
        tpl = result.scalar_one_or_none()
        if not tpl:
            raise HTTPException(status_code=404, detail="Template not found")
        return tpl
