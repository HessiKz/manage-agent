"""Platform APIs: notifications, external APIs, knowledge, conversations."""

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
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_notifications_list_and_count(client: TestClient, auth_headers: dict):
    r = client.get("/api/v1/notifications", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    count = client.get("/api/v1/notifications/count", headers=auth_headers)
    assert count.status_code == 200
    assert "unread" in count.json()


def test_external_apis_crud(client: TestClient, auth_headers: dict):
    suffix = uuid.uuid4().hex[:8]
    create = client.post(
        "/api/v1/external-apis",
        headers=auth_headers,
        json={
            "name": f"Test API {suffix}",
            "slug": f"test-api-{suffix}",
            "base_url": "https://httpbin.org",
            "auth_type": "none",
        },
    )
    assert create.status_code == 201
    svc = create.json()
    assert svc["slug"]

    listed = client.get("/api/v1/external-apis", headers=auth_headers)
    assert listed.status_code == 200
    assert any(s["id"] == svc["id"] for s in listed.json())

    ep = client.post(
        f"/api/v1/external-apis/{svc['id']}/endpoints",
        headers=auth_headers,
        json={"name": "Get IP", "path": "/ip", "method": "GET"},
    )
    assert ep.status_code == 201
    endpoint_id = ep.json()["id"]

    test = client.post(
        f"/api/v1/external-apis/endpoints/{endpoint_id}/test",
        headers=auth_headers,
        json={"params": {}, "body": {}},
    )
    assert test.status_code == 200


def test_knowledge_ingest_and_search(client: TestClient, auth_headers: dict):
    ingest = client.post(
        "/api/v1/knowledge/ingest",
        headers=auth_headers,
        json={"content": "این یک متن تست برای پایگاه دانش سازمانی است."},
    )
    assert ingest.status_code in (200, 201)
    assert "id" in ingest.json()

    search = client.get(
        "/api/v1/knowledge/search",
        headers=auth_headers,
        params={"q": "تست دانش"},
    )
    assert search.status_code == 200
    assert isinstance(search.json(), list)


def test_conversations_list(client: TestClient, auth_headers: dict):
    r = client.get("/api/v1/conversations", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_llm_provider_read_and_update(client: TestClient, auth_headers: dict):
    read = client.get("/api/v1/platform/llm-provider", headers=auth_headers)
    assert read.status_code == 200
    body = read.json()
    assert body["active"] in ("gateway", "cursor")
    assert "cursor" in body
    assert "base_url" in body["cursor"]

    health = client.get("/api/v1/platform/llm-provider/health", headers=auth_headers)
    assert health.status_code == 200
    h = health.json()
    assert "gateway" in h and "cursor" in h
    assert "reachable" in h["cursor"]

    saved = client.put(
        "/api/v1/platform/llm-provider",
        headers=auth_headers,
        json={"active": "gateway"},
    )
    assert saved.status_code == 200
    assert saved.json()["active"] == "gateway"


def test_sidebar_counts(client: TestClient, auth_headers: dict):
    r = client.get("/api/v1/dashboards/sidebar", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "my_agents" in data
    assert "conversations" in data
    assert "unread_notifications" in data
    assert "pending_access_requests" in data
    assert "worker_agents" in data


def test_prompt_templates_and_improve(client: TestClient, auth_headers: dict):
    import os

    t = client.get("/api/v1/prompt-templates", headers=auth_headers)
    assert t.status_code == 200
    assert isinstance(t.json(), list)

    if os.environ.get("SKIP_INVOKE", "1") == "1":
        pytest.skip("SKIP_INVOKE=1 — LLM improve not run in CI/local default")

    r = client.post(
        "/api/v1/prompts/improve",
        headers=auth_headers,
        json={"prompt": "تو دستیار مالی هستی. پاسخ کوتاه بده و دقیق باش.", "locale": "fa"},
    )
    assert r.status_code == 200
    assert "improved_prompt" in r.json()
