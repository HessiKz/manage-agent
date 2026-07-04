"""Seed admin, roles, full agent catalog, budgets, audit, notifications."""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import delete, select

from src.config import settings
from src.core.security import hash_password
from src.database.full_catalog import FULL_AGENT_CATALOG
from src.agents_lib.platform_constants import PLATFORM_SUPPORT_TOOL_NAMES
from src.services.catalog_agent_upgrade_service import (
    CATALOG_SCHEMA_VERSION,
    ensure_catalog_actions_templates,
    upgrade_catalog_agents,
    widget_plan_for_catalog_entry,
)
from src.database.session import async_session_maker
from src.models.access_request import AccessRequest, AccessRequestStatus
from src.models.agent import Agent, AgentKind, AgentStatus
from src.models.agent_action import AgentAction
from src.models.agent_link import AgentLink, AgentLinkType
from src.models.agent_prompt_template import AgentPromptTemplate
from src.models.agent_permission import AgentUserPermission
from src.models.audit_log import AuditLog
from src.models.budget import Budget, BudgetPeriod
from src.models.external_api import AuthType, ExternalApiEndpoint, ExternalApiService, HttpMethod
from src.models.notification import Notification, NotificationSeverity
from src.models.permission import Role
from src.models.user import User

SAMPLE_ROLES = [
    {"name": "admin", "description": "Full platform access", "is_system_role": True},
    {"name": "finance_manager", "description": "Finance department lead", "is_system_role": False},
    {"name": "hr_specialist", "description": "HR operations", "is_system_role": False},
    {"name": "support_agent", "description": "Support team member", "is_system_role": False},
]

LEGACY_EMAIL_ALIASES = {
    "finance@manage-agent.local": "finance@example.com",
    "hr@manage-agent.local": "hr@example.com",
    "admin@manage-agent.local": "admin@example.com",
}


SAMPLE_USERS = [
    {
        "email": "finance@example.com",
        "password": "finance123",
        "full_name": "مدیر مالی نمونه",
        "department": "finance",
    },
    {
        "email": "hr@example.com",
        "password": "hr12345",
        "full_name": "کارشناس منابع انسانی",
        "department": "hr",
    },
]

SAMPLE_AUDIT = [
    {
        "action": "agent_upgraded",
        "resource_type": "agent",
        "changes": {
            "message": "ایجنت «پاسخ تیکت» به نسخه v1.4 ارتقا یافت.",
            "severity": "info",
        },
    },
    {
        "action": "access_request",
        "resource_type": "user",
        "changes": {
            "message": "کاربر «ر. کریمی» درخواست دسترسی به «دستیار حقوق» داد.",
            "severity": "info",
        },
    },
    {
        "action": "integration_alert",
        "resource_type": "integration",
        "changes": {
            "message": "اتصال بانک ملت با تأخیر پاسخ می‌دهد.",
            "severity": "warning",
        },
    },
    {
        "action": "seed_reset",
        "resource_type": "system",
        "changes": {
            "message": "کاتالوگ کامل ایجنت‌ها و داده نمونه بازنشانی شد.",
            "severity": "success",
        },
    },
]

SAMPLE_NOTIFICATIONS = [
    ("خوش آمدید", "پلتفرم با کاتالوگ کامل ایجنت‌ها آماده است.", NotificationSeverity.SUCCESS, "/dashboard"),
    ("ایجنت‌ها", "کاتالوگ کامل ایجنت‌ها (شامل نوع API) ایجاد شد.", NotificationSeverity.INFO, "/agents"),
    ("سرپرست", "example-supervisor به chat، worker و file-intake متصل است.", NotificationSeverity.INFO, "/agents/example-supervisor"),
    ("یکپارچه‌سازی", "سرویس httpbin نمونه برای تست API اضافه شد.", NotificationSeverity.INFO, "/integrations"),
]


