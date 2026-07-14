"""Pure-string template substitution for skill procedures.

Resolves ``{{run_state.slug}}`` style tokens from a context dict. No LLM,
no eval — simple string replacement plus recursion into dicts/lists.

Supported tokens (per docs/plans/02-phase-2-institutional-memory.md §1.1):
  {{run_state.slug}}    -> context["run_state"]["slug"]
  {{run_state.phase}}   -> context["run_state"]["phase"]
  {{user.id}}           -> context["user"]["id"]
  {{payload.name}}      -> context["payload"]["name"]

Unknown ``{{...}}`` keys raise ValueError so bad seed data fails loudly.
"""

from __future__ import annotations

import re
from typing import Any, Mapping

# Matches a {{...}} placeholder. Non-greedy, allows nested dots.
_TOKEN_RE = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")

# Known two-segment keys. We resolve nested context lookups but the spec names
# exactly these tokens — anything else is rejected.
_KNOWN_KEYS = {
    "run_state.slug",
    "run_state.phase",
    "user.id",
    "payload.name",
}


def _lookup(key: str, context: Mapping[str, Any]) -> Any:
    """Resolve a dotted key against the context dict."""
    if key not in _KNOWN_KEYS:
        # Dotted nested lookup allowed if first segment exists in context —
        # but still reject to keep the surface minimal and explicit.
        raise ValueError(f"Unknown template key: {{{{{key}}}}}")

    parts = key.split(".")
    node: Any = context
    for part in parts:
        if not isinstance(node, Mapping):
            raise ValueError(f"Template key '{key}' not found in context")
        if part not in node:
            # Missing context value -> empty string; caller decides whether
            # that aborts the match (e.g. empty run_state.slug).
            return ""
        node = node[part]
    return node


def resolve_template(value: str | dict | list, context: Mapping[str, Any]) -> Any:
    """Substitute ``{{...}}`` tokens in strings, recursing into dicts/lists."""
    if isinstance(value, str):
        return _TOKEN_RE.sub(
            lambda m: _scalarize(_lookup(m.group(1), context)), value
        )
    if isinstance(value, dict):
        return {k: resolve_template(v, context) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_template(v, context) for v in value]
    return value


def _scalarize(value: Any) -> str:
    """Render a looked-up value as the string inside a larger template string."""
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        raise ValueError(
            f"Template token resolved to non-scalar ({type(value).__name__})"
        )
    return str(value)
