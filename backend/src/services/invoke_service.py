"""Agent invocation — delegates to orchestrator."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.ext.asyncio import AsyncSession

from src.agents_lib.agent_factory import build_llm, build_messages
from src.agents_lib.graph_agent import run_react_agent, run_react_agent_stream
from src.agents_lib.platform_constants import platform_tool_status_fa
from src.agents_lib.memory import InMemoryStore
from src.core import llm_runtime
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


def _summarize_thinking(text: str, max_len: int = 160) -> str:
    cleaned = " ".join(text.split()).strip()
    if not cleaned:
        return "تحلیل کامل شد — در حال آماده‌سازی پاسخ…"
    for sep in (". ", "! ", "? ", "؟ ", "۔ "):
        if sep in cleaned:
            head = cleaned.split(sep, 1)[0].strip()
            if head:
                cleaned = head
                break
    if len(cleaned) > max_len:
        return f"{cleaned[:max_len].rstrip()}…"
    return cleaned


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
        if agent.status not in (AgentStatus.ACTIVE, AgentStatus.DRAFT, AgentStatus.DEPLOYING):
            raise HTTPException(status_code=400, detail=f"Agent status is {agent.status.value}")
        return agent

    async def invoke_stream(
        self,
        agent_id: UUID,
        payload: AgentInvokeRequest,
        user: User,
    ) -> AsyncIterator[str]:
        """SSE stream — same enrichment/tools as orchestrator.invoke (file context, linkify)."""
        agent = await self._load_agent(agent_id)
        await self.orchestrator._enforce_capabilities(agent, payload)

        log_row = await self.activity.start(
            agent_id=agent.id,
            user_id=user.id,
            action="invoke",
            input_text=payload.input,
        )

        thread_id = payload.thread_id or f"user-{user.id}:agent-{agent.id}"

        try:
            history = InMemoryStore.history(thread_id)
            enriched_input = await self.orchestrator.build_enriched_input(agent, payload.input)
            tool_names = await self.orchestrator.resolve_tool_names(agent, user)
            caps = agent.capabilities or {}
            has_file_context = enriched_input != payload.input
            should_think = caps.get("chat_enabled", True) and (
                bool(tool_names) or has_file_context
            )

            from src.agents_lib.platform_tools import clear_platform_context, set_platform_context

            set_platform_context(user)
            try:
                yield f"data: {json.dumps({'status': 'phase', 'phase': 'preparing', 'message': 'در حال آماده‌سازی درخواست…'}, ensure_ascii=False)}\n\n"

                if should_think:
                    yield f"data: {json.dumps({'status': 'phase', 'phase': 'thinking', 'message': 'در حال تحلیل و برنامه‌ریزی…'}, ensure_ascii=False)}\n\n"
                    yield f"data: {json.dumps({'thinking_start': True}, ensure_ascii=False)}\n\n"
                    llm = build_llm(agent)
                    think_messages = [
                        SystemMessage(
                            content=(
                                "فقط فارسی بنویس. در ۲ تا ۴ جمله کوتاه برنامه‌ریزی کن — "
                                "فقط تفکر و استدلال، بدون پاسخ نهایی. "
                                "هیچ کلمه یا جمله انگلیسی ننویس."
                            )
                        ),
                        HumanMessage(content=enriched_input),
                    ]
                    thinking_text = ""
                    async for chunk in llm.astream(think_messages):
                        token = _normalize_content(getattr(chunk, "content", ""))
                        if not token:
                            continue
                        thinking_text += token
                        yield f"data: {json.dumps({'thinking_token': token}, ensure_ascii=False)}\n\n"
                    summary = _summarize_thinking(thinking_text)
                    yield f"data: {json.dumps({'thinking_end': True, 'thinking_summary': summary}, ensure_ascii=False)}\n\n"
                    yield f"data: {json.dumps({'status': 'phase', 'phase': 'reasoning_complete', 'message': summary}, ensure_ascii=False)}\n\n"

                if tool_names:
                    yield f"data: {json.dumps({'status': 'phase', 'phase': 'agent_run', 'message': 'در حال اجرای ایجنت و ابزارها…'}, ensure_ascii=False)}\n\n"
                    run_result = None
                    saw_output_token = False
                    async for item in run_react_agent_stream(
                        agent,
                        enriched_input,
                        history,
                        tool_names=tool_names,
                    ):
                        if item.token:
                            if not saw_output_token:
                                saw_output_token = True
                                yield f"data: {json.dumps({'status': 'generating', 'message': 'در حال نوشتن پاسخ…'}, ensure_ascii=False)}\n\n"
                            yield f"data: {json.dumps({'token': item.token}, ensure_ascii=False)}\n\n"
                            await asyncio.sleep(0)
                        elif item.tool_start:
                            tool_msg = platform_tool_status_fa(item.tool_start)
                            yield f"data: {json.dumps({'status': 'tool', 'message': tool_msg}, ensure_ascii=False)}\n\n"
                        elif item.result:
                            run_result = item.result
                    if run_result is None:
                        run_result = await run_react_agent(
                            agent,
                            enriched_input,
                            history,
                            tool_names=tool_names,
                        )
                    output = run_result.output
                    ui_actions = run_result.ui_actions
                    ui_scripts = run_result.ui_scripts
                else:
                    yield f"data: {json.dumps({'status': 'generating', 'message': 'در حال نوشتن پاسخ…'}, ensure_ascii=False)}\n\n"
                    output_parts: list[str] = []
                    llm = build_llm(agent)
                    messages = build_messages(agent, enriched_input, history)
                    async for chunk in llm.astream(messages):
                        token = _normalize_content(getattr(chunk, "content", ""))
                        if not token:
                            continue
                        output_parts.append(token)
                        yield f"data: {json.dumps({'token': token}, ensure_ascii=False)}\n\n"
                    output = "".join(output_parts)
                    ui_actions = []
                    ui_scripts = []
            finally:
                clear_platform_context()

            output = self.orchestrator.finalize_output(agent, output)

            InMemoryStore.append(thread_id, {"role": "user", "content": payload.input})
            InMemoryStore.append(thread_id, {"role": "assistant", "content": output})

            tokens_in = max(1, len(payload.input) // 4)
            tokens_out = max(1, len(output) // 4)
            resolved = llm_runtime.resolve(agent.model_name)
            cost = estimate_cost(resolved.model, tokens_in, tokens_out)

            log_row = await self.activity.finish(
                log_row,
                output_text=output,
                tokens_input=tokens_in,
                tokens_output=tokens_out,
                cost_usd=cost,
                details={"thread_id": thread_id},
            )
            done_payload: dict = {
                "done": True,
                "output": output,
                "activity_log_id": str(log_row.id),
                "thread_id": thread_id,
                "duration_ms": log_row.duration_ms or 0,
            }
            if ui_actions:
                done_payload["ui_actions"] = ui_actions
                done_payload["ui_action"] = ui_actions[-1]
            if ui_scripts:
                done_payload["ui_scripts"] = ui_scripts
                done_payload["ui_script"] = ui_scripts[-1]
            yield f"data: {json.dumps(done_payload, ensure_ascii=False)}\n\n"
        except Exception as exc:
            await self.activity.finish(log_row, output_text=None, error=str(exc))
            from src.agents_lib.platform_tools import _humanize_platform_error

            yield f"data: {json.dumps({'error': _humanize_platform_error(exc)}, ensure_ascii=False)}\n\n"
