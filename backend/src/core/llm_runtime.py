"""Runtime-switchable LLM provider configuration.

Two providers are supported and can be toggled at runtime from the admin panel:

- ``gateway``  – the OpenAI-compatible gateway configured via env
  (``OPENAI_BASE_URL`` / ``OPENAI_API_KEY``, e.g. gapgpt).
- ``cursor``   – the local ``cursor-to-api`` proxy that wraps the Cursor agent
  CLI. It exposes an OpenAI-compatible endpoint.

Per-agent ``model_name`` is honored when set; otherwise ``openai_default_model``
from settings is used.

The selection is persisted in the ``platform_settings`` table and mirrored here
in a process-local cache so the sync ``build_llm`` path can resolve it without a
DB round-trip. The cache is loaded at startup and refreshed whenever the admin
updates the setting.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any, Literal

from src.config import settings

Provider = Literal["gateway", "cursor"]
DEFAULT_MODEL = "claude-opus-4-8"


def available_models() -> list[str]:
    """Curated models exposed to the wizard model picker."""
    raw = settings.available_models_csv
    models = [m.strip() for m in raw.split(",") if m.strip()]
    return models or [settings.openai_default_model or DEFAULT_MODEL]


def resolve_model_name(model_name: str | None) -> str:
    """Pick a concrete model id from agent config or platform defaults."""
    candidate = (model_name or "").strip()
    if candidate and candidate in available_models():
        return candidate
    if candidate:
        return candidate
    default = settings.openai_default_model or DEFAULT_MODEL
    models = available_models()
    return default if default in models else models[0]

# The platform_settings key under which the provider selection is stored.
LLM_PROVIDER_KEY = "llm_provider"


def _default_state() -> dict[str, Any]:
    return {
        "active": settings.llm_provider,
        "cursor": {
            "base_url": settings.cursor_api_base_url,
            "api_key": settings.cursor_api_key or "",
            "model": settings.cursor_api_model,
        },
    }


# Process-local cache. Mutated only through `update_cache` / `set_active`.
_state: dict[str, Any] = _default_state()


@dataclass(frozen=True)
class ResolvedLLM:
    """Concrete connection parameters for the currently active provider."""

    provider: Provider
    base_url: str | None
    api_key: str | None
    model: str


def _normalize(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Merge a (possibly partial / persisted) dict onto the defaults."""
    state = _default_state()
    if not raw:
        return state
    active = raw.get("active")
    if active in ("gateway", "cursor"):
        state["active"] = active
    cursor = raw.get("cursor") or {}
    if isinstance(cursor, dict):
        if cursor.get("base_url"):
            state["cursor"]["base_url"] = str(cursor["base_url"])
        if "api_key" in cursor and cursor["api_key"] is not None:
            state["cursor"]["api_key"] = str(cursor["api_key"])
        if cursor.get("model"):
            state["cursor"]["model"] = str(cursor["model"])
    return state


def update_cache(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Replace the cached state from a persisted value. Returns the new state."""
    global _state
    _state = _normalize(raw)
    return get_state()


def set_active(provider: Provider) -> dict[str, Any]:
    _state["active"] = provider
    return get_state()


def get_state() -> dict[str, Any]:
    """Return a deep copy of the current state (safe to mutate by callers)."""
    return copy.deepcopy(_state)


def active_provider() -> Provider:
    return _state.get("active", "gateway")  # type: ignore[return-value]


def resolve(model_name: str | None = None) -> ResolvedLLM:
    """Resolve connection params for the active provider."""
    model = resolve_model_name(model_name)
    if active_provider() == "cursor":
        cursor = _state["cursor"]
        return ResolvedLLM(
            provider="cursor",
            base_url=cursor["base_url"],
            # ChatOpenAI requires a non-empty key even when the proxy ignores it.
            api_key=cursor["api_key"] or "cursor-to-api",
            model=model,
        )
    # OpenAI-compatible gateway. Some gateways (e.g. keyless workers.dev
    # proxies) need no API key; ChatOpenAI still requires a non-empty string,
    # so inject a placeholder when none is configured but a base_url exists.
    key = settings.openai_api_key
    if not key and settings.openai_base_url:
        key = "no-key-required"
    return ResolvedLLM(
        provider="gateway",
        base_url=settings.openai_base_url,
        api_key=key,
        model=model,
    )
