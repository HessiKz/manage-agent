"""Schemas for platform-wide settings (LLM provider toggle)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class CursorProviderConfig(BaseModel):
    base_url: str
    api_key: str = ""
    model: str = "auto"


class LlmProviderRead(BaseModel):
    active: Literal["gateway", "cursor"]
    cursor: CursorProviderConfig


class LlmProviderUpdate(BaseModel):
    active: Literal["gateway", "cursor"]
    cursor_base_url: str | None = Field(default=None)
    cursor_api_key: str | None = Field(default=None)
    cursor_model: str | None = Field(default=None)


class GatewayStatus(BaseModel):
    configured: bool
    base_url: str
    model: str


class CursorStatus(BaseModel):
    base_url: str
    model: str
    reachable: bool
    detail: str | None = None


class LlmProviderHealth(BaseModel):
    active: Literal["gateway", "cursor"]
    gateway: GatewayStatus
    cursor: CursorStatus
