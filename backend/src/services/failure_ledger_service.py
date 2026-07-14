"""Failure ledger service: record, relevant, top, link_skill."""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.failure_ledger import FailureLedger, FailureRootCauseTag
from src.schemas.failure_ledger import FailureRecordRequest

_EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
_SECRET_RE = re.compile(r"(?i)(password|secret|token|api_key)\s*[:=]\s*\S+")

_MAX_SAMPLE = 200


def redact(text: str) -> str:
    """Redact emails and secrets, then truncate to 200 chars."""
    redacted = _EMAIL_RE.sub("[email]", text)
    redacted = _SECRET_RE.sub("[redacted]", redacted)
    return redacted[:_MAX_SAMPLE]


def normalize_error(message: str) -> str:
    """Normalize whitespace and casing for stable hashing/matching."""
    return re.sub(r"\s+", " ", message).strip().lower()


def pattern_hash(tag: FailureRootCauseTag, error_message: str, phase: str | None, tool_name: str | None) -> str:
    raw = "|".join(
        [
            tag.value,
            normalize_error(error_message),
            phase or "",
            tool_name or "",
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def to_regex(error_message: str) -> str:
    """Build a forgiving SQL LIKE/regex pattern from the normalized error.

    Escapes regex metacharacters and collapses whitespace so partial
    error_substring matches succeed.
    """
    norm = normalize_error(error_message)
    # Escape regex special chars, then turn runs of spaces into \s+ for flexibility.
    escaped = re.escape(norm).replace(r"\ ", r"\s+")
    return escaped[:512]


class FailureLedgerService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def record(self, req: FailureRecordRequest) -> FailureLedger:
        ph = pattern_hash(req.root_cause_tag, req.error_message, req.phase, req.tool_name)
        regex = to_regex(req.error_message)
        sample = redact(req.sample_redacted or req.error_message)

        result = await self.db.execute(
            select(FailureLedger).where(FailureLedger.pattern_hash == ph)
        )
        row = result.scalar_one_or_none()

        now = datetime.now(timezone.utc).isoformat()
        if row is not None:
            row.occurrence_count += 1
            row.last_seen_at = now
            # Keep the freshest sample that is still redacted.
            if sample:
                row.sample_redacted = sample
            await self.db.flush()
            return row

        row = FailureLedger(
            pattern_hash=ph,
            scope=req.scope,
            phase=req.phase,
            pathname_prefix=req.pathname_prefix,
            tool_name=req.tool_name,
            error_regex=regex,
            root_cause_tag=req.root_cause_tag,
            recommended_fix={},
            occurrence_count=1,
            last_seen_at=now,
            resolved_by_skill_id=None,
            sample_redacted=sample or None,
        )
        self.db.add(row)
        await self.db.flush()
        return row

    async def relevant(
        self,
        phase: str | None = None,
        pathname: str | None = None,
        error_substring: str | None = None,
        top: int = 3,
    ) -> list[FailureLedger]:
        """Top-N patterns by occurrence_count matching the given hints."""
        from sqlalchemy import or_

        stmt = select(FailureLedger)
        clauses = []
        if phase:
            clauses.append(FailureLedger.phase == phase)
        if pathname:
            clauses.append(FailureLedger.pathname_prefix.like(f"{pathname}%"))
        if error_substring:
            # error_regex holds a regex built from the recorded error; match
            # the substring against it with case-insensitive ILIKE semantics.
            clauses.append(FailureLedger.error_regex.ilike(f"%{error_substring}%"))
        if clauses:
            stmt = stmt.where(or_(*clauses))
        stmt = stmt.order_by(FailureLedger.occurrence_count.desc()).limit(top)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def top(self, limit: int = 20) -> list[FailureLedger]:
        """Admin view: top patterns by occurrence_count."""
        stmt = (
            select(FailureLedger)
            .order_by(FailureLedger.occurrence_count.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def link_skill(self, pattern_hash: str, skill_id: UUID) -> FailureLedger | None:
        """Attach a resolving platform skill to a pattern."""
        result = await self.db.execute(
            select(FailureLedger).where(FailureLedger.pattern_hash == pattern_hash)
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        row.resolved_by_skill_id = skill_id
        await self.db.flush()
        return row
