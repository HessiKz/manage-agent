"""Platform administration tools for the support / guide agent."""

from __future__ import annotations

import json
import random
import re
import secrets
from contextvars import ContextVar
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from slugify import slugify

from langchain_core.tools import tool
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.agents_lib.platform_constants import (
    DEPT_LABELS_FA,
    PLATFORM_SUPPORT_TOOL_NAMES,
    department_label_fa,
    normalize_agent_tab,
    normalize_department,
)
from src.agents_lib.dynamic_tools import DynamicToolLoader
from src.agents_lib.platform_ui_catalog import (
    catalog_for_llm,
    steps_require_superuser,
    validate_ui_steps,
)
from src.agents_lib.tool_registry import ToolRegistry
from src.database.session import async_session_maker
from src.demo.datasets import demo_context_for_slug
from src.models.agent import Agent, AgentKind
from src.models.external_api import AuthType, ExternalApiEndpoint, ExternalApiService, HttpMethod
from src.models.permission import Role
from src.models.user import User
from src.schemas.agent import AgentCreate
from src.schemas.agent_api_bindings import AgentApiBindings
from src.schemas.user import UserAdminCreate, UserCreate
from src.services.agent_service import AgentService
from src.services.auth_service import AuthService
from src.services.external_api_service import ExternalApiServiceLayer
from src.services.platform_wizard_service import agent_ui_path
from src.services.platform_widget_prompts import default_widget_prompt

_platform_user_id: ContextVar[str | None] = ContextVar("platform_user_id", default=None)


def set_platform_context(user: User | None) -> None:
    """Bind invoke user for platform LangChain tools (async — same event loop as FastAPI)."""
    _platform_user_id.set(str(user.id) if user else None)


def clear_platform_context() -> None:
    _platform_user_id.set(None)


set_platform_user = set_platform_context
clear_platform_user = clear_platform_context


