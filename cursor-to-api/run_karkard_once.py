#!/usr/bin/env python3
"""Invoke manage-agent backend karkard_process once (subagent runner)."""
from __future__ import annotations

import json
import os
import shutil
import sys

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, os.path.join(BACKEND, "src"))
os.chdir(BACKEND)

AGENT_ID = "80e7d77f-7d50-4902-a589-3b031a4a3b5d"
STORAGE_REL = (
    f"var/agent_files/{AGENT_ID}/03727ec8f37f492e84b3c59a70b1117a_sample.xlsx"
)

dst = os.path.join(BACKEND, STORAGE_REL)
os.makedirs(os.path.dirname(dst), exist_ok=True)
fixture = os.path.join(BACKEND, "tests/fixtures/karkard_sample.xlsx")
if not os.path.isfile(dst):
    shutil.copy(fixture, dst)

import src.agents_lib.custom_tools  # noqa: F401
from src.demo.tool_runner import run_tool_slug

result = run_tool_slug(
    "karkard_process",
    {
        "storage_path": STORAGE_REL,
        "agent_id": AGENT_ID,
        "jalali_year": 1405,
    },
)
print(json.dumps(result, ensure_ascii=False))