async def seed_demo_workspace_files(db, by_slug: dict) -> None:
    """Attach demo system context and sample uploaded files per agent kind."""
    import uuid
    from pathlib import Path

    from src.models.agent_file import AgentFile

    for ag in by_slug.values():
        ag.system_prompt = demo_context_for_slug(ag.slug)
        caps = ag.capabilities or {}
        if not caps.get("file_upload_enabled"):
            continue
        existing = (
            await db.execute(
                select(AgentFile.id).where(AgentFile.agent_id == ag.id).limit(1)
            )
        ).scalar_one_or_none()
        if existing:
            continue
        base_dir = Path("var/agent_files") / str(ag.id)
        base_dir.mkdir(parents=True, exist_ok=True)
        if ag.slug == "example-karkard":
            repo_root = Path(__file__).resolve().parents[3]
            src_candidates = [
                repo_root / "formdocs" / "کارکرد_توسعه_کارآفرینی_1405.2.xlsx",
                repo_root / "frontend" / "public" / "samples" / "karkard-raw.xlsx",
                Path(__file__).resolve().parents[2] / "tests/fixtures/karkard_sample.xlsx",
            ]
            src = next((p for p in src_candidates if p.is_file()), None)
            if src and src.is_file():
                name = "demo-karkard-raw.xlsx"
                mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                body = src.read_bytes()
            else:
                name, mime, body = "demo-karkard.txt", "text/plain", b"no fixture"
        elif ag.slug in ("bank-recon", "example-file-intake"):
            name, mime, body = "demo-bank.csv", "text/csv", b"date,amount\n1404/01/01,1000\n"
        else:
            name, mime, body = "demo-data.txt", "text/plain", AGENT_DEMO_SNIPPETS.get(
                ag.slug, "داده نمونه workspace"
            ).encode("utf-8")
        storage = base_dir / f"{uuid.uuid4().hex}_{name}"
        storage.write_bytes(body)
        db.add(
            AgentFile(
                agent_id=ag.id,
                filename=name,
                mime_type=mime,
                size_bytes=len(body),
                storage_path=str(storage),
            )
        )


async def delete_all_agents(db) -> int:
    """Remove every agent; CASCADE clears actions, links, files, permissions, etc."""
    result = await db.execute(delete(Agent))
    count = result.rowcount or 0
    await db.flush()
    return count


async def apply_api_bindings_from_catalog(db, by_slug: dict[str, Agent]) -> None:
    """Resolve api_bind_slugs in catalog entries into config_json.api_bindings."""
    for cfg in FULL_AGENT_CATALOG:
        spec = cfg.get("api_bind_slugs")
        if not spec:
            continue
        ag = by_slug.get(cfg["slug"])
        if not ag:
            continue
        svc = (
            await db.execute(
                select(ExternalApiService).where(ExternalApiService.slug == spec["service"])
            )
        ).scalar_one_or_none()
        if not svc:
            print(f"  ⚠️  api bind skip: {cfg['slug']} (service {spec['service']} missing)")
            continue
        eps = (
            await db.execute(
                select(ExternalApiEndpoint).where(
                    ExternalApiEndpoint.service_id == svc.id,
                    ExternalApiEndpoint.slug.in_(spec.get("endpoints") or []),
                )
            )
        ).scalars().all()
        cfg_json = dict(ag.config_json or {})
        cfg_json["api_bindings"] = {
            "service_ids": [str(svc.id)],
            "endpoint_ids": [str(ep.id) for ep in eps],
        }
        ag.config_json = cfg_json
        print(f"  ✅ api bindings: {ag.slug} -> {svc.slug} ({len(eps)} endpoints)")


