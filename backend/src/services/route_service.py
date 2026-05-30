"""Smart agent routing from natural-language prompt."""

from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.agent import Agent, AgentStatus

# Keyword → department/slug hints (Persian + English)
_HINTS: list[tuple[list[str], str | None, str | None]] = [
    (["حقوق", "دستمزد", "payroll", "فیش", "اضافه‌کار"], "finance", "payroll"),
    (["بانک", "مغایرت", "recon", "bank"], "finance", "bank-recon"),
    (["فاکتور", "invoice"], "finance", "invoice"),
    (["رزومه", "resume", "cv", "استخدام"], "hr", "resume"),
    (["تیکت", "پشتیبانی", "support", "ticket"], "support", "support"),
]


class RouteService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def suggest(self, prompt: str) -> dict:
        prompt_lower = prompt.lower()
        slug_hint: str | None = None
        dept_hint: str | None = None

        for keywords, dept, slug in _HINTS:
            if any(k in prompt_lower for k in keywords):
                dept_hint = dept
                slug_hint = slug
                break

        if slug_hint:
            stmt = select(Agent).where(Agent.slug == slug_hint, Agent.status == AgentStatus.ACTIVE)
            agent = (await self.db.execute(stmt)).scalar_one_or_none()
            if agent:
                return self._pack(agent, confidence=0.92, reason=f"Matched keyword → {slug_hint}")

        stmt = select(Agent).where(Agent.status == AgentStatus.ACTIVE)
        if dept_hint:
            stmt = stmt.where(Agent.department == dept_hint)
        stmt = stmt.order_by(Agent.created_at.desc()).limit(1)
        agent = (await self.db.execute(stmt)).scalar_one_or_none()
        if agent:
            return self._pack(agent, confidence=0.75, reason=f"Department match: {dept_hint or 'any'}")

        # Fallback: search name/description
        pattern = f"%{prompt[:40]}%"
        stmt = (
            select(Agent)
            .where(
                Agent.status == AgentStatus.ACTIVE,
                or_(Agent.name.ilike(pattern), Agent.description.ilike(pattern)),
            )
            .limit(1)
        )
        agent = (await self.db.execute(stmt)).scalar_one_or_none()
        if agent:
            return self._pack(agent, confidence=0.6, reason="Text search match")

        # Last resort: general assistant
        stmt = select(Agent).where(Agent.slug == "general", Agent.status == AgentStatus.ACTIVE)
        agent = (await self.db.execute(stmt)).scalar_one_or_none()
        if agent:
            return self._pack(agent, confidence=0.4, reason="Default general assistant")

        return {"agent": None, "confidence": 0.0, "reason": "No agent found"}

    def _pack(self, agent: Agent, confidence: float, reason: str) -> dict:
        return {
            "agent": {
                "id": str(agent.id),
                "name": agent.name,
                "slug": agent.slug,
                "department": agent.department,
                "description": agent.description,
            },
            "confidence": confidence,
            "reason": reason,
        }
