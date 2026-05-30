"""Structured request-logging middleware with request context binding."""

from __future__ import annotations

import time
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from src.logger import bind_request_context, clear_request_context, get_logger

log = get_logger("http")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        req_id = request.headers.get("x-request-id") or uuid4().hex[:12]
        request.state.request_id = req_id
        bind_request_context(
            request_id=req_id,
            method=request.method,
            path=request.url.path,
        )
        start = time.perf_counter()
        try:
            response: Response = await call_next(request)
        except Exception as exc:
            duration_ms = int((time.perf_counter() - start) * 1000)
            log.error(
                "http.unhandled",
                status=500,
                duration_ms=duration_ms,
                error_type=type(exc).__name__,
                error=str(exc)[:500],
            )
            raise
        finally:
            clear_request_context()

        duration_ms = int((time.perf_counter() - start) * 1000)
        status = response.status_code
        if status >= 500:
            log.error("http.server_error", status=status, duration_ms=duration_ms)
        elif status >= 400:
            log.warning("http.client_error", status=status, duration_ms=duration_ms)
        else:
            log.info("http.request", status=status, duration_ms=duration_ms)

        response.headers["x-request-id"] = req_id
        return response
