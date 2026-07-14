from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from src.agents_lib.platform_constants import DOMAIN_TOOL_SLUGS
from src.models.agent import AgentStatus
from src.services.agent_runtime_prepare_service import AgentRuntimePrepareService
from src.services.agent_training_service import AgentTrainingService


def test_domain_tool_catalog_contains_runtime_tools():
    assert "karkard_process" not in DOMAIN_TOOL_SLUGS
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
async def test_prepare_detects_script_tool_from_tool_chain(monkeypatch):
    from src.services.agent_script_service import ScriptDecision

    agent = SimpleNamespace(
        id=uuid4(),
        name="گزارش",
        description="",
        system_prompt="",
        tool_names=[],
        config_json={},
    )
    action = SimpleNamespace(tool_chain=["run_agent_script"])

    svc = AgentRuntimePrepareService(SimpleNamespace())

    async def fake_actions(_agent):
        return [action]

    async def fake_evaluate(_self, _agent):
        # run_agent_script is not in BUILTIN_FILE_TOOLS; evaluate decides script need.
        return ScriptDecision(True, "file action tool_chain + samples", "high")

    monkeypatch.setattr(svc, "_actions", fake_actions)
    monkeypatch.setattr(
        "src.services.agent_runtime_prepare_service.AgentScriptService.evaluate",
        fake_evaluate,
    )
    plan = await svc._plan(agent)

    assert plan["primary_tool"] == "run_agent_script"
    assert plan["script_needed"] is True


@pytest.mark.anyio
async def test_prepare_does_not_text_sniff_karkard(monkeypatch):
    """A text mention alone must NOT force a hard-coded file tool."""
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

    monkeypatch.setattr(svc, "_actions", fake_actions)
    monkeypatch.setattr(svc, "_files", fake_files)
    monkeypatch.setattr(
        "src.services.agent_runtime_prepare_service.AgentScriptService.evaluate",
        fake_evaluate,
    )
    plan = await svc._plan(agent)

    assert plan["primary_tool"] is None
    assert plan["script_needed"] is False


@pytest.mark.anyio
async def test_prepare_karkard_input_sample_uses_script_evaluate(monkeypatch, tmp_path):
    """Raw karkard-looking xlsx no longer short-circuits to a built-in tool;
    script evaluate decides whether a workspace script is needed."""
    from src.services.agent_script_service import ScriptDecision

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

    async def fake_evaluate(_self, _agent):
        return ScriptDecision(True, "file_upload + output-sample", "high")

    monkeypatch.setattr(svc, "_actions", fake_actions)
    monkeypatch.setattr(svc, "_files", fake_files)
    monkeypatch.setattr(
        "src.services.agent_runtime_prepare_service.AgentScriptService.evaluate",
        fake_evaluate,
    )
    plan = await svc._plan(agent)

    assert plan["primary_tool"] == "run_agent_script"
    assert plan["script_needed"] is True


@pytest.mark.anyio
async def test_prepare_defers_llm_script_verify(monkeypatch):
    """File agents must not block bootstrap on multi-minute LLM verify."""
    agent_id = uuid4()
    agent = SimpleNamespace(
        id=agent_id,
        name="file agent",
        description="",
        system_prompt="",
        tool_names=[],
        config_json={"workspace_script": {}},
        capabilities={"file_upload_enabled": True},
    )

    class _Db:
        async def get(self, _model, _id):
            return agent

        async def commit(self):
            pass

        async def refresh(self, _obj):
            pass

    svc = AgentRuntimePrepareService(_Db())

    async def fake_plan(_agent):
        return {
            "prepared": False,
            "primary_tool": "run_agent_script",
            "script_needed": True,
            "reason": "samples",
            "confidence": "high",
        }

    called = {"verify": 0, "generate": 0}

    async def fake_generate(self, _agent, *, use_llm=False):
        called["generate"] += 1
        assert use_llm is False
        return {"needed": True, "slug": "process_x", "path": "scripts/process_x.py"}

    async def fake_verify(self, _agent, *, use_llm=False):
        called["verify"] += 1
        raise AssertionError("verify must not run during prepare bootstrap")

    monkeypatch.setattr(svc, "_plan", fake_plan)
    monkeypatch.setattr(
        "src.services.agent_runtime_prepare_service.AgentScriptService.generate_if_needed",
        fake_generate,
    )
    monkeypatch.setattr(
        "src.services.agent_runtime_prepare_service.AgentScriptService.verify",
        fake_verify,
    )
    monkeypatch.setattr(
        "src.services.agent_runtime_prepare_service.flag_modified",
        lambda *_a, **_k: None,
    )

    out = await svc.prepare(agent_id)
    plan = out.config_json["runtime_plan"]
    assert plan["prepared"] is True
    assert plan.get("script_verify_deferred") is True
    assert called["generate"] == 1
    assert called["verify"] == 0
