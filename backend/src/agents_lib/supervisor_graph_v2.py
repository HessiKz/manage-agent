"""Parallel supervisor v2 (Phase 3 M4).

Plan → Execute (parallel) → Merge. Selected only behind the
`parallel_supervisor_v1` flag for AUTONOMOUS supervisors. Child invokes receive
only their subtask (never the full user thread). Results are cached in
run_state.payload.supervisor_cache so idempotent retries reuse children.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.agents_lib.agent_factory import build_llm
from src.agents_lib.graph_agent import run_react_agent
from src.models.agent import Agent, AgentKind
from src.models.agent_link import AgentLink, AgentLinkType
from src.models.user import User


class PlanStep(BaseModel):
    callee_slug: str
    subtask: str
    parallel_group: str = "A"


class PlanSchema(BaseModel):
    plan_id: str = Field(default="")
    steps: list[PlanStep] = Field(default_factory=list)
    synthesis_hint: str = Field(default="")


@dataclass
class SubagentResult:
    slug: str
    summary: str
    confidence: float
    artifacts: list[dict[str, Any]] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    tool_trace_ref: str | None = None


async def _supervise_links(db: AsyncSession, agent_id: UUID) -> list[AgentLink]:
    result = await db.execute(
        select(AgentLink)
        .options(selectinload(AgentLink.callee))
        .where(
            AgentLink.caller_agent_id == agent_id,
            AgentLink.link_type == AgentLinkType.SUPERVISES,
        )
    )
    return list(result.scalars().all())


def _cache_ref(run_state: dict | None, plan_id: str, slug: str) -> SubagentResult | None:
    cache = (run_state or {}).get("payload", {}).get("supervisor_cache", {})
    entry = cache.get(plan_id, {}).get(slug)
    if not entry:
        return None
    return SubagentResult(**entry)


def _cache_store(run_state: dict | None, plan_id: str, slug: str, res: SubagentResult) -> None:
    if not run_state:
        return
    payload = run_state.setdefault("payload", {})
    cache = payload.setdefault("supervisor_cache", {})
    cache.setdefault(plan_id, {})[slug] = {
        "slug": res.slug,
        "summary": res.summary,
        "confidence": res.confidence,
        "artifacts": res.artifacts,
        "errors": res.errors,
        "tool_trace_ref": res.tool_trace_ref,
    }


async def run_supervisor_v2(
    db: AsyncSession,
    agent: Agent,
    user_input: str,
    user: User,
    *,
    depth: int = 0,
    thread_id: str | None = None,
    run_state: dict | None = None,
) -> "AgentInvokeResponse":
    """Plan children, run them in parallel groups, merge + cite artifacts."""
    from src.schemas.agent import AgentInvokeResponse

    links = await _supervise_links(db, agent.id)
    if not links:
        child = await run_react_agent(agent, user_input, [])
        return AgentInvokeResponse(output=child.output, execution_trace=child.trace)

    link_policy = agent.agent_link_policy or {}
    max_depth = int(link_policy.get("max_depth", 3))
    max_parallel = int(link_policy.get("max_parallel", 3))
    if depth >= max_depth:
        return AgentInvokeResponse(output="Supervisor max depth reached.")

    callee_by_slug = {link.callee.slug: link.callee for link in links}
    callee_lines = [
        f"- {link.callee.slug}: {link.callee.name} — {link.callee.description or ''}"
        for link in links
    ]

    # ── PLAN ──
    llm = build_llm(agent)
    plan_prompt = (
        "You are a supervisor planner. Given the user request, produce a JSON plan "
        "with a plan_id (uuid) and steps. Each step names a callee_slug, a subtask "
        "(a self-contained instruction for that sub-agent), and a parallel_group "
        "letter so independent steps run concurrently. Add a synthesis_hint.\n"
        f"Available callees:\n{chr(10).join(callee_lines)}\n"
        "Respond ONLY with JSON matching the schema.\n"
        f"User request: {user_input}"
    )
    plan: PlanSchema
    try:
        struct = await llm.with_structured_output(PlanSchema).ainvoke(plan_prompt)
        plan = PlanSchema.model_validate(struct) if not isinstance(struct, PlanSchema) else struct
    except Exception:
        # Fallback: sequential invoke via v1 semantics.
        return await _fallback_v1(db, agent, user_input, links)

    if not plan.steps or not plan.plan_id:
        return await _fallback_v1(db, agent, user_input, links)

    # Reject unknown callee slugs.
    plan.steps = [s for s in plan.steps if s.callee_slug in callee_by_slug]
    if not plan.steps:
        return await _fallback_v1(db, agent, user_input, links)

    # ── EXECUTE (parallel within group) ──
    async def _run_child(step: PlanStep) -> SubagentResult:
        cached = _cache_ref(run_state, plan.plan_id, step.callee_slug)
        if cached and not cached.errors:
            return cached
        child_agent = callee_by_slug[step.callee_slug]
        # Subagents that are themselves supervisors are rejected (no nesting).
        if (
            child_agent.kind.canonical == AgentKind.SUPERVISOR
            if hasattr(child_agent.kind, "canonical")
            else str(child_agent.kind) == "supervisor"
        ):
            return SubagentResult(
                slug=step.callee_slug, summary="", confidence=0.0,
                errors=["child is a supervisor; nesting rejected"],
            )
        result = await run_react_agent(child_agent, step.subtask, [])
        res = SubagentResult(
            slug=step.callee_slug,
            summary=result.output,
            confidence=getattr(result, "confidence", 0.8) if hasattr(result, "confidence") else 0.8,
            artifacts=(result.artifacts if hasattr(result, "artifacts") else []) or [],
            errors=[],
        )
        _cache_store(run_state, plan.plan_id, step.callee_slug, res)
        return res

    sem = asyncio.Semaphore(max_parallel)
    async def _guarded(step):
        async with sem:
            return await _run_child(step)

    results = await asyncio.gather(*[_guarded(s) for s in plan.steps])

    # ── MERGE ──
    parts = []
    citations = []
    low_conf = False
    for r in results:
        if r.errors:
            parts.append(f"[{r.slug}]: error — {'; '.join(r.errors)}")
            continue
        parts.append(f"[{r.slug}]: {r.summary}")
        for a in r.artifacts:
            name = a.get("name") or a.get("relative_path") or "artifact"
            citations.append(f"[{r.slug}: {name}]")
        if r.confidence < 0.5:
            low_conf = True

    merge_prompt = (
        f"{plan.synthesis_hint}\n\n"
        "Synthesize a final answer from these sub-agent results. Cite each produced "
        f"artifact using its tag.\n\n" + "\n\n".join(parts)
    )
    merged = await llm.ainvoke(merge_prompt)
    final = merged.content if hasattr(merged, "content") else str(merged)
    if citations:
        final = f"{final}\n\nمنابع:\n" + "\n".join(citations)
    if low_conf:
        final = (
            f"{final}\n\n⚠ بخشی از زیرعامل‌ها با اطمینان پایین پاسخ دادند؛ "
            "نتیجه ممکن است ناقص باشد."
        )
    return AgentInvokeResponse(output=final)


async def _fallback_v1(db, agent, user_input, links):
    from src.agents_lib.supervisor_graph import run_supervisor

    return AgentInvokeResponse(output=await run_supervisor(db, agent, user_input, None))


