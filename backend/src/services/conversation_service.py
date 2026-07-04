"""Load and resume conversations from activity logs + thread memory."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.agents_lib.memory import ConversationMemory
from src.core.chat_sanitize import sanitize_chat_output
from src.core.conversation_preview import (
    action_label_from_log_action,
    humanize_output_preview,
    humanize_user_message,
)
from src.models.activity_log import ActivityLog
from src.models.agent import Agent
from src.models.user import User
from src.schemas.conversation import (
    ConversationDetail,
    ConversationListItem,
    ConversationMessage,
    SupportThreadListItem,
)

SUPPORT_AGENT_SLUG = "support"


def thread_owned_by_user(user: User, agent_id: UUID, thread_id: str) -> bool:
    prefix = f"user-{user.id}:agent-{agent_id}"
    return thread_id == prefix or thread_id.startswith(f"{prefix}:session-")


def _action_filter():
    return or_(
        ActivityLog.action == "invoke",
        ActivityLog.action.like("action:%"),
    )


class ConversationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_user(self, user: User, *, limit: int = 30) -> list[ConversationListItem]:
        stmt = (
            select(
                ActivityLog.id,
                ActivityLog.agent_id,
                ActivityLog.input_text,
                ActivityLog.output_text,
                ActivityLog.started_at,
                ActivityLog.status,
                ActivityLog.action,
                ActivityLog.details,
                Agent.name.label("agent_name"),
                Agent.slug.label("agent_slug"),
            )
            .join(Agent, Agent.id == ActivityLog.agent_id)
            .where(
                ActivityLog.user_id == user.id,
                _action_filter(),
                ActivityLog.input_text.isnot(None),
                Agent.slug != SUPPORT_AGENT_SLUG,
            )
            .order_by(ActivityLog.started_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        items: list[ConversationListItem] = []
        for row in result.all():
            details = row.details or {}
            thread_id = details.get("thread_id")
            if not thread_id:
                thread_id = f"user-{user.id}:agent-{row.agent_id}"
            msg_count = len(ConversationMemory.history(thread_id)) if thread_id else (
                2 if row.output_text else 1
            )
            preview = humanize_user_message(row.input_text)
            if not preview and row.action.startswith("action:"):
                slug = action_label_from_log_action(row.action) or row.action
                preview = f"اقدام: {slug.replace('_', ' ')}"

            items.append(
                ConversationListItem(
                    id=str(row.id),
                    agent_id=str(row.agent_id),
                    agent_name=row.agent_name,
                    agent_slug=row.agent_slug,
                    preview=preview,
                    output_preview=humanize_output_preview(row.output_text),
                    status=row.status.value if hasattr(row.status, "value") else str(row.status),
                    action=row.action,
                    started_at=row.started_at.isoformat() if row.started_at else None,
                    thread_id=thread_id,
                    message_count=msg_count,
                )
            )
        return items

    async def get_for_user(self, conversation_id: UUID, user: User) -> ConversationDetail:
        stmt = (
            select(ActivityLog, Agent.name, Agent.slug, Agent.capabilities)
            .join(Agent, Agent.id == ActivityLog.agent_id)
            .where(ActivityLog.id == conversation_id, ActivityLog.user_id == user.id)
        )
        result = await self.db.execute(stmt)
        row = result.one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Conversation not found")

        log: ActivityLog = row[0]
        agent_name: str = row[1]
        agent_slug: str = row[2]
        capabilities = row[3] or {}

        details = log.details or {}
        thread_id = details.get("thread_id")
        if not thread_id and log.user_id:
            thread_id = f"user-{log.user_id}:agent-{log.agent_id}"
        messages = self._resolve_messages(log, thread_id)

        chat_enabled = capabilities.get("chat_enabled", True)
        can_continue = bool(chat_enabled)

        return ConversationDetail(
            id=str(log.id),
            agent_id=str(log.agent_id),
            agent_name=agent_name,
            agent_slug=agent_slug,
            thread_id=thread_id,
            status=log.status.value if hasattr(log.status, "value") else str(log.status),
            action=log.action,
            started_at=log.started_at.isoformat() if log.started_at else None,
            can_continue=can_continue,
            messages=messages,
        )

    def _resolve_messages(
        self, log: ActivityLog, thread_id: str | None
    ) -> list[ConversationMessage]:
        raw: list[dict] = []
        if thread_id:
            raw = ConversationMemory.history(thread_id)

        if not raw and log.input_text:
            user_line = humanize_user_message(log.input_text, max_len=8000) or log.input_text
            raw = [{"role": "user", "content": user_line}]
            if log.output_text:
                raw.append({"role": "assistant", "content": log.output_text})

        out: list[ConversationMessage] = []
        for msg in raw:
            role = msg.get("role", "user")
            content = str(msg.get("content", ""))
            if role == "assistant":
                content = sanitize_chat_output(content)
            elif role == "user":
                original = content
                cleaned = humanize_user_message(content, max_len=8000)
                if cleaned:
                    content = cleaned
                elif original.strip():
                    # Keep raw user text when sanitizer strips tool scaffolding entirely
                    content = original.strip()[:8000]
            if content.strip():
                out.append(ConversationMessage(role=role, content=content))

        if not out and log.input_text:
            preview = humanize_user_message(log.input_text, max_len=8000) or log.input_text.strip()
            if preview:
                out.append(ConversationMessage(role="user", content=preview[:8000]))
            if log.output_text:
                out.append(
                    ConversationMessage(
                        role="assistant",
                        content=sanitize_chat_output(log.output_text),
                    )
                )
        return out

    def messages_from_thread(self, thread_id: str) -> list[ConversationMessage]:
        raw = ConversationMemory.history(thread_id)
        out: list[ConversationMessage] = []
        for msg in raw:
            role = msg.get("role", "user")
            content = str(msg.get("content", ""))
            if role == "assistant":
                content = sanitize_chat_output(content)
            elif role == "user":
                cleaned = humanize_user_message(content, max_len=8000)
                content = cleaned or content.strip()[:8000]
            if content.strip():
                out.append(ConversationMessage(role=role, content=content))
        return out

    async def get_thread_messages_for_user(
        self, user: User, agent_id: UUID, thread_id: str
    ) -> list[ConversationMessage]:
        if not thread_owned_by_user(user, agent_id, thread_id):
            raise HTTPException(status_code=403, detail="Invalid thread for user")

        agent = await self.db.get(Agent, agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        return self.messages_from_thread(thread_id)

    async def list_support_threads(
        self, user: User, agent_id: UUID, *, limit: int = 40
    ) -> list[SupportThreadListItem]:
        agent = await self.db.get(Agent, agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        if agent.slug != SUPPORT_AGENT_SLUG:
            raise HTTPException(status_code=400, detail="Not a support agent")

        stmt = (
            select(
                ActivityLog.details,
                ActivityLog.input_text,
                ActivityLog.started_at,
            )
            .where(
                ActivityLog.user_id == user.id,
                ActivityLog.agent_id == agent_id,
                ActivityLog.action == "invoke",
            )
            .order_by(ActivityLog.started_at.desc())
            .limit(limit * 4)
        )
        result = await self.db.execute(stmt)
        by_thread: dict[str, SupportThreadListItem] = {}
        prefix = f"user-{user.id}:agent-{agent_id}"

        for details, input_text, started_at in result.all():
            tid = (details or {}).get("thread_id") or prefix
            if not thread_owned_by_user(user, agent_id, tid):
                continue
            iso = started_at.isoformat() if started_at else None
            preview = humanize_user_message(input_text, max_len=120) or "گفتگوی پشتیبانی"
            msg_count = len(ConversationMemory.history(tid)) if tid else 0
            existing = by_thread.get(tid)
            if existing:
                if iso and (not existing.updated_at or iso > existing.updated_at):
                    existing.updated_at = iso
                existing.message_count = max(existing.message_count, msg_count)
                continue
            by_thread[tid] = SupportThreadListItem(
                thread_id=tid,
                preview=preview,
                started_at=iso,
                updated_at=iso,
                message_count=msg_count,
            )
            if len(by_thread) >= limit:
                break

        return sorted(
            by_thread.values(),
            key=lambda t: t.updated_at or t.started_at or "",
            reverse=True,
        )
