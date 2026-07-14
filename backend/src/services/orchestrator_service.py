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
from src.agents_lib.platform_constants import PLATFORM_SUPPORT_TOOL_NAMES, is_support_agent_slug
from src.agents_lib.dynamic_tools import DynamicToolLoader
from src.agents_lib.execution_trace import AgentRunResult, numbered_trace, trace_step
from src.agents_lib.graph_agent import run_react_agent
from src.agents_lib.memory import InMemoryStore
from src.agents_lib.supervisor_graph import run_supervisor
from src.core.chat_sanitize import sanitize_chat_output
from src.core.conversation_preview import humanize_output_preview, plain_text_preview
from src.core.costs import estimate_cost
from src.core.execution_router import resolve_execution_path, resolve_precision
from src.core.precision_defaults import ExecutionPath
from src.services.execution_job_service import ExecutionJobService
from src.core.file_policy import files_count_for_invoke
from src.core.agent_file_roles import (
    display_agent_filename,
    is_instruction_file,
    is_output_sample_file,
)
from src.core.runtime_file_selection import pick_runtime_agent_file
from src.karkard.input_selection import pick_runtime_karkard_file
from src.models.agent import Agent, AgentKind, AgentStatus
from src.models.agent_action import AgentAction
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
_INLINE_FILE_CONTEXT_LIMIT = 12_000
_INLINE_FILE_CONTEXT_MAX_FILES = 2


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


def _truncate_inline_file_text(text: str) -> str:
    text = (text or "").strip()
    if len(text) <= _INLINE_FILE_CONTEXT_LIMIT:
        return text
    return text[:_INLINE_FILE_CONTEXT_LIMIT].rstrip() + "\n[... محتوای فایل کوتاه شد ...]"


def _caps(agent: Agent) -> dict:
    return agent.capabilities or {}


def _file_policy(agent: Agent) -> dict:
    return agent.file_policy or {}


def _is_llm_unreachable(exc: BaseException) -> bool:
    name = type(exc).__name__
    if name in (
        "ConnectTimeout",
        "ConnectError",
        "TimeoutException",
        "APITimeoutError",
        "ReadTimeout",
        "APIConnectionError",
        "InternalServerError",
        "APIStatusError",
        "RateLimitError",
        "ServiceUnavailableError",
    ):
        return True
    msg = str(exc).lower()
    markers = (
        "connecttimeout",
        "timeout",
        "connection",
        "bad gateway",
        "502",
        "503",
        "504",
        "service unavailable",
        "gateway",
        "overloaded",
        "rate limit",
    )
    return any(m in msg for m in markers)


