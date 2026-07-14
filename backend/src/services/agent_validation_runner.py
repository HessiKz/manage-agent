"""Background runner for post-create agent validation."""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy.orm.attributes import flag_modified

from src.database.session import async_session_maker
from src.models.agent import Agent, AgentStatus
from src.models.user import User
from src.services.agent_service import AgentService
from src.services.agent_validation_service import AgentValidationService

logger = logging.getLogger(__name__)


async def _mark_validation_failed(agent_id: UUID, message: str) -> None:
    async with async_session_maker() as db:
        agent = await db.get(Agent, agent_id)
        if not agent:
            return
        cfg = dict(agent.config_json or {})
        cfg["validation"] = {
            "validated": True,
            "ok": False,
            "state": "error",
            "current_phase": "error",
            "failures": [
                {
                    "phase": "system",
                    "message": message[:500],
                    "fixable_in_admin": False,
                }
            ],
        }
        agent.config_json = cfg
        flag_modified(agent, "config_json")
        if agent.status == AgentStatus.DEPLOYING:
            agent.status = AgentStatus.ERROR
        await db.commit()


async def run_planning_preflight_runner(agent_id: UUID, owner_id: UUID) -> None:
    """Run planning Q&A in an isolated DB session (FastAPI background task).

    Keeps the HTTP request fast — planning LLM can take minutes and must not
    block the single uvicorn worker (which otherwise stalls all other requests).
    """
    from src.services.agent_runtime_prepare_service import AgentRuntimePrepareService

    async with async_session_maker() as db:
        try:
            svc = AgentService(db)
            agent = await svc.get(agent_id)
            owner = await db.get(User, owner_id)
            if not agent or not owner:
                return
            # Publish a "starting" state so UI can show pending planning.
            cfg = dict(agent.config_json or {})
            validation = dict(cfg.get("validation") or {})
            validation["state"] = "planning"
            validation["current_phase"] = "planning"
            validation["current_detail"] = "در حال تحلیل و سؤالات قبل از تست تعاملی…"
            cfg["validation"] = validation
            agent.config_json = cfg
            flag_modified(agent, "config_json")
            await db.commit()
            try:
                await AgentRuntimePrepareService(db).prepare(agent_id)
                agent = await AgentService(db).get(agent_id)
            except Exception:  # noqa: BLE001
                pass
            await AgentValidationService(db).run_planning_preflight(agent)
        except Exception as exc:
            logger.exception("Background planning preflight failed for %s", agent_id)
            await db.rollback()
            # Soft-fail: mark analysis empty so training can still proceed.
            async with async_session_maker() as db2:
                a = await db2.get(Agent, agent_id)
                if a:
                    cfg = dict(a.config_json or {})
                    validation = dict(cfg.get("validation") or {})
                    validation.setdefault("planning", {})
                    validation["planning"]["analysis"] = (
                        "تحلیل خودکار در دسترس نبود؛ با نمونه‌ها و دستورالعمل ادامه دهید."
                    )
                    validation["planning"]["awaiting_answers"] = False
                    validation["state"] = "runtime_prepare"
                    validation["current_phase"] = None
                    cfg["validation"] = validation
                    a.config_json = cfg
                    flag_modified(a, "config_json")
                    await db2.commit()


async def run_agent_validation(agent_id: UUID, owner_id: UUID) -> None:
    """Run validation in an isolated DB session (FastAPI background task)."""
    async with async_session_maker() as db:
        try:
            svc = AgentService(db)
            agent = await svc.get(agent_id)
            owner = await db.get(User, owner_id)
            if not agent or not owner:
                return
            await AgentValidationService(db).validate_after_create(agent, owner)
        except Exception as exc:
            logger.exception("Background agent validation failed for %s", agent_id)
            await db.rollback()
            await _mark_validation_failed(agent_id, f"{type(exc).__name__}: {exc}")
