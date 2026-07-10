"""Run state business logic: upsert / patch / read with ownership + slug rules."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.agent import Agent
from src.models.run_state import RunState
from src.schemas.run_state import RunStatePatch, RunStateRead, RunStateUpsert


class RunStateNotFound(Exception):
    """No run state for the scope yet (client falls back to defaults)."""


class RunStateConflict(Exception):
    """Optimistic-lock mismatch on `version`."""


class RunStateService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get(self, scope_type: str, scope_key: str, user_id: UUID) -> RunState | None:
        result = await self.db.execute(
            select(RunState).where(
                RunState.scope_type == scope_type,
                RunState.scope_key == scope_key,
                RunState.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def get(self, scope_type: str, scope_key: str, user_id: UUID) -> RunState:
        state = await self._get(scope_type, scope_key, user_id)
        if state is None:
            raise RunStateNotFound()
        return state

    async def upsert(self, payload: RunStateUpsert, user_id: UUID) -> RunState:
        state = await self._get(payload.scope_type, payload.scope_key, user_id)
        if state is None:
            if payload.slug is not None:
                await self._ensure_slug_verified(payload.slug, payload.agent_id)
            state = RunState(
                scope_type=payload.scope_type,
                scope_key=payload.scope_key,
                user_id=user_id,
                agent_id=payload.agent_id,
                slug=payload.slug,
                phase=payload.phase,
                wizard_step_index=payload.wizard_step_index,
                payload=payload.payload or {},
                version=1,
            )
            self.db.add(state)
            await self.db.flush()
            return state

        if payload.version and payload.version != state.version:
            raise RunStateConflict()
        return await self._apply_patch(state, payload, user_id, bump=True)

    async def patch(self, scope_type: str, scope_key: str, patch: RunStatePatch, user_id: UUID) -> RunState:
        state = await self._get(scope_type, scope_key, user_id)
        if state is None:
            state = RunState(
                scope_type=scope_type,
                scope_key=scope_key,
                user_id=user_id,
                phase="unknown",
                payload={},
                version=1,
            )
            self.db.add(state)
        return await self._apply_patch(state, patch, user_id, bump=True)

    async def delete(self, scope_type: str, scope_key: str, user_id: UUID) -> None:
        state = await self._get(scope_type, scope_key, user_id)
        if state is not None:
            await self.db.delete(state)

    async def _apply_patch(
        self,
        state: RunState,
        patch: RunStatePatch | RunStateUpsert,
        user_id: UUID,
        *,
        bump: bool,
    ) -> RunState:
        data = patch.model_dump(exclude_unset=True)
        if "slug" in data and data["slug"] is not None:
            await self._ensure_slug_verified(data["slug"], state.agent_id or getattr(patch, "agent_id", None))
        for field, value in data.items():
            if value is None:
                continue
            if field == "payload" and isinstance(state.payload, dict):
                merged = dict(state.payload)
                merged.update(value)
                state.payload = merged
            else:
                setattr(state, field, value)
        if bump:
            state.version += 1
        await self.db.flush()
        return state

    async def _ensure_slug_verified(self, slug: str, agent_id: UUID | None) -> None:
        if agent_id is not None:
            agent = await self.db.get(Agent, agent_id)
            if agent is not None and agent.slug == slug:
                return
        existing = await self.db.execute(select(Agent).where(Agent.slug == slug))
        if existing.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="slug is not a verified agent",
            )
