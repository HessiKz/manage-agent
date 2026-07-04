"""_resolve_agent accepts slug when passed as agent_id."""

from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

from src.agents_lib.platform_tools import _resolve_agent


@pytest.mark.asyncio
async def test_resolve_agent_slug_when_agent_id_is_slug(monkeypatch):
    agent_id = uuid4()
    agent = MagicMock()
    agent.id = agent_id
    agent.slug = "yjnt-jdyd"

    svc = MagicMock()
    svc.get = AsyncMock(side_effect=ValueError("badly formed hexadecimal UUID string"))
    svc.get_by_slug = AsyncMock(return_value=agent)

    monkeypatch.setattr(
        "src.agents_lib.platform_tools.AgentService",
        lambda _db: svc,
    )

    db = MagicMock()
    found = await _resolve_agent(db, agent_id="yjnt-jdyd")
    assert found is agent
    svc.get_by_slug.assert_awaited_once_with("yjnt-jdyd")


@pytest.mark.asyncio
async def test_resolve_agent_uuid_still_works(monkeypatch):
    agent_id = uuid4()
    agent = MagicMock()
    agent.id = agent_id

    svc = MagicMock()
    svc.get = AsyncMock(return_value=agent)
    svc.get_by_slug = AsyncMock()

    monkeypatch.setattr(
        "src.agents_lib.platform_tools.AgentService",
        lambda _db: svc,
    )

    db = MagicMock()
    found = await _resolve_agent(db, agent_id=str(agent_id))
    assert found is agent
    svc.get.assert_awaited_once_with(UUID(str(agent_id)))
    svc.get_by_slug.assert_not_awaited()
