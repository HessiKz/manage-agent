"""Build execution-tab payload (docs + live actions/templates)."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.agent import Agent
from src.models.agent_action import AgentAction
from src.models.agent_prompt_template import AgentPromptTemplate
from src.repositories.agent_repo import AgentRepository
from src.schemas.agent_execution import (
    AgentExecutionActionRef,
    AgentExecutionRead,
    AgentExecutionTemplateRef,
)
from src.services.agent_execution_guide_service import resolve_execution_guide


class AgentExecutionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.agents = AgentRepository(db)

    async def get_for_agent_id(
        self, agent_id: UUID, *, force_refresh: bool = False
    ) -> AgentExecutionRead:
        agent = await self.agents.get(agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        return await self.build(agent, force_refresh=force_refresh)

    async def build(self, agent: Agent, *, force_refresh: bool = False) -> AgentExecutionRead:
        actions_result = await self.db.execute(
            select(AgentAction)
            .where(AgentAction.agent_id == agent.id)
            .order_by(AgentAction.order_index)
        )
        action_rows = list(actions_result.scalars().all())
        actions = [
            AgentExecutionActionRef(
                slug=a.slug,
                label=a.label,
                description=a.description,
            )
            for a in action_rows
        ]

        templates_result = await self.db.execute(
            select(AgentPromptTemplate)
            .where(AgentPromptTemplate.agent_id == agent.id)
            .order_by(AgentPromptTemplate.order_index)
        )
        template_rows = list(templates_result.scalars().all())
        templates = [
            AgentExecutionTemplateRef(slug=t.slug, label=t.label, body=t.body)
            for t in template_rows
        ]

        guide, test_steps, source = await resolve_execution_guide(
            self.db,
            agent,
            action_rows,
            template_rows,
            force_refresh=force_refresh,
        )

        tools = list(agent.tool_names or [])

        return AgentExecutionRead(
            profile=guide["profile"],
            domain_label=guide["domain_label"],
            headline=guide["headline"],
            summary=guide["summary"],
            responsibilities=guide["responsibilities"],
            how_to_steps=guide["how_to_steps"],
            inputs=guide.get("inputs", []),
            outputs=guide.get("outputs", []),
            tips=guide.get("tips", []),
            actions=actions,
            templates=templates,
            tools=tools,
            test_steps=test_steps,
            guide_source=source,
        )