_DIRECT_AUTO_TOOLS = frozenset(
    {"run_agent_script", "report_generate", "resume_screen"}
)


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

    async def build_enriched_input(self, agent: Agent, raw_input: str) -> str:
        """Attach training prefix, uploaded files, and RAG context to user input."""
        from src.core.agent_training_context import (
            agent_in_interactive_training,
            training_calibration_prefix,
        )

        enriched = raw_input
        if agent_in_interactive_training(agent):
            enriched = f"{training_calibration_prefix(agent)}\n\n{enriched}"
        file_context = await self._uploaded_files_context(agent)
        if file_context:
            enriched += f"\n\n---\n{file_context}"
        rag_context = await self._rag_context(agent.id, raw_input)
        if rag_context:
            enriched += f"\n\n---\nContext from knowledge base:\n{rag_context}"
        return enriched

    async def resolve_tool_names(self, agent: Agent, user: User, raw_input: str | None = None) -> list[str]:
        if is_support_agent_slug(agent.slug):
            from src.agents_lib.platform_support_grounding import needs_any_platform_tool

            tool_names = (
                list(PLATFORM_SUPPORT_TOOL_NAMES)
                if raw_input is None or needs_any_platform_tool(raw_input)
                else []
            )
        else:
            # Bind only the tools the agent actually declares (+ its runtime-plan
            # primary tool). Injecting the full DOMAIN_TOOL_SLUGS into every agent
            # made the model pick wrong tools at scale.
            tool_names = [
                str(t) for t in (agent.tool_names or []) if not str(t).startswith("platform_")
            ]
            cfg = agent.config_json or {}
            primary = str((cfg.get("runtime_plan") or {}).get("primary_tool") or "").strip()
            if primary:
                tool_names.append(primary)
            script = cfg.get("workspace_script") or {}
            if script.get("needed") and script.get("slug"):
                tool_names.append("run_agent_script")
        await DynamicToolLoader.register_for_agent(self.db, agent)
        tool_names.extend(await DynamicToolLoader.slugs_for_agent(self.db, agent.id))
        from src.agents_lib.agent_tools import AgentToolLoader

        await AgentToolLoader.register_for_agent(self.db, agent, user, depth=0)
        tool_names.extend(await AgentToolLoader.slugs_for_agent(self.db, agent))
        return list(set(tool_names))

    async def _run_react(self, agent, enriched_input, history, tool_names, user):
        """Wrap run_react_agent with platform context, returning an AgentRunResult."""
        from src.agents_lib.platform_tools import clear_platform_context, set_platform_context

        set_platform_context(user)
        try:
            return await run_react_agent(
                agent,
                enriched_input,
                history,
                tool_names=list(set(tool_names)),
            )
        finally:
            clear_platform_context()

    def finalize_output(self, agent: Agent, output: str) -> str:
        from src.core.agent_workspace_files import finalize_agent_output_text

        output = finalize_agent_output_text(output, agent.id)
        return sanitize_chat_output(output)

    async def _enforce_capabilities(
        self,
        agent: Agent,
        payload: AgentInvokeRequest,
    ) -> None:
        caps = _caps(agent)
        fp = _file_policy(agent)

        from src.core.agent_training_context import agent_in_interactive_training

        in_training = agent_in_interactive_training(agent)

        if not payload.action_slug and not caps.get("chat_enabled", True) and not in_training:
            if not caps.get("file_upload_enabled", False):
                raise HTTPException(
                    status_code=422,
                    detail="Chat is disabled for this agent",
                )

        if fp.get("require_files_to_invoke") and not in_training:
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
        return await self.invoke_with_agent(agent, payload, user, preview=False, depth=depth)

    async def invoke_with_agent(
        self,
        agent: Agent,
        payload: AgentInvokeRequest,
        user: User,
        *,
        preview: bool = False,
        depth: int = 0,
    ) -> AgentInvokeResponse:
        if preview:
            caps = _caps(agent)
            if not payload.action_slug and not caps.get("chat_enabled", True):
                raise HTTPException(status_code=422, detail="Chat is disabled for this agent")
        else:
            await self._enforce_capabilities(agent, payload)

        link_policy = agent.agent_link_policy or {}
        max_depth = int(link_policy.get("max_depth", 3))
        if depth > max_depth:
            raise HTTPException(status_code=422, detail=f"Max agent call depth ({max_depth}) exceeded")

        thread_id = payload.thread_id or f"user-{user.id}:agent-{agent.id}"

        log_row = None
        if not preview:
            log_row = await self.activity.start(
                agent_id=agent.id,
                user_id=user.id,
                action="invoke" if not payload.action_slug else f"action:{payload.action_slug}",
                input_text=payload.input,
            )

        try:
            if agent.slug == "support" and not preview:
                from src.agents_lib.platform_support_grounding import support_plain_response

                plain = support_plain_response(payload.input)
                if plain:
                    InMemoryStore.append(thread_id, {"role": "user", "content": payload.input})
                    InMemoryStore.append(thread_id, {"role": "assistant", "content": plain})
                    tokens_in = max(1, len(payload.input) // 4)
                    tokens_out = max(1, len(plain) // 4)
                    resolved_for_cost = llm_runtime.resolve(agent.model_name)
                    cost = estimate_cost(resolved_for_cost.model, tokens_in, tokens_out)
                    duration_ms = 0
                    activity_log_id = None
                    if log_row is not None:
                        log_row = await self.activity.finish(
                            log_row,
                            output_text=plain,
                            tokens_input=tokens_in,
                            tokens_output=tokens_out,
                            cost_usd=cost,
                            details={
                                "thread_id": thread_id,
                                "deterministic_support_reply": True,
                            },
                        )
                        duration_ms = log_row.duration_ms or 0
                        activity_log_id = log_row.id
                    return AgentInvokeResponse(
                        output=plain,
                        tokens_input=tokens_in,
                        tokens_output=tokens_out,
                        cost_usd=Decimal(cost),
                        duration_ms=duration_ms,
                        activity_log_id=activity_log_id,
                        execution_trace=[],
                        llm_provider=resolved_for_cost.provider,
                        model_name=resolved_for_cost.model,
                    )

            cache_key = await self._invoke_cache_key(agent, thread_id, payload)
            skip_cache = preview or "run_agent_script" in (agent.tool_names or [])
            if not payload.stream and depth == 0 and not payload.action_slug and not skip_cache:
                cached = CacheService.get_json(self.CACHE_NS, cache_key)
                if cached and isinstance(cached, dict) and cached.get("output"):
                    if log_row is not None:
                        await self.activity.finish(log_row, output_text=cached.get("output"))
                    return AgentInvokeResponse(**cached)

            history = InMemoryStore.history(thread_id)
            if preview:
                enriched_input = await self._preview_enriched_input(agent, payload.input)
            else:
                enriched_input = await self.build_enriched_input(agent, payload.input)

            if not preview:
                auto_response = await self._try_worker_auto_tool(
                    agent,
                    payload,
                    user,
                    log_row,
                    thread_id,
                    cache_key,
                )
                if auto_response is not None:
                    return auto_response

            caps = _caps(agent)
            path = resolve_execution_path(agent, payload, caps=caps) if not preview else None
            execution_trace: list[dict] = []
            if path is not None:
                execution_trace.append(
                    trace_step(
                        "execution_path",
                        "مسیر اجرا",
                        detail=path.value,
                        payload={"precision": resolve_precision(agent).value},
                    )
                )
            initial_resolved = llm_runtime.resolve(agent.model_name)
            llm_provider = initial_resolved.provider
            model_name = initial_resolved.model

            # Sandbox enqueue: do NOT run inline. Create an execution_jobs row and
            # return immediately. P0 path (pinned run_agent_script) never reaches
            # here — its precision is deterministic, not autonomous.
            if path == ExecutionPath.SANDBOX_JOB and not preview:
                job = await ExecutionJobService(self.db).enqueue_from_invoke(
                    agent, payload, user
                )
                execution_trace.append(
                    trace_step("sandbox_enqueue", "ثبت در صف اجرای جعبه‌ای", detail=str(job.id))
                )
                execution_trace = numbered_trace(execution_trace)
                return AgentInvokeResponse(
                    output="کار در صف پردازش قرار گرفت.",
                    job_id=str(job.id),
                    execution_trace=execution_trace,
                )

            if path == ExecutionPath.SUPERVISOR and not preview:
                # Parallel supervisor v2 only for AUTONOMOUS supervisors and only
                # when the feature flag is on; otherwise fall back to v1.
                if (
                    settings.parallel_supervisor_v1
                    and agent.kind.canonical == AgentKind.SUPERVISOR
                    and precision == ExecutionPrecision.AUTONOMOUS
                ):
                    from src.agents_lib.supervisor_graph_v2 import run_supervisor_v2

                    resp = await run_supervisor_v2(
                        self.db, agent, enriched_input, user,
                        depth=depth, thread_id=thread_id, run_state=run_state,
                    )
                    output = resp.output
                else:
                    output = await run_supervisor(
                        self.db,
                        agent,
                        enriched_input,
                        user,
                        depth=depth,
                        thread_id=thread_id,
                    )
                execution_trace.append(
                    trace_step(
                        "supervisor",
                        "مسیر سرپرست",
                        detail=_truncate_text(output, 800),
                    )
                )
                execution_trace = numbered_trace(execution_trace)
            elif path == ExecutionPath.AUTO_TOOL and not preview:
                # Deterministic worker path handled above by _try_worker_auto_tool.
                # If we reach here it means no runtime input file was present;
                # fall through to ReAct so the agent can still respond.
                tool_names = await self.resolve_tool_names(agent, user, payload.input)
                run_result = await self._run_react(agent, enriched_input, history, tool_names, user)
                output = run_result.output
                execution_trace += run_result.trace
                llm_provider = run_result.llm_provider
                model_name = run_result.model_name
            else:
                # REACT or PLAIN_LLM (preview always takes this branch).
                tool_names = [] if preview else await self.resolve_tool_names(agent, user, payload.input)

                if tool_names:
                    run_result = await self._run_react(agent, enriched_input, history, tool_names, user)
                    output = run_result.output
                    execution_trace += run_result.trace
                    llm_provider = run_result.llm_provider
                    model_name = run_result.model_name
                else:
                    llm = build_llm(agent)
                    _resolved = llm_runtime.resolve(agent.model_name)
                    llm_provider = _resolved.provider
                    model_name = _resolved.model
                    messages = build_messages(agent, enriched_input, history)
                    execution_trace.append(
                        trace_step(
                            "llm_config",
                            "پیکربندی مدل",
                            detail=f"{_resolved.provider} · {_resolved.model} · {_resolved.base_url or 'openai'}",
                        )
                    )
                    execution_trace.append(trace_step("llm_request", "درخواست به API مدل", detail="بدون ابزار"))
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

            output = (
                sanitize_chat_output(output)
                if preview
                else self.finalize_output(agent, output)
            )

            if not preview:
                InMemoryStore.append(thread_id, {"role": "user", "content": payload.input})
                InMemoryStore.append(thread_id, {"role": "assistant", "content": output})

            tokens_in = max(1, len(payload.input) // 4)
            tokens_out = max(1, len(output) // 4)
            resolved_for_cost = llm_runtime.resolve(agent.model_name)
            cost = estimate_cost(resolved_for_cost.model, tokens_in, tokens_out)

            duration_ms = 0
            activity_log_id = None
            if log_row is not None:
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
                duration_ms = log_row.duration_ms or 0
                activity_log_id = log_row.id

            response = AgentInvokeResponse(
                output=output,
                tokens_input=tokens_in,
                tokens_output=tokens_out,
                cost_usd=Decimal(cost),
                duration_ms=duration_ms,
                activity_log_id=activity_log_id,
                execution_trace=execution_trace,
                llm_provider=llm_provider,
                model_name=model_name,
            )

            is_internal = bool(
                payload.thread_id and str(payload.thread_id).startswith("validate-")
            )

            if depth == 0 and not preview:
                CacheService.set_json(
                    self.CACHE_NS,
                    cache_key,
                    response.model_dump(mode="json"),
                    self.CACHE_TTL,
                )

                if not is_internal:
                    preview_msg = humanize_output_preview(output, max_len=160)
                    await self.notifications.create(
                        user_id=user.id,
                        title=f"اجرای {agent.name}",
                        message=preview_msg or "اجرای ایجنت با موفقیت انجام شد.",
                        severity=NotificationSeverity.SUCCESS,
                        link=f"/agents/{agent.slug}",
                    )
                    await self.db.commit()

            return response
        except HTTPException:
            raise
        except Exception as exc:
            if log_row is not None:
                await self.activity.finish(log_row, output_text=None, error=str(exc))
            is_internal = bool(
                payload.thread_id and str(payload.thread_id).startswith("validate-")
            )
            if depth == 0 and not preview and not is_internal:
                await self.notifications.create(
                    user_id=user.id,
                    title=f"خطا در {agent.name}",
                    message=plain_text_preview(str(exc), max_len=200) or "خطا در اجرای ایجنت",
                    severity=NotificationSeverity.ERROR,
                )
                await self.db.commit()
            if _is_llm_unreachable(exc):
                raise LlmUnavailableError(
                    "درگاه مدل موقتاً در دسترس نیست (خطای شبکه/502). "
                    "لطفاً چند ثانیه بعد دوباره تلاش کنید. "
                    "اگر ادامه داشت، وضعیت gateway (MIX) را بررسی کنید."
                ) from exc
            raise AppError(
                f"اجرای ایجنت با خطا مواجه شد ({type(exc).__name__}). "
                "جزئیات در گزارش فعالیت ثبت شده است.",
                code=ErrorCode.ORCHESTRATION_FAILED,
                status_code=500,
                details={"type": type(exc).__name__, "message": str(exc)[:300]}
                if settings.app_debug
                else {"type": type(exc).__name__},
                log_level="error",
            ) from exc

    async def _preview_enriched_input(self, agent: Agent, raw_input: str) -> str:
        from src.schemas.agent_knowledge_bindings import parse_knowledge_bindings

        enriched = raw_input
        bindings = parse_knowledge_bindings(agent.config_json or {})
        if bindings.dataset_ids:
            try:
                hits = await self.vectors.search(
                    raw_input,
                    dataset_ids=bindings.dataset_ids,
                    limit=3,
                )
                if hits:
                    parts = [f"- {c.content[:500]}" for c, _score in hits]
                    enriched += "\n\n---\nContext from knowledge base:\n" + "\n".join(parts)
            except Exception:
                pass
        return enriched

    async def _invoke_cache_key(
        self,
        agent: Agent,
        thread_id: str,
        payload: AgentInvokeRequest,
    ) -> str:
        """Include latest runtime upload so re-invoke after a new file is not a stale cache hit."""
        parts = [str(agent.id), thread_id, payload.input or "", payload.action_slug or ""]
        tool_names = list(agent.tool_names or [])
        xlsx_only = "run_agent_script" in tool_names
        runtime = await self._latest_runtime_file(agent.id, xlsx_only=xlsx_only)
        if runtime:
            parts.append(str(runtime.id))
            try:
                path = Path(runtime.storage_path)
                if path.is_file():
                    parts.append(str(int(path.stat().st_mtime)))
            except OSError:
                pass
        return CacheService.hash_key(":".join(parts))

    async def _latest_runtime_file(
        self, agent_id: UUID, *, xlsx_only: bool = False
    ) -> AgentFile | None:
        result = await self.db.execute(
            select(AgentFile)
            .where(AgentFile.agent_id == agent_id)
            .order_by(desc(AgentFile.created_at))
            .limit(20)
        )
        rows = list(result.scalars().all())
        if xlsx_only:
            return pick_runtime_karkard_file(rows)
        return pick_runtime_agent_file(rows)

    async def _resolve_auto_tool_slug(
        self, agent: Agent, payload: AgentInvokeRequest
    ) -> str | None:
        if payload.action_slug:
            result = await self.db.execute(
                select(AgentAction).where(
                    AgentAction.agent_id == agent.id,
                    AgentAction.slug == payload.action_slug,
                )
            )
            action = result.scalar_one_or_none()
            if action:
                from src.agents_lib.platform_constants import BUILTIN_FILE_TOOLS

                for slug in action.tool_chain or []:
                    # Resolve direct-exec tools and built-in file tools (karkard).
                    # The LLM-vs-bypass decision is enforced downstream, so a
                    # built-in file tool is still routed through the model.
                    if slug in _DIRECT_AUTO_TOOLS or slug in BUILTIN_FILE_TOOLS:
                        return slug
            return None
        return await self._primary_worker_tool(agent)

    async def _primary_worker_tool(self, agent: Agent) -> str | None:
        plan = (agent.config_json or {}).get("runtime_plan") or {}
        primary = str(plan.get("primary_tool") or "").strip()
        if primary:
            return primary
        script = (agent.config_json or {}).get("workspace_script") or {}
        if script.get("needed") and script.get("slug") and script.get("verified_at"):
            return "run_agent_script"
        tool_names = list(agent.tool_names or [])
        if "run_agent_script" in tool_names:
            return "run_agent_script"
        result = await self.db.execute(
            select(AgentAction)
            .where(AgentAction.agent_id == agent.id)
            .order_by(AgentAction.order_index)
        )
        for action in result.scalars().all():
            chain = list(action.tool_chain or [])
            if chain:
                return chain[0]
        if len(tool_names) == 1:
            return tool_names[0]
        return None

    async def _try_worker_auto_tool(
        self,
        agent: Agent,
        payload: AgentInvokeRequest,
        user: User,
        log_row,
        thread_id: str,
        cache_key: str,
    ) -> AgentInvokeResponse | None:
        """Run deterministic worker tools directly when runtime input files exist."""
        kind = getattr(getattr(agent, "kind", None), "value", str(getattr(agent, "kind", "")))
        tool_slug = await self._resolve_auto_tool_slug(agent, payload)
        if not tool_slug:
            return None

        caps = _caps(agent)
        # Chat-enabled agents use the LLM + tools path unless an explicit action was chosen.
        if caps.get("chat_enabled") and not payload.action_slug:
            return None

        if kind != AgentKind.WORKER.value and tool_slug != "run_agent_script":
            return None

        runtime_file = await self._latest_runtime_file(
            agent.id, xlsx_only=(tool_slug == "run_agent_script")
        )
        if not runtime_file:
            return None

        from src.agents_lib.cursor_tool_runner import extract_tool_context
        from src.demo.tool_runner import format_tool_results, run_tool_slug

        from src.core.agent_tool_files import lock_tool_storage_path

        tool_vars: dict = {
            "agent_id": str(agent.id),
        }
        if tool_slug == "run_agent_script":
            script = (agent.config_json or {}).get("workspace_script") or {}
            tool_vars["script_slug"] = script.get("slug")
        try:
            tool_vars["storage_path"] = str(
                lock_tool_storage_path(
                    agent.id,
                    runtime_file.storage_path,
                    tool_slug=tool_slug,
                )
            )
        except FileNotFoundError:
            tool_vars["storage_path"] = runtime_file.storage_path

        ctx = extract_tool_context(payload.input)
        for key, value in ctx.items():
            if key != "storage_path":
                tool_vars[key] = value

        cfg = agent.config_json or {}
        if cfg.get("task_profile") == "karkard":
            tool_vars.setdefault("jalali_year", 1405)

        try:
            result = run_tool_slug(tool_slug, tool_vars)
        except ValueError as exc:
            raise AppError(
                str(exc),
                code=ErrorCode.VALIDATION_ERROR,
                status_code=422,
            ) from exc
        except Exception as exc:
            raise AppError(
                f"Worker auto-tool failed: {exc}",
                code=ErrorCode.INTERNAL_ERROR,
                status_code=500,
            ) from exc

        output = self.finalize_output(agent, format_tool_results([result]))
        execution_trace = numbered_trace(
            [
                trace_step(
                    "worker_auto_tool",
                    f"اجرای خودکار {tool_slug}",
                    detail=_truncate_text(str(result.get("summary") or result), 800),
                )
            ]
        )

        InMemoryStore.append(thread_id, {"role": "user", "content": payload.input})
        InMemoryStore.append(thread_id, {"role": "assistant", "content": output})

        tokens_in = max(1, len(payload.input) // 4)
        tokens_out = max(1, len(output) // 4)
        resolved_for_cost = llm_runtime.resolve(agent.model_name)
        cost = estimate_cost(resolved_for_cost.model, tokens_in, tokens_out)

        log_row = await self.activity.finish(
            log_row,
            output_text=output,
            tokens_input=tokens_in,
            tokens_output=tokens_out,
            cost_usd=cost,
            details={
                "thread_id": thread_id,
                "execution_trace": execution_trace,
                "llm_provider": "worker_auto_tool",
                "model_name": tool_slug,
                "auto_tool": tool_slug,
                "runtime_file": runtime_file.filename,
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
            llm_provider="worker_auto_tool",
            model_name=tool_slug,
        )

        is_internal = bool(payload.thread_id and str(payload.thread_id).startswith("validate-"))
        if not payload.stream and not is_internal:
            CacheService.set_json(
                self.CACHE_NS,
                cache_key,
                response.model_dump(mode="json"),
                self.CACHE_TTL,
            )
        if not is_internal:
            preview = humanize_output_preview(output, max_len=160)
            await self.notifications.create(
                user_id=user.id,
                title=f"اجرای {agent.name}",
                message=preview or "اجرای ایجنت با موفقیت انجام شد.",
                severity=NotificationSeverity.SUCCESS,
                link=f"/agents/{agent.slug}",
            )
            await self.db.commit()
        return response

    async def _uploaded_files_context(self, agent: Agent) -> str:
        """Tell the LLM which files are already attached so it never asks the user to upload."""
        from src.core.agent_workspace_files import (
            list_workspace_output_files,
            resolve_storage_path_file,
            workspace_download_url,
        )
        from src.core.file_text_extract import extract_text

        result = await self.db.execute(
            select(AgentFile)
            .where(AgentFile.agent_id == agent.id)
            .order_by(desc(AgentFile.created_at))
            .limit(8)
        )
        rows = list(result.scalars().all())
        outputs = list_workspace_output_files(agent.id)
        if not rows and not outputs:
            return ""

        tool_names = list(agent.tool_names or [])
        latest = pick_runtime_karkard_file(rows)

        lines = [
            "=== فایل‌های workspace این ایجنت (قبلاً آپلود شده — هرگز نگو فایل در گفتگو نیست) ===",
            "کاربر فایل را از پنل «دریافت فایل» یا آموزش آپلود کرده؛ در چت دکمه آپلود جدا نیست ولی فایل‌ها اینجاست.",
        ]
        output_samples: list[AgentFile] = []
        instruction_files: list[AgentFile] = []
        for f in rows:
            dl = f"/api/v1/agents/{agent.id}/files/{f.id}/download"
            ws = workspace_download_url(agent.id, f.storage_path)
            dl_bit = f" · دانلود: {dl}"
            if ws and ws != dl:
                dl_bit += f" · workspace: {ws}"
            name = f.filename or ""
            if is_output_sample_file(name):
                output_samples.append(f)
                lines.append(f"- [نمونه خروجی] {name} {dl_bit} · storage_path={f.storage_path}")
                continue
            if is_instruction_file(name):
                instruction_files.append(f)
                shown = display_agent_filename(name)
                lines.append(
                    f"- [فایل دستورالعمل — در system prompt گنجانده شده] {shown}{dl_bit}"
                )
                continue
            lines.append(f"- {name}{dl_bit} · storage_path={f.storage_path}")

        inline_blocks: list[str] = []
        runtime_rows = [
            f
            for f in rows
            if not is_output_sample_file(f.filename or "")
            and not is_instruction_file(f.filename or "")
        ]
        inline_sources = [latest] if latest else runtime_rows[:_INLINE_FILE_CONTEXT_MAX_FILES]
        # File-processing agents (run_agent_script) must not get truncated xlsx
        # inline — that pushes the LLM to invent numbers instead of running the script.
        if "run_agent_script" not in tool_names:
            for f in inline_sources[:_INLINE_FILE_CONTEXT_MAX_FILES]:
                path = resolve_storage_path_file(agent.id, f.storage_path)
                if not path:
                    continue
                try:
                    raw = path.read_bytes()
                except Exception:
                    continue
                text = extract_text(raw, f.mime_type, f.filename)
                if not text or len(text.strip()) < 10:
                    continue
                inline_blocks.append(
                    f"--- فایل: {f.filename} ---\n{_truncate_inline_file_text(text)}"
                )

        if inline_blocks:
            file_instruction = (
                "پاسخ را بر اساس داده واقعی همین فایل‌ها بساز؛ داده ساختگی نساز. "
                "اگر داده لازم در فایل نیست، صریح بگو چه چیزی کم است."
            )
            lines.extend(
                [
                    "",
                    "=== محتوای فایل ورودی فعلی (داده واقعی برای پاسخ) ===",
                    file_instruction,
                    *inline_blocks,
                ]
            )

        if output_samples:
            lines.extend(
                [
                    "",
                    "=== نمونه فایل خروجی (برای تقلید دقیق فرمت) ===",
                    "این فایل‌ها «نمونه خروجی» هستند. وقتی خروجی فایل (اکسل/پی‌دی‌اف/...) تولید می‌کنی:",
                    "1) نام شیت‌ها/ستون‌ها/فرمت را مطابق نمونه بساز",
                    "2) اگر نمونه با داده واقعی کاربر ناسازگار است، نزدیک‌ترین ساختار سازگار را حفظ کن",
                    "3) لینک دانلود خروجی را حتماً به شکل /api/v1/agents/.../workspace/... بده",
                ]
            )
            for f in output_samples[:4]:
                dl = f"/api/v1/agents/{agent.id}/files/{f.id}/download"
                shown = (f.filename or "").removeprefix("output-sample__")
                lines.append(f"- نمونه: {shown} · دانلود: {dl}")

        for out in outputs:
            rel = f"output/{out.name}"
            dl = workspace_download_url(agent.id, rel)
            if dl:
                lines.append(f"- خروجی پردازش: {out.name} · دانلود: {dl}")

        if instruction_files:
            lines.extend(
                [
                    "",
                    "=== فایل‌های دستورالعمل (فقط مرجع — قوانین در system prompt است) ===",
                    "این فایل‌ها در زمان ساخت ایجنت خوانده و در دستورالعمل سیستمی ذخیره شده‌اند؛ "
                    "آن‌ها داده ورودی اجرا نیستند.",
                ]
            )

        if latest and "run_agent_script" in tool_names:
            lines.append(
                "برای پردازش فایل، ابزار `run_agent_script` را با "
                f"storage_path=\"{latest.storage_path}\" و agent_id=\"{agent.id}\" فراخوانی کن. "
                "فقط همین فایل خام را پردازش کن — نه نمونه خروجی (output-sample__). "
                "محاسبه دستی در متن پاسخ ممنوع است — خروجی فقط از نتیجه اسکریپت. "
                "در پاسخ کاربر حتماً download_path به شکل /api/v1/agents/.../workspace/... بده."
            )
        elif latest:
            lines.append(
                f"برای پردازش از storage_path آخرین فایل استفاده کن: {latest.storage_path}. "
                "لینک دانلود خروجی را فقط به صورت /api/v1/agents/.../workspace/... بده."
            )
        return "\n".join(lines)

    async def _rag_context(self, agent_id: UUID, query: str) -> str:
        try:
            from src.repositories.agent_repository import AgentRepository
            from src.schemas.agent_knowledge_bindings import parse_knowledge_bindings

            agent = await AgentRepository(self.db).get(agent_id)
            dataset_ids = (
                parse_knowledge_bindings(agent.config_json if agent else {}).dataset_ids
            )
            hits = await self.vectors.search_for_agent(
                query,
                agent_id=agent_id,
                dataset_ids=dataset_ids,
                limit=3,
            )
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
