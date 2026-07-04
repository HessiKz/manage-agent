"""Background generation of execution-tab guides (LLM + cache persist)."""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy.orm.attributes import flag_modified

from src.database.session import async_session_maker
from src.services.agent_execution_guide_service import mark_execution_guide_failed
from src.services.agent_execution_service import AgentExecutionService
from src.services.agent_service import AgentService

logger = logging.getLogger(__name__)


async def run_execution_guide_generation(
    agent_id: UUID,
    *,
    force_refresh: bool = True,
) -> None:
    """Build and persist execution guide in an isolated DB session."""
    async with async_session_maker() as db:
        try:
            agent = await AgentService(db).get(agent_id)
            await AgentExecutionService(db).build(agent, force_refresh=force_refresh)
            logger.info(
                "Execution guide generated for agent %s (force_refresh=%s)",
                agent_id,
                force_refresh,
            )
        except Exception:
            logger.exception("Execution guide generation failed for agent %s", agent_id)
            await db.rollback()
            try:
                agent = await AgentService(db).get(agent_id)
                cfg = mark_execution_guide_failed(dict(agent.config_json or {}))
                agent.config_json = cfg
                flag_modified(agent, "config_json")
                await db.commit()
            except Exception:
                logger.exception(
                    "Failed to mark execution guide failure for agent %s", agent_id
                )
                await db.rollback()
