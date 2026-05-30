"""API error envelope and exception handlers."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from src.core.exception_handlers import register_exception_handlers
from src.core.errors import AppError, ErrorCode, NotFoundError


def _client() -> TestClient:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/not-found")
    def not_found():
        raise NotFoundError("ایجنت یافت نشد")

    @app.get("/http-401")
    def http_401():
        raise HTTPException(status_code=401, detail="Could not validate credentials")

    @app.get("/app-error")
    def app_err():
        raise AppError("دسترسی غیرمجاز", code=ErrorCode.PERMISSION_DENIED, status_code=403)

    @app.get("/boom")
    def boom():
        raise RuntimeError("secret internal")

    return TestClient(app, raise_server_exceptions=False)


def test_not_found_envelope():
    r = _client().get("/not-found")
    assert r.status_code == 404
    body = r.json()
    assert body["error"] is True
    assert body["code"] == "NOT_FOUND"
    assert "یافت" in body["message"]


def test_validation_envelope():
    from src.config import settings
    from src.main import app

    client = TestClient(app, raise_server_exceptions=False)
    r = client.post(f"{settings.api_v1_prefix}/auth/login", json={})
    assert r.status_code == 422
    body = r.json()
    assert body["error"] is True
    assert body["code"] == "VALIDATION_ERROR"
    assert body.get("errors")


def test_internal_error_hides_trace_in_production(monkeypatch):
    from src.config import settings

    monkeypatch.setattr(settings, "app_debug", False)
    r = _client().get("/boom")
    assert r.status_code == 500
    body = r.json()
    assert body["code"] == "INTERNAL_ERROR"
    assert "secret" not in body["message"]
    assert body.get("details") is None


def test_app_error_envelope():
    r = _client().get("/app-error")
    assert r.status_code == 403
    assert r.json()["code"] == "PERMISSION_DENIED"
