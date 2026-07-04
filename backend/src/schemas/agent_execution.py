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


class AgentExecutionTestStep(BaseModel):
    kind: str
    label: str
    description: str
    action_slug: str | None = None
    prompt: str | None = None


class AgentExecutionGuideStatusRead(BaseModel):
    """Background LLM guide generation progress after agent edits."""

    state: str = Field(
        description="idle | generating | ready | failed",
    )
    source: str | None = Field(
        default=None,
        description="llm | rule | cached when state is ready",
    )


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
    test_steps: list[AgentExecutionTestStep] = Field(default_factory=list)
    guide_source: str = "rule"
