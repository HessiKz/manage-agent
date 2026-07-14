"""Skill service: CRUD, activate, and outcome recording for platform_skills."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from slugify import slugify
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from src.core.errors import AppError, ConflictError, ErrorCode, NotFoundError, ValidationAppError
from src.models.platform_skill import (
    PlatformSkill,
    SkillScope,
    SkillStatus,
)
from src.models.user import User
from src.schemas.platform_skill import SkillCreate, SkillUpdate


def _utcnow_iso() -> datetime:
    return datetime.now(timezone.utc)


class SkillService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list(
        self,
        *,
        scope: str | None = None,
        status: str | None = None,
    ) -> list[PlatformSkill]:
        stmt = select(PlatformSkill).order_by(PlatformSkill.created_at.desc())
        if scope:
            stmt = stmt.where(PlatformSkill.scope == scope)
        if status:
            stmt = stmt.where(PlatformSkill.status == status)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get(self, slug: str) -> PlatformSkill:
        result = await self.db.execute(
            select(PlatformSkill).where(PlatformSkill.slug == slug)
        )
        skill = result.scalar_one_or_none()
        if skill is None:
            raise NotFoundError(f"Skill '{slug}' not found")
        return skill

    async def create(self, payload: SkillCreate, user: User) -> PlatformSkill:
        # Admin-only guard — enforced at API layer (CurrentSuperuser). Belt-and-braces.
        if not user.is_superuser:
            raise AppError(
                "Admin privileges required",
                code=ErrorCode.PERMISSION_DENIED,
                status_code=403,
            )

        slug = payload.slug or slugify(payload.name)
        existing = await self.db.execute(
            select(PlatformSkill).where(PlatformSkill.slug == slug)
        )
        if existing.scalar_one_or_none() is not None:
            raise ConflictError(f"Skill slug '{slug}' already exists")

        if payload.scope == SkillScope.AGENT and payload.agent_id is None:
            raise ValidationAppError("scope='agent' requires agent_id")

        skill = PlatformSkill(
            slug=slug,
            name=payload.name,
            name_fa=payload.name_fa,
            description=payload.description,
            scope=payload.scope,
            org_id=payload.org_id,
            agent_id=payload.agent_id,
            source=payload.source,
            status=SkillStatus.DRAFT,
            version=1,
            trigger=dict(payload.trigger or {}),
            procedure=dict(payload.procedure or {}),
            content_md=payload.content_md,
            stats={"success_count": 0, "failure_count": 0, "last_used_at": None},
            created_by=user.id,
        )
        self.db.add(skill)
        await self.db.commit()
        await self.db.refresh(skill)
        return skill

    async def update(self, slug: str, fields: SkillUpdate) -> PlatformSkill:
        skill = await self.get(slug)

        data = fields.model_dump(exclude_unset=True)
        if not data:
            return skill

        if "scope" in data and data.get("scope") == SkillScope.AGENT.value:
            agent_id = data.get("agent_id", skill.agent_id)
            if agent_id is None:
                raise ValidationAppError("scope='agent' requires agent_id")

        procedure_changed = "procedure" in data and data["procedure"] != skill.procedure

        for key, value in data.items():
            setattr(skill, key, value)
            if key in ("trigger", "procedure", "stats"):
                flag_modified(skill, key)

        if procedure_changed:
            # Version bump + supersedes chain: set supersedes_id to the prior
            # active version's id, then archive the current row's predecessor.
            await self._version_bump(skill)

        await self.db.commit()
        await self.db.refresh(skill)
        return skill

    async def _version_bump(self, skill: PlatformSkill) -> None:
        """Bump version; link supersedes_id to the prior active version; archive it."""
        prior_result = await self.db.execute(
            select(PlatformSkill)
            .where(PlatformSkill.slug == skill.slug)
            .where(PlatformSkill.status == SkillStatus.ACTIVE)
        )
        prior = prior_result.scalars().first()
        if prior is None:
            skill.version = skill.version + 1
            return

        if prior.id == skill.id:
            skill.version = skill.version + 1
            return

        # Create a new archived snapshot of the predecessor's procedure.
        snapshot = PlatformSkill(
            slug=prior.slug,
            name=prior.name,
            name_fa=prior.name_fa,
            description=prior.description,
            scope=prior.scope,
            org_id=prior.org_id,
            agent_id=prior.agent_id,
            source=prior.source,
            status=SkillStatus.ARCHIVED,
            version=prior.version,
            supersedes_id=prior.supersedes_id,
            trigger=dict(prior.trigger or {}),
            procedure=dict(prior.procedure or {}),
            content_md=prior.content_md,
            stats=dict(prior.stats or {}),
            created_by=prior.created_by,
        )
        self.db.add(snapshot)
        await self.db.flush()

        # The current edited row becomes the new version, pointing back at prior.
        skill.supersedes_id = prior.id
        skill.version = prior.version + 1

    async def activate(self, slug: str) -> PlatformSkill:
        """Promote a draft skill to active and archive any active predecessor."""
        skill = await self.get(slug)
        if skill.status == SkillStatus.ACTIVE:
            return skill

        prior_result = await self.db.execute(
            select(PlatformSkill)
            .where(PlatformSkill.slug == slug)
            .where(PlatformSkill.status == SkillStatus.ACTIVE)
        )
        prior = prior_result.scalars().first()
        if prior is not None and prior.id != skill.id:
            prior.status = SkillStatus.ARCHIVED

        skill.status = SkillStatus.ACTIVE
        await self.db.commit()
        await self.db.refresh(skill)
        return skill

    async def record_outcome(self, slug: str, success: bool) -> PlatformSkill:
        """Increment success/failure count and stamp last_used_at (ISO utcnow)."""
        skill = await self.get(slug)
        stats = dict(skill.stats or {})
        if success:
            stats["success_count"] = int(stats.get("success_count", 0)) + 1
        else:
            stats["failure_count"] = int(stats.get("failure_count", 0)) + 1
        stats["last_used_at"] = _utcnow_iso().isoformat()
        skill.stats = stats
        flag_modified(skill, "stats")
        await self.db.commit()
        await self.db.refresh(skill)
        return skill
