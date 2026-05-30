"""Access requests for per-agent permissions."""

from __future__ import annotations

import enum
from uuid import UUID

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.database.base import Base, TimestampMixin, UUIDPkMixin


class AccessRequestStatus(str, enum.Enum):
     PENDING = "pending"
     APPROVED = "approved"
     REJECTED = "rejected"


class AccessRequest(Base, UUIDPkMixin, TimestampMixin):
     __tablename__ = "access_requests"
 
     user_id: Mapped[UUID] = mapped_column(
         PG_UUID(as_uuid=True),
         ForeignKey("users.id", ondelete="CASCADE"),
         nullable=False,
         index=True,
     )
     agent_id: Mapped[UUID] = mapped_column(
         PG_UUID(as_uuid=True),
         ForeignKey("agents.id", ondelete="CASCADE"),
         nullable=False,
         index=True,
     )
     status: Mapped[AccessRequestStatus] = mapped_column(
         SAEnum(
             AccessRequestStatus,
             name="access_request_status",
             values_callable=lambda obj: [e.value for e in obj],
         ),
         default=AccessRequestStatus.PENDING,
         nullable=False,
         index=True,
     )
     reason: Mapped[str | None] = mapped_column(Text, nullable=True)
     decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
     decided_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
