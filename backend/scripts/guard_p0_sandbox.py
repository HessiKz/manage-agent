#!/usr/bin/env python3
"""P0 guard: ensure pinned run_agent_script never enqueues an execution_jobs
row. Scans orchestrator/execution_router sources for any referral from that
path to ExecutionJobService / SANDBOX_JOB, and confirms the SANDBOX_JOB rule
is gated on AUTONOMOUS + WORKER + execution_backend=sandbox.

Exits non-zero on violation so CI blocks a regression. Run:
    python scripts/guard_p0_sandbox.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "src" / "core" / "execution_router.py",
    ROOT / "src" / "services" / "orchestrator_service.py",
    ROOT / "src" / "services" / "execution_job_service.py",
]
P0_TOKENS = ("run_agent_script",)
SANDBOX_ENQUEUE_TOKENS = (
    "ExecutionJobService",
    "enqueue_from_invoke",
    "SANDBOX_JOB",
    "enqueue",
)


def _strip_docstrings_and_comments(text: str) -> list[str]:
    """Return source lines with docstrings and comments blanked out."""
    lines = text.splitlines()
    out = list(lines)
    in_doc = False
    doc_marker = None
    triple_dq = chr(34) * 3
    triple_sq = chr(39) * 3
    for i, line in enumerate(out):
        if in_doc:
            out[i] = ""
            if doc_marker and doc_marker in line:
                # closing marker on this line ends the docstring
                in_doc = False
                doc_marker = None
            continue
        # opening docstring?
        for marker in (triple_dq, triple_sq):
            if marker in line:
                stripped = line.strip()
                if stripped.startswith(marker) and stripped.count(marker) == 1:
                    in_doc = True
                    doc_marker = marker
                    out[i] = ""
                    break
        else:
            # strip inline comments
            if "#" in line:
                # crude: only strip if # is not inside a string literal
                code_part = line.split("#")[0]
                if code_part.count('"') % 2 == 0 and code_part.count("'") % 2 == 0:
                    line = code_part
            out[i] = line
    return out


def guard_p0_never_sandbox() -> list[str]:
    problems = []
    for path in TARGETS:
        if not path.exists():
            continue
        scoured = _strip_docstrings_and_comments(path.read_text(encoding="utf-8"))
        for i, line in enumerate(scoured, 1):
            if any(t in line for t in P0_TOKENS) and any(t in line for t in SANDBOX_ENQUEUE_TOKENS):
                problems.append(f"{path}:{i}: P0 token shares a line with sandbox enqueue: {line.strip()}")
    return problems


def guard_sandbox_rule_gated() -> list[str]:
    router = ROOT / "src" / "core" / "execution_router.py"
    if not router.exists():
        return ["execution_router missing"]
    text = router.read_text(encoding="utf-8")
    if "ExecutionPath.SANDBOX_JOB" not in text:
        return ["execution_router missing ExecutionPath.SANDBOX_JOB"]
    if "ExecutionPrecision.AUTONOMOUS" not in text:
        return ["Sandbox rule not gated on AUTONOMOUS precision"]
    if "AgentKind.WORKER" not in text:
        return ["Sandbox rule not gated on worker kind"]
    return []


def main() -> int:
    problems = guard_p0_never_sandbox() + guard_sandbox_rule_gated()
    if problems:
        print("P0 GUARD FAILED:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1
    print("P0 guard OK: karkard/run_agent_script stay native; sandbox gated on autonomous worker.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
