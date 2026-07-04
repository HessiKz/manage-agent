"""Preview agent invocation — no persisted agent row."""

from __future__ import annotations

import re
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from src.models.agent import Agent, AgentKind, AgentStatus
from src.models.user import User
from src.schemas.agent import AgentInvokeRequest, AgentInvokeResponse
from src.schemas.agent_preview import AgentPreviewInvokeRequest
from src.services.orchestrator_service import OrchestratorService


def _slugify(name: str) -> str:
    s = re.sub(r"[^\w\s-]", "", name.strip().lower())
    s = re.sub(r"[\s_-]+", "-", s).strip("-")
    return (s[:80] or "preview-agent")


class AgentPreviewService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.orchestrator = OrchestratorService(db)

    def _build_ephemeral_agent(self, payload: AgentPreviewInvokeRequest, owner: User) -> Agent:
        kind = AgentKind(payload.kind) if payload.kind in AgentKind.public_values() else AgentKind.CUSTOM
        cfg: dict = {}
        if payload.config_json:
            cfg.update(payload.config_json)
        if payload.knowledge_bindings:
            cfg["knowledge_bindings"] = payload.knowledge_bindings
        if payload.api_bindings:
            cfg["api_bindings"] = payload.api_bindings

        agent = Agent(
            id=uuid4(),
            name=payload.name.strip() or "پیش‌نمایش",
            slug=_slugify(payload.name or "preview"),
            description=payload.description,
            department=payload.department,
            status=AgentStatus.DRAFT,
            kind=kind,
            capabilities=payload.capabilities or {},
            file_policy=payload.file_policy or {},
            agent_link_policy=payload.agent_link_policy or {},
            system_prompt=payload.system_prompt or "",
            tool_names=payload.tool_names or [],
            model_name=payload.model_name or "claude-opus-4-8",
            model_provider="openai",
            temperature=payload.temperature if payload.temperature is not None else 0.2,
            owner_id=owner.id,
            config_json=cfg,
        )
        return agent

    async def preview_invoke(
        self,
        payload: AgentPreviewInvokeRequest,
        user: User,
    ) -> AgentInvokeResponse:
        agent = self._build_ephemeral_agent(payload, user)
        invoke_payload = AgentInvokeRequest(
            input=payload.input,
            thread_id=f"preview-{uuid4().hex[:12]}",
            stream=False,
        )
        enriched = payload.input
        if payload.inline_file_context:
            enriched = (
                f"{payload.inline_file_context.strip()}\n\n---\n\n{payload.input}"
            )
        invoke_payload = AgentInvokeRequest(
            input=enriched,
            thread_id=invoke_payload.thread_id,
            stream=False,
        )
        return await self.orchestrator.invoke_with_agent(
            agent, invoke_payload, user, preview=True
        )
