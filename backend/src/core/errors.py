"""Application error types and Persian user-facing messages."""

from __future__ import annotations

from enum import StrEnum
from typing import Any


class ErrorCode(StrEnum):
    """Stable machine-readable error codes for clients."""

    VALIDATION_ERROR = "VALIDATION_ERROR"
    AUTHENTICATION_REQUIRED = "AUTHENTICATION_REQUIRED"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    NOT_FOUND = "NOT_FOUND"
    CONFLICT = "CONFLICT"
    RATE_LIMITED = "RATE_LIMITED"
    BAD_REQUEST = "BAD_REQUEST"
    UNPROCESSABLE = "UNPROCESSABLE"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    ORCHESTRATION_FAILED = "ORCHESTRATION_FAILED"
    LLM_UNAVAILABLE = "LLM_UNAVAILABLE"
    FILE_POLICY_VIOLATION = "FILE_POLICY_VIOLATION"


# HTTP status → default Persian message (when detail is generic English)
STATUS_MESSAGE_FA: dict[int, str] = {
    400: "درخواست نامعتبر است.",
    401: "برای ادامه باید وارد شوید.",
    403: "دسترسی به این بخش مجاز نیست.",
    404: "مورد درخواستی یافت نشد.",
    409: "تداخل داده — این مورد از قبل وجود دارد.",
    422: "ورودی ارسالی معتبر نیست.",
    429: "تعداد درخواست‌ها بیش از حد مجاز است. کمی صبر کنید.",
    500: "خطای داخلی سرور. لطفاً دوباره تلاش کنید.",
    503: "سرویس موقتاً در دسترس نیست.",
}

# HTTP status → error code
STATUS_TO_CODE: dict[int, ErrorCode] = {
    400: ErrorCode.BAD_REQUEST,
    401: ErrorCode.AUTHENTICATION_REQUIRED,
    403: ErrorCode.PERMISSION_DENIED,
    404: ErrorCode.NOT_FOUND,
    409: ErrorCode.CONFLICT,
    422: ErrorCode.VALIDATION_ERROR,
    429: ErrorCode.RATE_LIMITED,
    500: ErrorCode.INTERNAL_ERROR,
    503: ErrorCode.SERVICE_UNAVAILABLE,
}


class AppError(Exception):
    """Raise from services for consistent API + log handling."""

    def __init__(
        self,
        message: str,
        *,
        code: ErrorCode = ErrorCode.BAD_REQUEST,
        status_code: int = 400,
        details: Any = None,
        log_level: str = "warning",
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details
        self.log_level = log_level


class NotFoundError(AppError):
    def __init__(self, message: str = "مورد درخواستی یافت نشد.", **kwargs: Any) -> None:
        super().__init__(
            message,
            code=ErrorCode.NOT_FOUND,
            status_code=404,
            log_level="info",
            **kwargs,
        )


class ConflictError(AppError):
    def __init__(self, message: str = "این مورد از قبل وجود دارد.", **kwargs: Any) -> None:
        super().__init__(message, code=ErrorCode.CONFLICT, status_code=409, **kwargs)


class ValidationAppError(AppError):
    def __init__(self, message: str = "ورودی معتبر نیست.", *, details: Any = None) -> None:
        super().__init__(
            message,
            code=ErrorCode.VALIDATION_ERROR,
            status_code=422,
            details=details,
        )


class ServiceUnavailableError(AppError):
    def __init__(self, message: str, *, code: ErrorCode = ErrorCode.SERVICE_UNAVAILABLE) -> None:
        super().__init__(
            message,
            code=code,
            status_code=503,
            log_level="warning",
        )


class LlmUnavailableError(ServiceUnavailableError):
    def __init__(
        self,
        message: str = (
            "سرویس LLM در دسترس نیست. اتصال به ارائه‌دهنده مدل را بررسی کنید "
            "(OPENAI_API_KEY و OPENAI_BASE_URL)."
        ),
    ) -> None:
        super().__init__(message, code=ErrorCode.LLM_UNAVAILABLE)
