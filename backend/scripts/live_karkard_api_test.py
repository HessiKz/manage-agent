#!/usr/bin/env python3
"""Live API test: 3-file karkard agent must process RAW input, not output-sample."""

from __future__ import annotations

import json
import re
import shutil
import sys
import uuid
from pathlib import Path

import httpx

BASE = "http://localhost:8000"
FORMDOCS = Path("/app/formdocs")
if not FORMDOCS.is_dir():
    FORMDOCS = Path(__file__).resolve().parents[2] / "formdocs"

RAW = FORMDOCS / "ب/کارکرد توسعه کارآفرینی-2.1405.xlsx"
SAMPLE = FORMDOCS / "کارکرد_توسعه_کارآفرینی_1405.2.xlsx"
INSTRUCTION = FORMDOCS / "ب/دستور محاسبه کارکرد - cloude.ai.docx"


def fail(msg: str) -> int:
    print("FAIL:", msg)
    return 1


def main() -> int:
    for path in (RAW, SAMPLE):
        if not path.is_file():
            return fail(f"missing fixture {path}")

    with httpx.Client(base_url=BASE, timeout=120.0) as client:
        login = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@example.com", "password": "admin123"},
        )
        if login.status_code != 200:
            return fail(f"login {login.status_code}: {login.text}")
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        suffix = uuid.uuid4().hex[:8]
        create = client.post(
            "/api/v1/agents",
            headers=headers,
            json={
                "name": f"Karkard Live {suffix}",
                "slug": f"karkard-live-{suffix}",
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
                    "max_total_size_mb": 200,
                    "allowed_mime_types": [
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    ],
                    "allowed_extensions": [".xlsx", ".xls", ".docx"],
                    "require_files_to_invoke": False,
                    "auto_ingest_to_rag": False,
                },
                "tool_names": ["karkard_process"],
                "actions": [
                    {
                        "slug": "process_karkard",
                        "label": "محاسبه کارکرد",
                        "prompt_template": "فایل کارکرد خام را پردازش کن.",
                        "tool_chain": ["karkard_process"],
                        "input_schema": {},
                    }
                ],
            },
        )
        if create.status_code != 201:
            return fail(f"create agent {create.status_code}: {create.text}")
        agent_id = create.json()["id"]

        def upload(name: str, path: Path, mime: str) -> None:
            with path.open("rb") as fh:
                r = client.post(
                    f"/api/v1/agents/{agent_id}/files",
                    headers=headers,
                    files={"file": (name, fh, mime)},
                )
            if r.status_code not in (200, 201):
                raise RuntimeError(f"upload {name}: {r.status_code} {r.text}")

        # Same order users often use: sample first, then raw last.
        upload(
            f"output-sample__{SAMPLE.name}",
            SAMPLE,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        if INSTRUCTION.is_file():
            upload(
                f"instruction__{INSTRUCTION.name}",
                INSTRUCTION,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        upload(
            RAW.name,
            RAW,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

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
                return fail(f"run {i + 1}: {run.status_code} {run.text}")
            out = run.json().get("output") or ""
            found = re.findall(
                r"/api/v1/agents/[^/]+/workspace/karkard-[^\s\"']+(?:\s[^\s\"']+)*-processed\.xlsx",
                out,
            )
            if not found:
                found = re.findall(r"/api/v1/agents/[^/]+/workspace/[^\s\"']+\.xlsx", out)
            if not found:
                return fail(f"run {i + 1} missing download url in: {out[:500]}")
            urls.append(found[0])
            print(f"run {i + 1}: {found[0]}")

        if urls[0] == urls[1]:
            return fail(f"duplicate urls: {urls}")
        if "کارکرد_توسعه_کارآفرینی_1405.2" in urls[0]:
            return fail(f"processed output-sample name in url: {urls[0]}")
        if "توسعه کارآفرینی-2.1405" not in urls[0] and "توسعه" not in urls[0]:
            return fail(f"raw stem not in url: {urls[0]}")
        if not re.search(r"-[0-9a-f]{8}-processed\.xlsx", urls[0]):
            return fail(f"missing versioned output in url: {urls[0]}")

        print("OK: live API karkard action processed raw input twice with unique urls")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
