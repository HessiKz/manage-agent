"""Agent file delete API."""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.main import app


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


def test_delete_agent_file_removes_record_and_disk(
    client: TestClient, auth_headers: dict, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    suffix = uuid.uuid4().hex[:8]
    create = client.post(
        "/api/v1/agents",
        headers=auth_headers,
        json={
            "name": f"File delete {suffix}",
            "slug": f"file-del-{suffix}",
            "kind": "worker",
            "capabilities": {"file_upload_enabled": True},
            "file_policy": {
                "min_files": 0,
                "max_files": 5,
                "max_file_size_mb": 5,
                "max_total_size_mb": 20,
                "allowed_mime_types": ["text/plain"],
                "allowed_extensions": [".txt"],
                "require_files_to_invoke": False,
                "auto_ingest_to_rag": False,
            },
        },
    )
    assert create.status_code == 201
    agent_id = create.json()["id"]

    upload = client.post(
        f"/api/v1/agents/{agent_id}/files",
        headers=auth_headers,
        files={"file": ("sample.txt", b"hello", "text/plain")},
    )
    assert upload.status_code in (200, 201)
    file_id = upload.json()["id"]

    dl_before = client.get(
        f"/api/v1/agents/{agent_id}/files/{file_id}/download",
        headers=auth_headers,
    )
    assert dl_before.status_code == 200

    delete = client.delete(
        f"/api/v1/agents/{agent_id}/files/{file_id}",
        headers=auth_headers,
    )
    assert delete.status_code == 204

    dl_after = client.get(
        f"/api/v1/agents/{agent_id}/files/{file_id}/download",
        headers=auth_headers,
    )
    assert dl_after.status_code == 404

    listing = client.get(f"/api/v1/agents/{agent_id}/files", headers=auth_headers)
    assert listing.status_code == 200
    assert all(row["id"] != file_id for row in listing.json())
