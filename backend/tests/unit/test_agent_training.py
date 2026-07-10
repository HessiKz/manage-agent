"""Unit tests for interactive agent training."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from src.models.agent import AgentStatus
from src.schemas.agent_training import TrainingCompleteRequest, TrainingMessage
from src.services.agent_training_service import AgentTrainingService, _fallback_profile
from src.services.agent_service import AgentService


def test_fallback_profile_uses_notes():
    agent = MagicMock()
    agent.description = "تست ایجنت"
    messages = [
        TrainingMessage(role="user", content="سلام"),
        TrainingMessage(role="assistant", content="## عنوان\n- مورد ۱"),
    ]
    profile = _fallback_profile(agent, messages, "خروجی باید bullet داشته باشد")
    assert "bullet" in profile["output_format_spec"]
    assert profile["example_output"].startswith("##")


def test_training_complete_request_drops_empty_assistant():
    req = TrainingCompleteRequest.model_validate(
        {
            "messages": [
                {"role": "user", "content": "اقدام: کارکرد"},
                {"role": "assistant", "content": "   "},
                {"role": "assistant", "content": "پردازش شد."},
            ]
        }
    )
    assert len(req.messages) == 2
    assert req.messages[-1].content == "پردازش شد."


def test_training_session_active_accepts_pending():
    from src.core.agent_training_context import training_session_active

    assert training_session_active({"state": "pending", "training_completed": False}) is True
    assert training_session_active({"state": "training"}) is True
    assert training_session_active({"state": "runtime_prepare", "training_completed": False}) is True
    assert training_session_active({"state": "dashboard_review", "training_completed": True}) is False


@pytest.mark.asyncio
async def test_start_training_sets_state():
    agent_id = uuid4()
    agent = MagicMock()
    agent.id = agent_id
    agent.status = AgentStatus.DRAFT
    agent.config_json = {}

    db = AsyncMock()
    svc = AgentTrainingService(db)
    svc.agents.get = AsyncMock(return_value=agent)

    async def agent_service_get(_agent_id):
        return agent

    async def fake_prepare(_agent_id):
        agent.config_json = {
            "runtime_plan": {"prepared": True, "primary_tool": None, "script_needed": False},
        }
        return agent

    with (
        patch(
            "src.services.agent_training_service.AgentService.get",
            new=AsyncMock(side_effect=agent_service_get),
        ),
        patch(
            "src.services.agent_training_service.AgentRuntimePrepareService.prepare",
            new=AsyncMock(side_effect=fake_prepare),
        ),
    ):
        result = await svc.start_training(agent_id)

    assert result.status == AgentStatus.DEPLOYING
    assert result.config_json["validation"]["state"] == "training"



@pytest.mark.asyncio
async def test_complete_training_rejects_wrong_state():
    agent_id = uuid4()
    agent = MagicMock()
    agent.id = agent_id
    agent.status = AgentStatus.DEPLOYING
    agent.config_json = {"validation": {"state": "running"}}

    db = AsyncMock()
    svc = AgentTrainingService(db)
    svc.agents.get = AsyncMock(return_value=agent)
    owner = MagicMock()

    with pytest.raises(HTTPException) as exc:
        await svc.complete_training(
            agent_id,
            owner,
            TrainingCompleteRequest(
                messages=[TrainingMessage(role="user", content="hi")],
            ),
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_start_validation_blocks_pending_untrained():
    agent_id = uuid4()
    agent = MagicMock()
    agent.id = agent_id
    agent.status = AgentStatus.DEPLOYING
    agent.config_json = {"validation": {"state": "pending", "training_completed": False}}

    db = AsyncMock()
    svc = AgentService(db)
    svc.get = AsyncMock(return_value=agent)

    result, schedule = await svc.start_validation(agent_id)

    assert schedule is False
    assert result.config_json["validation"]["state"] == "pending"
    assert result.config_json["validation"].get("training_completed") is not True

@pytest.mark.asyncio
async def test_update_resets_active_agent_for_full_republish():
    from src.schemas.agent import AgentUpdate

    agent_id = uuid4()
    agent = MagicMock()
    agent.id = agent_id
    agent.slug = "support"
    agent.status = AgentStatus.ACTIVE
    agent.config_json = {
        "validation": {"state": "done", "training_completed": True},
        "runtime_plan": {"prepared": True},
    }

    db = AsyncMock()
    svc = AgentService(db)
    svc.agents.get = AsyncMock(return_value=agent)

    result = await svc.update(agent_id, AgentUpdate(description="Updated"))

    assert result.status == AgentStatus.DEPLOYING
    assert result.config_json["validation"]["state"] == "runtime_prepare"
    assert result.config_json["validation"]["training_completed"] is False
    assert "runtime_plan" not in result.config_json

