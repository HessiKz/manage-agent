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
