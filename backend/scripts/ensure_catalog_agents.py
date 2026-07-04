"""Add missing FULL_AGENT_CATALOG agents without deleting existing ones."""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from src.agents_lib.platform_constants import PLATFORM_SUPPORT_TOOL_NAMES
from src.config import settings
from src.database.full_catalog import FULL_AGENT_CATALOG
from src.database.session import async_session_maker
from src.demo.datasets import demo_context_for_slug
from src.models.agent import Agent, AgentStatus
from src.models.agent_action import AgentAction
from src.models.agent_link import AgentLink
from src.models.agent_permission import AgentUserPermission
from src.models.agent_prompt_template import AgentPromptTemplate
from src.models.user import User
from src.services.catalog_agent_upgrade_service import (
    CATALOG_SCHEMA_VERSION,
    widget_plan_for_catalog_entry,
)


async def ensure_catalog_agents() -> int:
    added = 0
    async with async_session_maker() as db:
        existing_slugs = set((await db.execute(select(Agent.slug))).scalars().all())
        by_slug: dict[str, Agent] = {}

        for cfg in FULL_AGENT_CATALOG:
            slug = cfg["slug"]
            if slug in existing_slugs:
                ag = (
                    await db.execute(select(Agent).where(Agent.slug == slug))
                ).scalar_one()
                by_slug[slug] = ag
                continue

            data = {
                k: v
                for k, v in cfg.items()
                if k not in ("actions", "templates", "link_specs", "api_bind_slugs")
            }
            cfg_json = dict(data.get("config_json") or {})
            cfg_json["widget_plan"] = widget_plan_for_catalog_entry(cfg)
            cfg_json["_catalog_version"] = CATALOG_SCHEMA_VERSION
            cfg_json.setdefault(
                "validation", {"state": "done", "training_completed": True}
            )
            data["config_json"] = cfg_json
            data["system_prompt"] = demo_context_for_slug(slug)
            if slug == "support":
                data["tool_names"] = list(PLATFORM_SUPPORT_TOOL_NAMES)

            ag = Agent(
                status=AgentStatus.ACTIVE,
                model_provider="openai",
                model_name=settings.openai_default_model,
                **data,
            )
            db.add(ag)
            await db.flush()

            for act in cfg.get("actions") or []:
                db.add(AgentAction(agent_id=ag.id, **act))
            for tpl in cfg.get("templates") or []:
                db.add(AgentPromptTemplate(agent_id=ag.id, **tpl))

            by_slug[slug] = ag
            added += 1
            print(f"added {slug}")

        for cfg in FULL_AGENT_CATALOG:
            caller = by_slug.get(cfg["slug"])
            if not caller:
                continue
            for spec in cfg.get("link_specs") or []:
                callee = by_slug.get(spec["callee_slug"])
                if not callee:
                    continue
                dup = (
                    await db.execute(
                        select(AgentLink).where(
                            AgentLink.caller_agent_id == caller.id,
                            AgentLink.callee_agent_id == callee.id,
                        )
                    )
                ).scalar_one_or_none()
                if dup:
                    continue
                db.add(
                    AgentLink(
                        caller_agent_id=caller.id,
                        callee_agent_id=callee.id,
                        link_type=spec["link_type"],
                        requires_user_permission=False,
                    )
                )

        admin = (
            await db.execute(
                select(User).where(User.email == settings.first_admin_email)
            )
        ).scalar_one_or_none()
        if admin:
            for ag in by_slug.values():
                perm = (
                    await db.execute(
                        select(AgentUserPermission).where(
                            AgentUserPermission.user_id == admin.id,
                            AgentUserPermission.agent_id == ag.id,
                        )
                    )
                ).scalar_one_or_none()
                if not perm:
                    db.add(
                        AgentUserPermission(
                            user_id=admin.id,
                            agent_id=ag.id,
                            can_invoke=True,
                            can_configure=True,
                        )
                    )

        await db.commit()
    return added


def main() -> None:
    n = asyncio.run(ensure_catalog_agents())
    print(f"ensure_catalog_agents: added {n}")


if __name__ == "__main__":
    main()
