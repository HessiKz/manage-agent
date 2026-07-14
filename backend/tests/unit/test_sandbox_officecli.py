"""Unit guards for the officecli sandbox tool.

Pure-logic tests for the command allowlist and path-pinning behavior. No
Docker and no binary install are required; the binary-not-installed and
timeout branches are exercised via the allowlist/path checks which short
-circuit before subprocess.run.
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest import mock

import pytest

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from sandbox import runner  # noqa: E402

DISALLOWED = ["watch", "raw", "raw-set", "rm", "install", "mcp", "config"]


def _recorder():
    calls: list[list[str]] = []
    fake_proc = mock.Mock(returncode=0, stdout="", stderr="")
    def _run(argv, **kwargs):
        calls.append(list(argv))
        return fake_proc
    return calls, _run


def test_allowed_commands_pass_allowlist():
    for cmd in runner.OFFICECLI_ALLOWLIST:
        assert runner._officecli_reject_path is not None  # module loaded
    calls, _run = _recorder()
    with mock.patch("sandbox.runner.subprocess.run", side_effect=_run):
        res = runner.officecli(["view", "report.docx", "outline"])
    assert res["ok"] is True
    assert res["returncode"] == 0


@pytest.mark.parametrize("sub", DISALLOWED)
def test_disallowed_commands_rejected(sub):
    res = runner.officecli([sub, "x.docx"])
    assert res == {"ok": False, "error": f"officecli: command not allowed: {sub}"}


def test_empty_or_non_list_cmd_rejected():
    assert runner.officecli([])["ok"] is False
    assert runner.officecli("create")["ok"] is False  # type: ignore[arg-type]


def test_parent_traversal_token_rejected():
    res = runner.officecli(["view", "../secret.docx"])
    assert res["ok"] is False
    assert "path outside workspace" in res["error"]


def test_non_workspace_absolute_path_rejected():
    res = runner.officecli(["view", "/etc/passwd"])
    assert res["ok"] is False
    assert "path outside workspace" in res["error"]


def test_workspace_rooted_absolute_path_accepted():
    calls, _run = _recorder()
    with mock.patch("sandbox.runner.subprocess.run", side_effect=_run):
        res = runner.officecli(["view", str(runner.WORKSPACE / "report.pptx")])
    assert res["ok"] is True
    assert calls[0][:-1] == [runner.OFFICECLI_BIN, "view", str(runner.WORKSPACE / "report.pptx")]


def test_bare_relative_path_accepted():
    calls, _run = _recorder()
    with mock.patch("sandbox.runner.subprocess.run", side_effect=_run):
        runner.officecli(["view", "report.pptx"])
    assert calls[0][1] == "view"
    assert calls[0][2] == "report.pptx"


def test_json_always_appended():
    calls, _run = _recorder()
    with mock.patch("sandbox.runner.subprocess.run", side_effect=_run):
        runner.officecli(["create", "report.pptx"])
    assert calls[0] == [runner.OFFICECLI_BIN, "create", "report.pptx", "--json"]


def test_workspace_cwd_and_skip_update_env_passed():
    captured: dict = {}
    def _run(argv, **kwargs):
        captured["cwd"] = kwargs.get("cwd")
        captured["env"] = kwargs.get("env")
        return mock.Mock(returncode=0, stdout="", stderr="")
    with mock.patch("sandbox.runner.subprocess.run", side_effect=_run):
        runner.officecli(["validate", "report.docx"])
    assert captured["cwd"] == str(runner.WORKSPACE)
    assert captured["env"]["OFFICECLI_SKIP_UPDATE"] == "1"


def test_json_parsed_from_stdout_when_ok():
    def _run(argv, **kwargs):
        return mock.Mock(returncode=0, stdout='{"slides": []}', stderr="")
    with mock.patch("sandbox.runner.subprocess.run", side_effect=_run):
        res = runner.officecli(["view", "p.pptx", "outline"])
    assert res["json"] == {"slides": []}


def test_json_none_when_stderr_nonzero():
    def _run(argv, **kwargs):
        return mock.Mock(returncode=1, stdout="boom", stderr="not found")
    with mock.patch("sandbox.runner.subprocess.run", side_effect=_run):
        res = runner.officecli(["view", "missing.docx"])
    assert res["ok"] is False
    assert res["json"] is None


def test_binary_not_installed_handled():
    def _boom(argv, **kwargs):
        raise FileNotFoundError(argv[0])
    with mock.patch("sandbox.runner.subprocess.run", side_effect=_boom):
        res = runner.officecli(["view", "x.docx"])
    assert res["ok"] is False
    assert "binary not installed" in res["error"]


def test_timeout_handled():
    import subprocess
    def _run(argv, **kwargs):
        raise subprocess.TimeoutExpired(argv, 180)
    with mock.patch("sandbox.runner.subprocess.run", side_effect=_run):
        res = runner.officecli(["view", "x.docx"])
    assert res == {"ok": False, "error": "officecli: timed out"}


def test_traversal_scans_all_tokens():
    res = runner.officecli(["add", "report.pptx", "--prop", "title=../../x"])
    assert res["ok"] is False
    assert "path outside workspace" in res["error"]


def test_tools_dict_registered():
    assert runner.TOOLS["officecli"] is runner.officecli
