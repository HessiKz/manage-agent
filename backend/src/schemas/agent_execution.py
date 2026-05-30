"""Agent execution tab — documentation + run context."""

from __future__ import annotations

from pydantic import BaseModel, Field


class AgentExecutionActionRef(BaseModel):
    slug: str
    label: str
    description: str | None = None


class AgentExecutionTemplateRef(BaseModel):
    slug: str
    label: str
    body: str


class AgentExecutionRead(BaseModel):
    profile: str
    domain_label: str
    headline: str
    summary: str
    responsibilities: list[str]
    how_to_steps: list[str]
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)
    tips: list[str] = Field(default_factory=list)
    actions: list[AgentExecutionActionRef] = Field(default_factory=list)
    templates: list[AgentExecutionTemplateRef] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
