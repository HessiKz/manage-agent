"""Standard API error response schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class FieldError(BaseModel):
    field: str
    message: str
    code: str | None = None


class ApiErrorBody(BaseModel):
    """Uniform JSON body for all API errors."""

    error: bool = True
    code: str
    message: str
    request_id: str | None = None
    details: Any = None
    errors: list[FieldError] | None = None
