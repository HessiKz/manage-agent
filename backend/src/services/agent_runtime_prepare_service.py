"""Prepare deterministic runtime plan before interactive training."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from src.core.agent_file_roles import is_instruction_file, is_output_sample_file
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
        agent.config_json = cfg
        flag_modified(agent, "config_json")

        if plan.get("script_needed"):
            try:
                meta = await AgentScriptService(self.db).verify(agent, use_llm=True)
                plan["script_slug"] = meta.get("slug")
                plan["prepared"] = True
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

        if await self._input_sample_is_karkard(agent):
            return {
                "prepared": False,
                "primary_tool": "karkard_process",
                "script_needed": False,
                "reason": "فایل نمونه ورودی کارکرد شناسایی شد.",
            }

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

    async def _input_sample_is_karkard(self, agent: Agent) -> bool:
        from src.karkard.input_selection import workbook_looks_like_raw_karkard

        for row in await self._files(agent):
            if is_output_sample_file(row.filename) or is_instruction_file(row.filename):
                continue
            path = Path(row.storage_path or "")
            if path.is_file() and path.suffix.lower() == ".xlsx" and workbook_looks_like_raw_karkard(path):
                return True
        return False
