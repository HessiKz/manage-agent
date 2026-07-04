"""Machine-readable UI targets for support-agent automation (shared contract)."""

from __future__ import annotations

import re
from typing import Any

# Step types the frontend SupportUiPlayer can execute.
ALLOWED_UI_STEP_TYPES = frozenset(
    {
        "navigate",
        "wait",
        "wait_for_path",
        "wait_for_dom",
        "highlight",
        "click",
        "type",
        "select",
    }
)

_REF_RE = re.compile(r"^ui-\d+$")

ADMIN_PATH_PREFIXES: tuple[str, ...] = ("/agents/create", "/users", "/admin")


def path_requires_superuser(path: str) -> bool:
    normalized = (path or "").split("?")[0]
    return any(normalized.startswith(prefix) for prefix in ADMIN_PATH_PREFIXES)


def steps_require_superuser(steps: list[dict[str, Any]]) -> bool:
    for raw in steps:
        if not isinstance(raw, dict):
            continue
        if raw.get("type") == "navigate":
            path = raw.get("path")
            if isinstance(path, str) and path_requires_superuser(path):
                return True
    return False


# Pages and stable selectors — keep in sync with frontend data-ma-support / data-ma-guide.
PLATFORM_UI_CATALOG: dict[str, Any] = {
    "version": 2,
    "selector_prefixes": ["[data-ma-support=", "[data-ma-guide="],
    "vision": {
        "description": "Each user message includes a live UI snapshot with ref:ui-N per interactive element.",
        "target_fields": "Use ref (from snapshot) OR selector (data-ma-support/guide). Prefer ref when available.",
        "step_types": list(ALLOWED_UI_STEP_TYPES),
    },
    "pages": {
        "knowledge": {
            "path": "/knowledge",
            "label": "فایل‌ها و داده‌ها",
            "targets": {
                "ingest_textarea": '[data-ma-support="knowledge-ingest"]',
                "file_attach": '[data-ma-support="knowledge-file-attach"]',
                "ingest_save": '[data-ma-support="knowledge-save"]',
                "search_input": '[data-ma-support="knowledge-search"]',
                "agent_summary": '[data-ma-support="agent-knowledge-summary"]',
                "agent_summary_role": '[data-ma-support="agent-knowledge-role"]',
                "agent_summary_rules": '[data-ma-support="agent-knowledge-rules"]',
                "agent_summary_files": '[data-ma-support="agent-knowledge-files"]',
                "agent_summary_data": '[data-ma-support="agent-knowledge-data"]',
                "agent_reindex": '[data-ma-support="agent-knowledge-reindex"]',
            },
        },
        "agent_testing": {
            "path": "/agents/create/testing",
            "label": "تست و انتشار ایجنت",
            "targets": {
                "knowledge_summary": '[data-ma-support="agent-knowledge-summary"]',
                "knowledge_role": '[data-ma-support="agent-knowledge-role"]',
                "knowledge_rules": '[data-ma-support="agent-knowledge-rules"]',
                "knowledge_files": '[data-ma-support="agent-knowledge-files"]',
                "knowledge_data": '[data-ma-support="agent-knowledge-data"]',
                "knowledge_reindex": '[data-ma-support="agent-knowledge-reindex"]',
                "knowledge_open_page": '[data-ma-support="agent-knowledge-open-page"]',
            },
        },
        "dashboard": {
            "path": "/dashboard",
            "label": "صفحه اصلی",
            "targets": {
                "agents_grid": '[data-ma-guide="dashboard-agents"]',
            },
        },
        "agents_list": {
            "path": "/agents",
            "label": "فهرست ایجنت‌ها",
            "targets": {
                "list": '[data-ma-guide="agents-list"]',
            },
        },
        "agents_create": {
            "path": "/agents/create",
            "requires_superuser": True,
            "label": "ویزارد ساخت ایجنت",
            "targets": {
                "wizard_name": '[data-ma-support="wizard-name"]',
                "wizard_next": '[data-ma-support="wizard-next"]',
                "wizard_start_test": '[data-ma-support="wizard-next"]',
            },
        },
        "users": {
            "path": "/users",
            "requires_superuser": True,
            "label": "کاربران",
            "targets": {
                "invite": '[data-ma-guide="users-invite"]',
                "table": '[data-ma-guide="users-table"]',
            },
        },
        "integrations": {
            "path": "/integrations",
            "label": "اتصالات",
            "targets": {
                "service_name": '[data-ma-support="integration-service-name"]',
                "base_url": '[data-ma-support="integration-base-url"]',
                "save_service": '[data-ma-support="integration-save-service"]',
                "endpoint_name": '[data-ma-support="integration-endpoint-name"]',
                "endpoint_path": '[data-ma-support="integration-endpoint-path"]',
                "save_endpoint": '[data-ma-support="integration-save-endpoint"]',
                "test_endpoint": '[data-ma-support="integration-test-endpoint"]',
            },
        },
        "settings": {
            "path": "/settings",
            "label": "تنظیمات",
            "targets": {},
        },
        "admin": {
            "path": "/admin",
            "requires_superuser": True,
            "label": "پنل ادمین",
            "targets": {
                "agents": '[data-ma-guide="admin-agents"]',
            },
        },
    },
    "agent_page": {
        "path_pattern": "/agents/{slug}",
        "tabs": {
            "execute": '[data-ma-guide="agent-tab-execute"]',
            "chat": '[data-ma-guide="agent-tab-chat"]',
            "overview": '[data-ma-guide="agent-tab-overview"]',
        },
        "shell": '[data-ma-guide="agent-tabs"]',
    },
    "examples": [
        {
            "task": "باز کردن فایل‌ها و داده‌ها، نوشتن در درج دانش بدون ذخیره",
            "steps": [
                {"type": "navigate", "path": "/knowledge", "label": "رفتن به فایل‌ها و داده‌ها"},
                {"type": "wait_for_dom", "selector": '[data-ma-support="knowledge-ingest"]'},
                {"type": "type", "selector": '[data-ma-support="knowledge-ingest"]', "text": "سلام"},
            ],
        }
        ,
        {
            "task": "در مرحله تست ایجنت، خلاصه دانسته‌ها را نشان بده",
            "steps": [
                {
                    "type": "wait_for_dom",
                    "selector": '[data-ma-support="agent-knowledge-summary"]',
                },
                {
                    "type": "highlight",
                    "selector": '[data-ma-support="agent-knowledge-summary"]',
                    "label": "نمایش خلاصه دانسته‌های ایجنت",
                },
            ],
        },
        {
            "task": "اگر فایل‌های ایجنت در دانش دیده نمی‌شوند، بازسازی دانش را بزن",
            "steps": [
                {
                    "type": "wait_for_dom",
                    "selector": '[data-ma-support="agent-knowledge-reindex"]',
                },
                {
                    "type": "click",
                    "selector": '[data-ma-support="agent-knowledge-reindex"]',
                    "label": "بازسازی دانش از فایل‌ها",
                },
            ],
        },
    ],
    "tools": {
        "platform_create_agent": {"requires_superuser": True, "capability": "create_agent"},
        "platform_continue_agent_testing": {"requires_superuser": True, "capability": "create_agent"},
        "platform_create_user": {"requires_superuser": True, "capability": "manage_users"},
        "platform_execute_ui": {
            "note": "Navigate to /agents/create, /users, /admin requires superuser",
        },
    },
}


