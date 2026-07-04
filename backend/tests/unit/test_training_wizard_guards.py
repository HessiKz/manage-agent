"""Guards: interactive training must not be skipped by dashboard draft generation."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.models.agent import AgentKind, AgentStatus
from src.services.agent_dashboard_config_service import AgentDashboardConfigService
from src.schemas.agent_dashboard_config import DashboardGenerateRequest


def _agent(*, validation: dict) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        slug="wizard-guard",
        name="گارد ویزارد",
        kind=AgentKind.CHAT,
        department="ops",
        description="تست",
        status=AgentStatus.DEPLOYING,
        capabilities={"chat_enabled": True},
        config_json={"validation": validation, "dashboard": {}},
    )


@pytest.mark.asyncio
async def test_generate_draft_does_not_skip_active_training():
    agent = _agent(validation={"state": "training", "training_completed": False})
    db = AsyncMock()
    svc = AgentDashboardConfigService(db)
    svc.agents = MagicMock()
    svc.agents.get = AsyncMock(return_value=agent)

    fake_draft = MagicMock()
    fake_draft.model_dump.return_value = {"panel_title": "t", "stat_cards": []}

    with (
        patch(
            "src.services.agent_dashboard_config_service.flag_modified",
        ),
        patch.object(svc, "_generate_config", new_callable=AsyncMock, return_value=fake_draft),
        patch(
            "src.services.agent_dashboard_config_service.enforce_widget_plan",
            side_effect=lambda d, _a: d,
        ),
    ):
        await svc.generate_draft(agent.id, DashboardGenerateRequest())

    validation = agent.config_json["validation"]
    assert validation["state"] == "training"
    assert validation.get("training_completed") is not True


@pytest.mark.asyncio
async def test_generate_draft_advances_after_training_completed():
    agent = _agent(validation={"state": "training", "training_completed": True})
    db = AsyncMock()
    svc = AgentDashboardConfigService(db)
    svc.agents = MagicMock()
    svc.agents.get = AsyncMock(return_value=agent)

    fake_draft = MagicMock()
    fake_draft.model_dump.return_value = {"panel_title": "t", "stat_cards": []}

    with (
        patch(
            "src.services.agent_dashboard_config_service.flag_modified",
        ),
        patch.object(svc, "_generate_config", new_callable=AsyncMock, return_value=fake_draft),
        patch(
            "src.services.agent_dashboard_config_service.enforce_widget_plan",
            side_effect=lambda d, _a: d,
        ),
    ):
        await svc.generate_draft(agent.id, DashboardGenerateRequest())

    validation = agent.config_json["validation"]
    assert validation["state"] == "dashboard_review"


@pytest.mark.asyncio
async def test_generate_draft_does_not_skip_pending_training():
    agent = _agent(validation={"state": "pending", "training_completed": False})
    db = AsyncMock()
    svc = AgentDashboardConfigService(db)
    svc.agents = MagicMock()
    svc.agents.get = AsyncMock(return_value=agent)

    fake_draft = MagicMock()
    fake_draft.model_dump.return_value = {"panel_title": "t", "stat_cards": []}

    with (
        patch(
            "src.services.agent_dashboard_config_service.flag_modified",
        ),
        patch.object(svc, "_generate_config", new_callable=AsyncMock, return_value=fake_draft),
        patch(
            "src.services.agent_dashboard_config_service.enforce_widget_plan",
            side_effect=lambda d, _a: d,
        ),
    ):
        await svc.generate_draft(agent.id, DashboardGenerateRequest())

    validation = agent.config_json["validation"]
    assert validation["state"] == "pending"
    assert validation.get("training_completed") is not True
