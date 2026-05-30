"""Very small in-memory rate limiter (per IP, per minute).

Good enough for dev / single-instance deployments. Swap for Redis-based
sliding-window limiter in production.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from src.config import settings
from src.core.error_response import error_response
from src.core.errors import ErrorCode

WINDOW_SECONDS = 60


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, limit: int | None = None) -> None:
        super().__init__(app)
        self.limit = limit or settings.rate_limit_per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        # Never rate-limit CORS preflight
        if request.method == "OPTIONS":
            return await call_next(request)

        # Skip health / docs
        path = request.url.path
        if path in {"/", "/health", "/docs", "/redoc"} or path.startswith("/api/v1/openapi"):
            return await call_next(request)

        ip = request.client.host if request.client else "anonymous"
        now = time.time()
        bucket = self._hits[ip]
        cutoff = now - WINDOW_SECONDS
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= self.limit:
            retry_after = int(WINDOW_SECONDS - (now - bucket[0])) + 1
            return error_response(
                status_code=429,
                message="تعداد درخواست‌ها بیش از حد مجاز است. لطفاً چند ثانیه صبر کنید.",
                code=ErrorCode.RATE_LIMITED,
                request=request,
                details={"retry_after": retry_after},
                headers={"Retry-After": str(retry_after)},
            )
        bucket.append(now)
        response: Response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.limit)
        response.headers["X-RateLimit-Remaining"] = str(self.limit - len(bucket))
        return response