async def seed_agents_from_catalog(db) -> dict[str, Agent]:
    """Insert all catalog agents; return slug -> Agent map."""
    by_slug: dict[str, Agent] = {}
    for cfg in FULL_AGENT_CATALOG:
        data = {
            k: v
            for k, v in cfg.items()
            if k not in ("actions", "templates", "link_specs", "api_bind_slugs")
        }
        cfg_json = dict(data.get("config_json") or {})
        cfg_json["widget_plan"] = widget_plan_for_catalog_entry(cfg)
        cfg_json["_catalog_version"] = CATALOG_SCHEMA_VERSION
        cfg_json.setdefault("validation", {})
        cfg_json["validation"].setdefault("state", "done")
        cfg_json["validation"].setdefault("training_completed", True)
        data["config_json"] = cfg_json
        data["system_prompt"] = demo_context_for_slug(cfg["slug"])
        if cfg["slug"] == "support":
            data["tool_names"] = list(PLATFORM_SUPPORT_TOOL_NAMES)
        ag = Agent(
            status=AgentStatus.ACTIVE,
            model_provider="openai",
            model_name=settings.openai_default_model,
            **data,
        )
        db.add(ag)
        await db.flush()

        for i, act in enumerate(cfg.get("actions") or []):
            db.add(AgentAction(agent_id=ag.id, **act))

        for i, tpl in enumerate(cfg.get("templates") or []):
            db.add(AgentPromptTemplate(agent_id=ag.id, **tpl))

        by_slug[ag.slug] = ag
        print(f"  ✅ agent: {ag.slug} ({ag.kind.value})")

    await db.flush()

    for cfg in FULL_AGENT_CATALOG:
        caller = by_slug.get(cfg["slug"])
        if not caller:
            continue
        for spec in cfg.get("link_specs") or []:
            callee = by_slug.get(spec["callee_slug"])
            if not callee:
                print(f"  ⚠️  link skip: {cfg['slug']} -> {spec['callee_slug']} (missing)")
                continue
            db.add(
                AgentLink(
                    caller_agent_id=caller.id,
                    callee_agent_id=callee.id,
                    link_type=spec["link_type"],
                    requires_user_permission=False,
                )
            )
    await db.flush()
    return by_slug


