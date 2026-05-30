"""Full agent orchestration: cache → RAG → tools → invoke → notify."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException

from src.config import settings
from src.core import llm_runtime
from src.core.errors import AppError, ErrorCode, LlmUnavailableError
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.agents_lib.agent_factory import build_llm, build_messages
from src.agents_lib.dynamic_tools import DynamicToolLoader
from src.agents_lib.execution_trace import AgentRunResult, numbered_trace, trace_step
from src.agents_lib.graph_agent import run_react_agent
from src.agents_lib.memory import InMemoryStore
from src.agents_lib.supervisor_graph import run_supervisor
from src.core.chat_sanitize import sanitize_chat_output
from src.core.costs import estimate_cost
from src.core.file_policy import files_count_for_invoke
from src.models.agent import Agent, AgentStatus
from src.models.agent_file import AgentFile
from src.models.notification import NotificationSeverity
from src.models.user import User
from src.repositories.agent_repo import AgentRepository
from src.schemas.agent import AgentInvokeRequest, AgentInvokeResponse
from src.services.activity_service import ActivityService
from src.services.cache_service import CacheService
from src.services.notification_service import NotificationService
from src.services.vector_store import VectorStore

# DRAFT + DEPLOYING: internal smoke tests during wizard publish / re-validation.
_INVOKE_ALLOWED_STATUSES = frozenset(
    {AgentStatus.ACTIVE, AgentStatus.DRAFT, AgentStatus.DEPLOYING}
)


def _normalize_content(content) -> str:
    if isinstance(content, list):
        return "".join(
            part.get("text", "") if isinstance(part, dict) else str(part) for part in content
        )
    return str(content)


def _truncate_text(text: str, limit: int = 1200) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def _caps(agent: Agent) -> dict:
    return agent.capabilities or {}


def _file_policy(agent: Agent) -> dict:
    return agent.file_policy or {}


def _is_llm_unreachable(exc: BaseException) -> bool:
    name = type(exc).__name__
    if name in ("ConnectTimeout", "ConnectError", "TimeoutException", "APITimeoutError", "ReadTimeout"):
        return True
    msg = str(exc).lower()
    return "connecttimeout" in msg or "timeout" in msg or "connection" in msg


class OrchestratorService:
    """Central pipeline for agent execution."""

    CACHE_NS = "invoke"
    CACHE_TTL = 3600

    def __init__(self, db: AsyncSession):
        self.db = db
        self.agents = AgentRepository(db)
        self.activity = ActivityService(db)
        self.notifications = NotificationService(db)
        self.vectors = VectorStore(db)

    async def _enforce_capabilities(
        self,
        agent: Agent,
        payload: AgentInvokeRequest,
    ) -> None:
        caps = _caps(agent)
        fp = _file_policy(agent)

        if not payload.action_slug and not caps.get("chat_enabled", True):
            raise HTTPException(
                status_code=422,
                detail="Chat is disabled for this agent",
            )

        if fp.get("require_files_to_invoke"):
            min_files = int(fp.get("min_files", 1))
            count = await files_count_for_invoke(self.db, agent.id)
            if count < min_files:
                raise HTTPException(
                    status_code=422,
                    detail=f"At least {min_files} file(s) required before invoking this agent",
                )

    async def invoke(
        self,
        agent_id: UUID,
        payload: AgentInvokeRequest,
        user: User,
        *,
        depth: int = 0,
    ) -> AgentInvokeResponse:
        agent = await self._load_agent(agent_id)
        await self._enforce_capabilities(agent, payload)

        link_policy = agent.agent_link_policy or {}
        max_depth = int(link_policy.get("max_depth", 3))
        if depth > max_depth:
            raise HTTPException(status_code=422, detail=f"Max agent call depth ({max_depth}) exceeded")

        thread_id = payload.thread_id or f"user-{user.id}:agent-{agent.id}"

        cache_key = CacheService.hash_key(f"{agent_id}:{thread_id}:{payload.input}")
        if not payload.stream and depth == 0 and not payload.action_slug:
            cached = CacheService.get_json(self.CACHE_NS, cache_key)
            if cached and isinstance(cached, dict) and cached.get("output"):
                return AgentInvokeResponse(**cached)

        log_row = await self.activity.start(
            agent_id=agent.id,
            user_id=user.id,
            action="invoke" if not payload.action_slug else f"action:{payload.action_slug}",
            input_text=payload.input,
        )

        try:
            rag_context = await self._rag_context(agent.id, payload.input)
            file_context = await self._uploaded_files_context(agent)
            history = InMemoryStore.history(thread_id)
            # Demo rules live in build_system_prompt(); only attach per-request context here.
            enriched_input = payload.input
            if file_context:
                enriched_input += f"\n\n---\n{file_context}"
            if rag_context:
                enriched_input += f"\n\n---\nContext from knowledge base:\n{rag_context}"

            caps = _caps(agent)
            execution_trace: list[dict] = []
            llm_provider = agent.model_provider
            model_name = agent.model_name

            if caps.get("supervisor_enabled"):
                output = await run_supervisor(
                    self.db,
                    agent,
                    enriched_input,
                    user,
                    depth=depth,
                    thread_id=thread_id,
                )
                execution_trace = numbered_trace(
                    [
                        trace_step(
                            "supervisor",
                            "مسیر سرپرست",
                            detail=_truncate_text(output, 800),
                        )
                    ]
                )
            else:
                tool_names = list(agent.tool_names or [])
                await DynamicToolLoader.register_for_agent(self.db, agent)
                tool_names.extend(await DynamicToolLoader.slugs_for_agent(self.db, agent.id))

                from src.agents_lib.agent_tools import AgentToolLoader

                await AgentToolLoader.register_for_agent(
                    self.db, agent, user, depth=depth
                )
                tool_names.extend(await AgentToolLoader.slugs_for_agent(self.db, agent))

                if tool_names:
                    run_result = await run_react_agent(
                        agent,
                        enriched_input,
                        history,
                        tool_names=list(set(tool_names)),
                    )
                    output = run_result.output
                    execution_trace = run_result.trace
                    llm_provider = run_result.llm_provider
                    model_name = run_result.model_name
                else:
                    llm = build_llm(agent)
                    _resolved = llm_runtime.resolve(agent.model_name)
                    llm_provider = _resolved.provider
                    model_name = _resolved.model
                    messages = build_messages(agent, enriched_input, history)
                    execution_trace = numbered_trace(
                        [
                            trace_step(
                                "llm_config",
                                "پیکربندی مدل",
                                detail=f"{_resolved.provider} · {_resolved.model} · {_resolved.base_url or 'openai'}",
                            ),
                            trace_step("llm_request", "درخواست به API مدل", detail="بدون ابزار"),
                        ]
                    )
                    ai_msg = await llm.ainvoke(messages)
                    output = _normalize_content(getattr(ai_msg, "content", str(ai_msg)))
                    execution_trace.append(
                        trace_step(
                            "llm_response",
                            "پاسخ API",
                            detail=_truncate_text(output, 1200),
                        )
                    )
                    execution_trace = numbered_trace(execution_trace)

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
                details={
                    "thread_id": thread_id,
                    "execution_trace": execution_trace,
                    "llm_provider": llm_provider,
                    "model_name": model_name,
                    "api_base": llm_runtime.resolve(agent.model_name).base_url,
                },
            )

            response = AgentInvokeResponse(
                output=output,
                tokens_input=tokens_in,
                tokens_output=tokens_out,
                cost_usd=Decimal(cost),
                duration_ms=log_row.duration_ms or 0,
                activity_log_id=log_row.id,
                execution_trace=execution_trace,
                llm_provider=llm_provider,
                model_name=model_name,
            )

            is_internal = bool(
                payload.thread_id and str(payload.thread_id).startswith("validate-")
            )

            if depth == 0:
                CacheService.set_json(
                    self.CACHE_NS,
                    cache_key,
                    response.model_dump(mode="json"),
                    self.CACHE_TTL,
                )

                if not is_internal:
                    await self.notifications.create(
                        user_id=user.id,
                        title=f"اجرای {agent.name}",
                        message=output[:120] + ("…" if len(output) > 120 else ""),
                        severity=NotificationSeverity.SUCCESS,
                        link=f"/agents/{agent.slug}",
                    )
                    await self.db.commit()

            return response
        except HTTPException:
            raise
        except Exception as exc:
            await self.activity.finish(log_row, output_text=None, error=str(exc))
            is_internal = bool(
                payload.thread_id and str(payload.thread_id).startswith("validate-")
            )
            if depth == 0 and not is_internal:
                await self.notifications.create(
                    user_id=user.id,
                    title=f"خطا در {agent.name}",
                    message=str(exc)[:200],
                    severity=NotificationSeverity.ERROR,
                )
                await self.db.commit()
            if _is_llm_unreachable(exc):
                raise LlmUnavailableError(
                    "سرویس LLM در دسترس نیست (اتصال به ارائه‌دهنده مدل قطع شد). "
                    "کلید API و آدرس پایه (OPENAI_BASE_URL) را در تنظیمات سرور بررسی کنید."
                ) from exc
            raise AppError(
                "اجرای ایجنت با خطا مواجه شد. جزئیات در گزارش فعالیت ثبت شده است.",
                code=ErrorCode.ORCHESTRATION_FAILED,
                status_code=500,
                details={"type": type(exc).__name__} if settings.app_debug else None,
                log_level="error",
            ) from exc

    async def _uploaded_files_context(self, agent: Agent) -> str:
        """Tell the LLM which files are already attached so it never asks the user to upload."""
        if not (agent.capabilities or {}).get("file_upload_enabled"):
            return ""
        result = await self.db.execute(
            select(AgentFile)
            .where(AgentFile.agent_id == agent.id)
            .order_by(desc(AgentFile.created_at))
            .limit(5)
        )
        rows = list(result.scalars().all())
        if not rows:
            return ""
        latest = rows[0]
        lines = [
            "فایل‌های آپلودشده این ایجنت (همگی آماده پردازش هستند — از کاربر فایل نخواه):",
        ]
        for f in rows:
            lines.append(f"- {f.filename}  ←  storage_path={f.storage_path}")
        tool_names = list(agent.tool_names or [])
        if "karkard_process" in tool_names:
            stem = Path(latest.storage_path).stem
            lines.append(
                "برای پردازش، ابزار `karkard_process` را فقط با این آرگومان‌ها فراخوانی کن: "
                f"storage_path=\"{latest.storage_path}\" و agent_id=\"{agent.id}\". "
                "هرگز فقط نام نمایشی فایل (مثل demo-karkard-raw.xlsx) را به‌تنهایی نفرست."
            )
            lines.append(
                f"اگر خروجی از قبل ساخته شده، لینک دانلود: /api/v1/demo-files/karkard/karkard-{stem}-processed.xlsx"
            )
        else:
            lines.append(
                f"اگر کاربر گفت «پردازش کن»، از مسیر آخرین فایل ({latest.storage_path}) استفاده کن."
            )
        return "\n".join(lines)

    async def _rag_context(self, agent_id: UUID, query: str) -> str:
        try:
            hits = await self.vectors.search(query, agent_id=agent_id, limit=3)
            if not hits:
                return ""
            parts = [f"- {c.content[:500]}" for c, _score in hits]
            return "\n".join(parts)
        except Exception:
            return ""

    async def _load_agent(self, agent_id: UUID) -> Agent:
        agent = await self.agents.get(agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        if agent.status not in _INVOKE_ALLOWED_STATUSES:
            raise HTTPException(status_code=400, detail=f"Agent status is {agent.status.value}")
        return agent
