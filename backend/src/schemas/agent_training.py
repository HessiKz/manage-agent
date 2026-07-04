"""Interactive admin training during wizard publish."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class TrainingMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class TrainingCompleteRequest(BaseModel):
    messages: list[TrainingMessage] = Field(min_length=1)
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def drop_empty_messages(self) -> TrainingCompleteRequest:
        cleaned = [m for m in self.messages if m.content.strip()]
        if not cleaned:
            raise ValueError("At least one non-empty training message is required")
        self.messages = cleaned
        return self


class TrainingCompleteResponse(BaseModel):
    agent_id: str
    training_saved: bool
    validation_scheduled: bool
