"""Prompt-related schemas."""

from pydantic import BaseModel, Field


class PromptImproveRequest(BaseModel):
    template: str | None = None
    prompt: str = Field(..., min_length=10)
    locale: str = "fa"


class PromptImproveResponse(BaseModel):
    improved_prompt: str


class PromptSuggestRequest(BaseModel):
    name: str = Field(..., min_length=2)
    description: str | None = None
    department: str | None = None
    kind: str = "chat"
    tool_names: list[str] = Field(default_factory=list)
    capabilities: dict[str, bool] | None = None
    existing_prompt: str | None = None
    instruction_files: list[str] = Field(default_factory=list)
    locale: str = "fa"


class PromptSuggestResponse(BaseModel):
    suggested_prompt: str


class PromptTemplateRead(BaseModel):
    name: str
    description: str
    system_prompt: str
