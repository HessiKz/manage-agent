"""Persist + expose platform-wide settings, primarily the LLM provider toggle."""

from __future__ import annotations

from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.core import llm_runtime
from src.models.platform_setting import PlatformSetting


class PlatformSettingsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_row(self, key: str) -> PlatformSetting | None:
        result = await self.db.execute(
            select(PlatformSetting).where(PlatformSetting.key == key)
        )
        return result.scalar_one_or_none()

    async def get_value(self, key: str) -> dict[str, Any] | None:
        row = await self._get_row(key)
        return dict(row.value) if row and isinstance(row.value, dict) else None

    async def set_value(self, key: str, value: dict[str, Any]) -> dict[str, Any]:
        row = await self._get_row(key)
        if row is None:
            row = PlatformSetting(key=key, value=value)
            self.db.add(row)
        else:
            row.value = value
        await self.db.commit()
        await self.db.refresh(row)
        return dict(row.value)

    # ── LLM provider ───────────────────────────────────────────────

    async def load_llm_provider_into_cache(self) -> dict[str, Any]:
        """Hydrate the process-local cache from the DB (called at startup)."""
        stored = await self.get_value(llm_runtime.LLM_PROVIDER_KEY)
        return llm_runtime.update_cache(stored)

    async def get_llm_provider(self) -> dict[str, Any]:
        stored = await self.get_value(llm_runtime.LLM_PROVIDER_KEY)
        # Keep the cache in sync with the source of truth on every read.
        return llm_runtime.update_cache(stored)

    async def set_llm_provider(
        self,
        *,
        active: str,
        cursor_base_url: str | None = None,
        cursor_api_key: str | None = None,
        cursor_model: str | None = None,
    ) -> dict[str, Any]:
        current = await self.get_llm_provider()
        cursor = dict(current.get("cursor") or {})
        if cursor_base_url is not None:
            cursor["base_url"] = cursor_base_url
        if cursor_api_key is not None:
            cursor["api_key"] = cursor_api_key
        if cursor_model is not None:
            cursor["model"] = cursor_model
        value = {"active": active, "cursor": cursor}
        saved = await self.set_value(llm_runtime.LLM_PROVIDER_KEY, value)
        return llm_runtime.update_cache(saved)

    async def provider_health(self) -> dict[str, Any]:
        """Probe both providers so the admin UI can show live status."""
        state = await self.get_llm_provider()
        cursor_cfg = state.get("cursor") or {}
        cursor_base = cursor_cfg.get("base_url") or settings.cursor_api_base_url

        default_model = settings.openai_default_model
        gateway = {
            "configured": bool(settings.openai_api_key),
            "base_url": settings.openai_base_url or "https://api.openai.com/v1",
            "model": default_model,
        }

        cursor_status: dict[str, Any] = {
            "base_url": cursor_base,
            "model": default_model,
            "reachable": False,
            "detail": None,
        }
        health_url = cursor_base.rstrip("/") + "/health"
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(health_url)
                cursor_status["reachable"] = resp.status_code == 200
                if resp.status_code != 200:
                    cursor_status["detail"] = f"HTTP {resp.status_code}"
        except Exception as exc:  # noqa: BLE001 - surface any connection error
            cursor_status["detail"] = str(exc)[:200]

        return {
            "active": state.get("active", "gateway"),
            "gateway": gateway,
            "cursor": cursor_status,
        }

    # ── support autonomy default (Phase 1 M3) ─────────────────────

    async def get_autonomy_default(self) -> int:
        from src.services.autonomy_policy_service import (
            AUTONOMY_DEFAULT_KEY,
            AutonomyLevel,
        )

        value = await self.get_value(AUTONOMY_DEFAULT_KEY)
        return AutonomyLevel.coerce((value or {}).get("level"))

    async def set_autonomy_default(self, level: int) -> int:
        from src.services.autonomy_policy_service import (
            AUTONOMY_DEFAULT_KEY,
            AutonomyLevel,
        )

        coerced = AutonomyLevel.coerce(level)
        await self.set_value(AUTONOMY_DEFAULT_KEY, {"level": coerced})
        return coerced
