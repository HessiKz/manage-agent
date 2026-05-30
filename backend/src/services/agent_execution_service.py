"""Build execution-tab payload (docs + live actions/templates)."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.demo.agent_execution_profiles import execution_profile_for_agent
from src.models.agent import Agent
from src.models.agent_action import AgentAction
from src.models.agent_prompt_template import AgentPromptTemplate
from src.repositories.agent_repo import AgentRepository
from src.schemas.agent_execution import (
    AgentExecutionActionRef,
    AgentExecutionRead,
    AgentExecutionTemplateRef,
)


class AgentExecutionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.agents = AgentRepository(db)

    async def get_for_agent_id(self, agent_id: UUID) -> AgentExecutionRead:
        agent = await self.agents.get(agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        return await self.build(agent)

    async def build(self, agent: Agent) -> AgentExecutionRead:
        raw = execution_profile_for_agent(agent)

        actions_result = await self.db.execute(
            select(AgentAction)
            .where(AgentAction.agent_id == agent.id)
            .order_by(AgentAction.order_index)
        )
        actions = [
            AgentExecutionActionRef(
                slug=a.slug,
                label=a.label,
                description=a.description,
            )
            for a in actions_result.scalars().all()
        ]

        templates_result = await self.db.execute(
            select(AgentPromptTemplate)
            .where(AgentPromptTemplate.agent_id == agent.id)
            .order_by(AgentPromptTemplate.order_index)
        )
        templates = [
            AgentExecutionTemplateRef(slug=t.slug, label=t.label, body=t.body)
            for t in templates_result.scalars().all()
        ]

        tools = list(agent.tool_names or [])

        return AgentExecutionRead(
            profile=raw["profile"],
            domain_label=raw["domain_label"],
            headline=raw["headline"],
            summary=raw["summary"],
            responsibilities=raw["responsibilities"],
            how_to_steps=raw["how_to_steps"],
            inputs=raw.get("inputs", []),
            outputs=raw.get("outputs", []),
            tips=raw.get("tips", []),
            actions=actions,
            templates=templates,
            tools=tools,
        )
