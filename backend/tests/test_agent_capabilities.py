"""Agent kinds, capabilities, file policy, actions, links."""

import io
import uuid

import pytest
from fastapi.testclient import TestClient

from src.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth_headers(client: TestClient):
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "admin123"},
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _create_agent(client, headers, **extra):
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "name": f"Test Agent {suffix}",
        "slug": f"test-{suffix}",
        "department": "ops",
        "kind": "chat",
        "capabilities": {"chat_enabled": True},
        **extra,
    }
    r = client.post("/api/v1/agents", headers=headers, json=payload)
    return r


def test_create_chat_kind_defaults(client: TestClient, auth_headers: dict):
    r = _create_agent(client, auth_headers, kind="chat")
    assert r.status_code == 201
    data = r.json()
    assert data["kind"] == "chat"
    assert data["capabilities"]["chat_enabled"] is True


def test_create_worker_kind(client: TestClient, auth_headers: dict):
    r = _create_agent(
        client,
        auth_headers,
        kind="worker",
        capabilities={
            "chat_enabled": False,
            "actions_enabled": True,
            "templates_enabled": True,
        },
        actions=[
            {
                "slug": "act1",
                "label": "Run",
                "prompt_template": "do {{x}}",
                "input_schema": {},
                "tool_chain": [],
            }
        ],
    )
    assert r.status_code == 201
    agent_id = r.json()["id"]
    actions = client.get(f"/api/v1/agents/{agent_id}/actions", headers=auth_headers)
    assert actions.status_code == 200
    assert len(actions.json()) == 1


def test_create_custom_capabilities(client: TestClient, auth_headers: dict):
    r = _create_agent(
        client,
        auth_headers,
        kind="custom",
        capabilities={
            "chat_enabled": True,
            "file_upload_enabled": True,
            "actions_enabled": False,
        },
        file_policy={
            "min_files": 1,
            "max_files": 10,
            "max_file_size_mb": 5,
            "max_total_size_mb": 50,
            "allowed_mime_types": ["text/plain"],
            "allowed_extensions": [".txt"],
        },
    )
    assert r.status_code == 201
    assert r.json()["capabilities"]["file_upload_enabled"] is True


def test_file_upload_policy_rejects_bad_mime(client: TestClient, auth_headers: dict):
    r = _create_agent(
        client,
        auth_headers,
        kind="file_intake",
        capabilities={"chat_enabled": False, "file_upload_enabled": True},
        file_policy={
            "min_files": 0,
            "max_files": 5,
            "max_file_size_mb": 1,
            "max_total_size_mb": 5,
            "allowed_mime_types": ["text/plain"],
            "allowed_extensions": [".txt"],
        },
    )
    assert r.status_code == 201
    agent_id = r.json()["id"]
    bad = client.post(
        f"/api/v1/agents/{agent_id}/files",
        headers=auth_headers,
        files={"file": ("bad.exe", io.BytesIO(b"x"), "application/octet-stream")},
    )
    assert bad.status_code == 422


def test_link_self_rejected(client: TestClient, auth_headers: dict):
    r = _create_agent(client, auth_headers)
    assert r.status_code == 201
    agent_id = r.json()["id"]
    link = client.post(
        f"/api/v1/agents/{agent_id}/links",
        headers=auth_headers,
        json={
            "callee_agent_id": agent_id,
            "link_type": "tool",
            "requires_user_permission": True,
        },
    )
    assert link.status_code == 400


def test_link_supervisor_cycle(client: TestClient, auth_headers: dict):
    a = _create_agent(client, auth_headers, slug=f"a-{uuid.uuid4().hex[:6]}")
    b = _create_agent(client, auth_headers, slug=f"b-{uuid.uuid4().hex[:6]}")
    assert a.status_code == 201 and b.status_code == 201
    a_id, b_id = a.json()["id"], b.json()["id"]
    client.post(
        f"/api/v1/agents/{a_id}/links",
        headers=auth_headers,
        json={"callee_agent_id": b_id, "link_type": "supervises"},
    )
    cycle = client.post(
        f"/api/v1/agents/{b_id}/links",
        headers=auth_headers,
        json={"callee_agent_id": a_id, "link_type": "supervises"},
    )
    assert cycle.status_code == 400


def test_templates_crud(client: TestClient, auth_headers: dict):
    r = _create_agent(client, auth_headers)
    agent_id = r.json()["id"]
    create = client.post(
        f"/api/v1/agents/{agent_id}/templates",
        headers=auth_headers,
        json={"slug": "t1", "label": "T1", "body": "hello"},
    )
    assert create.status_code == 201
    listed = client.get(f"/api/v1/agents/{agent_id}/templates", headers=auth_headers)
    assert listed.status_code == 200
    assert any(t["slug"] == "t1" for t in listed.json())


def test_invoke_chat_disabled(client: TestClient, auth_headers: dict):
    r = _create_agent(
        client,
        auth_headers,
        capabilities={"chat_enabled": False, "actions_enabled": False},
    )
    agent_id = r.json()["id"]
    client.patch(
        f"/api/v1/agents/{agent_id}",
        headers=auth_headers,
        json={"status": "active"},
    )
    inv = client.post(
        f"/api/v1/agents/{agent_id}/invoke",
        headers=auth_headers,
        json={"input": "hi", "stream": False},
    )
    assert inv.status_code == 422


def test_create_api_kind_requires_bindings(client: TestClient, auth_headers: dict):
    suffix = uuid.uuid4().hex[:8]
    r = client.post(
        "/api/v1/agents",
        headers=auth_headers,
        json={
            "name": f"API Empty {suffix}",
            "slug": f"api-empty-{suffix}",
            "kind": "api",
            "capabilities": {
                "chat_enabled": True,
                "external_apis_enabled": True,
                "actions_enabled": True,
                "templates_enabled": True,
            },
            "api_bindings": {"service_ids": [], "endpoint_ids": []},
        },
    )
    assert r.status_code == 422


def test_create_api_kind_with_bindings(client: TestClient, auth_headers: dict):
    suffix = uuid.uuid4().hex[:8]
    svc = client.post(
        "/api/v1/external-apis",
        headers=auth_headers,
        json={
            "name": f"Bind API {suffix}",
            "slug": f"bind-api-{suffix}",
            "base_url": "https://httpbin.org",
            "auth_type": "none",
        },
    )
    assert svc.status_code == 201
    svc_id = svc.json()["id"]
    ep = client.post(
        f"/api/v1/external-apis/{svc_id}/endpoints",
        headers=auth_headers,
        json={
            "name": "Get",
            "slug": "get",
            "path": "/get",
            "method": "GET",
            "register_as_tool": True,
        },
    )
    assert ep.status_code == 201
    ep_id = ep.json()["id"]

    r = client.post(
        "/api/v1/agents",
        headers=auth_headers,
        json={
            "name": f"API Agent {suffix}",
            "slug": f"api-agent-{suffix}",
            "kind": "api",
            "capabilities": {
                "chat_enabled": True,
                "external_apis_enabled": True,
                "actions_enabled": True,
                "templates_enabled": True,
            },
            "api_bindings": {
                "service_ids": [svc_id],
                "endpoint_ids": [ep_id],
            },
        },
    )
    assert r.status_code == 201
    bindings = r.json()["config_json"]["api_bindings"]
    assert svc_id in bindings["service_ids"]
    assert ep_id in bindings["endpoint_ids"]
