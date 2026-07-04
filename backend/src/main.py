"""
FastAPI application entry point.

Run locally:
    uvicorn src.main:app --reload

In Docker:
    handled by docker-compose `command:`.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.config import settings
from src.core.exception_handlers import register_exception_handlers
from src.logger import configure_logging, get_logger
from src.middleware.rate_limit import RateLimitMiddleware
from src.middleware.request_logging import RequestLoggingMiddleware

configure_logging()
log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown hooks — /health must respond before deferred init finishes."""
    import asyncio
    from contextlib import suppress

    from src.core.app_startup import schedule_deferred_startup
    from src.core.storage_dirs import ensure_storage_dirs

    log.info("app.startup", env=settings.app_env, debug=settings.app_debug)
    ensure_storage_dirs()
    deferred = schedule_deferred_startup()
    yield
    deferred.cancel()
    with suppress(asyncio.CancelledError):
        await deferred
    log.info("app.shutdown")


def create_app() -> FastAPI:
    """Application factory."""
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        debug=settings.app_debug,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url=f"{settings.api_v1_prefix}/openapi.json",
        lifespan=lifespan,
    )

    # Middleware — CORS must be outermost (added last) so preflight succeeds
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(RateLimitMiddleware)

    cors_kwargs: dict = {
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
        "expose_headers": ["x-request-id", "x-ratelimit-limit", "x-ratelimit-remaining"],
    }
    if settings.app_env == "development":
        # Allow localhost / 127.0.0.1 / [::1] on any dev port (Next.js may use 3001+)
        cors_kwargs["allow_origin_regex"] = (
            r"https?://("
            r"localhost"
            r"|127\.0\.0\.1"
            r"|\[::1\]"
            r")(:\d+)?"
        )
        extras = settings.cors_origins_list
        if extras:
            cors_kwargs["allow_origins"] = extras
    else:
        origins = list(settings.cors_origins_list)
        cors_kwargs["allow_origins"] = origins
        regex_parts: list[str] = []
        if settings.cors_allow_vercel_previews:
            regex_parts.append(r"https://([a-z0-9-]+\.)*vercel\.app")
        if settings.cors_allow_railway_domains:
            regex_parts.append(r"https://([a-z0-9-]+\.)*up\.railway\.app")
        if regex_parts:
            cors_kwargs["allow_origin_regex"] = "|".join(regex_parts)

    app.add_middleware(CORSMiddleware, **cors_kwargs)

    # Root
    @app.get("/", tags=["meta"])
    async def root() -> dict:
        return {
            "name": settings.app_name,
            "version": "0.1.0",
            "env": settings.app_env,
            "docs": "/docs",
        }

    @app.get("/health", tags=["meta"])
    async def health() -> JSONResponse:
        return JSONResponse({"status": "ok"})

    # API v1
    from src.api.v1.router import api_router

    app.include_router(api_router, prefix=settings.api_v1_prefix)

    register_exception_handlers(app)

    return app


app = create_app()
