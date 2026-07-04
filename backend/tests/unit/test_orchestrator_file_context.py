"""Tests for uploaded-file context included in agent invocation."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.services.orchestrator_service import OrchestratorService


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
    def __init__(self, rows):
        self._rows = rows

    async def execute(self, _stmt):
        return _Result(self._rows)


@pytest.mark.asyncio
async def test_uploaded_files_context_includes_recent_file_content(tmp_path, monkeypatch):
    agent_id = uuid4()
    monkeypatch.chdir(tmp_path)

    storage_dir = tmp_path / "var" / "agent_files" / str(agent_id)
    storage_dir.mkdir(parents=True)
    storage_path = storage_dir / "input.csv"
    storage_path.write_text("name,hours\nAli,22\n", encoding="utf-8")

    file_row = SimpleNamespace(
        id=uuid4(),
        agent_id=agent_id,
        filename="input.csv",
        mime_type="text/csv",
        storage_path=str(storage_path),
        created_at=datetime.now(UTC),
    )
    agent = SimpleNamespace(id=agent_id, tool_names=[], config_json={}, capabilities={})
    service = OrchestratorService(_Db([file_row]))

    context = await service._uploaded_files_context(agent)

    assert "=== محتوای فایل ورودی فعلی" in context
    assert "--- فایل: input.csv ---" in context
    assert "name,hours" in context
    assert "Ali,22" in context
    assert "داده ساختگی نساز" in context


@pytest.mark.asyncio
async def test_uploaded_files_context_prefers_karkard_tool_instruction(tmp_path, monkeypatch):
    agent_id = uuid4()
    monkeypatch.chdir(tmp_path)

    storage_dir = tmp_path / "var" / "agent_files" / str(agent_id)
    storage_dir.mkdir(parents=True)
    storage_path = storage_dir / "karkard.xlsx"
    storage_path.write_bytes(b"not-real-xlsx")

    file_row = SimpleNamespace(
        id=uuid4(),
        agent_id=agent_id,
        filename="karkard.xlsx",
        mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        storage_path=str(storage_path),
        created_at=datetime.now(UTC),
    )
    agent = SimpleNamespace(
        id=agent_id,
        tool_names=["karkard_process"],
        config_json={},
        capabilities={},
    )
    service = OrchestratorService(_Db([file_row]))
    monkeypatch.setattr(
        "src.karkard.input_selection.workbook_looks_like_raw_karkard",
        lambda _path: True,
    )

    context = await service._uploaded_files_context(agent)

    assert "karkard_process" in context
    assert f"storage_path=\"{storage_path}\"" in context
    # ponytail: karkard never inlines xlsx — LLM must call the tool, not guess from truncated rows
    assert "=== محتوای فایل ورودی فعلی" not in context


@pytest.mark.asyncio
async def test_file_only_worker_may_invoke_without_chat():
    from src.schemas.agent import AgentInvokeRequest

    agent = SimpleNamespace(
        capabilities={"chat_enabled": False, "file_upload_enabled": True},
        file_policy={"require_files_to_invoke": False, "min_files": 1},
        config_json={},
    )
    service = OrchestratorService(_Db([]))
    payload = AgentInvokeRequest(input="فایل را پردازش کن", stream=False)

    await service._enforce_capabilities(agent, payload)


@pytest.mark.asyncio
async def test_worker_without_chat_or_files_rejects_invoke():
    from fastapi import HTTPException
    from src.schemas.agent import AgentInvokeRequest

    agent = SimpleNamespace(
        capabilities={"chat_enabled": False, "file_upload_enabled": False},
        file_policy={"require_files_to_invoke": False, "min_files": 0},
        config_json={},
    )
    service = OrchestratorService(_Db([]))
    payload = AgentInvokeRequest(input="test", stream=False)

    with pytest.raises(HTTPException) as exc:
        await service._enforce_capabilities(agent, payload)
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_uploaded_files_context_excludes_instruction_files(tmp_path, monkeypatch):
    agent_id = uuid4()
    monkeypatch.chdir(tmp_path)

    storage_dir = tmp_path / "var" / "agent_files" / str(agent_id)
    storage_dir.mkdir(parents=True)
    runtime_path = storage_dir / "data.xlsx"
    runtime_path.write_text("name,hours\nAli,8\n", encoding="utf-8")
    instruction_path = storage_dir / "rules.docx"
    instruction_path.write_text("پنجشنبه و جمعه تعطیل است", encoding="utf-8")

    runtime_row = SimpleNamespace(
        id=uuid4(),
        agent_id=agent_id,
        filename="data.csv",
        mime_type="text/csv",
        storage_path=str(runtime_path),
        created_at=datetime.now(UTC),
    )
    instruction_row = SimpleNamespace(
        id=uuid4(),
        agent_id=agent_id,
        filename="instruction__rules.docx",
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storage_path=str(instruction_path),
        created_at=datetime.now(UTC),
    )
    agent = SimpleNamespace(id=agent_id, tool_names=[], config_json={}, capabilities={})
    service = OrchestratorService(_Db([runtime_row, instruction_row]))

    context = await service._uploaded_files_context(agent)

    assert "=== محتوای فایل ورودی فعلی" in context
    assert "--- فایل: data.csv ---" in context
    assert "instruction__rules.docx" not in context.split("=== محتوای فایل ورودی")[1]
    assert "پنجشنبه" not in context.split("=== محتوای فایل ورودی")[1]
    assert "فایل دستورالعمل — در system prompt" in context


@pytest.mark.asyncio
async def test_karkard_never_uses_worker_auto_tool(tmp_path, monkeypatch):
    from src.models.agent import AgentKind

    agent_id = uuid4()
    monkeypatch.chdir(tmp_path)

    storage_dir = tmp_path / "var" / "agent_files" / str(agent_id)
    storage_dir.mkdir(parents=True)
    storage_path = storage_dir / "raw.xlsx"
    storage_path.write_bytes(b"not-real-xlsx")

    file_row = SimpleNamespace(
        id=uuid4(),
        agent_id=agent_id,
        filename="raw.xlsx",
        mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        storage_path=str(storage_path),
        created_at=datetime.now(UTC),
    )

    class _DbAuto:
        async def execute(self, stmt):
            sql = str(stmt)
            if "agent_actions" in sql.lower():
                return _Result([])
            return _Result([file_row])

        async def commit(self):
            return None

    agent = SimpleNamespace(
        id=agent_id,
        slug="example-karkard",
        name="کارکرد",
        kind=AgentKind.WORKER,
        tool_names=["karkard_process"],
        config_json={"task_profile": "karkard"},
        capabilities={"chat_enabled": False},
        model_name="claude-opus-4-8",
        model_provider="openai",
        system_prompt="test",
    )

    service = OrchestratorService(_DbAuto())

    from src.schemas.agent import AgentInvokeRequest

    response = await service._try_worker_auto_tool(
        agent,
        AgentInvokeRequest(input="پردازش کن", stream=False),
        SimpleNamespace(id=uuid4()),
        SimpleNamespace(id=uuid4(), duration_ms=5),
        "thread-1",
        "cache-1",
    )

    assert response is None


@pytest.mark.asyncio
async def test_chat_enabled_skips_karkard_auto_tool(tmp_path, monkeypatch):
    from src.models.agent import AgentKind

    agent_id = uuid4()
    monkeypatch.chdir(tmp_path)
    storage_dir = tmp_path / "var" / "agent_files" / str(agent_id)
    storage_dir.mkdir(parents=True)
    storage_path = storage_dir / "raw.xlsx"
    storage_path.write_bytes(b"not-real-xlsx")

    file_row = SimpleNamespace(
        id=uuid4(),
        agent_id=agent_id,
        filename="raw.xlsx",
        mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        storage_path=str(storage_path),
        created_at=datetime.now(UTC),
    )

    class _DbAuto:
        async def execute(self, stmt):
            return _Result([file_row])

    agent = SimpleNamespace(
        id=agent_id,
        slug="example-karkard",
        name="کارکرد",
        kind=AgentKind.WORKER,
        tool_names=["karkard_process"],
        config_json={"task_profile": "karkard"},
        capabilities={"chat_enabled": True},
    )
    service = OrchestratorService(_DbAuto())
    from src.schemas.agent import AgentInvokeRequest

    response = await service._try_worker_auto_tool(
        agent,
        AgentInvokeRequest(input="پردازش کارکرد", stream=False),
        SimpleNamespace(id=uuid4()),
        SimpleNamespace(id=uuid4(), duration_ms=5),
        "thread-1",
        "cache-1",
    )
    assert response is None
