from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.services.agent_script_service import (
    AgentScriptService,
    run_agent_script_file,
    verify_file_matches,
)


class _Scalars:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def scalars(self):
        return _Scalars(self.rows)


class _Db:
    def __init__(self, rows=()):
        self.rows = list(rows)

    async def execute(self, *_args, **_kwargs):
        return _Result(self.rows)

    async def flush(self):
        pass


def _agent(**kw):
    return SimpleNamespace(
        id=kw.get("id", uuid4()),
        slug=kw.get("slug", "agent"),
        name=kw.get("name", "Agent"),
        description=kw.get("description", ""),
        system_prompt=kw.get("system_prompt", ""),
        kind=kw.get("kind", SimpleNamespace(value="chat")),
        capabilities=kw.get("capabilities", {}),
        config_json=kw.get("config_json", {}),
    )


def _file(root: Path, name: str, text: str = "a,b\n1,2\n"):
    path = root / f"{uuid4().hex}_{name}"
    path.write_text(text, encoding="utf-8")
    return SimpleNamespace(filename=name, storage_path=str(path), created_at=None)


@pytest.mark.anyio
async def test_chat_only_needs_no_script(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    agent = _agent(capabilities={"chat_enabled": True, "file_upload_enabled": False})

    decision = await AgentScriptService(_Db()).evaluate(agent)

    assert decision.needed is False


@pytest.mark.anyio
async def test_verify_requires_input_and_output_samples(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    agent = _agent(kind=SimpleNamespace(value="worker"), capabilities={"file_upload_enabled": True})
    root = tmp_path / "var" / "agent_files" / str(agent.id)
    root.mkdir(parents=True)
    rows = [_file(root, "instruction__rules.pdf", "rules only")]

    with pytest.raises(ValueError, match="فایل نمونه ورودی"):
        await AgentScriptService(_Db(rows)).verify(agent)


@pytest.mark.anyio
async def test_file_sample_generates_and_verifies(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    agent = _agent(kind=SimpleNamespace(value="worker"), capabilities={"file_upload_enabled": True})
    root = tmp_path / "var" / "agent_files" / str(agent.id)
    root.mkdir(parents=True)
    rows = [
        _file(root, "input.csv"),
        _file(root, "output-sample__expected.csv"),
    ]

    meta = await AgentScriptService(_Db(rows)).verify(agent)

    assert meta["needed"] is True
    assert meta["verified_at"]
    assert (root / meta["path"]).is_file()


def test_run_agent_script_rejects_path_escape(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    agent = _agent(
        config_json={
            "workspace_script": {
                "needed": True,
                "slug": "x",
                "path": "../x.py",
            }
        }
    )
    root = tmp_path / "var" / "agent_files" / str(agent.id)
    root.mkdir(parents=True)
    input_path = root / "input.csv"
    input_path.write_text("x\n", encoding="utf-8")

    with pytest.raises(PermissionError):
        run_agent_script_file(agent, input_path)


def test_verify_file_matches_detects_mismatch(tmp_path):
    actual = tmp_path / "actual.csv"
    expected = tmp_path / "expected.csv"
    actual.write_text("a\n1\n", encoding="utf-8")
    expected.write_text("a\n2\n", encoding="utf-8")

    with pytest.raises(ValueError):
        verify_file_matches(actual, expected)
