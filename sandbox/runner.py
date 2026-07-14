"""In-container sandbox runner for Phase 3 worker execution.

Reads a job spec (JSON) from stdin or /job/spec.json, executes a small set of
constrained tools against /workspace, collects outputs, and emits a result
JSON document on stdout. No outbound network, no shell escapes, no pip/git.

Constraints (mirrors agent_script_service.SCRIPT_IMPORT_ALLOWLIST):
- read_file / write_file / list_dir / execute_python / officecli only
- every path stays under /workspace (reject '..')
- execute_python runs user code via subprocess with a frozen import allowlist
- officecli runs the native binary with a frozen command allowlist + --json
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import time
import traceback
from pathlib import Path

WORKSPACE = Path("/workspace")
OUTPUTS = WORKSPACE / "outputs"
JOB_SPEC_PATH = Path("/job/spec.json")

ALLOWED_IMPORTS = frozenset(
    {
        "__future__", "csv", "datetime", "decimal", "json", "math",
        "openpyxl", "pandas", "pathlib", "re", "shutil", "statistics",
        "typing", "jdatetime", "pypdf2", "pdfplumber", "tabulate",
    }
)


def _safe(path: Path) -> Path:
    resolved = (WORKSPACE / path).resolve() if not path.is_absolute() else path.resolve()
    try:
        resolved.relative_to(WORKSPACE)
    except ValueError:
        raise PermissionError(f"path outside workspace: {path}")
    return resolved


def read_file(rel: str) -> dict:
    p = _safe(Path(rel))
    if not p.exists() or not p.is_file():
        return {"ok": False, "error": "not a file"}
    return {"ok": True, "content": p.read_text(encoding="utf-8", errors="replace")}


def write_file(rel: str, content: str) -> dict:
    p = _safe(Path("outputs") / rel)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    return {"ok": True, "path": str(p.relative_to(WORKSPACE))}


def list_dir(rel: str) -> dict:
    p = _safe(Path(rel))
    if not p.exists() or not p.is_dir():
        return {"ok": False, "error": "not a dir"}
    return {"ok": True, "entries": [str(x.relative_to(WORKSPACE)) for x in p.iterdir()]}


def execute_python(code: str) -> dict:
    # Static import guard: forbid imports outside the allowlist before running.
    for m in re.finditer(r"^\s*(?:from\s+([\w\.]+)\s+import|import\s+([\w\.]+))", code, re.M):
        mod = (m.group(1) or m.group(2)).split(".")[0]
        if mod not in ALLOWED_IMPORTS:
            return {"ok": False, "error": f"import denied: {mod}"}
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, dir="/tmp") as tf:
        tf.write(code)
        tmp = tf.name
    try:
        proc = subprocess.run(
            [sys.executable, tmp],
            cwd=str(WORKSPACE),
            capture_output=True,
            text=True,
            timeout=120,
        )
        return {
            "ok": proc.returncode == 0,
            "stdout": proc.stdout[-4000:],
            "stderr": proc.stderr[-4000:],
            "returncode": proc.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "python exec timed out"}
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


OFFICECLI_BIN = "/usr/local/bin/officecli"
OFFICECLI_ALLOWLIST = frozenset(
    {
        "create", "view", "get", "query", "set", "add", "remove",
        "move", "swap", "validate", "merge", "dump", "batch",
    }
)


def _officecli_reject_path(tok: str) -> bool:
    # Reject traversal and non-/workspace absolute paths; bare relative paths
    # are pinned under WORKSPACE by the cwd passed to subprocess and by _safe().
    if ".." in tok:
        return True
    if tok.startswith("/") and not tok.startswith(str(WORKSPACE)):
        return True
    return False


def _officecli_doc_path(cmd: list[str]) -> str | None:
    # First non-flag token that looks like a path (contains a dot or slash).
    for tok in cmd[1:]:
        if tok.startswith("--"):
            continue
        if "." in tok or "/" in tok:
            return tok
    return None


def officecli(cmd: list[str]) -> dict:
    if not cmd or not isinstance(cmd, list):
        return {"ok": False, "error": "officecli: cmd must be a non-empty list"}
    sub = str(cmd[0])
    if sub not in OFFICECLI_ALLOWLIST:
        return {"ok": False, "error": f"officecli: command not allowed: {sub}"}
    for tok in cmd:
        if _officecli_reject_path(tok):
            return {"ok": False, "error": f"officecli: path outside workspace: {tok}"}
    doc = _officecli_doc_path(cmd)
    if doc is not None:
        try:
            _safe(Path(doc))
        except PermissionError as e:
            return {"ok": False, "error": f"officecli: {e}"}
    argv = [OFFICECLI_BIN, *cmd, "--json"]
    try:
        proc = subprocess.run(
            argv,
            cwd=str(WORKSPACE),
            capture_output=True,
            text=True,
            timeout=180,
            env={**os.environ, "OFFICECLI_SKIP_UPDATE": "1"},
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "officecli: timed out"}
    except FileNotFoundError:
        return {"ok": False, "error": "officecli: binary not installed"}
    parsed = None
    if proc.returncode == 0:
        try:
            parsed = json.loads(proc.stdout)
        except (json.JSONDecodeError, ValueError):
            parsed = None
    return {
        "ok": proc.returncode == 0,
        "stdout": proc.stdout[-4000:],
        "stderr": proc.stderr[-4000:],
        "returncode": proc.returncode,
        "json": parsed,
    }


TOOLS = {
    "read_file": read_file,
    "write_file": write_file,
    "list_dir": list_dir,
    "execute_python": execute_python,
    "officecli": officecli,
}


def run_job(spec: dict) -> dict:
    steps = spec.get("steps", [])
    max_steps = int(spec.get("max_steps", 25))
    steps_executed = 0
    OUTPUTS.mkdir(parents=True, exist_ok=True)

    for i, step in enumerate(steps[:max_steps]):
        steps_executed += 1
        tool = step.get("tool")
        args = step.get("args", {}) or {}
        fn = TOOLS.get(tool)
        if fn is None:
            return {"status": "failed", "error": f"unknown tool: {tool}", "stats": {"steps_executed": steps_executed}, "artifacts": []}
        try:
            res = fn(**args)
            if isinstance(res, dict) and not res.get("ok", True):
                return {"status": "failed", "error": res.get("error", "tool error"), "stats": {"steps_executed": steps_executed}, "artifacts": []}
        except Exception as e:
            return {"status": "failed", "error": f"{type(e).__name__}: {e}", "stats": {"steps_executed": steps_executed}, "artifacts": []}

    artifacts = collect_artifacts(spec.get("output_glob", "outputs/*"))
    return {
        "status": "succeeded" if artifacts or steps_executed else "succeeded",
        "artifacts": artifacts,
        "stats": {"steps_executed": steps_executed},
    }


def collect_artifacts(glob_pattern: str) -> list[dict]:
    out = []
    base = Path("outputs")
    pattern = os.path.basename(glob_pattern)
    src = base if pattern in ("*", base.name) else base
    if not src.exists():
        return out
    for p in sorted(src.rglob(pattern if pattern != "*" else "*")):
        if p.is_file():
            rel = p.relative_to(WORKSPACE)
            # path traversal guard
            try:
                rel.resolve().relative_to(WORKSPACE)
            except ValueError:
                continue
            size = p.stat().st_size
            out.append({
                "relative_path": str(rel),
                "mime_type": "application/octet-stream",
                "size_bytes": size,
            })
    return out


def main() -> int:
    raw = None
    if JOB_SPEC_PATH.exists():
        raw = JOB_SPEC_PATH.read_text(encoding="utf-8")
    if not raw:
        raw = sys.stdin.read()
    try:
        spec = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as e:
        print(json.dumps({"status": "failed", "error": f"bad spec json: {e}", "artifacts": []}))
        return 2
    try:
        result = run_job(spec)
        print(json.dumps(result))
        return 0 if result.get("status") == "succeeded" else 1
    except MemoryError:
        print(json.dumps({"status": "failed", "error": "oom", "artifacts": []}))
        return 137
    except Exception:
        print(json.dumps({"status": "failed", "error": traceback.format_exc()[-2000:], "artifacts": []}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
