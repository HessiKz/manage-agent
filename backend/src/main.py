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
    """Startup / shutdown hooks."""
    log.info("app.startup", env=settings.app_env, debug=settings.app_debug)
    from src.core.storage_dirs import ensure_storage_dirs

    ensure_storage_dirs()
    try:
        from src.database.session import async_session_maker
        from src.agents_lib.dynamic_tools import DynamicToolLoader

        async with async_session_maker() as db:
            n = await DynamicToolLoader.register_all(db)
            log.info("tools.registered", count=n)
    except Exception as exc:
        log.warning("tools.register_failed", error=str(exc))

    try:
        from src.database.session import async_session_maker
        from src.services.platform_settings_service import PlatformSettingsService

        async with async_session_maker() as db:
            state = await PlatformSettingsService(db).load_llm_provider_into_cache()
            log.info("llm_provider.loaded", active=state.get("active"))
    except Exception as exc:
        log.warning("llm_provider.load_failed", error=str(exc))
    yield
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
    else:
        cors_kwargs["allow_origins"] = settings.cors_origins_list

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
