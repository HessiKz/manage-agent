"""FastAPI exception handlers — uniform JSON errors + structured logging."""

from __future__ import annotations

import traceback
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.config import settings
from src.core.error_response import error_response, get_request_id, user_message, looks_user_facing
from src.core.errors import STATUS_MESSAGE_FA, AppError, ErrorCode, STATUS_TO_CODE
from src.logger import get_logger, log_exception
from src.schemas.errors import FieldError

log = get_logger("errors")


def _http_detail_to_message(status: int, detail: Any) -> str:
    if detail is None:
        return user_message(status, None, prefer_detail=False)
    if isinstance(detail, str):
        return user_message(status, detail)
    if isinstance(detail, list):
        parts = []
        for item in detail:
            if isinstance(item, dict):
                msg = item.get("msg", item.get("message", ""))
                loc = item.get("loc", ())
                if loc:
                    parts.append(f"{'.'.join(str(x) for x in loc)}: {msg}")
                else:
                    parts.append(str(msg))
            else:
                parts.append(str(item))
        return user_message(status, "; ".join(parts) if parts else None)
    if isinstance(detail, dict):
        return user_message(status, detail.get("message") or str(detail))
    return user_message(status, str(detail))


def _code_from_http(status: int, detail: Any) -> ErrorCode:
    if isinstance(detail, dict) and detail.get("code"):
        try:
            return ErrorCode(str(detail["code"]))
        except ValueError:
            pass
    text = str(detail).lower() if detail else ""
    if status == 503 and "llm" in text:
        return ErrorCode.LLM_UNAVAILABLE
    return STATUS_TO_CODE.get(status, ErrorCode.INTERNAL_ERROR)


async def app_error_handler(request: Request, exc: AppError) -> Any:
    log_fn = getattr(log, exc.log_level, log.warning)
    log_fn(
        "app.error",
        code=exc.code.value,
        status=exc.status_code,
        message=exc.message,
        path=request.url.path,
        request_id=get_request_id(request),
        details=exc.details,
    )
    return error_response(
        status_code=exc.status_code,
        message=exc.message,
        code=exc.code,
        request=request,
        details=exc.details,
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> Any:
    message = _http_detail_to_message(exc.status_code, exc.detail)
    code = _code_from_http(exc.status_code, exc.detail)
    level = "warning" if exc.status_code < 500 else "error"
    getattr(log, level)(
        "http.exception",
        status=exc.status_code,
        code=code.value,
        message=message,
        path=request.url.path,
        request_id=get_request_id(request),
    )
    headers = dict(exc.headers) if exc.headers else None
    return error_response(
        status_code=exc.status_code,
        message=message,
        code=code,
        request=request,
        headers=headers,
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> Any:
    field_errors: list[FieldError] = []
    for err in exc.errors():
        loc = err.get("loc", ())
        field = ".".join(str(p) for p in loc if p not in ("body", "query", "path"))
        field_errors.append(
            FieldError(
                field=field or "request",
                message=err.get("msg", "invalid"),
                code=err.get("type"),
            )
        )
    log.warning(
        "validation.error",
        path=request.url.path,
        request_id=get_request_id(request),
        error_count=len(field_errors),
    )
    return error_response(
        status_code=422,
        message="ورودی ارسالی معتبر نیست. فیلدهای مشخص‌شده را اصلاح کنید.",
        code=ErrorCode.VALIDATION_ERROR,
        request=request,
        errors=field_errors,
    )


async def file_not_found_handler(request: Request, exc: FileNotFoundError) -> Any:
    message = str(exc) or STATUS_MESSAGE_FA[404]
    if looks_user_facing(message):
        status = 422
        code = ErrorCode.UNPROCESSABLE
        level = "warning"
    else:
        status = 404
        code = ErrorCode.NOT_FOUND
        level = "info"
    getattr(log, level)(
        "client.file_error",
        status=status,
        code=code.value,
        message=message,
        path=request.url.path,
        request_id=get_request_id(request),
    )
    return error_response(
        status_code=status,
        message=message,
        code=code,
        request=request,
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> Any:
    log_exception(
        log,
        exc,
        event="unhandled.exception",
        path=request.url.path,
        method=request.method,
        request_id=get_request_id(request),
    )
    if settings.app_debug:
        details = {
            "type": type(exc).__name__,
            "traceback": traceback.format_exc().splitlines()[-8:],
        }
    else:
        details = None
    return error_response(
        status_code=500,
        message=STATUS_MESSAGE_FA[500],
        code=ErrorCode.INTERNAL_ERROR,
        request=request,
        details=details,
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(FileNotFoundError, file_not_found_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
