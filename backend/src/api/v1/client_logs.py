"""Ingest client-side logs from the web app."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from src.core.error_response import get_request_id
from src.logger import get_logger

router = APIRouter()
log = get_logger("client")


class ClientLogEntry(BaseModel):
    level: Literal["debug", "info", "warn", "error"]
    message: str = Field(..., max_length=2000)
    event: str | None = Field(default=None, max_length=120)
    url: str | None = Field(default=None, max_length=500)
    stack: str | None = Field(default=None, max_length=8000)
    context: dict[str, Any] | None = None


class ClientLogBatch(BaseModel):
    entries: list[ClientLogEntry] = Field(..., min_length=1, max_length=20)


@router.post("/client", status_code=204)
async def ingest_client_logs(payload: ClientLogBatch, request: Request) -> None:
    """Accept batched browser logs (no auth — rate-limited at middleware)."""
    req_id = get_request_id(request)
    for entry in payload.entries:
        data: dict[str, Any] = {
            "source": "browser",
            "client_event": entry.event,
            "url": entry.url,
            "request_id": req_id,
        }
        if entry.context:
            data["context"] = entry.context
        if entry.stack:
            data["stack"] = entry.stack[:4000]
        log_fn = {
            "debug": log.debug,
            "info": log.info,
            "warn": log.warning,
            "error": log.error,
        }[entry.level]
        log_fn("client.log", message=entry.message[:2000], **data)
