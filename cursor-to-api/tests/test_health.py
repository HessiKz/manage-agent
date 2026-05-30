"""Fast smoke tests for cursor-to-api (no agent CLI invoke)."""

from fastapi.testclient import TestClient

from cursor_to_api.main import app

client = TestClient(app)


def test_health():
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_root_lists_endpoints():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["service"] == "cursor-to-api"
