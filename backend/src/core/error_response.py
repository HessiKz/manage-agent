"""Build standardized JSON error responses."""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse

from src.core.errors import STATUS_MESSAGE_FA, STATUS_TO_CODE, ErrorCode
from src.schemas.errors import ApiErrorBody, FieldError


def get_request_id(request: Request | None) -> str | None:
    if request is None:
        return None
    return getattr(request.state, "request_id", None) or request.headers.get("x-request-id")


def user_message(
    status_code: int,
    detail: str | None = None,
    *,
    prefer_detail: bool = True,
) -> str:
    """Pick Persian message: use detail if it looks user-facing, else status default."""
    if detail and prefer_detail and _looks_user_facing(detail):
        return detail
    return STATUS_MESSAGE_FA.get(status_code, STATUS_MESSAGE_FA[500])


def _looks_user_facing(text: str) -> bool:
    """Heuristic: Persian text or known LLM messages are shown to users."""
    if any("\u0600" <= c <= "\u06FF" for c in text):
        return True
    lowered = text.lower()
    return any(
        k in lowered
        for k in (
            "llm",
            "gapgpt",
            "orchestr",
            "agent",
            "file",
            "upload",
            "permission",
            "disabled",
            "not found",
            "rate limit",
        )
    )


def error_response(
    *,
    status_code: int,
    message: str,
    code: ErrorCode | str | None = None,
    request: Request | None = None,
    details: Any = None,
    errors: list[FieldError] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    resolved_code = code or STATUS_TO_CODE.get(status_code, ErrorCode.INTERNAL_ERROR)
    if isinstance(resolved_code, ErrorCode):
        resolved_code = resolved_code.value

    body = ApiErrorBody(
        code=resolved_code,
        message=message,
        request_id=get_request_id(request),
        details=details,
        errors=errors,
    )
    hdrs = dict(headers or {})
    req_id = body.request_id
    if req_id:
        hdrs.setdefault("x-request-id", req_id)
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(exclude_none=True),
        headers=hdrs,
    )