async def seed(
    *,
    reset_agents: bool = False,
    refresh_aux: bool = False,
) -> None:
    async with async_session_maker() as db:
        # Admin
        result = await db.execute(select(User).where(User.email == settings.first_admin_email))
        admin = result.scalar_one_or_none()
        if not admin:
            admin = User(
                email=settings.first_admin_email.lower(),
                hashed_password=hash_password(settings.first_admin_password),
                full_name=settings.first_admin_name,
                is_superuser=True,
                is_active=True,
                locale="fa",
            )
            db.add(admin)
            await db.flush()
            print(f"✅ Created admin: {admin.email}")

        for cfg in SAMPLE_ROLES:
            existing = await db.execute(select(Role).where(Role.name == cfg["name"]))
            if not existing.scalar_one_or_none():
                db.add(Role(**cfg))
                print(f"✅ Created role: {cfg['name']}")

        for old_email, new_email in LEGACY_EMAIL_ALIASES.items():
            legacy = (
                await db.execute(select(User).where(User.email == old_email))
            ).scalar_one_or_none()
            if not legacy:
                continue
            target = (
                await db.execute(select(User).where(User.email == new_email))
            ).scalar_one_or_none()
            if target and target.id != legacy.id:
                await db.delete(legacy)
                print(f"✅ Removed duplicate legacy user: {old_email}")
            else:
                legacy.email = new_email
                print(f"✅ Migrated user email: {old_email} -> {new_email}")
        await db.flush()

        for cfg in SAMPLE_USERS:
            existing = (
                await db.execute(select(User).where(User.email == cfg["email"]))
            ).scalar_one_or_none()
            if existing:
                continue
            db.add(
                User(
                    email=cfg["email"],
                    hashed_password=hash_password(cfg["password"]),
                    full_name=cfg["full_name"],
                    is_superuser=False,
                    is_active=True,
                    locale="fa",
                    department=cfg.get("department"),
                )
            )
            await db.flush()
            print(f"✅ Created user: {cfg['email']}")
        admin = (
            await db.execute(select(User).where(User.email == settings.first_admin_email))
        ).scalar_one_or_none()

        if reset_agents:
            n = await delete_all_agents(db)
            print(f"🗑️  Deleted {n} agents")
            await db.execute(delete(Budget))
            print("🗑️  Cleared agent budgets")

        existing_count = (await db.execute(select(Agent.id).limit(1))).scalar_one_or_none()
        if reset_agents or not existing_count:
            print("📦 Seeding full agent catalog…")
            by_slug = await seed_agents_from_catalog(db)

            finance_agents = (
                await db.execute(select(Agent).where(Agent.department == "finance"))
            ).scalars().all()
            for ag in finance_agents:
                db.add(
                    Budget(
                        name=f"{ag.name} — ماهانه",
                        amount=1000,
                        currency="USD",
                        period=BudgetPeriod.MONTHLY,
                        agent_id=ag.id,
                        alert_threshold=0.8,
                    )
                )
            print(f"✅ Budgets for {len(finance_agents)} finance agents")

            if admin:
                all_agents = (await db.execute(select(Agent))).scalars().all()
                for ag in all_agents:
                    exists = (
                        await db.execute(
                            select(AgentUserPermission).where(
                                AgentUserPermission.user_id == admin.id,
                                AgentUserPermission.agent_id == ag.id,
                            )
                        )
                    ).scalar_one_or_none()
                    if not exists:
                        db.add(
                            AgentUserPermission(
                                user_id=admin.id,
                                agent_id=ag.id,
                                can_invoke=True,
                                can_configure=True,
                            )
                        )
                print(f"✅ Admin permissions on {len(all_agents)} agents")

            await seed_demo_workspace_files(db, by_slug)
            print("✅ Demo workspace files + prompts for all agents")

            payroll = by_slug.get("payroll")
            finance_user = (
                await db.execute(select(User).where(User.email == "finance@example.com"))
            ).scalar_one_or_none()
            if payroll and finance_user:
                pending = (
                    await db.execute(
                        select(AccessRequest).where(
                            AccessRequest.user_id == finance_user.id,
                            AccessRequest.agent_id == payroll.id,
                        )
                    )
                ).scalar_one_or_none()
                if not pending:
                    db.add(
                        AccessRequest(
                            user_id=finance_user.id,
                            agent_id=payroll.id,
                            status=AccessRequestStatus.PENDING,
                            reason="نیاز به اجرای حقوق ماه جاری",
                        )
                    )
                    print("✅ Sample pending access request")
        else:
            n = await upgrade_catalog_agents(db)
            tpl = await ensure_catalog_actions_templates(db)
            if n or tpl:
                print(f"🔄 Catalog sync: {n} agents updated, {tpl} actions/templates added")

        if refresh_aux or reset_agents:
            await db.execute(delete(AuditLog))
            for cfg in SAMPLE_AUDIT:
                db.add(AuditLog(**cfg))
            print(f"✅ {len(SAMPLE_AUDIT)} audit events")

            if admin:
                await db.execute(delete(Notification).where(Notification.user_id == admin.id))
                for title, message, severity, link in SAMPLE_NOTIFICATIONS:
                    db.add(
                        Notification(
                            user_id=admin.id,
                            title=title,
                            message=message,
                            severity=severity,
                            link=link,
                            is_read=False,
                        )
                    )
                print(f"✅ {len(SAMPLE_NOTIFICATIONS)} notifications")

        api_existing = (
            await db.execute(
                select(ExternalApiService).where(ExternalApiService.slug == "httpbin-demo")
            )
        ).scalar_one_or_none()
        if not api_existing:
            svc = ExternalApiService(
                name="HTTPBin Demo",
                slug="httpbin-demo",
                base_url="https://httpbin.org",
                auth_type=AuthType.NONE,
                description="نمونه برای تست یکپارچه‌سازی",
            )
            db.add(svc)
            await db.flush()
            db.add(
                ExternalApiEndpoint(
                    service_id=svc.id,
                    name="Get IP",
                    slug="get-ip",
                    path="/ip",
                    method=HttpMethod.GET,
                    description="برگرداندن IP عمومی",
                )
            )
            print("✅ External API: httpbin-demo")

        all_by_slug = {
            a.slug: a for a in (await db.execute(select(Agent))).scalars().all()
        }
        await apply_api_bindings_from_catalog(db, all_by_slug)

        total = (await db.execute(select(Agent))).scalars().all()
        kinds = {}
        for a in total:
            kinds[a.kind.value] = kinds.get(a.kind.value, 0) + 1
        print(f"\n📊 Agents in DB: {len(total)} — kinds: {kinds}")
        await db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed manage-agent database")
    parser.add_argument(
        "--reset-agents",
        action="store_true",
        help="Delete all agents and re-seed the full catalog",
    )
    parser.add_argument(
        "--refresh-aux",
        action="store_true",
        help="Refresh audit logs and admin notifications",
    )
    args = parser.parse_args()
    asyncio.run(
        seed(
            reset_agents=args.reset_agents,
            refresh_aux=args.refresh_aux or args.reset_agents,
        )
    )


if __name__ == "__main__":
    main()