async def _load_user(db: AsyncSession, user_id: UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def _require_user(db: AsyncSession) -> User | dict:
    user_id = _platform_user_id.get()
    if not user_id:
        return {"error": "Platform context missing"}
    user = await _load_user(db, UUID(user_id))
    if not user:
        return {"error": "User not found"}
    return user


def _admin_only(user: User, *, capability: str = "admin") -> dict | None:
    if not user.is_superuser:
        messages = {
            "create_agent": (
                "ساخت ایجنت فقط برای ادمین پلتفرم مجاز است — "
                "از نوار کنار به «نمای ادمین» بروید یا از مدیر سیستم بخواهید."
            ),
            "manage_users": "مدیریت کاربران فقط برای ادمین است — از مدیر سیستم بخواهید.",
            "access_admin": "پنل ادمین فقط برای ادمین در دسترس است.",
        }
        return {
            "success": False,
            "error": messages.get(capability, "این عملیات فقط برای ادمین پلتفرم مجاز است."),
            "capability": capability,
            "requires_superuser": True,
        }
    return None


def check_platform_capability(action: str, user: User) -> dict | None:
    """Return denial dict before emitting ui_script, or None if allowed."""
    admin_actions = {
        "create_agent",
        "manage_users",
        "access_admin",
        "platform_create_agent",
        "platform_create_user",
        "platform_create_widget_for_agent",
    }
    if action in admin_actions or action.startswith("admin_"):
        cap = "create_agent" if "agent" in action and "user" not in action else (
            "manage_users" if "user" in action else "access_admin"
        )
        if action == "platform_create_user":
            cap = "manage_users"
        if action == "platform_create_agent":
            cap = "create_agent"
        return _admin_only(user, capability=cap)
    return None


def user_capabilities_payload(user: User) -> dict[str, Any]:
    is_admin = bool(user.is_superuser)
    user_paths = ["/dashboard", "/agents", "/knowledge", "/settings", "/integrations", "/conversations"]
    admin_paths = user_paths + ["/agents/create", "/users", "/admin"]
    return {
        "is_superuser": is_admin,
        "can_create_agent": is_admin,
        "can_manage_users": is_admin,
        "can_access_admin": is_admin,
        "allowed_paths": admin_paths if is_admin else user_paths,
    }


def _ui_action_payload(
    *,
    path: str,
    label: str,
    kind: str,
    preview: str = "",
    highlight_widget: str | None = None,
    wizard_step: str | None = None,
) -> dict:
    ui_action: dict = {
        "type": "navigate",
        "path": path,
        "label": label,
        "kind": kind,
    }
    if preview:
        ui_action["preview"] = preview
    if highlight_widget:
        ui_action["highlight_widget"] = highlight_widget
    if wizard_step:
        ui_action["wizard_step"] = wizard_step
    return ui_action


def _humanize_platform_error(exc: Exception) -> str:
    msg = str(exc).strip()
    lowered = msg.lower()
    if "badly formed hexadecimal uuid" in lowered or "invalid uuid" in lowered:
        return "شناسهٔ ایجنت نامعتبر است — لطفاً دوباره تلاش کنید."
    if "agent not found" in lowered or "not found" in lowered:
        return "ایجنت پیدا نشد — شناسه یا نام ایجنت را بررسی کنید."
    if "platform context missing" in lowered:
        return "خطای داخلی پلتفرم — لطفاً صفحه را رفرش کنید و دوباره تلاش کنید."
    if (
        "invalid token" in lowered
        or "incorrect api key" in lowered
        or "authenticationerror" in lowered
        or "api key" in lowered
        and ("invalid" in lowered or "401" in msg)
    ):
        return (
            "کلید API مدل زبانی نامعتبر یا منقضی است — "
            "در ادمین → ارائه‌دهنده مدل، OPENAI_API_KEY را در backend/.env به‌روز کنید "
            "یا به cursor-to-api تغییر دهید."
        )
    if "connection refused" in lowered and ("9191" in msg or "cursor" in lowered):
        return (
            "سرویس cursor-to-api در دسترس نیست — "
            "make dev را اجرا کنید یا در ادمین به gateway با کلید معتبر برگردید."
        )
    if msg and not re.search(r"[\u0600-\u06ff]", msg):
        return "خطایی رخ داد — لطفاً دوباره تلاش کنید."
    return msg or "خطایی رخ داد — لطفاً دوباره تلاش کنید."


def _tool_result(**fields) -> dict:
    append: dict = {}
    ui_action = fields.get("ui_action")
    ui_script = fields.get("ui_script")
    if ui_action:
        append["ui_action"] = ui_action
    if ui_script:
        append["ui_script"] = ui_script
    if append:
        fields["append_json"] = json.dumps(append, ensure_ascii=False)
    return fields


def _ui_script(label: str, steps: list[dict]) -> dict:
    return {"label": label, "steps": steps}


_PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")


def _name_candidates(base_name: str) -> list[str]:
    trimmed = (base_name or "").strip()
    if not trimmed:
        return []
    match = re.match(r"^(.*?)(?:\s+([۰-۹0-9]+))?\s*$", trimmed)
    stem = (match.group(1) if match else trimmed).strip() or trimmed
    suffix = match.group(2) if match else None
    start = int(suffix.translate(_PERSIAN_DIGITS)) + 1 if suffix else 2
    out = [trimmed]
    out.extend(f"{stem} {start + i}" for i in range(40))
    from time import time_ns

    out.append(f"{stem} {time_ns() % 100_000}")
    return out


async def _resolve_unique_agent_name(db: AsyncSession, base_name: str) -> tuple[str, str]:
    """Return display name and slug; bump numeric suffix until slug is free."""
    agents = AgentService(db).agents
    seen: set[str] = set()
    for candidate in _name_candidates(base_name):
        if candidate in seen:
            continue
        seen.add(candidate)
        slug = slugify(candidate, lowercase=True)
        if not slug:
            continue
        existing = await agents.get_by_slug(slug)
        if existing is None:
            return candidate, slug
    raise ValueError(f"نامی آزاد برای «{base_name.strip()}» پیدا نشد")


async def _resolve_agent(
    db: AsyncSession,
    *,
    agent_id: str = "",
    agent_slug: str = "",
    agent_name: str = "",
    pick_random: bool = False,
    require_chat: bool = False,
    exclude_slugs: set[str] | None = None,
) -> Agent | None:
    svc = AgentService(db)

    raw_id = agent_id.strip()
    raw_slug = agent_slug.strip()

    if raw_id:
        try:
            return await svc.get(UUID(raw_id))
        except (ValueError, HTTPException):
            if not raw_slug:
                raw_slug = raw_id

    if raw_slug:
        slug = raw_slug.lower()
        found = await svc.get_by_slug(slug)
        if found:
            return found
        needle = slug.replace("_", " ").replace("-", " ")
        items, _ = await svc.list(page=1, page_size=20, search=needle)
        if len(items) == 1:
            return items[0]
        for candidate in items:
            if candidate.slug.replace("-", "_") == slug.replace("-", "_"):
                return candidate

    if agent_name.strip():
        name = agent_name.strip()
        items, _ = await svc.list(page=1, page_size=50, search=name)
        for candidate in items:
            if candidate.name.strip() == name:
                return candidate
        if items:
            return items[0]

    if pick_random:
        items, _ = await svc.list(page=1, page_size=100)
        blocked = exclude_slugs or set()
        pool = [a for a in items if a.slug not in blocked and a.slug != "support"]
        if require_chat:
            pool = [a for a in pool if (a.capabilities or {}).get("chat_enabled")]
        if pool:
            return random.choice(pool)

    return None


@tool
async def platform_open_agent(
    agent_slug: str = "",
    agent_id: str = "",
    agent_name: str = "",
    pick_random: bool = False,
    tab: str = "chat",
) -> dict:
    """Open an agent page by real slug/id/name — never guess slugs.

    tab: chat (گفتگو), execute, overview, runs, settings. Use pick_random=true for any agent.
    """
    if not _platform_user_id.get():
        return {"error": "Platform context missing"}

    tab_slug = normalize_agent_tab(tab) or "chat"
    require_chat = tab_slug == "chat"

    try:
        async with async_session_maker() as db:
            agent = await _resolve_agent(
                db,
                agent_id=agent_id,
                agent_slug=agent_slug,
                agent_name=agent_name,
                pick_random=pick_random,
                require_chat=require_chat,
            )
            if not agent:
                hint = await AgentService(db).list(page=1, page_size=8)
                samples = [f"{a.name} ({a.slug})" for a in hint[0][:8]]
                return {
                    "success": False,
                    "error": (
                        "ایجنت پیدا نشد — slug را حدس نزنید. "
                        f"از platform_list_agents استفاده کنید. نمونه: {'؛ '.join(samples)}"
                    ),
                }

            chat_enabled = bool((agent.capabilities or {}).get("chat_enabled"))
            effective_tab = tab_slug
            if tab_slug == "chat" and not chat_enabled:
                effective_tab = "execute"

            path = agent_ui_path(agent, tab=effective_tab)
            tab_labels = {
                "chat": "گفت‌وگو",
                "execute": "اجرا و راهنما",
                "overview": "پنل ایجنت",
                "runs": "تاریخچه اجرا",
                "settings": "تنظیمات",
            }
            tab_label = tab_labels.get(effective_tab, effective_tab)
            human = f"ایجنت «{agent.name}» (شناسه {agent.slug}) — تب {tab_label}."
            if tab_slug == "chat" and not chat_enabled:
                human += " (این ایجنت گفت‌وگو ندارد — تب اجرا باز می‌شود.)"
            ui_script = _ui_script(
                f"باز کردن «{agent.name}»",
                [
                    {
                        "type": "navigate",
                        "path": path,
                        "label": f"رفتن به {agent.name}",
                    },
                    {"type": "wait", "ms": 700},
                    {
                        "type": "wait_for_dom",
                        "selector": '[data-ma-guide="agent-tabs"]',
                        "timeout_ms": 30_000,
                        "label": f"منتظر بارگذاری «{agent.name}»",
                    },
                ],
            )
            return _tool_result(
                success=True,
                agent_id=str(agent.id),
                name=agent.name,
                slug=agent.slug,
                path=path,
                tab=effective_tab,
                chat_enabled=chat_enabled,
                message=human,
                ui_script=ui_script,
            )
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": str(exc)}


@tool
def platform_get_ui_catalog() -> dict:
    """Return pages, CSS targets, and example UI scripts for platform_execute_ui."""
    return {"success": True, "catalog": catalog_for_llm()}


@tool
async def platform_get_user_capabilities() -> dict:
    """Return what the current user can do on the platform (self-check before UI scripts)."""
    if not _platform_user_id.get():
        return {"error": "Platform context missing"}
    try:
        async with async_session_maker() as db:
            actor = await _require_user(db)
            if isinstance(actor, dict):
                return actor
            caps = user_capabilities_payload(actor)
            role = "ادمین" if actor.is_superuser else "کاربر"
            human = (
                f"دسترسی فعلی ({role}): "
                f"create_agent={caps['can_create_agent']} · "
                f"manage_users={caps['can_manage_users']} · "
                f"paths={', '.join(caps['allowed_paths'][:6])}…"
            )
            return _tool_result(success=True, capabilities=caps, message=human)
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": str(exc)}


@tool
async def platform_execute_ui(label: str, steps_json: str) -> dict:
    """Run arbitrary visible UI automation (navigate, click, type, wait).

    steps_json: JSON array of steps. Use selectors from platform_get_ui_catalog only.
    Omit click on buttons the user asked not to press.
    """
    if not _platform_user_id.get():
        return {"error": "Platform context missing"}
    if not label.strip():
        return {"success": False, "error": "label الزامی است"}

    try:
        raw_steps = json.loads(steps_json)
    except json.JSONDecodeError as exc:
        return {"success": False, "error": f"steps_json نامعتبر: {exc}"}

    if not isinstance(raw_steps, list):
        return {"success": False, "error": "steps_json باید آرایه باشد"}

    steps, err = validate_ui_steps(raw_steps)
    if err:
        return {"success": False, "error": err}

    if steps_require_superuser(raw_steps):
        async with async_session_maker() as db:
            actor = await _require_user(db)
            if isinstance(actor, dict):
                return actor
            denied = _admin_only(actor, capability="execute_admin_ui")
            if denied:
                denied["capability"] = (
                    "create_agent"
                    if any(
                        isinstance(s, dict)
                        and s.get("type") == "navigate"
                        and isinstance(s.get("path"), str)
                        and s["path"].startswith("/agents/create")
                        for s in raw_steps
                    )
                    else "access_admin"
                )
                return denied

    human = f"در حال اجرای «{label.strip()}» در رابط ({len(steps)} مرحله)…"
    ui_script = _ui_script(label.strip(), steps)
    return _tool_result(
        success=True,
        step_count=len(steps),
        message=human,
        ui_script=ui_script,
    )


def _parse_auth_type(raw: str) -> AuthType:
    try:
        return AuthType((raw or "none").strip().lower())
    except ValueError:
        return AuthType.NONE


def _parse_http_method(raw: str) -> HttpMethod:
    try:
        return HttpMethod((raw or "GET").strip().upper())
    except ValueError:
        return HttpMethod.GET


async def _resolve_endpoint(
    db: AsyncSession,
    *,
    endpoint_id: str = "",
    service_slug: str = "",
    endpoint_slug: str = "",
) -> ExternalApiEndpoint | dict:
    layer = ExternalApiServiceLayer(db)
    if endpoint_id.strip():
        ep = await db.get(ExternalApiEndpoint, UUID(endpoint_id.strip()))
        if not ep:
            return {"success": False, "error": "اندپوینت پیدا نشد"}
        return ep
    if service_slug.strip() and endpoint_slug.strip():
        result = await db.execute(
            select(ExternalApiService).where(ExternalApiService.slug == service_slug.strip())
        )
        svc = result.scalar_one_or_none()
        if not svc:
            return {"success": False, "error": f"سرویس «{service_slug}» پیدا نشد"}
        result = await db.execute(
            select(ExternalApiEndpoint).where(
                ExternalApiEndpoint.service_id == svc.id,
                ExternalApiEndpoint.slug == endpoint_slug.strip(),
            )
        )
        ep = result.scalar_one_or_none()
        if not ep:
            return {"success": False, "error": f"اندپوینت «{endpoint_slug}» پیدا نشد"}
        return ep
    return {"success": False, "error": "endpoint_id یا service_slug+endpoint_slug الزامی است"}


@tool
async def platform_create_external_api(
    service_name: str,
    base_url: str,
    endpoint_name: str,
    endpoint_path: str = "/ip",
    endpoint_method: str = "GET",
    service_description: str = "",
    auth_type: str = "none",
) -> dict:
    """Create an external API service + endpoint in the database (admin only).

    Use for «API اضافه کن» — do not only navigate to /integrations.
    """
    if not service_name.strip() or not base_url.strip() or not endpoint_name.strip():
        return {"success": False, "error": "نام سرویس، base_url و نام اندپوینت الزامی است"}

    try:
        async with async_session_maker() as db:
            actor = await _require_user(db)
            if isinstance(actor, dict):
                return actor
            denied = _admin_only(actor)
            if denied:
                return denied

            layer = ExternalApiServiceLayer(db)
            svc_slug = slugify(service_name.strip())
            existing = await db.execute(
                select(ExternalApiService).where(ExternalApiService.slug == svc_slug)
            )
            if existing.scalar_one_or_none():
                svc_slug = f"{svc_slug}-{secrets.token_hex(3)}"

            svc = await layer.create_service(
                {
                    "name": service_name.strip(),
                    "slug": svc_slug,
                    "description": service_description.strip() or None,
                    "base_url": base_url.strip(),
                    "auth_type": _parse_auth_type(auth_type),
                    "auth_config": {},
                    "default_headers": {},
                    "is_active": True,
                }
            )
            ep = await layer.create_endpoint(
                svc.id,
                {
                    "name": endpoint_name.strip(),
                    "path": endpoint_path.strip() or "/",
                    "method": _parse_http_method(endpoint_method),
                    "register_as_tool": True,
                    "is_active": True,
                },
            )
            await DynamicToolLoader.register_all(db)

            human = (
                f"سرویس API «{svc.name}» ({svc.base_url}) و اندپوینت "
                f"«{ep.name}» {ep.method.value} {ep.path} ساخته شد."
            )
            ui_script = _ui_script(
                f"نمایش سرویس «{svc.name}»",
                [
                    {"type": "navigate", "path": "/integrations", "label": "رفتن به اتصالات"},
                    {"type": "wait", "ms": 600},
                ],
            )
            return _tool_result(
                success=True,
                service_id=str(svc.id),
                service_slug=svc.slug,
                service_name=svc.name,
                base_url=svc.base_url,
                endpoint_id=str(ep.id),
                endpoint_slug=ep.slug,
                endpoint_name=ep.name,
                endpoint_path=ep.path,
                endpoint_method=ep.method.value if hasattr(ep.method, "value") else str(ep.method),
                message=human,
                ui_script=ui_script,
            )
    except HTTPException as exc:
        detail = exc.detail
        if isinstance(detail, list):
            detail = "; ".join(str(item) for item in detail)
        return {"success": False, "error": str(detail)}
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": str(exc)}


@tool
async def platform_test_external_api(
    endpoint_id: str = "",
    service_slug: str = "",
    endpoint_slug: str = "",
) -> dict:
    """Execute a live HTTP test against an external API endpoint."""
    try:
        async with async_session_maker() as db:
            actor = await _require_user(db)
            if isinstance(actor, dict):
                return actor

            ep = await _resolve_endpoint(
                db,
                endpoint_id=endpoint_id,
                service_slug=service_slug,
                endpoint_slug=endpoint_slug,
            )
            if isinstance(ep, dict):
                return ep

            layer = ExternalApiServiceLayer(db)
            result = await layer.test_endpoint(ep.id, {}, {})
            status_code = result.get("status_code", "?")
            preview = json.dumps(result.get("data", {}), ensure_ascii=False)[:500]
            human = f"تست اندپوینت «{ep.name}» — HTTP {status_code}"
            return _tool_result(
                success=True,
                endpoint_id=str(ep.id),
                endpoint_name=ep.name,
                status_code=status_code,
                response_preview=preview,
                response=result,
                message=human,
            )
    except HTTPException as exc:
        detail = exc.detail
        if isinstance(detail, list):
            detail = "; ".join(str(item) for item in detail)
        return {"success": False, "error": str(detail)}
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": str(exc)}


@tool
async def platform_create_api_agent(
    agent_name: str,
    endpoint_id: str = "",
    service_id: str = "",
    service_slug: str = "",
    endpoint_slug: str = "",
    description: str = "",
) -> dict:
    """Create an active agent bound to external API endpoint(s) (admin only)."""
    if not agent_name.strip():
        return {"success": False, "error": "نام ایجنت الزامی است"}

    try:
        async with async_session_maker() as db:
            actor = await _require_user(db)
            if isinstance(actor, dict):
                return actor
            denied = _admin_only(actor)
            if denied:
                return denied

            ep = await _resolve_endpoint(
                db,
                endpoint_id=endpoint_id,
                service_slug=service_slug,
                endpoint_slug=endpoint_slug,
            )
            if isinstance(ep, dict):
                return ep

            svc_id = service_id.strip() or str(ep.service_id)
            ep_id = str(ep.id)
            clean_name, slug = await _resolve_unique_agent_name(db, agent_name.strip())
            desc = (description or f"ایجنت متصل به API {ep.name}").strip()

            payload = AgentCreate(
                name=clean_name,
                slug=slug,
                description=desc,
                department="ops",
                kind=AgentKind.API,
                capabilities={
                    "chat_enabled": True,
                    "external_apis_enabled": True,
                    "actions_enabled": True,
                    "templates_enabled": True,
                },
                api_bindings=AgentApiBindings(
                    service_ids=[UUID(svc_id)],
                    endpoint_ids=[UUID(ep_id)],
                ),
            )
            agent_svc = AgentService(db)
            agent = await agent_svc.create(payload, actor)
            agent = await agent_svc.finalize_quick_start(agent, description=desc)
            await DynamicToolLoader.register_for_agent(db, agent)

            human = (
                f"ایجنت «{agent.name}» (شناسه `{agent.slug}`) با API «{ep.name}» ساخته و فعال شد."
            )
            path = agent_ui_path(agent, tab="chat")
            ui_script = _ui_script(
                f"باز کردن ایجنت «{agent.name}»",
                [
                    {"type": "navigate", "path": path, "label": f"رفتن به {agent.name}"},
                    {"type": "wait_for_dom", "selector": '[data-ma-guide="agent-tabs"]'},
                ],
            )
            return _tool_result(
                success=True,
                agent_id=str(agent.id),
                agent_name=agent.name,
                agent_slug=agent.slug,
                endpoint_id=ep_id,
                service_id=svc_id,
                message=human,
                ui_script=ui_script,
            )
    except HTTPException as exc:
        detail = exc.detail
        if isinstance(detail, list):
            detail = "; ".join(str(item) for item in detail)
        return {"success": False, "error": str(detail)}
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": str(exc)}


@tool
async def platform_provision_api_agent(
    service_name: str = "",
    base_url: str = "https://httpbin.org",
    endpoint_name: str = "Get IP",
    endpoint_path: str = "/ip",
    endpoint_method: str = "GET",
    agent_name: str = "",
    service_description: str = "",
) -> dict:
    """Full workflow: create external API + endpoint, test it, create bound agent, open agent.

    Use when user asks to add API, create agent for it, and test — one tool call.
    """
    suffix = secrets.token_hex(3)
    svc_name = (service_name or f"API {suffix}").strip()
    ep_name = (endpoint_name or "Get IP").strip()
    ag_name = (agent_name or f"ایجنت {svc_name}").strip()

    created = await platform_create_external_api.ainvoke(
        {
            "service_name": svc_name,
            "base_url": base_url,
            "endpoint_name": ep_name,
            "endpoint_path": endpoint_path,
            "endpoint_method": endpoint_method,
            "service_description": service_description,
            "auth_type": "none",
        }
    )
    if isinstance(created, dict) and not created.get("success"):
        return created

    tested = await platform_test_external_api.ainvoke(
        {"endpoint_id": created.get("endpoint_id", "")}
    )
    if isinstance(tested, dict) and not tested.get("success"):
        return tested

    agent = await platform_create_api_agent.ainvoke(
        {
            "agent_name": ag_name,
            "endpoint_id": created.get("endpoint_id", ""),
            "service_id": created.get("service_id", ""),
        }
    )
    if isinstance(agent, dict) and not agent.get("success"):
        return agent

    def _ui_from_result(result: dict) -> dict | None:
        if ui := result.get("ui_script"):
            return ui
        raw = result.get("append_json")
        if isinstance(raw, str) and raw.strip():
            try:
                return json.loads(raw).get("ui_script")
            except json.JSONDecodeError:
                return None
        return None

    status_code = tested.get("status_code", "?")
    preview = tested.get("response_preview", "")
    human = (
        f"✓ سرویس «{created.get('service_name')}» + اندپوینت «{created.get('endpoint_name')}» ساخته شد.\n"
        f"✓ تست HTTP {status_code}: {preview}\n"
        f"✓ ایجنت «{agent.get('agent_name')}» (`{agent.get('agent_slug')}`) فعال شد."
    )
    return _tool_result(
        success=True,
        service_id=created.get("service_id"),
        service_slug=created.get("service_slug"),
        endpoint_id=created.get("endpoint_id"),
        agent_id=agent.get("agent_id"),
        agent_slug=agent.get("agent_slug"),
        agent_name=agent.get("agent_name"),
        status_code=status_code,
        response_preview=preview,
        message=human,
        ui_script=_ui_from_result(agent) or _ui_from_result(created),
    )


@tool
async def platform_list_agents(
    search: str = "",
    department: str = "",
    limit: int = 20,
) -> dict:
    """List organization agents. Filter by department slug or Persian name (ops / عملیات)."""
    user_id = _platform_user_id.get()
    if not user_id:
        return {"error": "Platform context missing"}

    limit = max(1, min(int(limit), 50))
    dept = normalize_department(department) if department.strip() else None

    try:
        async with async_session_maker() as db:
            user = await _load_user(db, UUID(user_id))
            if not user:
                return {"error": "User not found"}
            items, total = await AgentService(db).list(
                page=1,
                page_size=limit,
                search=search.strip() or None,
                department=dept,
            )
            return {
                "total": total,
                "department": dept,
                "department_label": department_label_fa(dept) if dept else None,
                "agents": [
                    {
                        "id": str(a.id),
                        "name": a.name,
                        "slug": a.slug,
                        "status": a.status.value,
                        "department": a.department,
                        "department_label": department_label_fa(a.department),
                        "path": agent_ui_path(a),
                    }
                    for a in items
                ],
            }
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


@tool
async def platform_list_departments() -> dict:
    """List all departments with live agent counts from the database."""
    user_id = _platform_user_id.get()
    if not user_id:
        return {"error": "Platform context missing"}

    try:
        async with async_session_maker() as db:
            user = await _load_user(db, UUID(user_id))
            if not user:
                return {"error": "User not found"}

            agent_rows = await db.execute(
                select(Agent.department, func.count(Agent.id))
                .where(Agent.department.isnot(None))
                .group_by(Agent.department)
                .order_by(func.count(Agent.id).desc())
            )
            departments = [
                {
                    "department": row[0],
                    "label": department_label_fa(row[0]),
                    "agent_count": int(row[1]),
                }
                for row in agent_rows.all()
            ]

            payload: dict = {
                "success": True,
                "total_departments": len(departments),
                "departments": departments,
            }

            if user.is_superuser:
                user_rows = await db.execute(
                    select(User.department, func.count(User.id))
                    .where(User.department.isnot(None))
                    .group_by(User.department)
                )
                user_counts = {row[0]: int(row[1]) for row in user_rows.all()}
                for item in departments:
                    item["user_count"] = user_counts.get(item["department"], 0)

            return payload
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


@tool
async def platform_department_overview(department: str, limit: int = 30) -> dict:
    """Show a department's agents (and users for admin). Use for «دپارتمان عملیات را بیار».

    department: slug or Persian label, e.g. ops, عملیات, finance, مالی.
    """
    if not department.strip():
        return {"success": False, "error": "نام دپارتمان الزامی است."}

    dept = normalize_department(department)
    if not dept:
        known = "، ".join(f"{department_label_fa(s)} ({s})" for s in DEPT_LABELS_FA)
        return {
            "success": False,
            "error": f"دپارتمان «{department.strip()}» شناخته نشده. گزینه‌ها: {known}",
        }

    limit = max(1, min(int(limit), 50))
    label = department_label_fa(dept)

    try:
        async with async_session_maker() as db:
            user = await _require_user(db)
            if isinstance(user, dict):
                return user

            items, agent_total = await AgentService(db).list(
                page=1,
                page_size=limit,
                department=dept,
            )
            agents = [
                {
                    "id": str(a.id),
                    "name": a.name,
                    "slug": a.slug,
                    "status": a.status.value,
                    "kind": getattr(a.kind, "value", str(a.kind)),
                    "path": agent_ui_path(a),
                }
                for a in items
            ]

            payload: dict = {
                "success": True,
                "department": dept,
                "department_label": label,
                "agent_count": agent_total,
                "agents": agents,
            }

            if user.is_superuser:
                from src.repositories.user_repo import UserRepository

                all_users = await UserRepository(db).list_with_roles(offset=0, limit=200)
                dept_users = [u for u in all_users if (u.department or "") == dept]
                payload["user_count"] = len(dept_users)
                payload["users"] = [
                    {
                        "id": str(u.id),
                        "full_name": u.full_name,
                        "email": u.email,
                        "is_active": u.is_active,
                        "roles": [r.name for r in u.roles],
                    }
                    for u in dept_users[:limit]
                ]

            path = f"/agents?dept={dept}"
            human = (
                f"دپارتمان {label} ({dept}): {agent_total} ایجنت"
                + (f"، {payload.get('user_count', 0)} کاربر" if user.is_superuser else "")
                + "."
            )
            ui_script = _ui_script(
                f"نمایش دپارتمان {label}",
                [
                    {
                        "type": "navigate",
                        "path": path,
                        "label": f"باز کردن فهرست ایجنت‌های {label}",
                    },
                ],
            )
            return _tool_result(
                **payload,
                message=human,
                agents_path=path,
                ui_script=ui_script,
            )
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": str(exc)}


@tool
async def platform_create_agent(
    name: str = "ایجنت جدید",
    description: str = "",
    department: str = "ops",
    kind: str = "chat",
    output_format_spec: str = "",
) -> dict:
    """Start agent creation through the visible UI wizard — never create silently in background.

    kind: chat, worker, supervisor, or custom.
    Use sensible defaults when the user did not specify name/department/kind.
    """
    requested_name = (name or "").strip() or "ایجنت جدید"
    if not _platform_user_id.get():
        return {"error": "Platform context missing"}

    try:
        async with async_session_maker() as db:
            actor = await _require_user(db)
            if isinstance(actor, dict):
                return actor
            denied = check_platform_capability("platform_create_agent", actor) or _admin_only(
                actor, capability="create_agent"
            )
            if denied:
                return denied
            clean_name, slug = await _resolve_unique_agent_name(db, requested_name)
    except ValueError as exc:
        return {"success": False, "error": str(exc)}

    try:
        kind_enum = AgentKind(kind.strip().lower())
    except ValueError:
        kind_enum = AgentKind.CHAT

    desc = description.strip()
    dept = normalize_department(department) or "ops"
    format_spec = output_format_spec.strip()

    renamed = clean_name != requested_name
    bridge_payload = {
        "name": clean_name,
        "agent_slug": slug,
        "description": desc,
        "department": dept,
        "kind": kind_enum.value,
        "output_format_spec": format_spec,
    }
    ui_script = _ui_script(
        f"ساخت کامل ایجنت «{clean_name}»",
        [
            {
                "type": "navigate",
                "path": "/agents/create",
                "label": "باز کردن ویزارد ساخت",
            },
            {"type": "wait", "ms": 700},
            {
                "type": "bridge",
                "action": "wizard.create",
                "payload": bridge_payload,
                "label": f"پیمایش همه مراحل ویزارد و انتشار «{clean_name}»",
            },
            {
                "type": "wait_for_path",
                "pattern": "slug=",
                "timeout_ms": 120_000,
                "label": "منتظر تکمیل انتشار و شروع آموزش…",
            },
            {"type": "wait", "ms": 1200, "label": "آماده‌سازی صفحه آموزش…"},
            {
                "type": "bridge",
                "action": "wizard.continue_testing",
                "payload": bridge_payload,
                "label": "آموزش تعاملی، طراحی پنل و تأیید",
            },
        ],
    )
    rename_note = (
        f" (نام «{requested_name}» قبلاً بود؛ از «{clean_name}» با شناسه {slug} استفاده می‌کنم)"
        if renamed
        else ""
    )
    human = (
        f"باشه — الان ایجنت «{clean_name}» را مرحله‌به‌مرحله از رابط کاربری می‌سازم{rename_note}: "
        "ویزارد → آموزش → پنل → تأیید. می‌توانید هر لحظه «توقف» بزنید یا دستور جدید بدهید."
    )
    return _tool_result(
        success=True,
        name=clean_name,
        slug=slug,
        renamed=renamed,
        message=human,
        ui_script=ui_script,
    )


@tool
async def platform_continue_agent_testing(
    agent_slug: str = "",
    name: str = "",
    output_format_spec: str = "",
    description: str = "",
    department: str = "ops",
    kind: str = "chat",
) -> dict:
    """Continue step-6 testing for an agent already created — never re-walk wizard steps 1–5.

    Use when ?slug= is in the URL or snapshot shows planning/training/testing on /agents/create.
    Never invent the next slug (e.g. …-22) — pass the real slug from snapshot/URL, or name only.
    """
    if not _platform_user_id.get():
        return {"error": "Platform context missing"}

    slug = (agent_slug or "").strip()
    display_hint = (name or "").strip()

    try:
        async with async_session_maker() as db:
            actor = await _require_user(db)
            if isinstance(actor, dict):
                return actor
            denied = check_platform_capability("platform_create_agent", actor) or _admin_only(
                actor, capability="create_agent"
            )
            if denied:
                return denied
            # Prefer real slug; if model guessed a non-existent slug, fall back to name only when testing started.
            agent = await _resolve_agent(
                db, agent_slug=slug, agent_name=display_hint
            )
            if not agent and display_hint:
                svc = AgentService(db)
                items, _ = await svc.list(page=1, page_size=30)
                pool = [a for a in items if a.slug != "support"]
                for candidate in pool:
                    if candidate.name.strip() == display_hint:
                        agent = candidate
                        break
                if not agent:
                    for candidate in pool:
                        if display_hint in candidate.name or candidate.name in display_hint:
                            agent = candidate
                            break
            if not agent:
                return {
                    "success": False,
                    "error": (
                        f"ایجنت پیدا نشد"
                        + (f" (slug حدسی «{slug}» وجود ندارد)" if slug else "")
                        + " — اگر ویزارد هنوز تمام نشده platform_create_agent بزنید؛ "
                        "اگر تست شروع شده slug واقعی را از ?slug= در URL بگیرید."
                    ),
                }
    except ValueError as exc:
        return {"success": False, "error": str(exc)}

    display_name = (name or agent.name or "ایجنت").strip()
    bridge_payload = {
        "name": display_name,
        "agent_slug": agent.slug,
        "description": (description or "").strip(),
        "department": normalize_department(department) or agent.department or "ops",
        "kind": (kind or agent.kind or "chat").strip().lower(),
        "output_format_spec": (output_format_spec or "").strip(),
    }
    ui_script = _ui_script(
        f"ادامه تست «{display_name}»",
        [
            {
                "type": "bridge",
                "action": "wizard.continue_testing",
                "payload": bridge_payload,
                "label": "آموزش تعاملی، طراحی پنل و تست خودکار",
            },
        ],
    )
    human = (
        f"ادامه تست «{display_name}» — آموزش، پنل و تست خودکار "
        "(بدون بازگشت به مرحله ۱ ویزارد)."
    )
    return _tool_result(
        success=True,
        name=display_name,
        slug=agent.slug,
        message=human,
        ui_script=ui_script,
    )


@tool
async def platform_complete_agent_training(
    agent_id: str = "",
    agent_slug: str = "",
    output_format_spec: str = "",
    example_output: str = "",
    training_notes: str = "",
) -> dict:
    """Complete training through the visible training UI — not in background."""
    if not _platform_user_id.get():
        return {"error": "Platform context missing"}
    if not output_format_spec.strip():
        return {"success": False, "error": "فرمت خروجی آموزش الزامی است."}

    try:
        async with async_session_maker() as db:
            agent = await _resolve_agent(
                db,
                agent_id=agent_id,
                agent_slug=agent_slug,
            )
            if not agent:
                return {
                    "success": False,
                    "error": "ایجنت پیدا نشد — slug یا شناسه را از platform_list_agents بگیرید.",
                }
            agent_uuid = str(agent.id)
            spec = output_format_spec.strip()
            ui_script = _ui_script(
                f"تکمیل آموزش «{agent.name}»",
                [
                    {
                        "type": "navigate",
                        "path": agent_ui_path(agent),
                        "label": "رفتن به صفحه آموزش",
                    },
                    {"type": "wait", "ms": 700},
                    {
                        "type": "bridge",
                        "action": "training.complete",
                        "payload": {
                            "agent_id": agent_uuid,
                            "agent_slug": agent.slug,
                            "output_format_spec": spec,
                            "example_output": (example_output or spec).strip()[:2000],
                            "training_notes": (training_notes or spec).strip(),
                        },
                        "label": "ذخیره آموزش در رابط",
                    },
                ],
            )
            return _tool_result(
                success=True,
                agent_id=agent_uuid,
                agent_slug=agent.slug,
                name=agent.name,
                message=f"در حال تکمیل آموزش «{agent.name}» در رابط کاربری…",
                ui_script=ui_script,
            )
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": _humanize_platform_error(exc)}


@tool
async def platform_approve_agent_dashboard(
    agent_id: str = "",
    agent_slug: str = "",
) -> dict:
    """Approve dashboard draft via visible UI click — not in background."""
    if not _platform_user_id.get():
        return {"error": "Platform context missing"}

    try:
        async with async_session_maker() as db:
            agent = await _resolve_agent(
                db,
                agent_id=agent_id,
                agent_slug=agent_slug,
            )
            if not agent:
                return {
                    "success": False,
                    "error": "ایجنت پیدا نشد — slug یا شناسه را از platform_list_agents بگیرید.",
                }
            agent_uuid = str(agent.id)
            ui_script = _ui_script(
                f"تأیید پنل «{agent.name}»",
                [
                    {
                        "type": "navigate",
                        "path": agent_ui_path(agent, draft=True),
                        "label": "مشاهده پیش‌نویس پنل",
                    },
                    {"type": "wait", "ms": 800},
                    {
                        "type": "bridge",
                        "action": "dashboard.approve",
                        "payload": {"agent_id": agent_uuid, "agent_slug": agent.slug},
                        "label": "کلیک تأیید پنل",
                    },
                ],
            )
            return _tool_result(
                success=True,
                agent_id=agent_uuid,
                agent_slug=agent.slug,
                name=agent.name,
                message=f"در حال تأیید پنل «{agent.name}» در رابط کاربری…",
                ui_script=ui_script,
            )
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": _humanize_platform_error(exc)}


@tool
async def platform_generate_widget(
    agent_id: str = "",
    agent_slug: str = "",
    widget_type: str = "stat_cards",
    prompt: str = "",
) -> dict:
    """Generate a widget draft through visible UI on the agent dashboard."""
    if not _platform_user_id.get():
        return {"error": "Platform context missing"}

    valid_types = ("stat_cards", "line_chart", "pie_chart", "review_table", "hr_savings")
    wt = widget_type if widget_type in valid_types else "stat_cards"

    try:
        async with async_session_maker() as db:
            agent = await _resolve_agent(
                db,
                agent_id=agent_id,
                agent_slug=agent_slug,
            )
            if not agent:
                return {
                    "success": False,
                    "error": "ایجنت پیدا نشد — slug یا شناسه را از platform_list_agents بگیرید.",
                }
            agent_uuid = str(agent.id)
            widget_prompt = prompt.strip() or default_widget_prompt(agent, wt)
            ui_script = _ui_script(
                f"ساخت ویجت {wt} برای «{agent.name}»",
                [
                    {
                        "type": "navigate",
                        "path": agent_ui_path(agent, draft=True, highlight_widget=wt),
                        "label": "مرحله ۱ از ۳: رفتن به پنل ایجنت",
                    },
                    {"type": "wait", "ms": 800},
                    {
                        "type": "bridge",
                        "action": "dashboard.generate_widget",
                        "payload": {
                            "agent_id": agent_uuid,
                            "agent_slug": agent.slug,
                            "widget_type": wt,
                            "prompt": widget_prompt,
                        },
                        "label": f"مرحله ۲ از ۳: باز کردن سازنده ویجت {wt}",
                    },
                    {
                        "type": "wait_for_dom",
                        "selector": '[data-ma-support="dashboard-panel"], [data-ma-support="widget-builder-preview"]',
                        "timeout_ms": 120_000,
                        "label": "مرحله ۳ از ۳: منتظر آماده شدن پیش‌نمایش ویجت",
                    },
                ],
            )
            return _tool_result(
                success=True,
                agent_id=agent_uuid,
                agent_slug=agent.slug,
                agent_name=agent.name,
                widget_type=wt,
                message=f"در حال ساخت ویجت {wt} در رابط کاربری…",
                ui_script=ui_script,
            )
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": _humanize_platform_error(exc)}


@tool
async def platform_create_widget_for_agent(
    agent_slug: str,
    widget_type: str = "stat_cards",
    prompt: str = "",
) -> dict:
    """Generate a widget draft for an agent identified by slug, then open draft preview."""
    user_id = _platform_user_id.get()
    if not user_id:
        return {"error": "Platform context missing"}
    if not agent_slug.strip():
        return {"success": False, "error": "agent_slug الزامی است"}

    try:
        async with async_session_maker() as db:
            agent = await AgentService(db).get_by_slug(agent_slug.strip())
            if not agent:
                return {"success": False, "error": f"ایجنت «{agent_slug}» یافت نشد"}
            return await platform_generate_widget.ainvoke(
                {
                    "agent_id": str(agent.id),
                    "widget_type": widget_type,
                    "prompt": prompt,
                }
            )
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": str(exc)}


@tool
async def platform_list_users(
    search: str = "",
    department: str = "",
    limit: int = 20,
) -> dict:
    """List platform users (admin only). Filter by name/email or department (ops / عملیات)."""
    limit = max(1, min(int(limit), 50))
    needle = search.strip().lower()
    dept = normalize_department(department) if department.strip() else None

    try:
        async with async_session_maker() as db:
            user = await _require_user(db)
            if isinstance(user, dict):
                return user
            denied = _admin_only(user)
            if denied:
                return denied

            from src.repositories.user_repo import UserRepository

            users = await UserRepository(db).list_with_roles(offset=0, limit=200)
            if dept:
                users = [u for u in users if (u.department or "") == dept]
            if needle:
                users = [
                    u
                    for u in users
                    if needle in (u.email or "").lower()
                    or needle in (u.full_name or "").lower()
                ]
            users = users[:limit]
            return {
                "total": len(users),
                "department": dept,
                "department_label": department_label_fa(dept) if dept else None,
                "users": [
                    {
                        "id": str(u.id),
                        "email": u.email,
                        "full_name": u.full_name,
                        "department": u.department,
                        "is_active": u.is_active,
                        "is_superuser": u.is_superuser,
                        "roles": [r.name for r in u.roles],
                    }
                    for u in users
                ],
            }
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


@tool
async def platform_create_user(
    email: str,
    full_name: str,
    password: str = "",
    department: str = "",
    role_name: str = "",
    is_superuser: bool = False,
) -> dict:
    """Create a new platform user so they can log in (admin only).

    If password is empty, a temporary password is generated and returned once.
    """
    if not email.strip() or not full_name.strip():
        return {"success": False, "error": "ایمیل و نام کامل الزامی است."}

    try:
        async with async_session_maker() as db:
            actor = await _require_user(db)
            if isinstance(actor, dict):
                return actor
            denied = _admin_only(actor)
            if denied:
                return denied

            temp_password = password.strip() or secrets.token_urlsafe(12)
            dept = normalize_department(department) if department.strip() else None
            payload = UserAdminCreate(
                email=email.strip(),
                full_name=full_name.strip(),
                password=temp_password,
                department=dept,
                is_superuser=is_superuser,
                role_name=role_name.strip() or None,
            )
            user = await AuthService(db).register(
                UserCreate(
                    email=payload.email,
                    password=temp_password,
                    full_name=payload.full_name,
                    locale=payload.locale,
                    department=payload.department,
                    title=payload.title,
                    is_superuser=payload.is_superuser,
                )
            )
            assigned_role = (payload.role_name or "").strip()
            if assigned_role:
                result = await db.execute(select(Role).where(Role.name == assigned_role))
                role = result.scalar_one_or_none()
                if role:
                    user.roles.append(role)
                    await db.commit()
                    await db.refresh(user)

            human = (
                f"کاربر «{user.full_name}» با ایمیل {user.email} ساخته شد. "
                f"رمز عبور: {temp_password} — آن را به کاربر بدهید تا وارد شود."
            )
            ui_script = _ui_script(
                f"نمایش کاربر «{user.full_name}»",
                [
                    {
                        "type": "navigate",
                        "path": "/users",
                        "label": "رفتن به مدیریت کاربران",
                    },
                ],
            )
            return _tool_result(
                success=True,
                user_id=str(user.id),
                email=user.email,
                full_name=user.full_name,
                temporary_password=temp_password,
                roles=[r.name for r in user.roles],
                message=human,
                ui_script=ui_script,
            )
    except HTTPException as exc:
        detail = exc.detail
        if isinstance(detail, list):
            detail = "; ".join(str(item) for item in detail)
        return {"success": False, "error": str(detail)}
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": str(exc)}


@tool
def platform_ui_action(
    action_type: str,
    path: str = "",
    agent_slug: str = "",
    widget_type: str = "",
) -> dict:
    """Navigate to platform screens. Do NOT use for agent pages — use platform_open_agent instead."""
    if action_type == "navigate" and path.strip():
        raw_path = path.strip()
        if raw_path.startswith("/agents/") and "create" not in raw_path:
            slug_part = raw_path.split("/agents/", 1)[-1].split("?")[0].strip("/")
            if slug_part and slug_part not in ("", "create"):
                return {
                    "success": False,
                    "error": (
                        f"برای باز کردن ایجنت از platform_open_agent استفاده کنید "
                        f"(slug واقعی را از platform_list_agents بگیرید، نه «{slug_part}»)."
                    ),
                }
        ui_action = {"type": "navigate", "path": raw_path}
        return _tool_result(success=True, ui_action=ui_action)
    if action_type == "open_widget_builder" and agent_slug.strip():
        wt = widget_type.strip() or "stat_cards"
        params = f"tab=overview&open_widget_builder=1&widget_type={wt}"
        ui_action = {
            "type": "navigate",
            "path": f"/agents/{agent_slug.strip()}?{params}",
            "label": "ساخت و مشاهده پیش‌نویس ویجت",
            "kind": "widget_generated",
        }
        return _tool_result(
            success=True,
            ui_action=ui_action,
            message="برای ساخت واقعی ویجت از platform_create_widget_for_agent استفاده کنید.",
        )
    return {
        "success": False,
        "error": "For navigate provide path; for widgets use platform_create_widget_for_agent",
    }


async def upgrade_platform_support_agent(db) -> bool:
    """Ensure seeded support agent has platform tools and prompt rules."""
    result = await db.execute(select(Agent).where(Agent.slug == "support"))
    agent = result.scalar_one_or_none()
    if not agent:
        return False

    changed = False
    if list(agent.tool_names or []) != PLATFORM_SUPPORT_TOOL_NAMES:
        agent.tool_names = list(PLATFORM_SUPPORT_TOOL_NAMES)
        changed = True

    prompt = demo_context_for_slug("support")
    if (agent.system_prompt or "").strip() != prompt.strip():
        agent.system_prompt = prompt
        changed = True

    if changed:
        await db.commit()
    return changed


ToolRegistry.register("platform_get_ui_catalog", platform_get_ui_catalog)
ToolRegistry.register("platform_get_user_capabilities", platform_get_user_capabilities)
ToolRegistry.register("platform_execute_ui", platform_execute_ui)
ToolRegistry.register("platform_create_external_api", platform_create_external_api)
ToolRegistry.register("platform_test_external_api", platform_test_external_api)
ToolRegistry.register("platform_create_api_agent", platform_create_api_agent)
ToolRegistry.register("platform_provision_api_agent", platform_provision_api_agent)
ToolRegistry.register("platform_list_agents", platform_list_agents)
ToolRegistry.register("platform_list_departments", platform_list_departments)
ToolRegistry.register("platform_department_overview", platform_department_overview)
ToolRegistry.register("platform_open_agent", platform_open_agent)
ToolRegistry.register("platform_create_agent", platform_create_agent)
ToolRegistry.register("platform_continue_agent_testing", platform_continue_agent_testing)
ToolRegistry.register("platform_complete_agent_training", platform_complete_agent_training)
ToolRegistry.register("platform_approve_agent_dashboard", platform_approve_agent_dashboard)
ToolRegistry.register("platform_create_widget_for_agent", platform_create_widget_for_agent)
ToolRegistry.register("platform_generate_widget", platform_generate_widget)
ToolRegistry.register("platform_list_users", platform_list_users)
ToolRegistry.register("platform_create_user", platform_create_user)
ToolRegistry.register("platform_ui_action", platform_ui_action)
