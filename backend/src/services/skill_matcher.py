"""SkillMatcher — deterministic trigger scoring for platform skills.

Scoring (Phase 2 §1.2):
  phase exact match       +0.4
  pathname_prefix match   +0.2
  intent_regex match      +0.2
  run_state predicates    +0.2
  success_rate multiplier × 0.8–1.2 (clamped)
  below min_autonomy_level → disqualify (skill=None)

Thresholds:
  >=0.75 execute
  0.50–0.74 suggest
  <0.50  no match

Only ``status='active'`` skills are considered; draft/archived are excluded.
Ties are broken by ``trigger.priority`` (default 100) — higher priority wins.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Mapping

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.platform_skill import PlatformSkill, SkillStatus

_EXECUTE_THRESHOLD = 0.75
_SUGGEST_THRESHOLD = 0.50


@dataclass
class MatchResult:
    skill: PlatformSkill | None
    confidence: float = 0.0
    reasons: list[str] = field(default_factory=list)


def _coerce_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _success_rate(stats: Mapping[str, Any]) -> float:
    success = int(stats.get("success_count", 0) or 0)
    failure = int(stats.get("failure_count", 0) or 0)
    total = success + failure
    if total == 0:
        return 1.0  # neutral prior for skills with no history
    return success / total


def _rate_multiplier(rate: float) -> float:
    """Map success_rate [0,1] to a [0.8, 1.2] multiplier."""
    return 0.8 + (max(0.0, min(1.0, rate)) * 0.4)


def _phase_match(trigger: Mapping[str, Any], run_state: Mapping[str, Any]) -> bool:
    phases = trigger.get("phase_any")
    if not phases:
        return False
    phase = run_state.get("phase")
    if phase is None:
        return False
    return str(phase) in {str(p) for p in phases}


def _pathname_match(trigger: Mapping[str, Any], pathname: str | None) -> bool:
    prefix = trigger.get("pathname_prefix")
    if not prefix or pathname is None:
        return False
    return pathname.startswith(prefix)


def _intent_match(trigger: Mapping[str, Any], message: str) -> bool:
    pattern = trigger.get("intent_regex")
    if not pattern:
        return False
    try:
        return re.search(pattern, message or "") is not None
    except re.error:
        return False


def _run_state_predicates_match(
    trigger: Mapping[str, Any], run_state: Mapping[str, Any]
) -> bool:
    preds = trigger.get("run_state")
    if not isinstance(preds, Mapping) or not preds:
        return False
    for key, expected in preds.items():
        actual = run_state.get(key)
        if isinstance(expected, bool):
            if bool(actual) != expected:
                return False
        elif actual != expected:
            return False
    return True


def _autonomy_ok(trigger: Mapping[str, Any], autonomy_level: int) -> bool:
    min_level = trigger.get("min_autonomy_level")
    if min_level is None:
        return True
    return autonomy_level >= _coerce_int(min_level, 0)


def _score_skill(
    skill: PlatformSkill,
    *,
    run_state: Mapping[str, Any],
    message: str,
    pathname: str | None,
    autonomy_level: int,
) -> tuple[float, list[str], bool]:
    """Return (score, reasons, qualified)."""
    trigger = skill.trigger or {}
    reasons: list[str] = []

    if not _autonomy_ok(trigger, autonomy_level):
        return 0.0, ["autonomy below min_autonomy_level"], False

    score = 0.0
    if _phase_match(trigger, run_state):
        score += 0.4
        reasons.append("phase match +0.4")
    if _pathname_match(trigger, pathname):
        score += 0.2
        reasons.append("pathname_prefix match +0.2")
    if _intent_match(trigger, message):
        score += 0.2
        reasons.append("intent_regex match +0.2")
    if _run_state_predicates_match(trigger, run_state):
        score += 0.2
        reasons.append("run_state predicates +0.2")

    rate = _success_rate(skill.stats or {})
    multiplier = _rate_multiplier(rate)
    score = round(score * multiplier, 4)
    if rate != 1.0 or multiplier != 1.0:
        reasons.append(f"success_rate {rate:.2f} ×{multiplier:.2f}")

    return score, reasons, True


class SkillMatcher:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def match(
        self,
        context: Mapping[str, Any],
    ) -> MatchResult:
        run_state = context.get("run_state") or {}
        message = str(context.get("message") or "")
        pathname = context.get("pathname")
        autonomy_level = _coerce_int(context.get("autonomy_level", 0), 0)

        result = await self.db.execute(
            select(PlatformSkill).where(PlatformSkill.status == SkillStatus.ACTIVE)
        )
        skills = list(result.scalars().all())

        best: MatchResult = MatchResult(skill=None, confidence=0.0, reasons=[])
        for skill in skills:
            score, reasons, qualified = _score_skill(
                skill,
                run_state=run_state,
                message=message,
                pathname=pathname,
                autonomy_level=autonomy_level,
            )
            if not qualified or score < best.confidence:
                continue
            trigger = skill.trigger or {}
            priority = _coerce_int(trigger.get("priority", 100), 100)
            current_priority = _coerce_int(
                (best.skill.trigger or {}).get("priority", 100), 100
            ) if best.skill is not None else -1
            if score == best.confidence and priority <= current_priority and best.skill is not None:
                # Tie-break: only replace if strictly higher priority.
                continue
            best = MatchResult(
                skill=skill,
                confidence=score,
                reasons=reasons,
            )

        if best.skill is None or best.confidence < _SUGGEST_THRESHOLD:
            return MatchResult(skill=None, confidence=best.confidence, reasons=best.reasons)
        return best

    @staticmethod
    def threshold_band(confidence: float) -> str:
        if confidence >= _EXECUTE_THRESHOLD:
            return "execute"
        if confidence >= _SUGGEST_THRESHOLD:
            return "suggest"
        return "none"
