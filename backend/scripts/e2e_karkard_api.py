#!/usr/bin/env python3
"""API E2E: action run twice must yield distinct workspace download URLs."""

from __future__ import annotations

import re
import sys
import uuid
from pathlib import Path

from fastapi.testclient import TestClient
from openpyxl import Workbook

# Ensure mounted source wins over site-packages copy baked into the image.
sys.path.insert(0, "/app")

import src.services.orchestrator_service as orch
from tests.helpers.mock_react import mock_run_react_agent

orch.run_react_agent = mock_run_react_agent

from src.main import app  # noqa: E402


def main() -> int:
    client = TestClient(app)
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "admin123"},
    )
    if login.status_code != 200:
        print("LOGIN FAIL", login.text)
        return 1
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    suffix = uuid.uuid4().hex[:8]
    create = client.post(
        "/api/v1/agents",
        headers=headers,
        json={
            "name": f"Karkard E2E {suffix}",
            "slug": f"karkard-e2e-{suffix}",
            "kind": "worker",
            "capabilities": {
                "chat_enabled": True,
                "file_upload_enabled": True,
                "actions_enabled": True,
                "templates_enabled": True,
            },
            "file_policy": {
                "min_files": 1,
                "max_files": 10,
                "max_file_size_mb": 25,
                "max_total_size_mb": 100,
                "allowed_mime_types": [
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                ],
                "allowed_extensions": [".xlsx"],
                "require_files_to_invoke": False,
                "auto_ingest_to_rag": False,
            },
            "tool_names": ["run_agent_script"],
            "actions": [
                {
                    "slug": "process_karkard",
                    "label": "محاسبه",
                    "prompt_template": "پردازش کارکرد",
                    "tool_chain": ["run_agent_script"],
                    "input_schema": {},
                }
            ],
        },
    )
    if create.status_code != 201:
        print("CREATE FAIL", create.text)
        return 1
    agent_id = create.json()["id"]

    raw_path = Path(f"/tmp/raw-{suffix}.xlsx")
    wb = Workbook()
    ws = wb.active
    ws.append(["تاریخ", "کارکرد", "اضافه کار کل", "تاخیر و تعجیل"])
    ws.append(["1405/01/01", "08:00:00", "00:00:00", "00:00:00"])
    wb.save(raw_path)

    with raw_path.open("rb") as fh:
        up = client.post(
            f"/api/v1/agents/{agent_id}/files",
            headers=headers,
            files={
                "file": (
                    f"کارکرد-raw-{suffix}.xlsx",
                    fh,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
    if up.status_code not in (200, 201):
        print("UPLOAD RAW FAIL", up.text)
        return 1

    sample_path = Path(f"/tmp/sample-{suffix}.xlsx")
    Workbook().save(sample_path)
    with sample_path.open("rb") as fh:
        up2 = client.post(
            f"/api/v1/agents/{agent_id}/files",
            headers=headers,
            files={
                "file": (
                    f"output-sample__sample-{suffix}.xlsx",
                    fh,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
    if up2.status_code not in (200, 201):
        print("UPLOAD SAMPLE FAIL", up2.text)
        return 1

    urls: list[str] = []
    for i in range(2):
        run = client.post(
            f"/api/v1/agents/{agent_id}/actions/process_karkard/run",
            headers=headers,
            json={
                "variables": {
                    "jalali_year": 1405,
                    "company_name": "شرکت توسعه کارآفرینی سوره",
                }
            },
        )
        if run.status_code != 200:
            print(f"RUN {i + 1} FAIL", run.text)
            return 1
        out = run.json()["output"]
        found = re.findall(r"/api/v1/agents/[^/]+/workspace/[^\s\"']+", out)
        if not found:
            print(f"RUN {i + 1} no URL in:", out)
            return 1
        urls.append(found[0])
        print(f"run {i + 1}: {found[0]}")

    if urls[0] == urls[1]:
        print("FAIL: duplicate download URLs")
        return 1
    if "output-sample" in urls[0]:
        print("FAIL: processed output-sample")
        return 1
    if not re.search(r"-[0-9a-f]{8}-processed\.xlsx", urls[0]):
        print("FAIL: missing versioned output filename", urls[0])
        return 1

    print("OK: API E2E passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
