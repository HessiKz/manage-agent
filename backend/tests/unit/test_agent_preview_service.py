from unittest.mock import AsyncMock, patch
from uuid import uuid4

from src.models.user import User
from src.schemas.agent import AgentInvokeResponse
from src.schemas.agent_preview import AgentPreviewInvokeRequest
from src.services.agent_preview_service import AgentPreviewService


def test_build_ephemeral_agent_merges_bindings():
    owner = User(id=uuid4(), email="a@b.com", hashed_password="x", full_name="Test")
    payload = AgentPreviewInvokeRequest(
        name="پیش‌نمایش",
        system_prompt="دستورالعمل تستی برای پیش‌نمایش",
        model_name="gpt-4.1",
        knowledge_bindings={"dataset_ids": ["ds-1"]},
        api_bindings={"service_ids": ["svc-1"], "endpoint_ids": []},
        input="سلام",
    )
    agent = AgentPreviewService(db=None)._build_ephemeral_agent(payload, owner)

    assert agent.model_name == "gpt-4.1"
    assert agent.config_json["knowledge_bindings"] == {"dataset_ids": ["ds-1"]}
    assert agent.config_json["api_bindings"]["service_ids"] == ["svc-1"]


async def test_preview_invoke_uses_preview_flag():
    owner = User(id=uuid4(), email="a@b.com", hashed_password="x", full_name="Test")
    payload = AgentPreviewInvokeRequest(
        name="پیش‌نمایش",
        system_prompt="دستورالعمل تست",
        input="سلام",
    )
    svc = AgentPreviewService(db=None)
    expected = AgentInvokeResponse(output="ok")

    with patch.object(
        svc.orchestrator,
        "invoke_with_agent",
        new_callable=AsyncMock,
        return_value=expected,
    ) as mock_invoke:
        result = await svc.preview_invoke(payload, owner)

    assert result.output == "ok"
    mock_invoke.assert_awaited_once()
    _agent, _invoke_payload, user = mock_invoke.await_args.args
    assert mock_invoke.await_args.kwargs.get("preview") is True
    assert user is owner
