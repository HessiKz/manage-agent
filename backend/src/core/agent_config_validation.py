"""Config-time tool slug validation with admin-fixable, structured errors.

Goal: creating/updating hundreds of agents never 500s or fails at runtime on a
bad tool slug. Bad slugs are caught here with a clear, fixable message the
wizard can render — no Python edit required.
"""

from __future__ import annotations

# Dynamic, per-agent tools are registered at runtime (external APIs, agent
# links), so their slugs can't be in ToolRegistry at create/update time. Accept
# them by prefix and let the validate-after-create `tool_resolution` phase
# confirm they actually bind.
_DEFERRED_PREFIXES = ("ext_", "call_agent_")


def known_tool_slugs() -> set[str]:
    """Every slug resolvable without per-agent runtime registration."""
    import src.agents_lib.custom_tools  # noqa: F401  (registers built-in tools)
    from src.agents_lib.platform_constants import (
        DOMAIN_TOOL_SLUGS,
        PLATFORM_SUPPORT_TOOL_NAMES,
    )
    from src.agents_lib.tool_registry import ToolRegistry

    slugs = set(ToolRegistry.list_slugs())
    slugs.update(DOMAIN_TOOL_SLUGS)
    slugs.update(PLATFORM_SUPPORT_TOOL_NAMES)
    slugs.add("run_agent_script")
    return slugs


def _is_deferred(slug: str) -> bool:
    return any(slug.startswith(p) for p in _DEFERRED_PREFIXES)


def unknown_tool_slugs(slugs) -> list[str]:
    """Slugs that are neither registered nor a known deferred dynamic tool."""
    known = known_tool_slugs()
    seen: list[str] = []
    for raw in slugs or []:
        slug = str(raw).strip()
        if not slug or slug in seen:
            continue
        if slug in known or _is_deferred(slug):
            continue
        seen.append(slug)
    return seen


def collect_tool_config_issues(
    tool_names, actions
) -> list[dict[str, str]]:
    """Return structured, fixable issues for bad tool slugs.

    `actions` is an iterable of objects/dicts with `slug` and `tool_chain`.
    """
    issues: list[dict[str, str]] = []

    for slug in unknown_tool_slugs(tool_names):
        issues.append(
            {
                "field": "tool_names",
                "slug": slug,
                "message": f"ابزار «{slug}» ثبت نشده است. آن را از فهرست ابزارها حذف یا اصلاح کنید.",
                "fixable_in_admin": True,
            }
        )

    for action in actions or []:
        a_slug = getattr(action, "slug", None) or (
            action.get("slug") if isinstance(action, dict) else None
        )
        chain = getattr(action, "tool_chain", None)
        if chain is None and isinstance(action, dict):
            chain = action.get("tool_chain")
        for slug in unknown_tool_slugs(chain):
            issues.append(
                {
                    "field": "action.tool_chain",
                    "action": str(a_slug or "—"),
                    "slug": slug,
                    "message": (
                        f"اقدام «{a_slug}» به ابزار ثبت‌نشده «{slug}» اشاره دارد."
                    ),
                    "fixable_in_admin": True,
                }
            )

    return issues
