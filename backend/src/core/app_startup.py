"""Deferred application startup — keep /health fast for Docker and load balancers."""

from __future__ import annotations

import asyncio

from src.logger import get_logger

log = get_logger(__name__)


async def run_deferred_startup() -> None:
    """DB-backed init that must not block uvicorn from serving /health."""
    try:
        from src.database.session import async_session_maker
        from src.agents_lib.dynamic_tools import DynamicToolLoader

        async with async_session_maker() as db:
            n = await DynamicToolLoader.register_all(db)
            log.info("tools.registered", count=n)
    except Exception as exc:
        log.warning("tools.register_failed", error=str(exc))

    try:
        from src.database.session import async_session_maker
        from src.services.platform_settings_service import PlatformSettingsService

        async with async_session_maker() as db:
            state = await PlatformSettingsService(db).load_llm_provider_into_cache()
            log.info("llm_provider.loaded", active=state.get("active"))
    except Exception as exc:
        log.warning("llm_provider.load_failed", error=str(exc))

    try:
        from src.database.session import async_session_maker
        from src.services.agent_script_service import hydrate_import_allowlist

        async with async_session_maker() as db:
            extra = await hydrate_import_allowlist(db)
            log.info("script_import_allowlist.loaded", extra=len(extra))
    except Exception as exc:
        log.warning("script_import_allowlist.load_failed", error=str(exc))

    try:
        from src.database.session import async_session_maker
        from src.agents_lib.platform_tools import upgrade_platform_support_agent
        from src.services.catalog_agent_upgrade_service import (
            ensure_catalog_actions_templates,
            upgrade_catalog_agents,
        )

        async with async_session_maker() as db:
            n = await upgrade_catalog_agents(db)
            if n:
                log.info("catalog_agents.upgraded", count=n)
            tpl = await ensure_catalog_actions_templates(db)
            if tpl:
                log.info("catalog_agents.templates_added", count=tpl)
            upgraded = await upgrade_platform_support_agent(db)
            if upgraded:
                log.info("support_agent.upgraded")
    except Exception as exc:
        log.warning("catalog_agents.upgrade_failed", error=str(exc))

    try:
        from src.database.session import async_session_maker
        from src.services.karkard_workspace_service import ensure_catalog_karkard_outputs

        async with async_session_maker() as db:
            n = await ensure_catalog_karkard_outputs(db)
            if n:
                log.info("karkard.demo_output.ensured", count=n)
    except Exception as exc:
        log.warning("karkard.demo_output.ensure_failed", error=str(exc))

    try:
        from pathlib import Path

        from src.core.workspace_output_registry import reconcile_all_agent_manifests

        n = reconcile_all_agent_manifests(Path("var/agent_files"))
        if n:
            log.info("workspace_outputs.reconciled", count=n)
    except Exception as exc:
        log.warning("workspace_outputs.reconcile_failed", error=str(exc))

    log.info("app.deferred_startup.complete")


def schedule_deferred_startup() -> asyncio.Task[None]:
    return asyncio.create_task(run_deferred_startup())
