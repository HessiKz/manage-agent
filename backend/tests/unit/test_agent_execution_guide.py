"""Rule-based execution guide from agent metadata."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from src.models.agent import AgentKind
from src.services.agent_execution_guide_service import (
    build_rule_based_guide,
    build_test_steps,
    execution_guide_status,
    guide_fingerprint,
    mark_execution_guide_generating,
    mark_execution_guide_ready,
    resolve_execution_guide,
)


def _agent(**kwargs):
    defaults = {
        "name": "ایجنت تست",
        "slug": "my-custom-agent",
        "description": "پردازش فاکتورهای ماهانه؛ صدور گزارش PDF",
        "department": "finance",
        "kind": AgentKind.WORKER,
        "capabilities": {
            "chat_enabled": False,
            "actions_enabled": True,
            "file_upload_enabled": False,
        },
        "file_policy": {},
        "tool_names": ["report_generate"],
        "system_prompt": "",
        "config_json": {},
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_rule_based_guide_uses_admin_description():
    agent = _agent()
    action = SimpleNamespace(
        slug="batch_invoice",
        label="صدور فاکتور",
        description="فاکتور دسته‌ای",
        input_schema={"batch": {"title": "دسته", "type": "string"}},
    )
    guide = build_rule_based_guide(agent, [action], [])
    assert "فاکتور" in guide["summary"] or "فاکتور" in " ".join(guide["responsibilities"])
    assert any("منوی کشویی" in s for s in guide["how_to_steps"])
    assert "دسته" in guide["inputs"]


def test_file_upload_test_step_is_generic_not_existing_file_claim():
    agent = _agent(
        capabilities={
            "chat_enabled": False,
            "actions_enabled": False,
            "file_upload_enabled": True,
        },
        file_policy={"allowed_extensions": [".docx"]},
    )
    guide = build_rule_based_guide(agent, [], [])
    steps = build_test_steps(agent, [], [], guide)
    upload = next(step for step in steps if step.kind == "upload")
    assert upload.label == "آپلود فایل نمونه"


def test_fingerprint_changes_when_description_changes():
    agent = _agent()
    fp1 = guide_fingerprint(agent, [], [])
    agent2 = _agent(description="توضیح جدید")
    fp2 = guide_fingerprint(agent2, [], [])
    assert fp1 != fp2


@pytest.mark.asyncio
async def test_resolve_execution_guide_skips_llm_without_refresh():
    agent = _agent()
    db = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    with patch(
        "src.services.agent_execution_guide_service.enhance_guide_with_llm",
        new_callable=AsyncMock,
    ) as llm_mock:
        guide, _steps, source = await resolve_execution_guide(
            db, agent, [], [], force_refresh=False
        )

    llm_mock.assert_not_called()
    assert source == "rule"
    assert guide["headline"] == agent.name


def test_execution_guide_status_generating_and_ready():
    agent = _agent(config_json=mark_execution_guide_generating({}))
    assert execution_guide_status(agent)["state"] == "generating"

    ready_cfg = mark_execution_guide_ready(
        {
            "execution_guide": {
                "guide": {"headline": "x"},
                "source": "llm",
            }
        },
        "llm",
    )
    agent2 = _agent(config_json=ready_cfg)
    meta = execution_guide_status(agent2)
    assert meta["state"] == "ready"
    assert meta["source"] == "llm"
