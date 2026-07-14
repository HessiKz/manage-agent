"""Phase 3 — config-time tool slug validation with fixable, structured errors."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from src.core.agent_config_validation import (
    collect_tool_config_issues,
    known_tool_slugs,
    unknown_tool_slugs,
)
from src.services.agent_service import AgentService


def test_known_builtin_tool_is_accepted():
    assert "run_agent_script" in known_tool_slugs()
    assert unknown_tool_slugs(["run_agent_script", "run_agent_script"]) == []


def test_bogus_slug_is_flagged():
    assert unknown_tool_slugs(["totally_made_up_tool"]) == ["totally_made_up_tool"]


def test_deferred_dynamic_slugs_are_accepted():
    # External API + agent-link tools register at runtime, not at create time.
    assert unknown_tool_slugs(["ext_1234", "call_agent_finance"]) == []


def test_collect_issues_covers_actions():
    action = SimpleNamespace(slug="do_it", tool_chain=["nope_tool"])
    issues = collect_tool_config_issues(["good?"], [action])
    fields = {i["field"] for i in issues}
    assert "action.tool_chain" in fields
    assert all(i["fixable_in_admin"] for i in issues)


def test_create_rejects_bogus_tool_with_structured_error():
    svc = AgentService(db=SimpleNamespace())
    with pytest.raises(HTTPException) as exc:
        svc._assert_tool_config_valid(["totally_made_up_tool"], [])
    assert exc.value.status_code == 422
    detail = exc.value.detail
    assert isinstance(detail, dict)
    assert detail["tool_config_issues"][0]["slug"] == "totally_made_up_tool"


@pytest.mark.anyio
async def test_audit_agents_flags_bad_slug(monkeypatch):
    from uuid import uuid4

    from src.services import agent_batch_validation

    good = SimpleNamespace(
        id=uuid4(), slug="ok", name="OK", status="active",
        tool_names=["run_agent_script"], config_json={},
    )
    bad = SimpleNamespace(
        id=uuid4(), slug="bad", name="Bad", status="error",
        tool_names=["nope_tool"], config_json={},
    )

    class _Scalars:
        def __init__(self, rows):
            self._rows = rows

        def all(self):
            return self._rows

    class _Result:
        def __init__(self, rows):
            self._rows = rows

        def scalars(self):
            return _Scalars(self._rows)

    class _Db:
        def __init__(self):
            self._calls = 0

        async def execute(self, *_a, **_k):
            self._calls += 1
            return _Result([good, bad] if self._calls == 1 else [])

    report = await agent_batch_validation.audit_agents(_Db())

    assert report["agents_total"] == 2
    assert report["agents_with_issues"] == 1
    assert report["agents"][0]["slug"] == "bad"
