"""Batch config audit across all agents — the 'hundreds of agents' acceptance test.

Network-free and deterministic: it checks tool-slug configuration for every
agent and surfaces any previously-recorded validation failures, so an admin can
see at a glance which agents need a fix and whether each issue is fixable in the
admin UI (never 'edit Python').
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.agent_config_validation import collect_tool_config_issues
from src.models.agent import Agent
from src.models.agent_action import AgentAction


async def audit_agents(db: AsyncSession) -> dict:
    agents = list((await db.execute(select(Agent))).scalars().all())

    actions_by_agent: dict = {}
    for action in (await db.execute(select(AgentAction))).scalars().all():
        actions_by_agent.setdefault(action.agent_id, []).append(action)

    agent_reports: list[dict] = []
    total_fixable = 0
    total_unfixable = 0

    for agent in agents:
        issues = collect_tool_config_issues(
            agent.tool_names or [], actions_by_agent.get(agent.id, [])
        )

        validation = (agent.config_json or {}).get("validation") or {}
        for failure in validation.get("failures") or []:
            issues.append(
                {
                    "field": f"validation:{failure.get('phase', '—')}",
                    "message": str(failure.get("message", "")),
                    "fixable_in_admin": bool(failure.get("fixable_in_admin")),
                }
            )

        if not issues:
            continue

        fixable = sum(1 for i in issues if i.get("fixable_in_admin"))
        unfixable = len(issues) - fixable
        total_fixable += fixable
        total_unfixable += unfixable
        agent_reports.append(
            {
                "agent_id": str(agent.id),
                "slug": agent.slug,
                "name": agent.name,
                "status": getattr(agent.status, "value", str(agent.status)),
                "issues": issues,
            }
        )

    return {
        "agents_total": len(agents),
        "agents_with_issues": len(agent_reports),
        "issues_fixable": total_fixable,
        "issues_unfixable": total_unfixable,
        "ok": total_unfixable == 0,
        "agents": agent_reports,
    }
