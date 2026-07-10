"""Interactive admin training — chat until output format is right, then persist."""

from __future__ import annotations

import json
import re
from uuid import UUID

from fastapi import HTTPException
from langchain_openai import ChatOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from src.agents_lib.agent_factory import _supports_temperature, build_system_prompt
from src.core import llm_runtime
from src.models.agent import Agent, AgentStatus
from src.models.user import User
from src.repositories.agent_repo import AgentRepository
from src.schemas.agent_training import TrainingCompleteRequest, TrainingMessage
from src.core.agent_training_context import training_session_active
from src.services.agent_dashboard_config_service import AgentDashboardConfigService
from src.services.agent_runtime_prepare_service import AgentRuntimePrepareService
from src.services.agent_service import AgentService
from src.schemas.agent_dashboard_config import DashboardGenerateRequest

_RUNTIME_PREPARE_MSG = "آماده‌سازی ابزار/اسکریپت قبل از تست تعاملی انجام نشده است."


def _build_llm() -> ChatOpenAI | None:
    resolved = llm_runtime.resolve()
    if not resolved.api_key:
        return None
    kwargs: dict = {
        "model": resolved.model,
        "api_key": resolved.api_key,
        "timeout": 120,
        "max_retries": 0,
    }
    if _supports_temperature(resolved.model):
        kwargs["temperature"] = 0.25
    if resolved.base_url:
        kwargs["base_url"] = resolved.base_url
    if resolved.provider == "cursor":
        kwargs["use_responses_api"] = False
    return ChatOpenAI(**kwargs)


def _parse_json(text: str) -> dict | None:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if not m:
            return None
        try:
            data = json.loads(m.group())
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None


def _format_transcript(messages: list[TrainingMessage]) -> str:
    lines = []
    for m in messages:
        label = "ادمین" if m.role == "user" else "ایجنت"
        lines.append(f"{label}: {m.content.strip()}")
    return "\n\n".join(lines)


def _fallback_profile(agent: Agent, messages: list[TrainingMessage], notes: str | None) -> dict:
    last_assistant = next((m.content for m in reversed(messages) if m.role == "assistant"), "")
    return {
        "output_format_spec": notes or "پاسخ‌ها باید مطابق نمونه‌های آموزش تعاملی باشند.",
        "example_output": last_assistant[:2000] if last_assistant else "",
        "behavior_notes": agent.description or "",
        "responsibilities": _split_lines(agent.description or ""),
        "how_to_steps": [],
    }


def _split_lines(text: str) -> list[str]:
    parts = re.split(r"[\n؛;]+", text.strip())
    return [p.strip() for p in parts if p.strip()][:6]


