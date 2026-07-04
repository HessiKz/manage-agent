import pytest
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from src.models.agent import AgentStatus
from src.services.agent_validation_runner import _mark_validation_failed, run_agent_validation


@pytest.mark.asyncio
async def test_mark_validation_failed_sets_error_state():
    agent_id = uuid4()
    agent = type(
        "Agent",
        (),
        {
            "id": agent_id,
            "config_json": {"validation": {"state": "running"}},
            "status": AgentStatus.DEPLOYING,
        },
    )()

    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=agent)
    mock_db.commit = AsyncMock()

    class _Ctx:
        async def __aenter__(self):
            return mock_db

        async def __aexit__(self, *args):
            return False

    with (
        patch("src.services.agent_validation_runner.async_session_maker", return_value=_Ctx()),
        patch("src.services.agent_validation_runner.flag_modified"),
    ):
        await _mark_validation_failed(agent_id, "boom")

    validation = agent.config_json["validation"]
    assert validation["state"] == "error"
    assert validation["ok"] is False
    assert agent.status == AgentStatus.ERROR
    mock_db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_run_agent_validation_marks_failed_on_crash():
    agent_id = uuid4()
    owner_id = uuid4()

    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=object())
    mock_db.rollback = AsyncMock()

    class _Ctx:
        async def __aenter__(self):
            return mock_db

        async def __aexit__(self, *args):
            return False

    with (
        patch("src.services.agent_validation_runner.async_session_maker", return_value=_Ctx()),
        patch("src.services.agent_validation_runner.AgentService") as agent_svc_cls,
        patch(
            "src.services.agent_validation_runner.AgentValidationService"
        ) as validation_svc_cls,
        patch(
            "src.services.agent_validation_runner._mark_validation_failed",
            new_callable=AsyncMock,
        ) as mark_failed,
    ):
        agent_svc_cls.return_value.get = AsyncMock(return_value=object())
        validation_svc_cls.return_value.validate_after_create = AsyncMock(
            side_effect=RuntimeError("deadlock")
        )
        await run_agent_validation(agent_id, owner_id)

    mock_db.rollback.assert_awaited_once()
    mark_failed.assert_awaited_once()
