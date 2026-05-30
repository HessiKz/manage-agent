"""Conversation list/detail schemas (backed by activity logs + thread memory)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ConversationMessage(BaseModel):
    role: str
    content: str


class ConversationListItem(BaseModel):
    id: str
    agent_id: str
    agent_name: str
    agent_slug: str
    preview: str
    output_preview: str = ""
    status: str
    action: str = "invoke"
    started_at: str | None = None
    thread_id: str | None = None
    message_count: int = 0


class ConversationDetail(BaseModel):
    id: str
    agent_id: str
    agent_name: str
    agent_slug: str
    thread_id: str | None = None
    status: str
    action: str
    started_at: str | None = None
    can_continue: bool = True
    messages: list[ConversationMessage] = Field(default_factory=list)
