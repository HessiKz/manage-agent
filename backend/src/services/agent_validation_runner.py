"""Background runner for post-create agent validation."""

from __future__ import annotations

import logging
from uuid import UUID

from src.database.session import async_session_maker
from src.models.user import User
from src.services.agent_service import AgentService
from src.services.agent_validation_service import AgentValidationService

logger = logging.getLogger(__name__)


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
        except Exception:
            logger.exception("Background agent validation failed for %s", agent_id)
            await db.rollback()
