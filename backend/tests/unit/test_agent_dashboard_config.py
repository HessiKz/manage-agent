"""Unit tests for AI dashboard config."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.models.agent import AgentStatus
from src.schemas.agent_dashboard_config import DashboardWidgetPatchRequest
from src.services.agent_dashboard_config_service import (
    AgentDashboardConfigService,
    _rule_based_dashboard,
)


def test_rule_based_dashboard_uses_agent_name():
    agent = MagicMock()
    agent.name = "ایجنت تست"
    agent.slug = "unknown-slug"
    agent.kind = MagicMock(value="chat")
    agent.department = "finance"
    agent.description = "تست"
    agent.config_json = {}

    config = _rule_based_dashboard(agent)
    assert "ایجنت تست" in config.panel_title
    assert len(config.stat_cards) >= 1


@pytest.mark.asyncio
async def test_patch_widgets_bootstraps_when_empty():
    agent_id = uuid4()
    agent = MagicMock()
    agent.id = agent_id
    agent.status = AgentStatus.ACTIVE
    agent.name = "تست"
    agent.slug = "test"
    agent.kind = MagicMock(value="chat")
    agent.department = "finance"
    agent.description = "تست"
    agent.config_json = {}

    db = AsyncMock()
    svc = AgentDashboardConfigService(db)
    svc.agents.get = AsyncMock(return_value=agent)

    result = await svc.patch_widgets(
        agent_id, DashboardWidgetPatchRequest(remove_widgets=["line_chart"])
    )
    assert "dashboard" in result.config_json
    bucket = result.config_json["dashboard"]
    assert bucket.get("draft") or bucket.get("custom")


@pytest.mark.asyncio
async def test_patch_widgets_ignores_invalid_draft_type():
    agent_id = uuid4()
    agent = MagicMock()
    agent.id = agent_id
    agent.status = AgentStatus.ACTIVE
    agent.name = "تست"
    agent.slug = "test"
    agent.kind = MagicMock(value="chat")
    agent.department = "finance"
    agent.description = "تست"
    agent.config_json = {"dashboard": {"draft": "corrupt", "approved": False}}

    db = AsyncMock()
    svc = AgentDashboardConfigService(db)
    svc.agents.get = AsyncMock(return_value=agent)

    result = await svc.patch_widgets(
        agent_id, DashboardWidgetPatchRequest(remove_widgets=["pie_chart"])
    )
    bucket = result.config_json["dashboard"]
    assert isinstance(bucket.get("draft"), dict)


@pytest.mark.asyncio
async def test_patch_widgets_removes_line_chart():
    agent_id = uuid4()
    agent = MagicMock()
    agent.id = agent_id
    agent.status = AgentStatus.ACTIVE
    agent.config_json = {
        "dashboard": {
            "approved": True,
            "custom": {
                "panel_title": "پنل",
                "domain_label": "مالی",
                "profile": "custom",
                "stat_cards": [{"label": "A", "value": "1"}],
                "line_chart": {
                    "title": "روند",
                    "series": [{"name": "x", "data_key": "x"}],
                    "points": [{"month": "فروردین", "x": 1}],
                },
                "disabled_widgets": [],
            },
        }
    }

    db = AsyncMock()
    svc = AgentDashboardConfigService(db)
    svc.agents.get = AsyncMock(return_value=agent)

    result = await svc.patch_widgets(
        agent_id, DashboardWidgetPatchRequest(remove_widgets=["line_chart"])
    )
    custom = result.config_json["dashboard"]["custom"]
    assert custom["line_chart"] is None
