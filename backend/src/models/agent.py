"""Agent ORM model — represents a configured AI agent."""

from __future__ import annotations

import enum
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ARRAY, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database.base import Base, TimestampMixin, UUIDPkMixin

if TYPE_CHECKING:
    from src.models.activity_log import ActivityLog
    from src.models.agent_action import AgentAction
    from src.models.agent_link import AgentLink
    from src.models.agent_prompt_template import AgentPromptTemplate
    from src.models.budget import Budget
    from src.models.user import User


class AgentStatus(str, enum.Enum):
    """Lifecycle status of an agent."""

    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    ERROR = "error"
    DEPLOYING = "deploying"
    ARCHIVED = "archived"


class AgentKind(str, enum.Enum):
    """Agent persona — only four public kinds; legacy values remain for old DB rows."""

    CHAT = "chat"
    WORKER = "worker"
    SUPERVISOR = "supervisor"
    CUSTOM = "custom"
    # Deprecated — use canonical kind + capabilities (file upload, external API, tools).
    FILE_INTAKE = "file_intake"
    API = "api"
    SPREADSHEET = "spreadsheet"

    def canonical(self) -> AgentKind:
        return _LEGACY_TO_CANONICAL.get(self, self)

    @classmethod
    def public_values(cls) -> list[str]:
        return ["chat", "worker", "supervisor", "custom"]


_LEGACY_TO_CANONICAL: dict[AgentKind, AgentKind] = {
    AgentKind.FILE_INTAKE: AgentKind.WORKER,
    AgentKind.API: AgentKind.CHAT,
    AgentKind.SPREADSHEET: AgentKind.WORKER,
}


def canonical_agent_kind(value: str | AgentKind) -> AgentKind:
    if isinstance(value, AgentKind):
        return value.canonical()
    try:
        return AgentKind(value).canonical()
    except ValueError:
        return AgentKind.CUSTOM


class Agent(Base, UUIDPkMixin, TimestampMixin):
    """A configured AI agent."""

    __tablename__ = "agents"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    department: Mapped[str | None] = mapped_column(String(100), index=True, nullable=True)

    status: Mapped[AgentStatus] = mapped_column(
        SAEnum(AgentStatus, name="agent_status"),
        default=AgentStatus.DRAFT,
        nullable=False,
        index=True,
    )

    kind: Mapped[AgentKind] = mapped_column(
        SAEnum(
            AgentKind,
            name="agent_kind",
            values_callable=lambda x: [e.value for e in x],
        ),
        default=AgentKind.CHAT,
        nullable=False,
        index=True,
    )
    capabilities: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)
    file_policy: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)
    agent_link_policy: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)

    # LLM
    model_provider: Mapped[str] = mapped_column(String(50), default="openai", nullable=False)
    model_name: Mapped[str] = mapped_column(String(100), default="auto", nullable=False)
    temperature: Mapped[float] = mapped_column(Numeric(3, 2), default=0.2, nullable=False)
    max_iterations: Mapped[int] = mapped_column(Integer, default=20, nullable=False)

    # System prompt template
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Tools (registered slugs in tool_registry)
    tool_names: Mapped[list[str]] = mapped_column(
        ARRAY(String),
        default=list,
        server_default="{}",
        nullable=False,
    )

    # Memory configuration
    memory_type: Mapped[str] = mapped_column(String(50), default="buffer", nullable=False)
    memory_config: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)

    # Cost limits
    cost_limit_monthly: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    cost_limit_daily: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    overtime_threshold_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Misc agent config
    config_json: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)

    # Owner
    owner_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    owner: Mapped["User | None"] = relationship("User", back_populates="owned_agents")

    # Relationships
    activity_logs: Mapped[list["ActivityLog"]] = relationship(
        "ActivityLog",
        back_populates="agent",
        cascade="all, delete-orphan",
    )
    budgets: Mapped[list["Budget"]] = relationship(
        "Budget",
        back_populates="agent",
        cascade="all, delete-orphan",
    )
    actions: Mapped[list["AgentAction"]] = relationship(
        "AgentAction",
        back_populates="agent",
        cascade="all, delete-orphan",
        order_by="AgentAction.order_index",
    )
    templates: Mapped[list["AgentPromptTemplate"]] = relationship(
        "AgentPromptTemplate",
        back_populates="agent",
        cascade="all, delete-orphan",
        order_by="AgentPromptTemplate.order_index",
    )
    outgoing_links: Mapped[list["AgentLink"]] = relationship(
        "AgentLink",
        foreign_keys="AgentLink.caller_agent_id",
        back_populates="caller",
        cascade="all, delete-orphan",
    )
    incoming_links: Mapped[list["AgentLink"]] = relationship(
        "AgentLink",
        foreign_keys="AgentLink.callee_agent_id",
        back_populates="callee",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Agent {self.slug} status={self.status.value}>"
