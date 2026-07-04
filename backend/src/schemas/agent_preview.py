"""Schemas for wizard preview invoke (no DB agent row)."""

from __future__ import annotations

from pydantic import BaseModel, Field

from src.schemas.agent import AgentInvokeResponse


class AgentPreviewInvokeRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    description: str | None = None
    department: str | None = None
    kind: str = "chat"
    system_prompt: str = Field(..., min_length=8)
    model_name: str | None = None
    temperature: float | None = Field(default=0.2, ge=0, le=2)
    capabilities: dict | None = None
    file_policy: dict | None = None
    agent_link_policy: dict | None = None
    tool_names: list[str] | None = None
    knowledge_bindings: dict | None = None
    api_bindings: dict | None = None
    config_json: dict | None = None
    input: str = Field(..., min_length=1)
    inline_file_context: str | None = Field(
        default=None,
        description="Optional extracted text from staged wizard files for preview context.",
    )


class AgentPreviewInvokeResponse(AgentInvokeResponse):
    preview: bool = True
