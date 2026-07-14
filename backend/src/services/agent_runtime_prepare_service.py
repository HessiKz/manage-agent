"""Prepare deterministic runtime plan before interactive training."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from src.models.agent import Agent
from src.models.agent_action import AgentAction
from src.models.agent_file import AgentFile
from src.services.agent_script_service import AgentScriptService


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AgentRuntimePrepareService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def prepare(self, agent_id: UUID) -> Agent:
        agent = await self.db.get(Agent, agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        plan = await self._plan(agent)
        cfg = dict(agent.config_json or {})
        cfg["runtime_plan"] = plan
        # Bake time.ir holidays early so training chat + scripts see them even
        # before full validation file_setup (karkard agents especially).
        try:
            from src.services.holiday_service import (
                agent_wants_holiday_context,
                ensure_holiday_calendar,
            )

            if agent_wants_holiday_context(agent):
                ensure_holiday_calendar(agent)
                cfg = dict(agent.config_json or {})
                cfg["runtime_plan"] = plan
        except Exception:  # noqa: BLE001
            pass
        agent.config_json = cfg
        flag_modified(agent, "config_json")

        if plan.get("script_needed"):
            # Do NOT run full LLM script synthesis/verify here. That can take
            # many minutes (gateway + multi-sheet samples) and blocks the wizard
            # bootstrap (client times out at 600s). Interactive training only
            # needs a runtime plan; real synth+verify runs after planning in
            # AgentValidationService (with live progress).
            scripts = AgentScriptService(self.db)
            try:
                existing = dict((agent.config_json or {}).get("workspace_script") or {})
                if existing.get("verified_at") and existing.get("path"):
                    plan["script_slug"] = existing.get("slug")
                    plan["prepared"] = True
                    plan["script_verify_deferred"] = False
                else:
                    meta = await scripts.generate_if_needed(agent, use_llm=False)
                    plan["script_slug"] = meta.get("slug")
                    plan["prepared"] = True
                    plan["script_verify_deferred"] = not bool(meta.get("verified_at"))
                    plan["reason"] = (
                        (plan.get("reason") or "")
                        + " | تأیید اسکریپت پس از آموزش/برنامه‌ریزی انجام می‌شود"
                    ).strip(" |")
            except Exception as exc:  # noqa: BLE001
                plan.update(
                    {
                        "prepared": False,
                        "error": f"{type(exc).__name__}: {exc}",
                    }
                )
                cfg = dict(agent.config_json or {})
                cfg["runtime_plan"] = plan
                agent.config_json = cfg
                flag_modified(agent, "config_json")
                await self.db.commit()
                raise HTTPException(
                    status_code=422,
                    detail=f"آماده‌سازی اسکریپت ناموفق بود: {exc}",
                ) from exc
        else:
            plan["prepared"] = True

        plan["prepared_at"] = _now()
        cfg = dict(agent.config_json or {})
        cfg["runtime_plan"] = plan
        agent.config_json = cfg
        flag_modified(agent, "config_json")
        await self.db.commit()
        await self.db.refresh(agent)
        return agent

    async def _plan(self, agent: Agent) -> dict:
        # Detection is capability + explicitly-assigned-tool driven. A built-in
        # file tool wins as primary_tool; otherwise fall back to script synthesis.
        # No text/keyword sniffing — new file tools need no new keywords here.
        builtin = await self._assigned_builtin_file_tool(agent)
        if builtin:
            return {
                "prepared": False,
                "primary_tool": builtin,
                "script_needed": False,
                "reason": f"اقدام فایل با ابزار داخلی {builtin}.",
            }

        # Karkard (and any other spreadsheet pipeline) goes through script
        # synthesis + run_agent_script — no hard-coded karkard_process tool.
        decision = await AgentScriptService(self.db).evaluate(agent)
        return {
            "prepared": False,
            "primary_tool": "run_agent_script" if decision.needed else None,
            "script_needed": decision.needed,
            "reason": decision.reason,
            "confidence": decision.confidence,
        }

    async def _actions(self, agent: Agent) -> list[AgentAction]:
        result = await self.db.execute(
            select(AgentAction).where(AgentAction.agent_id == agent.id).order_by(AgentAction.order_index)
        )
        return list(result.scalars().all())

    async def _assigned_builtin_file_tool(self, agent: Agent) -> str | None:
        """First built-in file tool the agent explicitly declares (tool or action).

        Config-driven only — a new built-in file tool just gets added to
        BUILTIN_FILE_TOOLS; no text/keyword sniffing of names or files.
        """
        from src.agents_lib.platform_constants import BUILTIN_FILE_TOOLS

        declared: list[str] = [str(t) for t in (getattr(agent, "tool_names", None) or [])]
        for act in await self._actions(agent):
            declared.extend(str(t) for t in (act.tool_chain or []))
        for slug in declared:
            if slug in BUILTIN_FILE_TOOLS:
                return slug
        return None

    async def _files(self, agent: Agent) -> list[AgentFile]:
        result = await self.db.execute(
            select(AgentFile).where(AgentFile.agent_id == agent.id).order_by(AgentFile.created_at.desc())
        )
        return list(result.scalars().all())
