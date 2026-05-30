"""Supervisor agent routing via LangGraph-style iteration."""

from __future__ import annotations

from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.agents_lib.agent_factory import build_llm
from src.models.agent import Agent
from src.models.agent_link import AgentLink, AgentLinkType
from src.models.user import User
from src.schemas.agent import AgentInvokeRequest
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


async def run_supervisor(
    db: AsyncSession,
    agent: Agent,
    user_input: str,
    user: User,
    *,
    depth: int = 0,
    thread_id: str | None = None,
) -> str:
    """Route to sub-agents then synthesize a final answer."""
    links = await _supervise_links(db, agent.id)
    if not links:
        from src.agents_lib.graph_agent import run_react_agent

        result = await run_react_agent(agent, user_input, [])
        return result.output

    link_policy = agent.agent_link_policy or {}
    max_depth = int(link_policy.get("max_depth", 3))
    if depth >= max_depth:
        return "Supervisor max depth reached."

    callee_lines = [
        f"- {link.callee.slug}: {link.callee.name} — {link.callee.description or 'no description'}"
        for link in links
    ]
    slugs = [link.callee.slug for link in links]

    router_prompt = (
        "You are a supervisor router. Given the user request, respond with ONLY one line:\n"
        "Either the slug of the best sub-agent to handle it, or FINAL if you can answer directly.\n"
        f"Available slugs: {', '.join(slugs)}\n"
        f"Sub-agents:\n" + "\n".join(callee_lines)
    )

    llm = build_llm(agent)
    router_msg = await llm.ainvoke(
        [
            SystemMessage(content=router_prompt),
            HumanMessage(content=user_input),
        ]
    )
    raw = getattr(router_msg, "content", str(router_msg))
    if isinstance(raw, list):
        choice = "".join(
            p.get("text", "") if isinstance(p, dict) else str(p) for p in raw
        ).strip()
    else:
        choice = str(raw).strip().split("\n")[0].strip().lower()

    if choice == "final" or choice not in slugs:
        from src.agents_lib.agent_factory import build_messages

        messages = build_messages(agent, user_input, [])
        ai_msg = await llm.ainvoke(messages)
        content = getattr(ai_msg, "content", str(ai_msg))
        if isinstance(content, list):
            return "".join(
                p.get("text", "") if isinstance(p, dict) else str(p) for p in content
            )
        return str(content)

    target = next((l for l in links if l.callee.slug == choice), links[0])
    from src.services.orchestrator_service import OrchestratorService

    orch = OrchestratorService(db)
    child_response = await orch.invoke(
        target.callee_agent_id,
        AgentInvokeRequest(input=user_input, thread_id=thread_id, stream=False),
        user,
        depth=depth + 1,
    )

    synth_prompt = (
        f"User asked: {user_input}\n\n"
        f"Sub-agent ({target.callee.name}) responded:\n{child_response.output}\n\n"
        "Synthesize a concise final answer for the user."
    )
    synth_msg = await llm.ainvoke([HumanMessage(content=synth_prompt)])
    content = getattr(synth_msg, "content", str(synth_msg))
    if isinstance(content, list):
        return "".join(
            p.get("text", "") if isinstance(p, dict) else str(p) for p in content
        )
    return str(content)