class AgentTrainingService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.agents = AgentRepository(db)

    async def start_training(self, agent_id: UUID) -> Agent:
        agent = await self.agents.get(agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        if agent.status not in (AgentStatus.DRAFT, AgentStatus.DEPLOYING):
            raise HTTPException(status_code=400, detail="Agent is not in a publishable state")

        cfg = dict(agent.config_json or {})
        validation = dict(cfg.get("validation") or {})
        runtime_plan = dict(cfg.get("runtime_plan") or {})
        if not runtime_plan.get("prepared"):
            try:
                agent = await AgentRuntimePrepareService(self.db).prepare(agent_id)
            except HTTPException:
                raise
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(status_code=422, detail=_RUNTIME_PREPARE_MSG) from exc
            cfg = dict(agent.config_json or {})
            runtime_plan = dict(cfg.get("runtime_plan") or {})
            if not runtime_plan.get("prepared"):
                raise HTTPException(status_code=422, detail=_RUNTIME_PREPARE_MSG)
        validation.update(
            {
                "state": "training",
                "current_phase": "training",
                "training_completed": False,
            }
        )
        cfg["validation"] = validation
        agent.status = AgentStatus.DEPLOYING
        agent.config_json = cfg
        flag_modified(agent, "config_json")
        await self.db.commit()
        return await AgentService(self.db).get(agent_id)

    async def _extract_profile(
        self, agent: Agent, payload: TrainingCompleteRequest
    ) -> dict:
        llm = _build_llm()
        if not llm:
            return _fallback_profile(agent, payload.messages, payload.notes)

        sys = (
            "You analyze an admin CALIBRATION session for a Persian enterprise AI agent. "
            "The agent ALREADY has a full system prompt and role — this was NOT teaching from scratch. "
            "The admin tested the agent's REAL capabilities (chat, files, API, supervisor routing, actions) "
            "and optional file attachments to lock output FORMAT, TONE, and structure. "
            "Return ONLY JSON with keys:\n"
            "- output_format_spec (string, fa-IR): precise rules for structure, tone, sections, bullets\n"
            "- example_output (string): best assistant reply from the session (trimmed)\n"
            "- behavior_notes (string, fa-IR): response style only — do not redefine core agent duties\n"
            "- system_prompt_addendum (string, fa-IR): 2-4 sentences about format/tone ONLY (not new role)\n"
            "- responsibilities (array of strings, fa-IR, 3-5 items for end users)\n"
            "- how_to_steps (array of strings, fa-IR, 3-5 items for end users)\n"
            "Base everything on the transcript and admin notes — no generic filler."
        )
        prompt_preview = (agent.system_prompt or "").strip()[:1200]
        user = "\n".join(
            [
                f"نام ایجنت: {agent.name}",
                f"توضیح اولیه: {agent.description or '—'}",
                f"نوع: {getattr(agent.kind, 'value', agent.kind)}",
                f"دستورالعمل موجود (خلاصه): {prompt_preview or '—'}",
                f"یادداشت ادمین: {payload.notes or '—'}",
                "رونوشت کالیبراسیون:",
                _format_transcript(payload.messages),
            ]
        )
        try:
            result = await llm.ainvoke(
                [{"role": "system", "content": sys}, {"role": "user", "content": user}]
            )
            text = (getattr(result, "content", None) or str(result)).strip()
            parsed = _parse_json(text)
            if parsed:
                return parsed
        except Exception:  # noqa: BLE001
            pass
        return _fallback_profile(agent, payload.messages, payload.notes)

    async def complete_training(
        self, agent_id: UUID, owner: User, payload: TrainingCompleteRequest
    ) -> Agent:
        agent = await self.agents.get(agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        cfg = dict(agent.config_json or {})
        validation = dict(cfg.get("validation") or {})

        if validation.get("training_completed"):
            if validation.get("state") == "dashboard_review":
                return await AgentService(self.db).get(agent_id)
            raise HTTPException(status_code=400, detail="Training already completed")

        if agent.status not in (AgentStatus.DEPLOYING, AgentStatus.DRAFT):
            raise HTTPException(status_code=400, detail="Agent is not awaiting training")

        if not training_session_active(validation):
            raise HTTPException(status_code=400, detail="Interactive training is not active")

        # Wizard publish leaves runtime_prepare until /training/start — bootstrap if needed.
        if validation.get("state") != "training" and validation.get("current_phase") != "training":
            agent = await self.start_training(agent_id)
            cfg = dict(agent.config_json or {})
            validation = dict(cfg.get("validation") or {})
            if not training_session_active(validation):
                raise HTTPException(status_code=400, detail="Interactive training is not active")

        profile = await self._extract_profile(agent, payload)
        cfg["training_profile"] = {
            "output_format_spec": profile.get("output_format_spec", ""),
            "example_output": profile.get("example_output", ""),
            "behavior_notes": profile.get("behavior_notes", ""),
            "responsibilities": profile.get("responsibilities") or [],
            "how_to_steps": profile.get("how_to_steps") or [],
            "transcript_messages": len(payload.messages),
        }
        cfg.pop("execution_guide", None)

        addendum = (profile.get("system_prompt_addendum") or "").strip()
        if addendum:
            base = (agent.system_prompt or "").strip()
            block = f"\n\n## آموزش تعاملی (تأیید ادمین)\n{addendum}"
            agent.system_prompt = f"{base}{block}".strip() if base else addendum

        validation["training_completed"] = True
        validation["state"] = "dashboard_review"
        validation["current_phase"] = "dashboard_review"
        cfg["validation"] = validation
        agent.config_json = cfg

        await self.db.commit()
        await self.db.refresh(agent)

        training_ctx = _format_transcript(payload.messages)
        if payload.notes:
            training_ctx += f"\n\nیادداشت ادمین: {payload.notes}"
        try:
            await AgentDashboardConfigService(self.db).generate_draft(
                agent_id,
                DashboardGenerateRequest(context_notes=payload.notes),
                training_context=training_ctx,
            )
            agent = await self.agents.get(agent_id)
        except Exception:  # noqa: BLE001
            pass

        return agent
