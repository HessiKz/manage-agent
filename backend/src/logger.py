"""Structured logging setup (structlog + optional file sink)."""

from __future__ import annotations

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

import structlog

from src.config import settings


def configure_logging() -> None:
    """Set up structlog + stdlib logging."""

    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)

    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]

    if settings.log_file:
        log_path = Path(settings.log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            log_path,
            maxBytes=settings.log_file_max_bytes,
            backupCount=settings.log_file_backup_count,
            encoding="utf-8",
        )
        file_handler.setLevel(log_level)
        handlers.append(file_handler)

    logging.basicConfig(
        format="%(message)s",
        level=log_level,
        force=True,
        handlers=handlers,
    )

    processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]

    use_json = settings.log_json or settings.app_env not in ("development", "test")
    if use_json:
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer(colors=True))

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None):
    """Return a configured structlog logger."""
    return structlog.get_logger(name or "app")


def bind_request_context(
    *,
    request_id: str,
    method: str | None = None,
    path: str | None = None,
    user_id: str | None = None,
) -> None:
    """Attach per-request fields to all log lines until cleared."""
    structlog.contextvars.clear_contextvars()
    ctx: dict[str, str] = {"request_id": request_id}
    if method:
        ctx["method"] = method
    if path:
        ctx["path"] = path
    if user_id:
        ctx["user_id"] = user_id
    structlog.contextvars.bind_contextvars(**ctx)


def clear_request_context() -> None:
    structlog.contextvars.clear_contextvars()


def log_exception(logger: Any, exc: BaseException, *, event: str = "exception", **kwargs: Any) -> None:
    """Log exception with traceback at error level."""
    logger.error(
        event,
        exc_type=type(exc).__name__,
        exc_message=str(exc),
        **kwargs,
        exc_info=exc,
    )
