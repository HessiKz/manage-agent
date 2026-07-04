"""Phase 2 — LLM script synthesis verify->repair retry loop."""

from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.services import agent_script_service
from src.services.agent_script_service import AgentScriptService

_BAD_SCRIPT = """from pathlib import Path
from shutil import copy2


def main(input_path, output_dir, *, agent_id, args):
    output_dir.mkdir(parents=True, exist_ok=True)
    out = output_dir / "result.csv"
    copy2(input_path, out)
    return out
"""

_GOOD_SCRIPT = """import csv
from pathlib import Path


def main(input_path, output_dir, *, agent_id, args):
    output_dir.mkdir(parents=True, exist_ok=True)
    with input_path.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    out_rows = [rows[0]] + [[str(int(r[0]) * 2)] for r in rows[1:]]
    out = output_dir / "result.csv"
    with out.open("w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(out_rows)
    return out
"""


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

    async def execute(self, *_a, **_k):
        return _Result(self.rows)

    async def flush(self):
        pass


class _FakeLLM:
    """Returns a broken script first, a correct one on the repair retry."""

    def __init__(self, scripts):
        self._scripts = list(scripts)
        self.calls = 0

    async def ainvoke(self, _messages):
        idx = min(self.calls, len(self._scripts) - 1)
        self.calls += 1
        return SimpleNamespace(content=self._scripts[idx])


def _file(root: Path, name: str, text: str):
    path = root / f"{uuid4().hex}_{name}"
    path.write_text(text, encoding="utf-8")
    return SimpleNamespace(filename=name, storage_path=str(path), created_at=None)


def _agent():
    return SimpleNamespace(
        id=uuid4(),
        slug="doubler",
        name="Doubler",
        description="Double the numeric column",
        system_prompt="",
        kind=SimpleNamespace(value="worker"),
        capabilities={"file_upload_enabled": True},
        config_json={},
    )


@pytest.mark.anyio
async def test_verify_repairs_bad_first_synthesis(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    fake = _FakeLLM([_BAD_SCRIPT, _GOOD_SCRIPT])
    monkeypatch.setattr(agent_script_service, "_build_llm", lambda: fake)

    agent = _agent()
    root = tmp_path / "var" / "agent_files" / str(agent.id)
    root.mkdir(parents=True)
    rows = [
        _file(root, "input.csv", "a\n1\n2\n"),
        _file(root, "output-sample__expected.csv", "a\n2\n4\n"),
    ]

    meta = await AgentScriptService(_Db(rows)).verify(agent, use_llm=True)

    assert meta["verified_at"]
    # First synthesis failed verification; the repair retry produced the fix.
    assert meta["repair_attempts_used"] == 1
    assert fake.calls == 2
