from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from src.agents_lib.platform_constants import DOMAIN_TOOL_SLUGS
from src.models.agent import AgentStatus
from src.services.agent_runtime_prepare_service import AgentRuntimePrepareService
from src.services.agent_training_service import AgentTrainingService


def test_domain_tool_catalog_contains_runtime_tools():
    assert "karkard_process" in DOMAIN_TOOL_SLUGS
    assert "run_agent_script" in DOMAIN_TOOL_SLUGS
    assert all(not slug.startswith("platform_") for slug in DOMAIN_TOOL_SLUGS)


@pytest.mark.anyio
async def test_training_start_requires_runtime_prepare(monkeypatch):
    agent = SimpleNamespace(
        id=uuid4(),
        status=AgentStatus.DEPLOYING,
        config_json={"validation": {"state": "runtime_prepare"}},
    )

    async def fake_get(_id):
        return agent

    async def fake_prepare(_agent_id):
        raise HTTPException(status_code=422, detail="آماده‌سازی ابزار/اسکریپت قبل از تست تعاملی انجام نشده است.")

    svc = AgentTrainingService(SimpleNamespace())
    svc.agents = SimpleNamespace(get=fake_get)
    monkeypatch.setattr(
        "src.services.agent_training_service.AgentRuntimePrepareService.prepare",
        fake_prepare,
    )

    with pytest.raises(HTTPException) as exc:
        await svc.start_training(uuid4())

    assert exc.value.status_code == 422
    assert "آماده‌سازی" in exc.value.detail


@pytest.mark.anyio
async def test_prepare_detects_karkard_from_tool_chain(monkeypatch):
    agent = SimpleNamespace(
        id=uuid4(),
        name="گزارش",
        description="",
        system_prompt="",
        tool_names=[],
        config_json={},
    )
    action = SimpleNamespace(tool_chain=["karkard_process"])

    svc = AgentRuntimePrepareService(SimpleNamespace())

    async def fake_actions(_agent):
        return [action]

    monkeypatch.setattr(svc, "_actions", fake_actions)
    plan = await svc._plan(agent)

    assert plan["primary_tool"] == "karkard_process"
    assert plan["script_needed"] is False


@pytest.mark.anyio
async def test_prepare_does_not_text_sniff_karkard(monkeypatch):
    """A text mention alone must NOT force the karkard tool — detection is
    capability + explicitly-assigned-tool driven, not keyword sniffing."""
    from src.services.agent_script_service import ScriptDecision

    agent = SimpleNamespace(
        id=uuid4(),
        name="ایجنت کارکرد",
        description="پردازش فایل حضور و غیاب و کارکرد",
        system_prompt="",
        tool_names=[],
        config_json={},
    )

    svc = AgentRuntimePrepareService(SimpleNamespace())

    async def fake_actions(_agent):
        return []

    async def fake_files(_agent):
        return []

    async def fake_evaluate(_self, _agent):
        return ScriptDecision(False, "no deterministic file signal", "high")

    async def fake_karkard(_agent):
        return False

    monkeypatch.setattr(svc, "_actions", fake_actions)
    monkeypatch.setattr(svc, "_files", fake_files)
    monkeypatch.setattr(svc, "_input_sample_is_karkard", fake_karkard)
    monkeypatch.setattr(
        "src.services.agent_runtime_prepare_service.AgentScriptService.evaluate",
        fake_evaluate,
    )
    plan = await svc._plan(agent)

    assert plan["primary_tool"] != "karkard_process"


@pytest.mark.anyio
async def test_prepare_detects_karkard_from_input_sample(monkeypatch, tmp_path):
    agent = SimpleNamespace(
        id=uuid4(),
        name="کارکرد",
        description="",
        system_prompt="",
        tool_names=[],
        config_json={},
    )
    xlsx = tmp_path / "raw.xlsx"
    xlsx.write_bytes(b"fake")

    row = SimpleNamespace(
        filename="raw.xlsx",
        storage_path=str(xlsx),
    )

    svc = AgentRuntimePrepareService(SimpleNamespace())

    async def fake_actions(_agent):
        return []

    async def fake_files(_agent):
        return [row]

    def fake_karkard(_path):
        return True

    monkeypatch.setattr(svc, "_actions", fake_actions)
    monkeypatch.setattr(svc, "_files", fake_files)
    monkeypatch.setattr(
        "src.karkard.input_selection.workbook_looks_like_raw_karkard",
        fake_karkard,
    )
    plan = await svc._plan(agent)

    assert plan["primary_tool"] == "karkard_process"
    assert plan["script_needed"] is False


@pytest.mark.anyio
async def test_prepare_keeps_workspace_script_after_verify(monkeypatch, tmp_path):
    """Regression: stale cfg dict must not wipe workspace_script written by verify()."""
    agent = SimpleNamespace(
        id=uuid4(),
        slug="script-agent",
        name="Script Agent",
        description="",
        system_prompt="",
        tool_names=[],
        config_json={},
    )

    svc = AgentRuntimePrepareService(SimpleNamespace())

    async def fake_plan(_agent):
        return {
            "prepared": False,
            "primary_tool": "run_agent_script",
            "script_needed": True,
            "reason": "test",
            "confidence": "high",
        }

    async def fake_verify(_self, _agent, *, use_llm=False):
        cfg = dict(_agent.config_json or {})
        cfg["workspace_script"] = {
            "needed": True,
            "slug": "process_script_agent",
            "path": "scripts/process_script_agent.py",
            "verified_at": "2026-01-01T00:00:00+00:00",
        }
        _agent.config_json = cfg
        return cfg["workspace_script"]

    monkeypatch.setattr(svc, "_plan", fake_plan)
    monkeypatch.setattr(
        "src.services.agent_runtime_prepare_service.AgentScriptService.verify",
        fake_verify,
    )
    monkeypatch.setattr(
        "src.services.agent_runtime_prepare_service.flag_modified",
        lambda *_a, **_k: None,
    )

    committed: dict = {}

    async def fake_commit():
        committed["cfg"] = dict(agent.config_json or {})

    async def fake_refresh(_agent):
        pass

    async def fake_get(_model, _id):
        return agent

    svc.db = SimpleNamespace(get=fake_get, commit=fake_commit, refresh=fake_refresh)

    await svc.prepare(agent.id)

    assert committed["cfg"].get("workspace_script", {}).get("needed") is True
    assert committed["cfg"].get("runtime_plan", {}).get("prepared") is True
