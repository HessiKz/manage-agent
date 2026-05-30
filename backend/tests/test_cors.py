"""CORS preflight tests."""

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)

ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]


def test_cors_preflight_login_allowed_origins():
    for origin in ORIGINS:
        r = client.options(
            "/api/v1/auth/login",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,authorization",
            },
        )
        assert r.status_code == 200, f"Failed for {origin}: {r.status_code}"
        assert r.headers.get("access-control-allow-origin") == origin


def test_cors_preflight_rejects_unknown_origin():
    r = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://evil.example.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert r.status_code == 400
