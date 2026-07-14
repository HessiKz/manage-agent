"""Bake a national-holiday table (time.ir) into agent context.

Scripts run in a network-sandboxed workspace, so the LLM cannot call
``timeir`` at script-run time. Instead we fetch the calendar ONCE during
validation (backend has network) and write a static Jalali holiday table
into ``agent.config_json["holiday_calendar"]``. The synthesis prompt and any
holiday-aware tool read this pre-fetched table — no network in the agent
script, fully deterministic.

``timeir`` itself caches per-year data to disk for 90 days, so repeated
validations of the same agent cost no extra HTTP. Any network failure is
swallowed so validation never breaks on a flaky time.ir.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from src.models.agent import Agent

logger = logging.getLogger(__name__)

HOLIDAY_CALENDAR_ENABLED = True


def _years_for_agent(agent: Agent) -> set[int]:
    """Infer the Jalali years a file agent might touch from its sample/rules."""
    years: set[int] = set()
    cfg = agent.config_json or {}
    rules = cfg.get("instruction_rules") or []
    file_blocks = cfg.get("instruction_files_text") or []
    parts = [
        agent.name or "",
        agent.description or "",
        agent.system_prompt or "",
        " ".join(str(r) for r in rules),
        " ".join(
            str(b.get("text") or "") if isinstance(b, dict) else str(b)
            for b in file_blocks
        ),
    ]
    hay = " ".join(parts)
    for m in re.findall(r"\b(1[45]\d{2})\b", hay):
        try:
            years.add(int(m))
        except ValueError:
            pass
    try:
        import jdatetime

        cur = jdatetime.date.today().year
        years.update({cur - 1, cur, cur + 1})
    except Exception:  # noqa: BLE001
        pass
    return years


def build_holiday_calendar(agent: Agent) -> dict[str, Any]:
    """Return ``{"by_year": {year: {month: {day: occasion}}}, "occasions": [...]}``.

    Best-effort: returns whatever years resolved. On any failure returns an
    empty structure so callers can safely skip holiday context.
    """
    if not HOLIDAY_CALENDAR_ENABLED:
        return {"by_year": {}, "occasions": []}
    try:
        from timeir import get_holidays
    except Exception:  # noqa: BLE001
        logger.warning("timeir not installed; skipping holiday calendar")
        return {"by_year": {}, "occasions": []}

    by_year: dict[int, dict[int, dict[int, str]]] = {}
    occasions: list[dict[str, Any]] = []
    for year in sorted(_years_for_agent(agent)):
        try:
            months = get_holidays(year)
        except Exception as exc:  # noqa: BLE001
            logger.warning("time.ir fetch failed for %s: %s", year, exc)
            continue
        ymap: dict[int, dict[int, str]] = {}
        for month in range(1, 13):
            mmap = months[month] if month < len(months) and months[month] else {}
            if mmap:
                ymap[month] = {int(d): occ for d, occ in mmap.items()}
                for d, occ in ymap[month].items():
                    occasions.append({"year": year, "month": month, "day": d, "occasion": occ})
        if ymap:
            by_year[year] = ymap
    return {"by_year": by_year, "occasions": occasions}


def stamp_holiday_calendar(agent: Agent, table: dict[str, Any]) -> bool:
    """Write the table into config_json. Returns True if anything changed."""
    if not table.get("by_year"):
        return False
    cfg = dict(agent.config_json or {})
    cfg["holiday_calendar"] = table
    agent.config_json = cfg
    try:
        from sqlalchemy.orm.attributes import flag_modified

        flag_modified(agent, "config_json")
    except Exception:  # noqa: BLE001
        pass
    return True


def ensure_holiday_calendar(agent: Agent) -> dict[str, Any]:
    """Return existing calendar or fetch/stamp a fresh time.ir table in-memory.

    Does not commit; callers that mutate agent should flush/commit as needed.
    """
    cfg = agent.config_json or {}
    existing = cfg.get("holiday_calendar")
    if isinstance(existing, dict) and existing.get("by_year"):
        return existing
    table = build_holiday_calendar(agent)
    if stamp_holiday_calendar(agent, table):
        return table
    return table if isinstance(table, dict) else {"by_year": {}, "occasions": []}


def holiday_calendar_prompt_block(agent: Agent, *, max_occasions: int = 80) -> str:
    """Persian system-prompt section so chat/script agents know holidays."""
    table = ensure_holiday_calendar(agent)
    occasions = table.get("occasions") if isinstance(table, dict) else None
    if not isinstance(occasions, list) or not occasions:
        return ""
    # Prefer current Jalali year first for attention.
    try:
        import jdatetime

        cur = jdatetime.date.today().year
    except Exception:  # noqa: BLE001
        cur = None
    ordered = sorted(
        occasions,
        key=lambda o: (
            0 if cur is not None and int(o.get("year") or 0) == cur else 1,
            int(o.get("year") or 0),
            int(o.get("month") or 0),
            int(o.get("day") or 0),
        ),
    )[:max_occasions]
    lines = [
        f"- {int(o.get('year'))}/{int(o.get('month')):02d}/{int(o.get('day')):02d}: {o.get('occasion')}"
        for o in ordered
        if isinstance(o, dict) and o.get("occasion")
    ]
    if not lines:
        return ""
    return (
        "## تقویم تعطیلات رسمی (time.ir)\n"
        "این جدول از time.ir بارگذاری شده و برای محاسبات کارکرد، تعطیل‌کاری، "
        "جمعه/تعطیل رسمی و هر تاریخ وابسته به تقویم ایران معتبر است. "
        "روزهایی که در این لیست هستند تعطیل رسمی‌اند مگر خلاف صریح دستورالعمل.\n"
        + "\n".join(lines)
    )


def agent_wants_holiday_context(agent: Agent) -> bool:
    """True for karkard / attendance / HR file agents that need calendar awareness."""
    blob = " ".join(
        [
            str(agent.name or ""),
            str(agent.description or ""),
            str(agent.slug or ""),
            str(agent.system_prompt or "")[:2000],
        ]
    ).lower()
    keys = (
        "کارکرد",
        "karkard",
        "khrkhrd",
        "attendance",
        "مرخصی",
        "اضافه کار",
        "تعطیل",
        "پرسنل",
        "timesheet",
        "ورود و خروج",
    )
    if any(k in blob for k in keys):
        return True
    caps = agent.capabilities or {}
    if caps.get("file_upload_enabled"):
        # File workers often need holiday tables for overtime/holiday work.
        return True
    return False
