"""Draft preview flags on AgentDashboardService.build."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from src.models.agent import AgentKind, AgentStatus
from src.services.agent_dashboard_service import AgentDashboardService


@pytest.mark.asyncio
async def test_build_draft_preview_without_approved_custom():
    agent_id = uuid4()
    agent = SimpleNamespace(
        id=agent_id,
        slug="draft-test",
        name="تست پیش‌نویس",
        kind=AgentKind.CHAT,
        department="ops",
        description="تست",
        status=AgentStatus.DEPLOYING,
        config_json={
            "validation": {"state": "dashboard_review"},
            "dashboard": {
                "draft": {
                    "panel_title": "پنل تست",
                    "domain_label": "تست",
                    "profile": "custom",
                    "stat_cards": [
                        {
                            "id": "c1",
                            "label": "KPI",
                            "value": "۱۲",
                            "hint": "نمونه",
                        }
                    ],
                },
                "approved": False,
            },
        },
    )

    db = AsyncMock()
    svc = AgentDashboardService(db)

    with patch.object(svc, "activity") as activity_mock:
        activity_mock.stats_for_agent = AsyncMock(
            return_value={
                "total": 0,
                "success": 0,
                "errors": 0,
                "avg_duration_ms": 0,
                "cost_usd": 0.0,
                "tokens_input": 0,
                "tokens_output": 0,
            }
        )
        result = await svc.build(agent, use_draft=True)

    assert result.has_pending_draft is True
    assert result.is_draft_preview is True
    assert result.draft_unavailable is False
    assert len(result.stat_cards) >= 1
    assert result.stat_cards[0].value == "۱۲"
