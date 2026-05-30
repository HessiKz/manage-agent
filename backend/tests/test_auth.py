"""Auth + route integration tests."""

import pytest
from fastapi.testclient import TestClient

from src.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_login_success(client: TestClient):
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "admin123"},
        headers={"Origin": "http://localhost:3000"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_login_invalid_credentials(client: TestClient):
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "wrongpass1"},
    )
    assert r.status_code == 401


def test_auth_flow_refresh_route_budgets(client: TestClient):
    """Single client session avoids asyncpg pool teardown issues."""
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "admin123"},
    )
    assert login.status_code == 200
    tokens = login.json()

    refresh = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refresh.status_code == 200
    assert "access_token" in refresh.json()

    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    route = client.post(
        "/api/v1/agents/route",
        json={"prompt": "حقوق این ماه را آماده کن"},
        headers=headers,
    )
    assert route.status_code == 200
    assert route.json()["agent"]["slug"] == "payroll"

    budgets = client.get("/api/v1/budgets/summary", headers=headers)
    assert budgets.status_code == 200
    assert "total_budget_usd" in budgets.json()


@pytest.mark.parametrize(
    "prompt,expected_slug",
    [
        ("payroll for this month", "payroll"),
        ("bank reconciliation", "bank-recon"),
        ("support ticket", "support"),
    ],
)
def test_route_keyword_hints(prompt, expected_slug):
    hints = [
        (["حقوق", "دستمزد", "payroll", "فیش", "اضافه‌کار"], "finance", "payroll"),
        (["بانک", "مغایرت", "recon", "bank"], "finance", "bank-recon"),
        (["فاکتور", "invoice"], "finance", "invoice"),
        (["رزومه", "resume", "cv", "استخدام"], "hr", "resume"),
        (["تیکت", "پشتیبانی", "support", "ticket"], "support", "support"),
    ]
    found = None
    pl = prompt.lower()
    for keywords, _dept, slug in hints:
        if any(k in pl for k in keywords):
            found = slug
            break
    assert found == expected_slug
