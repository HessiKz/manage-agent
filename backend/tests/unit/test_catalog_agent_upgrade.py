"""Tests for catalog agent upgrade helpers."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from src.models.agent import AgentKind, AgentStatus
from src.services.catalog_agent_upgrade_service import (
    CATALOG_CUSTOMIZED_KEY,
    catalog_agent_is_customized,
    mark_catalog_agent_customized,
    upgrade_catalog_agents,
    widget_plan_for_catalog_entry,
)


def test_payroll_has_review_widget_plan():
    plan = widget_plan_for_catalog_entry(
        {
            "slug": "payroll",
            "department": "finance",
            "kind": "worker",
            "description": "Payroll agent",
            "capabilities": {"actions_enabled": True},
        }
    )
    assert plan["review_table"]["enabled"] is True
    assert "اضافه" in plan["review_table"]["scope"]


def test_chat_example_has_charts():
    plan = widget_plan_for_catalog_entry(
        {
            "slug": "example-chat",
            "department": "ops",
            "kind": "chat",
            "description": "Chat only",
            "capabilities": {"actions_enabled": False},
        }
    )
    assert plan["stat_cards"]["enabled"] is True
    assert plan["review_table"]["enabled"] is False


def test_catalog_customized_helpers():
    assert not catalog_agent_is_customized(None)
    cfg = mark_catalog_agent_customized({})
    assert cfg[CATALOG_CUSTOMIZED_KEY] is True
    assert catalog_agent_is_customized(cfg)


@pytest.mark.asyncio
async def test_upgrade_preserves_customized_catalog_agent():
    agent = MagicMock()
    agent.slug = "example-karkard"
    agent.kind = AgentKind.WORKER
    agent.status = AgentStatus.ACTIVE
    agent.tool_names = ["karkard_process"]
    agent.capabilities = {"actions_enabled": True}
    agent.system_prompt = "دستورالعمل سفارشی کاربر"
    agent.description = "توضیح سفارشی کاربر"
    agent.file_policy = {"min_files": 1}
    agent.config_json = {
        CATALOG_CUSTOMIZED_KEY: True,
        "_catalog_version": 2,
        "widget_plan": {"stat_cards": {"enabled": True}},
        "validation": {"state": "done", "training_completed": True},
    }

    result = MagicMock()
    result.scalars.return_value.all.return_value = [agent]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)

    upgraded = await upgrade_catalog_agents(db)

    assert upgraded == 0
    assert agent.system_prompt == "دستورالعمل سفارشی کاربر"
    assert agent.description == "توضیح سفارشی کاربر"
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_upgrade_marks_user_edited_prompt_as_customized():
    agent = MagicMock()
    agent.slug = "example-karkard"
    agent.kind = AgentKind.WORKER
    agent.status = AgentStatus.ACTIVE
    agent.tool_names = ["karkard_process"]
    agent.capabilities = {"actions_enabled": True}
    agent.system_prompt = "دستورالعمل ادیت‌شده بدون فلگ"
    agent.description = "پردازش فایل اکسل کارکرد ماهانه طبق دستورالعمل HR (سوره)"
    agent.file_policy = {"min_files": 1}
    agent.config_json = {
        "_catalog_version": 2,
        "widget_plan": {"stat_cards": {"enabled": True}},
        "validation": {"state": "done", "training_completed": True},
    }

    result = MagicMock()
    result.scalars.return_value.all.return_value = [agent]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)

    upgraded = await upgrade_catalog_agents(db)

    assert upgraded == 1
    assert agent.config_json[CATALOG_CUSTOMIZED_KEY] is True
    assert agent.system_prompt == "دستورالعمل ادیت‌شده بدون فلگ"
    db.commit.assert_called_once()
