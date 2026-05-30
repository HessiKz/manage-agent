"""Agent actions must go through the LLM orchestrator, not direct tool_runner."""

from __future__ import annotations

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.models.agent import Agent
from src.models.agent_action import AgentAction
from src.schemas.agent import AgentInvokeResponse
from src.schemas.agent_action import AgentActionRunRequest
from src.services.agent_action_service import AgentActionService


def test_action_run_invokes_orchestrator(monkeypatch: pytest.MonkeyPatch):
    agent = Agent(
        id=uuid.uuid4(),
        name="Test",
        slug="test-agent",
        tool_names=["karkard_process"],
        capabilities={"actions_enabled": True, "chat_enabled": True},
    )
    action = AgentAction(
        id=uuid.uuid4(),
        agent_id=agent.id,
        slug="process_karkard",
        label="محاسبه",
        prompt_template="پردازش کارکرد",
        tool_chain=["karkard_process"],
    )

    db = MagicMock()
    db.get = AsyncMock(return_value=agent)

    async def fake_tool_vars(self, agent_id, variables):
        return {"agent_id": str(agent_id), "storage_path": "var/fake/raw.xlsx"}

    invoke_response = AgentInvokeResponse(
        output="✅ از طریق LLM",
        tokens_input=10,
        tokens_output=20,
        cost_usd=0,
        duration_ms=1,
        activity_log_id=uuid.uuid4(),
    )
    mock_invoke = AsyncMock(return_value=invoke_response)
    monkeypatch.setattr(
        AgentActionService,
        "_tool_variables",
        fake_tool_vars,
    )
    monkeypatch.setattr(
        "src.services.agent_action_service.OrchestratorService",
        lambda db: MagicMock(invoke=mock_invoke),
    )

    svc = AgentActionService(db)
    monkeypatch.setattr(svc, "get_by_slug", AsyncMock(return_value=action))

    result = asyncio.run(
        svc.run(
            agent.id,
            "process_karkard",
            AgentActionRunRequest(variables={"jalali_year": 1405}),
            MagicMock(id=uuid.uuid4()),
        )
    )

    assert result.output == "✅ از طریق LLM"
    mock_invoke.assert_awaited_once()
    call_input = mock_invoke.await_args[0][1].input
    assert "karkard_process" in call_input
    assert "function calling" in call_input
