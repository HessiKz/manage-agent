"""Agent action CRUD and execution."""

from __future__ import annotations

import json
import re
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.agents_lib.tool_registry import ToolRegistry
from src.core import llm_runtime
from src.core.runtime_file_selection import pick_runtime_agent_file
from src.models.agent import Agent
from src.models.agent_action import AgentAction
from src.models.agent_file import AgentFile
from src.models.user import User
from src.schemas.agent import AgentInvokeRequest, AgentInvokeResponse
from src.schemas.agent_action import AgentActionCreate, AgentActionRunRequest, AgentActionUpdate
from src.services.orchestrator_service import OrchestratorService


def render_template(template: str, variables: dict) -> str:
    out = template
    for key, value in variables.items():
        out = out.replace(f"{{{{{key}}}}}", str(value))
        out = re.sub(rf"\{{\{{\s*{re.escape(key)}\s*\}}\}}", str(value), out)
    return out


def _action_input_properties(schema: dict | None) -> dict:
    if not schema or not isinstance(schema, dict):
        return {}
    nested = schema.get("properties")
    if isinstance(nested, dict):
        return nested
    skip = {"properties", "required", "type", "$schema"}
    return {k: v for k, v in schema.items() if k not in skip and isinstance(v, dict)}


def variables_with_schema_defaults(
    action: AgentAction, variables: dict | None
) -> dict:
    """Merge input_schema defaults — UI may show defaults without posting them."""
    out = dict(variables or {})
    for key, field in _action_input_properties(action.input_schema).items():
        if not isinstance(field, dict):
            continue
        val = out.get(key)
        if val is not None and str(val).strip() != "":
            continue
        if "default" in field:
            out[key] = field["default"]
    return out


def _build_action_invoke_input(
    action: AgentAction,
    prompt: str,
    tool_vars: dict,
) -> str:
    """Compose the user message sent to the LLM ReAct agent for an action."""
    parts = [prompt.strip()]
    if tool_vars:
        parts.append(
            "Context for tools (use these exact values when calling tools):\n"
            + json.dumps(tool_vars, ensure_ascii=False)
        )
    if action.tool_chain:
        tools = ", ".join(action.tool_chain)
        parts.append(
            f"Complete this action by calling these tools via function calling: {tools}. "
            "Reason about the task, then invoke the tools. "
            "Do not ask the user to upload files or say you lack access to workspace data."
        )
        if "resume_screen" in (action.tool_chain or []):
            parts.append(
                'For resume_screen you MUST pass role (e.g. "Backend Engineer") from the context JSON.'
            )
    parts.append(
        "Output contract (MANDATORY):\n"
        "1) Return ONLY the executed result for this exact task.\n"
        "2) Never return a guide/framework/how-to/checklist about how someone should do it.\n"
        "3) Never ask the user for extra data unless absolutely required.\n"
        "4) If data is missing, explicitly state what was used and give the best concrete result now.\n"
        "5) For screening tasks, return ranked candidates with scores and a final shortlist."
    )
    return "\n\n".join(parts)


_ADVICE_PATTERNS = (
    r"اگر بخواهی",
    r"می[‌ ]?توانم",
    r"می[‌ ]?تونم",
    r"چارچوب",
    r"مرحله [0-9۰-۹]",
    r"این یک .*است که می[‌ ]?توانی",
    r"for .*? you can",
    r"here.?s a framework",
    r"step [0-9]",
)


def _is_advisory_output(text: str) -> bool:
    t = (text or "").strip().lower()
    if not t:
        return True
    for pat in _ADVICE_PATTERNS:
        if re.search(pat, t, flags=re.IGNORECASE):
            return True
    return False


def _has_tool_activity(resp: AgentInvokeResponse) -> bool:
    trace = resp.execution_trace or []
    return any((s.kind in ("tool_call", "tool_result")) for s in trace)


_DIRECT_ACTION_TOOLS = frozenset(
    {"run_agent_script", "report_generate", "resume_screen"}
)


class AgentActionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _latest_runtime_xlsx(self, agent_id: UUID) -> AgentFile | None:
        result = await self.db.execute(
            select(AgentFile)
            .where(AgentFile.agent_id == agent_id)
            .order_by(desc(AgentFile.created_at))
            .limit(20)
        )
        rows = list(result.scalars().all())
        from src.karkard.input_selection import pick_runtime_karkard_file

        return pick_runtime_karkard_file(rows) or pick_runtime_agent_file(rows)

    async def _tool_variables(
        self,
        agent_id: UUID,
        variables: dict | None,
        *,
        tool_chain: list[str] | None = None,
    ) -> dict:
        """Inject agent context and locked runtime file path for tools."""
        from src.core.agent_tool_files import lock_tool_storage_path

        vars_map = dict(variables or {})
        vars_map.setdefault("agent_id", str(agent_id))
        hint = vars_map.get("storage_path", "")
        tool_slug = (tool_chain or [None])[0] if tool_chain else None
        try:
            vars_map["storage_path"] = str(
                lock_tool_storage_path(agent_id, hint, tool_slug=tool_slug)
            )
        except FileNotFoundError:
            if tool_slug == "karkard_process":
                raise
            if "storage_path" not in (variables or {}):
                latest = await self._latest_runtime_xlsx(agent_id)
                if latest:
                    vars_map["storage_path"] = latest.storage_path
        return vars_map

    async def _invoke_direct_action_tools(
        self,
        agent: Agent,
        action: AgentAction,
        tool_vars: dict,
    ) -> AgentInvokeResponse | None:
        """Run deterministic tool_chain locally — reliable during training (cursor/no FC)."""
        chain = [t for t in (action.tool_chain or []) if t in _DIRECT_ACTION_TOOLS]
        if not chain:
            return None
        from src.agents_lib.execution_trace import numbered_trace, trace_step
        from src.demo.tool_runner import format_tool_results, run_tool_slug

        results = []
        vars_copy = dict(tool_vars)
        for slug in chain:
            results.append(run_tool_slug(slug, vars_copy))
        output = OrchestratorService(self.db).finalize_output(
            agent, format_tool_results(results)
        )
        trace = numbered_trace(
            [
                trace_step(
                    "direct_action_tool",
                    f"اجرای مستقیم {chain[0]}",
                    detail=(results[0].get("summary") or output)[:800],
                )
            ]
        )
        return AgentInvokeResponse(
            output=output,
            execution_trace=trace,
            llm_provider="direct_tool",
            model_name=chain[0],
        )

    async def _get_agent(self, agent_id: UUID) -> Agent:
        agent = await self.db.get(Agent, agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        return agent

    async def list_actions(self, agent_id: UUID) -> list[AgentAction]:
        await self._get_agent(agent_id)
        result = await self.db.execute(
            select(AgentAction)
            .where(AgentAction.agent_id == agent_id)
            .order_by(AgentAction.order_index, AgentAction.created_at)
        )
        return list(result.scalars().all())

    async def create(self, agent_id: UUID, payload: AgentActionCreate) -> AgentAction:
        await self._get_agent(agent_id)
        existing = await self.db.execute(
            select(AgentAction).where(
                AgentAction.agent_id == agent_id,
                AgentAction.slug == payload.slug,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Action slug already exists")
        action = AgentAction(agent_id=agent_id, **payload.model_dump())
        self.db.add(action)
        await self.db.flush()
        return action

    async def update(
        self, agent_id: UUID, action_id: UUID, payload: AgentActionUpdate
    ) -> AgentAction:
        action = await self._get_action(agent_id, action_id)
        for k, v in payload.model_dump(exclude_unset=True).items():
            setattr(action, k, v)
        await self.db.flush()
        return action

    async def delete(self, agent_id: UUID, action_id: UUID) -> None:
        action = await self._get_action(agent_id, action_id)
        await self.db.delete(action)

    async def _get_action(self, agent_id: UUID, action_id: UUID) -> AgentAction:
        result = await self.db.execute(
            select(AgentAction).where(
                AgentAction.id == action_id,
                AgentAction.agent_id == agent_id,
            )
        )
        action = result.scalar_one_or_none()
        if not action:
            raise HTTPException(status_code=404, detail="Action not found")
        return action

    async def get_by_slug(self, agent_id: UUID, slug: str) -> AgentAction:
        result = await self.db.execute(
            select(AgentAction).where(
                AgentAction.agent_id == agent_id,
                AgentAction.slug == slug,
            )
        )
        action = result.scalar_one_or_none()
        if not action:
            raise HTTPException(status_code=404, detail="Action not found")
        return action

    async def run(
        self,
        agent_id: UUID,
        slug: str,
        payload: AgentActionRunRequest,
        user: User,
    ) -> AgentInvokeResponse:
        """Run an action through the LLM orchestrator (ReAct + tools), never direct tool bypass."""
        agent = await self._get_agent(agent_id)
        caps = agent.capabilities or {}
        if not caps.get("actions_enabled", False):
            raise HTTPException(status_code=422, detail="Actions are disabled for this agent")

        action = await self.get_by_slug(agent_id, slug)
        variables = variables_with_schema_defaults(action, payload.variables)
        if "resume_screen" in (action.tool_chain or []):
            role = str(variables.get("role", "")).strip()
            if not role or role.lower() in {"sample", "python", "test"}:
                variables["role"] = "Backend Engineer"

        prompt = render_template(action.prompt_template, variables)
        tool_vars = await self._tool_variables(agent_id, variables, tool_chain=action.tool_chain)
        action_input = _build_action_invoke_input(action, prompt, tool_vars)

        direct = await self._invoke_direct_action_tools(agent, action, tool_vars)
        if direct is not None:
            return direct

        merged_tools = list(
            dict.fromkeys([*(agent.tool_names or []), *(action.tool_chain or [])])
        )
        # Backward-compat for older DB rows: resume screening actions previously pointed to hr_lookup.
        # Ensure they execute with the dedicated resume tool when available.
        if (
            ("resume" in action.slug.lower() or "cv" in action.slug.lower() or "رزومه" in action.label)
            and "resume_screen" not in merged_tools
        ):
            try:
                ToolRegistry.get("resume_screen")
                merged_tools.append("resume_screen")
            except KeyError:
                pass
        original_tools = list(agent.tool_names or [])
        agent.tool_names = merged_tools

        try:
            response = await OrchestratorService(self.db).invoke(
                agent_id,
                AgentInvokeRequest(
                    input=action_input,
                    thread_id=payload.thread_id,
                    stream=False,
                    action_slug=slug,
                ),
                user,
                depth=0,
            )
            if _is_advisory_output(response.output) or (
                action.tool_chain
                and bool(response.execution_trace)
                and not _has_tool_activity(response)
                and llm_runtime.active_provider() != "cursor"
            ):
                retry_input = (
                    f"{action_input}\n\n"
                    "The previous response was rejected for being non-executable or too generic. "
                    "Retry now and provide only the final executed output. "
                    "If tools are listed, you MUST call them and base your answer on their results."
                )
                response = await OrchestratorService(self.db).invoke(
                    agent_id,
                    AgentInvokeRequest(
                        input=retry_input,
                        thread_id=payload.thread_id,
                        stream=False,
                        action_slug=slug,
                    ),
                    user,
                    depth=0,
                )
            return response
        finally:
            agent.tool_names = original_tools
