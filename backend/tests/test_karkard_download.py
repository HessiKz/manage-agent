"""Karkard processed file download resolves agent_files paths."""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.main import app

FIXTURE_XLSX = Path(__file__).resolve().parents[2] / "formdocs/ب/کارکرد توسعه کارآفرینی-2.1405.xlsx"
FIXTURE_FALLBACK = Path(__file__).resolve().parent / "fixtures/karkard_sample.xlsx"


def _fixture_xlsx() -> Path:
    if FIXTURE_XLSX.is_file():
        return FIXTURE_XLSX
    return FIXTURE_FALLBACK


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_headers(client: TestClient):
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "admin123"},
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


@pytest.mark.skipif(not _fixture_xlsx().is_file(), reason="karkard fixture missing")
def test_karkard_download_from_agent_files_dir(
    client: TestClient, auth_headers: dict, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    from tests.helpers.mock_react import mock_run_react_agent

    monkeypatch.setattr(
        "src.services.orchestrator_service.run_react_agent",
        mock_run_react_agent,
    )
    monkeypatch.setattr("src.karkard.output.KARKARD_OUTPUT_DIR", tmp_path / "unused")
    suffix = uuid.uuid4().hex[:8]
    create = client.post(
        "/api/v1/agents",
        headers=auth_headers,
        json={
            "name": f"Karkard DL {suffix}",
            "slug": f"karkard-dl-{suffix}",
            "kind": "worker",
            "capabilities": {
                "chat_enabled": True,
                "file_upload_enabled": True,
                "actions_enabled": True,
            },
            "file_policy": {
                "min_files": 1,
                "max_files": 5,
                "max_file_size_mb": 25,
                "max_total_size_mb": 100,
                "allowed_mime_types": [
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                ],
                "allowed_extensions": [".xlsx"],
                "require_files_to_invoke": False,
                "auto_ingest_to_rag": False,
            },
            "tool_names": ["karkard_process"],
            "actions": [
                {
                    "slug": "process_karkard",
                    "label": "محاسبه",
                    "prompt_template": "پردازش",
                    "tool_chain": ["karkard_process"],
                    "input_schema": {},
                }
            ],
        },
    )
    assert create.status_code == 201
    agent_id = create.json()["id"]

    with _fixture_xlsx().open("rb") as fh:
        upload = client.post(
            f"/api/v1/agents/{agent_id}/files",
            headers=auth_headers,
            files={
                "file": (
                    "raw.xlsx",
                    fh,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
    assert upload.status_code in (200, 201)

    run = client.post(
        f"/api/v1/agents/{agent_id}/actions/process_karkard/run",
        headers=auth_headers,
        json={"variables": {"jalali_year": 1405}},
    )
    assert run.status_code == 200, run.text
    output = run.json()["output"]
    assert "/api/v1/agents/" in output and "/workspace/" in output

    agent_dir = Path("var/agent_files") / agent_id
    processed = list(agent_dir.glob("karkard-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f].xlsx"))
    assert processed, "output should live next to upload"
    name = processed[0].name

    dl = client.get(
        f"/api/v1/agents/{agent_id}/workspace/{name}",
        headers=auth_headers,
    )
    assert dl.status_code == 200
    assert "spreadsheetml" in dl.headers.get("content-type", "")
