"""Integration checks for support platform wizard + widget draft preview."""

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


def test_wizard_create_training_and_draft_dashboard(client: TestClient, auth_headers: dict):
    suffix = uuid.uuid4().hex[:8]
    name = f"ایجنت تست پشتیبان {suffix}"

    create = client.post(
        "/api/v1/agents",
        headers=auth_headers,
        json={
            "name": name,
            "description": "تست ویزارد از API",
            "department": "ops",
            "kind": "chat",
            "capabilities": {"chat_enabled": True},
            "config_json": {
                "widget_plan": {
                    "stat_cards": {"enabled": True, "count": 4},
                    "line_chart": {"enabled": True},
                    "pie_chart": {"enabled": False},
                    "review_table": {"enabled": False},
                    "hr_savings": {"enabled": True},
                }
            },
        },
    )
    assert create.status_code == 201, create.text
    agent = create.json()
    agent_id = agent["id"]
    assert agent["status"] == "deploying"

    start = client.post(f"/api/v1/agents/{agent_id}/training/start", headers=auth_headers)
    assert start.status_code == 200, start.text
    validation = start.json().get("config_json", {}).get("validation", {})
    assert validation.get("state") == "training"

    complete = client.post(
        f"/api/v1/agents/{agent_id}/training/complete",
        headers=auth_headers,
        json={
            "messages": [
                {"role": "user", "content": "فرمت: پاسخ کوتاه با bullet"},
                {"role": "assistant", "content": "- مورد اول\n- مورد دوم"},
            ],
            "notes": "bullet list",
        },
    )
    assert complete.status_code == 200, complete.text

    detail = client.get(f"/api/v1/agents/{agent_id}", headers=auth_headers)
    assert detail.status_code == 200
    v2 = detail.json().get("config_json", {}).get("validation", {})
    assert v2.get("state") == "dashboard_review"

    dash = client.get(
        f"/api/v1/agents/{agent_id}/dashboard",
        headers=auth_headers,
        params={"draft": True},
    )
    assert dash.status_code == 200, dash.text
    body = dash.json()
    assert body.get("hasPendingDraft") is True
    assert body.get("isDraftPreview") is True
    assert body.get("draftUnavailable") is False
    assert len(body.get("stat_cards") or body.get("statCards") or []) >= 1


def test_generate_widget_draft_returns_data(client: TestClient, auth_headers: dict):
    suffix = uuid.uuid4().hex[:8]
    create = client.post(
        "/api/v1/agents",
        headers=auth_headers,
        json={
            "name": f"ویجت تست {suffix}",
            "department": "finance",
            "kind": "chat",
            "capabilities": {"chat_enabled": True},
        },
    )
    assert create.status_code == 201
    agent_id = create.json()["id"]

    gen = client.post(
        f"/api/v1/agents/{agent_id}/dashboard/generate",
        headers=auth_headers,
        json={"widget_type": "pie_chart", "merge_with_existing": True},
    )
    assert gen.status_code == 200, gen.text

    dash = client.get(
        f"/api/v1/agents/{agent_id}/dashboard",
        headers=auth_headers,
        params={"draft": True},
    )
    assert dash.status_code == 200
    body = dash.json()
    assert body.get("isDraftPreview") is True
    assert body.get("pie_chart") is not None or len(body.get("stat_cards") or []) >= 1
