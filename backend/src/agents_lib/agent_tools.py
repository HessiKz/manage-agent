"""Register callable agents as LangChain tools."""

from __future__ import annotations

from uuid import UUID

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.agents_lib.tool_registry import ToolRegistry
from src.models.agent import Agent
from src.models.agent_link import AgentLink, AgentLinkType
from src.models.agent_permission import AgentUserPermission
from src.models.audit_log import AuditLog
from src.models.user import User
from src.schemas.agent import AgentInvokeRequest


class CallAgentInput(BaseModel):
    input: str = Field(..., description="Message or instruction for the callee agent")
    thread_id: str | None = Field(None, description="Optional thread id for memory")


class AgentToolLoader:
    @classmethod
    async def slugs_for_agent(cls, db: AsyncSession, agent: Agent) -> list[str]:
        result = await db.execute(
            select(AgentLink)
            .options(selectinload(AgentLink.callee))
            .where(
                AgentLink.caller_agent_id == agent.id,
                AgentLink.link_type == AgentLinkType.TOOL,
            )
        )
        return [f"call_agent_{link.callee.slug}" for link in result.scalars().all()]

    @classmethod
    async def register_for_agent(
        cls,
        db: AsyncSession,
        agent: Agent,
        user: User,
        *,
        depth: int = 0,
    ) -> int:
        result = await db.execute(
            select(AgentLink)
            .options(selectinload(AgentLink.callee))
            .where(
                AgentLink.caller_agent_id == agent.id,
                AgentLink.link_type == AgentLinkType.TOOL,
            )
        )
        links = list(result.scalars().all())
        count = 0
        link_policy = agent.agent_link_policy or {}
        max_depth = int(link_policy.get("max_depth", 3))

        for link in links:
            slug = f"call_agent_{link.callee.slug}"
            if slug in ToolRegistry.list_slugs():
                continue

            callee = link.callee
            callee_id = callee.id
            callee_slug = callee.slug
            requires_perm = link.requires_user_permission

            async def _call(
                input: str,
                thread_id: str | None = None,
                _callee_id: UUID = callee_id,
                _callee_slug: str = callee_slug,
                _requires: bool = requires_perm,
                _db: AsyncSession = db,
                _user: User = user,
                _depth: int = depth,
                _max_depth: int = max_depth,
            ) -> str:
                if _depth >= _max_depth:
                    return f"Max agent call depth ({_max_depth}) reached."

                if _requires:
                    perm = await _db.execute(
                        select(AgentUserPermission).where(
                            AgentUserPermission.user_id == _user.id,
                            AgentUserPermission.agent_id == _callee_id,
                            AgentUserPermission.can_invoke.is_(True),
                        )
                    )
                    if not perm.scalar_one_or_none() and not _user.is_superuser:
                        return f"Permission denied to call agent '{_callee_slug}'."

                from src.services.orchestrator_service import OrchestratorService

                _db.add(
                    AuditLog(
                        action="agent.link_call",
                        resource_type="agent",
                        resource_id=_callee_id,
                        user_id=_user.id,
                        changes={
                            "caller_depth": _depth,
                            "callee_slug": _callee_slug,
                            "input_preview": input[:200],
                        },
                    )
                )

                response = await OrchestratorService(_db).invoke(
                    _callee_id,
                    AgentInvokeRequest(input=input, thread_id=thread_id, stream=False),
                    _user,
                    depth=_depth + 1,
                )
                return response.output

            tool = StructuredTool.from_function(
                coroutine=_call,
                name=slug,
                description=link.description or f"Delegate to agent {callee.name}",
                args_schema=CallAgentInput,
            )
            try:
                ToolRegistry.register(slug, tool)
                count += 1
            except ValueError:
                pass
        return count
