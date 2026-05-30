"""Load LangChain tools from external API endpoint definitions (per-agent bindings)."""

from __future__ import annotations

import json
from uuid import UUID

from langchain_core.tools import StructuredTool
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.agents_lib.tool_registry import ToolRegistry
from src.models.agent import Agent, AgentKind
from src.models.external_api import ExternalApiEndpoint, ExternalApiService
from src.schemas.agent_api_bindings import parse_api_bindings
from src.services.external_api_service import ExternalApiServiceLayer


def agent_uses_external_apis(agent: Agent) -> bool:
    caps = agent.capabilities or {}
    return bool(caps.get("external_apis_enabled"))


class DynamicToolLoader:
    @classmethod
    async def _endpoints_for_agent(cls, db: AsyncSession, agent: Agent) -> list[ExternalApiEndpoint]:
        if not agent_uses_external_apis(agent):
            return []

        bindings = parse_api_bindings(agent.config_json)
        if bindings.is_empty():
            return []

        filters = []
        if bindings.service_ids:
            filters.append(ExternalApiEndpoint.service_id.in_(bindings.service_ids))
        if bindings.endpoint_ids:
            filters.append(ExternalApiEndpoint.id.in_(bindings.endpoint_ids))
        if not filters:
            return []

        result = await db.execute(
            select(ExternalApiEndpoint)
            .options(selectinload(ExternalApiEndpoint.service))
            .join(ExternalApiService)
            .where(
                ExternalApiEndpoint.register_as_tool.is_(True),
                ExternalApiEndpoint.is_active.is_(True),
                ExternalApiService.is_active.is_(True),
                or_(*filters),
            )
        )
        return list(result.scalars().all())

    @classmethod
    async def slugs_for_agent(cls, db: AsyncSession, agent_id: UUID) -> list[str]:
        agent = await db.get(Agent, agent_id)
        if not agent:
            return []
        endpoints = await cls._endpoints_for_agent(db, agent)
        return [f"ext_{ep.id}" for ep in endpoints]

    @classmethod
    async def register_for_agent(cls, db: AsyncSession, agent: Agent) -> int:
        """Register bound external endpoints as tools for this agent. Returns count."""
        endpoints = await cls._endpoints_for_agent(db, agent)
        if not endpoints:
            return 0

        layer = ExternalApiServiceLayer(db)
        count = 0
        for ep in endpoints:
            slug = f"ext_{ep.id}"
            if slug in ToolRegistry.list_slugs():
                count += 1
                continue

            async def _call(
                _ep_id: UUID = ep.id,
                params_json: str = "{}",
                body_json: str = "{}",
                _db: AsyncSession = db,
                _layer: ExternalApiServiceLayer = layer,
            ) -> dict:
                params = json.loads(params_json) if params_json else {}
                body = json.loads(body_json) if body_json else {}
                return await _layer.test_endpoint(_ep_id, params, body)

            svc_name = ep.service.name if ep.service else "API"
            tool = StructuredTool.from_function(
                coroutine=_call,
                name=slug,
                description=ep.description or f"Call {svc_name} — {ep.name} ({ep.method.value})",
            )
            try:
                ToolRegistry.register(slug, tool)
                count += 1
            except ValueError:
                count += 1
        return count

    @classmethod
    async def register_all(cls, db: AsyncSession) -> int:
        """Register all active external endpoints (startup). Returns count."""
        result = await db.execute(
            select(ExternalApiEndpoint)
            .options(selectinload(ExternalApiEndpoint.service))
            .join(ExternalApiService)
            .where(
                ExternalApiEndpoint.register_as_tool.is_(True),
                ExternalApiEndpoint.is_active.is_(True),
                ExternalApiService.is_active.is_(True),
            )
        )
        endpoints = list(result.scalars().all())
        layer = ExternalApiServiceLayer(db)
        count = 0
        for ep in endpoints:
            slug = f"ext_{ep.id}"
            if slug in ToolRegistry.list_slugs():
                continue

            async def _call(
                _ep_id: UUID = ep.id,
                params_json: str = "{}",
                body_json: str = "{}",
                _layer: ExternalApiServiceLayer = layer,
            ) -> dict:
                params = json.loads(params_json) if params_json else {}
                body = json.loads(body_json) if body_json else {}
                return await _layer.test_endpoint(_ep_id, params, body)

            tool = StructuredTool.from_function(
                coroutine=_call,
                name=slug,
                description=ep.description or f"Call {ep.name} ({ep.method.value})",
            )
            try:
                ToolRegistry.register(slug, tool)
                count += 1
            except ValueError:
                pass
        return count
