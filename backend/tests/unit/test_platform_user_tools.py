"""Platform support tools — user management API."""

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


def test_admin_can_create_user(client: TestClient, auth_headers: dict):
    suffix = uuid.uuid4().hex[:8]
    email = f"demo.user.{suffix}@example.com"
    password = "TestPass123!"
    res = client.post(
        "/api/v1/users",
        headers=auth_headers,
        json={
            "email": email,
            "full_name": f"کاربر تست {suffix}",
            "password": password,
            "department": "ops",
            "role_name": "support_agent",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["email"] == email
    assert any(r["name"] == "support_agent" for r in body.get("roles", []))

    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200, login.text

    dup = client.post(
        "/api/v1/users",
        headers=auth_headers,
        json={"email": email, "full_name": "تکراری", "password": password},
    )
    assert dup.status_code == 409
