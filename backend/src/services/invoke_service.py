"""Agent invocation — delegates to orchestrator."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.agents_lib.agent_factory import build_llm, build_messages
from src.agents_lib.graph_agent import run_react_agent
from src.agents_lib.memory import InMemoryStore
from src.core.chat_sanitize import sanitize_chat_output
from src.core.costs import estimate_cost
from src.models.agent import Agent, AgentStatus
from src.models.user import User
from src.repositories.agent_repo import AgentRepository
from src.schemas.agent import AgentInvokeRequest, AgentInvokeResponse
from src.services.activity_service import ActivityService
from src.services.orchestrator_service import OrchestratorService


def _normalize_content(content) -> str:
    if isinstance(content, list):
        return "".join(
            part.get("text", "") if isinstance(part, dict) else str(part) for part in content
        )
    return str(content)


class InvokeService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.orchestrator = OrchestratorService(db)
        self.agents = AgentRepository(db)
        self.activity = ActivityService(db)

    async def invoke(
        self,
        agent_id: UUID,
        payload: AgentInvokeRequest,
        user: User,
    ) -> AgentInvokeResponse:
        return await self.orchestrator.invoke(agent_id, payload, user)

    async def _load_agent(self, agent_id: UUID) -> Agent:
        agent = await self.agents.get(agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        if agent.status not in (AgentStatus.ACTIVE, AgentStatus.DRAFT):
            raise HTTPException(status_code=400, detail=f"Agent status is {agent.status.value}")
        return agent

    async def invoke_stream(
        self,
        agent_id: UUID,
        payload: AgentInvokeRequest,
        user: User,
    ) -> AsyncIterator[str]:
        """SSE stream: data: {"token": "..."} chunks, then data: {"done": true, ...}."""
        agent = await self._load_agent(agent_id)

        log_row = await self.activity.start(
            agent_id=agent.id,
            user_id=user.id,
            action="invoke",
            input_text=payload.input,
        )

        thread_id = payload.thread_id or f"user-{user.id}:agent-{agent.id}"

        try:
            history = InMemoryStore.history(thread_id)

            if agent.tool_names:
                run_result = await run_react_agent(agent, payload.input, history)
                output = run_result.output
                yield f"data: {json.dumps({'token': output}, ensure_ascii=False)}\n\n"
            else:
                output_parts: list[str] = []
                llm = build_llm(agent)
                messages = build_messages(agent, payload.input, history)
                async for chunk in llm.astream(messages):
                    token = _normalize_content(getattr(chunk, "content", ""))
                    if not token:
                        continue
                    output_parts.append(token)
                    yield f"data: {json.dumps({'token': token}, ensure_ascii=False)}\n\n"
                output = "".join(output_parts)

            output = sanitize_chat_output(output)

            InMemoryStore.append(thread_id, {"role": "user", "content": payload.input})
            InMemoryStore.append(thread_id, {"role": "assistant", "content": output})

            tokens_in = max(1, len(payload.input) // 4)
            tokens_out = max(1, len(output) // 4)
            cost = estimate_cost(agent.model_name, tokens_in, tokens_out)

            log_row = await self.activity.finish(
                log_row,
                output_text=output,
                tokens_input=tokens_in,
                tokens_output=tokens_out,
                cost_usd=cost,
                details={"thread_id": thread_id},
            )
            yield f"data: {json.dumps({'done': True, 'activity_log_id': str(log_row.id), 'duration_ms': log_row.duration_ms or 0}, ensure_ascii=False)}\n\n"
        except Exception as exc:
            await self.activity.finish(log_row, output_text=None, error=str(exc))
            yield f"data: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"