def catalog_for_llm() -> dict[str, Any]:
    return PLATFORM_UI_CATALOG


def _selector_allowed(selector: str) -> bool:
    s = (selector or "").strip()
    if not s:
        return False
    return any(s.startswith(p) for p in PLATFORM_UI_CATALOG["selector_prefixes"])


def _ref_allowed(ref: str) -> bool:
    return bool(_REF_RE.match((ref or "").strip()))


def _normalize_target(raw: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    ref = raw.get("ref")
    selector = raw.get("selector")
    out: dict[str, Any] = {}
    if isinstance(ref, str) and _ref_allowed(ref):
        out["ref"] = ref.strip()
    if isinstance(selector, str) and _selector_allowed(selector):
        out["selector"] = selector.strip()
    if not out:
        return None, "ref (ui-N از snapshot) یا selector مجاز لازم است"
    return out, None


_WIZARD_SELECTOR_MARKERS = (
    "wizard-name",
    "wizard-next",
    "wizard-prev",
    "wizard-save",
    "wizard-step-",
    "wizard-kind-",
    "wizard-description",
    "wizard-department",
    "wizard-system-prompt",
)


def steps_touch_agent_create_wizard(steps: list[dict[str, Any]]) -> bool:
    """True when execute_ui steps manipulate the create-agent wizard (use platform_create_agent)."""
    for raw in steps:
        if not isinstance(raw, dict):
            continue
        sel = str(raw.get("selector") or "")
        if any(marker in sel for marker in _WIZARD_SELECTOR_MARKERS):
            return True
        path = raw.get("path")
        if raw.get("type") == "navigate" and isinstance(path, str) and path.startswith(
            "/agents/create"
        ):
            interactive = any(
                isinstance(s, dict)
                and s.get("type") in ("click", "type", "select", "highlight")
                for s in steps
            )
            if interactive:
                return True
    return False


def validate_ui_steps(steps: list[dict[str, Any]], *, max_steps: int = 24) -> tuple[list[dict[str, Any]], str | None]:
    """Return (normalized_steps, error_message)."""
    if not steps:
        return [], "حداقل یک مرحله UI لازم است."
    if len(steps) > max_steps:
        return [], f"حداکثر {max_steps} مرحله مجاز است."
    if steps_touch_agent_create_wizard(steps):
        return (
            [],
            "برای ویزارد ساخت ایجنت از platform_create_agent استفاده کنید — "
            "نه platform_execute_ui مرحله‌به‌مرحله.",
        )

    out: list[dict[str, Any]] = []
    for i, raw in enumerate(steps):
        if not isinstance(raw, dict):
            return [], f"مرحله {i + 1}: قالب نامعتبر"
        step_type = raw.get("type")
        if step_type not in ALLOWED_UI_STEP_TYPES:
            return [], f"مرحله {i + 1}: نوع «{step_type}» مجاز نیست"

        step: dict[str, Any] = {"type": step_type}
        if label := raw.get("label"):
            if isinstance(label, str) and label.strip():
                step["label"] = label.strip()

        if step_type == "navigate":
            path = raw.get("path")
            if not isinstance(path, str) or not path.startswith("/"):
                return [], f"مرحله {i + 1}: مسیر navigate باید با / شروع شود"
            step["path"] = path.strip()
        elif step_type == "wait":
            ms = raw.get("ms", 500)
            step["ms"] = max(100, min(int(ms), 15_000))
        elif step_type in ("wait_for_path",):
            pattern = raw.get("pattern")
            if not isinstance(pattern, str) or not pattern.strip():
                return [], f"مرحله {i + 1}: pattern الزامی است"
            step["pattern"] = pattern.strip()
            if timeout := raw.get("timeout_ms"):
                step["timeout_ms"] = max(1000, min(int(timeout), 120_000))
        elif step_type in ("wait_for_dom", "highlight", "click", "type", "select"):
            target, terr = _normalize_target(raw)
            if terr or not target:
                return [], f"مرحله {i + 1}: {terr}"
            step.update(target)
            if timeout := raw.get("timeout_ms"):
                step["timeout_ms"] = max(1000, min(int(timeout), 120_000))
            if step_type == "type":
                text = raw.get("text")
                if not isinstance(text, str):
                    return [], f"مرحله {i + 1}: text برای type الزامی است"
                step["text"] = text
            if step_type == "select":
                value = raw.get("value")
                if not isinstance(value, str):
                    return [], f"مرحله {i + 1}: value برای select الزامی است"
                step["value"] = value
        out.append(step)
    return out, None
