"""Access request workflow."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select

from src.models.access_request import AccessRequest, AccessRequestStatus
from src.models.agent_permission import AgentUserPermission


class AccessRequestService:
    def __init__(self, db):
        self.db = db

    async def create(self, user_id: UUID, agent_id: UUID, reason: str | None = None) -> AccessRequest:
        ar = AccessRequest(user_id=user_id, agent_id=agent_id, reason=reason)
        self.db.add(ar)
        await self.db.flush()
        return ar

    async def list(
        self, status: AccessRequestStatus | None = None, limit: int = 50
    ) -> list[AccessRequest]:
        stmt = select(AccessRequest).order_by(AccessRequest.created_at.desc()).limit(limit)
        if status:
            stmt = stmt.where(AccessRequest.status == status)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def pending_count(self) -> int:
        return (
            await self.db.execute(
                select(func.count(AccessRequest.id)).where(
                    AccessRequest.status == AccessRequestStatus.PENDING
                )
            )
        ).scalar_one()

    async def approve(self, request_id: UUID, admin_id: UUID, note: str | None = None) -> None:
        ar = (
            await self.db.execute(select(AccessRequest).where(AccessRequest.id == request_id))
        ).scalar_one()
        ar.status = AccessRequestStatus.APPROVED
        ar.decision_note = note
        ar.decided_by = admin_id

        # Grant invoke permission by default on approval
        exists = (
            await self.db.execute(
                select(AgentUserPermission).where(
                    AgentUserPermission.user_id == ar.user_id,
                    AgentUserPermission.agent_id == ar.agent_id,
                )
            )
        ).scalar_one_or_none()
        if not exists:
            self.db.add(
                AgentUserPermission(
                    user_id=ar.user_id,
                    agent_id=ar.agent_id,
                    can_invoke=True,
                    can_configure=False,
                )
            )

    async def reject(self, request_id: UUID, admin_id: UUID, note: str | None = None) -> None:
        ar = (
            await self.db.execute(select(AccessRequest).where(AccessRequest.id == request_id))
        ).scalar_one()
        ar.status = AccessRequestStatus.REJECTED
        ar.decision_note = note
        ar.decided_by = admin_id
