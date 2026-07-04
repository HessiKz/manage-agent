"""Karkard actions must use the LLM orchestrator, not direct tool bypass."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.models.agent import AgentKind
from src.schemas.agent import AgentInvokeRequest
from src.services.agent_action_service import AgentActionService
from src.services.orchestrator_service import OrchestratorService


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None


@pytest.mark.asyncio
async def test_action_slug_resolves_karkard_tool_for_llm_path():
    agent_id = uuid4()
    agent = SimpleNamespace(
        id=agent_id,
        slug="example-karkard",
        name="کارکرد",
        kind=AgentKind.WORKER,
        tool_names=["karkard_process"],
        config_json={"task_profile": "karkard"},
    )
    action = SimpleNamespace(
        slug="process_karkard",
        tool_chain=["karkard_process"],
    )

    class _Db:
        async def execute(self, stmt):
            return _Result([action])

    service = OrchestratorService(_Db())
    tool_slug = await service._resolve_auto_tool_slug(
        agent,
        AgentInvokeRequest(input="run", stream=False, action_slug="process_karkard"),
    )
    assert tool_slug == "karkard_process"


@pytest.mark.asyncio
async def test_karkard_action_not_direct_tool_bypass():
    agent = SimpleNamespace(
        id=uuid4(),
        slug="example-karkard",
        name="کارکرد",
        tool_names=["karkard_process"],
    )
    action = SimpleNamespace(
        slug="process_karkard",
        tool_chain=["karkard_process"],
        prompt_template="پردازش کن",
    )
    service = AgentActionService(SimpleNamespace())
    direct = await service._invoke_direct_action_tools(
        agent,
        action,
        {"agent_id": str(agent.id), "storage_path": "/tmp/raw.xlsx"},
    )
    assert direct is None
