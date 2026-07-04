"""Shared constants for platform support tools (no service imports)."""

from __future__ import annotations

DEPT_LABELS_FA: dict[str, str] = {
    "finance": "مالی",
    "hr": "منابع انسانی",
    "support": "پشتیبانی",
    "sales": "فروش",
    "ops": "عملیات",
}

_DEPT_ALIASES: dict[str, str] = {}
for _slug, _fa in DEPT_LABELS_FA.items():
    _DEPT_ALIASES[_slug] = _slug
    _DEPT_ALIASES[_fa] = _slug
    _DEPT_ALIASES[_fa.replace(" ", "")] = _slug
_DEPT_ALIASES["operations"] = "ops"
_DEPT_ALIASES["operation"] = "ops"
_DEPT_ALIASES["human resources"] = "hr"
_DEPT_ALIASES["human_resources"] = "hr"


def normalize_department(value: str | None) -> str | None:
    """Map Persian/English department labels to canonical slug (ops, finance, …)."""
    if not value or not str(value).strip():
        return None
    raw = str(value).strip()
    key = raw.lower().replace("_", " ")
    if key in _DEPT_ALIASES:
        return _DEPT_ALIASES[key]
    compact = key.replace(" ", "")
    if compact in _DEPT_ALIASES:
        return _DEPT_ALIASES[compact]
    for slug, fa in DEPT_LABELS_FA.items():
        if fa in raw or raw == slug:
            return slug
    if key in DEPT_LABELS_FA:
        return key
    return None


def department_label_fa(slug: str | None) -> str:
    if not slug:
        return "—"
    return DEPT_LABELS_FA.get(slug, slug)


AGENT_TAB_ALIASES: dict[str, str] = {
    "chat": "chat",
    "گفتگو": "chat",
    "گفتگوها": "chat",
    "conversations": "chat",
    "execute": "execute",
    "اجرا": "execute",
    "راهنما": "execute",
    "overview": "overview",
    "پنل": "overview",
    "runs": "runs",
    "تاریخچه": "runs",
    "settings": "settings",
    "تنظیمات": "settings",
}


def normalize_agent_tab(value: str | None) -> str | None:
    if not value or not str(value).strip():
        return None
    raw = str(value).strip().lower()
    if raw in AGENT_TAB_ALIASES:
        return AGENT_TAB_ALIASES[raw]
    for key, slug in AGENT_TAB_ALIASES.items():
        if key in raw:
            return slug
    if raw in ("execute", "chat", "overview", "runs", "settings"):
        return raw
    return None


PLATFORM_TOOL_STATUS_FA: dict[str, str] = {
    "platform_list_agents": "در حال دریافت فهرست ایجنت‌ها…",
    "platform_list_departments": "در حال دریافت فهرست دپارتمان‌ها…",
    "platform_department_overview": "در حال بررسی دپارتمان…",
    "platform_open_agent": "در حال باز کردن صفحه ایجنت…",
    "platform_create_agent": "در حال ساخت ایجنت از طریق ویزارد…",
    "platform_continue_agent_testing": "در حال ادامه تست ایجنت…",
    "platform_complete_agent_training": "در حال تکمیل آموزش ایجنت…",
    "platform_approve_agent_dashboard": "در حال تأیید پنل ایجنت…",
    "platform_generate_widget": "در حال ساخت ویجت…",
    "platform_create_widget_for_agent": "در حال ساخت ویجت…",
    "platform_execute_ui": "در حال اجرای مراحل رابط کاربری…",
    "platform_get_ui_catalog": "در حال دریافت فهرست UI…",
    "platform_get_user_capabilities": "در حال بررسی دسترسی‌های شما…",
    "platform_provision_api_agent": "در حال اتصال API و ساخت ایجنت…",
    "platform_create_external_api": "در حال ثبت API خارجی…",
    "platform_test_external_api": "در حال تست API…",
    "platform_create_api_agent": "در حال ساخت ایجنت API…",
    "platform_list_users": "در حال دریافت فهرست کاربران…",
    "platform_create_user": "در حال ساخت کاربر…",
    "platform_ui_action": "در حال اجرای عمل UI…",
}


def platform_tool_status_fa(tool_name: str) -> str:
    key = (tool_name or "").strip()
    if key in PLATFORM_TOOL_STATUS_FA:
        return PLATFORM_TOOL_STATUS_FA[key]
    if key.startswith("platform_"):
        return "در حال اجرای ابزار پلتفرم…"
    return "در حال اجرای ابزار…"


PLATFORM_SUPPORT_TOOL_NAMES = [
    "crm_lookup",
    "platform_get_ui_catalog",
    "platform_get_user_capabilities",
    "platform_execute_ui",
    "platform_create_external_api",
    "platform_test_external_api",
    "platform_create_api_agent",
    "platform_provision_api_agent",
    "platform_list_agents",
    "platform_list_departments",
    "platform_department_overview",
    "platform_open_agent",
    "platform_create_agent",
    "platform_continue_agent_testing",
    "platform_complete_agent_training",
    "platform_approve_agent_dashboard",
    "platform_generate_widget",
    "platform_create_widget_for_agent",
    "platform_list_users",
    "platform_create_user",
    "platform_ui_action",
]

DOMAIN_TOOL_SLUGS = [
    "budget_lookup",
    "hr_lookup",
    "report_generate",
    "resume_screen",
    "crm_lookup",
    "karkard_process",
    "run_agent_script",
]

# Built-in tools that natively process an uploaded file and should win as an
# agent's primary_tool over LLM script synthesis. Add a new built-in file tool
# here once and runtime planning picks it up — no per-tool heuristic code.
BUILTIN_FILE_TOOLS = frozenset({"karkard_process"})


def is_support_agent_slug(slug: str | None) -> bool:
    return (slug or "").strip().lower() in {"platform-support", "support", "پشتیبانی"}
