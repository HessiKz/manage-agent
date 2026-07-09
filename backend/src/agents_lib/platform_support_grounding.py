"""Ground support-agent chat output in platform tool results — no free-form facts."""

from __future__ import annotations

import json
import re
from typing import Any

from src.agents_lib.platform_constants import department_label_fa


_PLATFORM_TOOL_PREFIX = "platform_"
_CHITCHAT_RE = re.compile(
    r"^(?:سلام|درود|ممنون|مرسی|متشکرم|hello|hi|thanks|thank you|"
    r"چه\s+کار|چیکار|چه\s+کارهایی|help|"
    r"کی\s+هستی|تو\s+کی|who\s+are\s+you)[\s!?.,،]*$",
    re.IGNORECASE,
)

_CAPABILITIES_RE = re.compile(
    r"چه\s+کار[\w\u0600-\u06FF]*\s*(?:می\s*(?:تونی|توانی|توان)|بکنی|help)",
    re.IGNORECASE,
)

_NAVIGATION_CLAIM_RE = re.compile(
    r"(صفحه\s+را\s+باز|باز\s+کردم|در\s+حال\s+باز\s+کردن|navigat)",
    re.IGNORECASE,
)

_UI_ACTION_RE = re.compile(
    r"(باز\s*کن|کلیک|بنویس|تایپ|/type|کلیک\s*نکن|نزن|نزنی|ذخیره\s*نکن|"
    r"برو\s*به|رفتن\s*به|تب\s|درج\s|فیلد|دکمه|فرم|وارد\s*کن)",
    re.IGNORECASE,
)

_PROVISIONING_RE = re.compile(
    r"(اضافه\s*کن|بساز|بسازش|ایجاد\s*کن|ثبت\s*کن|ساخت|provision|setup)",
    re.IGNORECASE,
)

_AGENT_CREATE_RE = re.compile(
    r"(?:ایجنت|agent).*(?:بساز|جدید|ساخت|create)|(?:بساز|ساخت|create).*(?:ایجنت|agent)|یک\s+ایجنت",
    re.IGNORECASE,
)

# Minimal "create agent" intent without extra detail — e.g. "یک ایجنت بساز",
# "ایجنت جدید بساز", "یک ایجنت جدید".  Distinguish from detailed requests
# like "یک ایجنت برای پشتیبانی بساز" that contain department/role context.
_AGENT_CREATE_MINIMAL_RE = re.compile(
    r"^یک\s+ایجنت\s*(جدید)?\s*بساز$|^ایجنت\s+(جدید\s*)?بساز$|^یک\s+ایجنت\s*$",
    re.IGNORECASE | re.UNICODE,
)

_API_WORKFLOW_RE = re.compile(
    r"(api|اندپوینت|endpoint|اتصال|integration|سرویس|httpbin)",
    re.IGNORECASE,
)

_CONTINUE_TESTING_RE = re.compile(
    r"(?:ادامه(?:\s*بده|\s*کن|\s*ده)?|continue|go\s*on|ادامه.*تست|continue.*test|مرحله\s*تست|platform_continue)",
    re.IGNORECASE,
)

_TICKET_DRAFT_RE = re.compile(
    r"(تیکت|ticket|بستن\s*تیکت|close\s*ticket|پاسخ\s*پیشنهادی|پاسخ\s*برای|جواب\s*برای|فرمت[:：])",
    re.IGNORECASE,
)

_TESTING_PAGE_MARKERS = (
    "slug=",
    "wizard-planning-questions",
    "wizard-testing-complete",
    "wizard-bootstrap-loading",
    "training-panel",
    "wizard-testing-error",
    "dashboard-panel",
)

_STATIC_CAPABILITIES = """من دستیار پلتفرم manage-agent هستم — **حدس نمی‌زنم**؛ همهٔ کارها با ابزار انجام می‌شود.

**داده و فهرست:** platform_list_departments، platform_department_overview، platform_list_agents، platform_list_users

**باز کردن ایجنت:** platform_open_agent (slug واقعی از DB)

**بینایی UI:** هر پیام شامل snapshot زنده با ref:ui-N است — مثل دیدن صفحه.

**هر کار UI:** platform_execute_ui با ref از snapshot یا selector
(ناوبری، کلیک، تایپ، select — بعد از هر اجرا مشاهدهٔ جدید می‌آید)

**API خارجی:** platform_provision_api_agent (ساخت+تست+ایجنت یکجا) یا
platform_create_external_api → platform_test_external_api → platform_create_api_agent

**ساخت/ویجت/کاربر:** platform_create_agent، platform_continue_agent_testing، platform_create_user، platform_generate_widget

**دانسته‌های ایجنت:** در ساخت و تست ایجنت، بخش «چیزهایی که ایجنت یاد گرفته» با selectorهای
agent-knowledge-summary / agent-knowledge-reindex قابل نمایش و بازسازی است.
برای attach فایل در پایگاه دانش، selector knowledge-file-attach را هایلایت کن؛ انتخاب فایل محلی را خود کاربر انجام می‌دهد.

بگویید چه می‌خواهید."""


def is_ui_observation_message(user_input: str) -> bool:
    """True only for the post-UI-execution observation callback the wizard posts back.

    The support context block also contains a live-UI line ("[مشاهده UI زنده …")
    on every message, so a bare substring check wrongly flagged the user's own
    command as an observation — which stripped its tools and made the agent hang
    on "یک ایجنت جدید بساز". The callback is the only message that carries the
    post-execution marker, so match that specifically.
    """
    return "پس از اجرای UI" in user_input


def is_ui_action_request(user_input: str) -> bool:
    """User wants visible UI automation (not DB facts)."""
    if is_ui_observation_message(user_input):
        return False
    text = _strip_page_context(user_input).strip()
    if is_api_provisioning_request(text):
        return False
    return bool(_UI_ACTION_RE.search(text))


def is_provisioning_request(user_input: str) -> bool:
    text = _strip_page_context(user_input).strip()
    return bool(_PROVISIONING_RE.search(text))


def is_agent_create_request(user_input: str) -> bool:
    """User wants a new agent created through platform_create_agent.

    Both bare ("یک ایجنت جدید بساز") and detailed ("یک ایجنت برای پشتیبانی بساز")
    commands reach the tool path. Bare commands get sensible defaults from
    infer_agent_create_defaults (name "ایجنت جدید") and the wizard automation
    drives the visible UI end-to-end — so the quick-prompt actually builds the
    agent instead of asking for more detail.

    The command lives in the user-text portion (after '---'), since the
    frontend prepends a page-context block.
    """
    text = _user_text_from_input(user_input)
    if is_api_provisioning_request(user_input):
        return False
    return bool(_AGENT_CREATE_RE.search(text)) or is_wizard_create_intent(user_input)


def infer_agent_create_defaults(user_input: str) -> dict[str, str]:
    """Minimal defaults for platform_create_agent — avoid chat interrogation."""
    text = _strip_page_context(user_input).strip()
    name = "ایجنت جدید"
    quoted = re.search(r'[«"]([^»"]{2,60})[»"]', text)
    if quoted:
        name = quoted.group(1).strip()
    else:
        named = re.search(
            r"(?:به\s+نام|بنام|named)\s+([^\s،,.]{2,40})",
            text,
            re.IGNORECASE,
        )
        if named:
            name = named.group(1).strip()
    return {
        "name": name,
        "description": "",
        "department": "ops",
        "kind": "chat",
        "output_format_spec": "",
    }


def _page_path_from_context(user_input: str) -> str | None:
    m = re.search(r"مسیر\s*فعلی[:\s]+(/[^\s\n\]]+)", user_input)
    return m.group(1).strip() if m else None


def is_wizard_create_intent(user_input: str) -> bool:
    """True when the input is a bare 'create agent' command without extra detail.

    These are handled by the wizard automation (platform_execute_ui navigation).
    Detailed requests (e.g. 'یک ایجنت برای پشتیبانی بساز') go through the tool
    path or plain text depending on the current page.

    The command lives in the user-text portion (after '---').
    """
    text = _user_text_from_input(user_input)
    return bool(_AGENT_CREATE_MINIMAL_RE.match(text))


def is_on_agent_create_wizard(user_input: str) -> bool:
    path = _page_path_from_context(user_input) or ""
    return path.startswith("/agents/create") and "/agents/create/testing" not in path


def is_continue_testing_request(user_input: str) -> bool:
    text = _strip_page_context(user_input).strip()
    return bool(_CONTINUE_TESTING_RE.search(text))


def is_agent_testing_on_create_page(user_input: str) -> bool:
    """Agent already persisted — step 6 testing; must not re-run wizard.create."""
    if not is_on_agent_create_wizard(user_input):
        return False
    if "wizard-testing-complete" in user_input:
        return False
    return any(marker in user_input for marker in _TESTING_PAGE_MARKERS)


def is_wizard_steps_incomplete(user_input: str) -> bool:
    """Steps 1–5 not finished — no slug / testing markers yet."""
    if not is_on_agent_create_wizard(user_input):
        return False
    return not is_agent_testing_on_create_page(user_input)


def is_testing_complete_on_create_page(user_input: str) -> bool:
    return is_on_agent_create_wizard(user_input) and "wizard-testing-complete" in user_input


def needs_grounded_tools(user_input: str) -> bool:
    """True when the user expects DB-backed facts (lists, counts)."""
    text = _strip_page_context(user_input).strip()
    if not text:
        return False
    if _CAPABILITIES_RE.search(text):
        return False
    if _CHITCHAT_RE.match(text):
        return False
    if is_ticket_drafting_request(text):
        return False
    if is_plain_command(user_input):
        return False
    if is_ui_action_request(text):
        return False
    if is_api_provisioning_request(text):
        return False
    if is_agent_create_request(text):
        return False
    return True


def needs_any_platform_tool(user_input: str) -> bool:
    """Support agent must call a tool (data or UI).

    The command lives in the user-text portion (after the '---' separator the
    frontend prepends), so match against that — otherwise 'یک ایجنت جدید بساز'
    is stripped away and the agent gets zero tools and hangs.
    """
    text = _user_text_from_input(user_input)
    if not text:
        return False
    if is_ui_observation_message(user_input):
        return False
    if _CAPABILITIES_RE.search(text) or _CHITCHAT_RE.match(text):
        return False
    if is_ticket_drafting_request(text):
        return False
    if is_plain_command(user_input):
        return False
    return is_ui_action_request(text) or is_api_provisioning_request(text) or is_agent_create_request(text) or needs_grounded_tools(text)


def is_api_provisioning_request(user_input: str) -> bool:
    text = _strip_page_context(user_input).strip()
    if is_ui_observation_message(user_input):
        return False
    if not is_provisioning_request(text):
        return False
    return bool(_API_WORKFLOW_RE.search(text))


def is_capabilities_question(user_input: str) -> bool:
    text = _strip_page_context(user_input).strip()
    return bool(_CAPABILITIES_RE.search(text))


def is_ticket_drafting_request(user_input: str) -> bool:
    text = _strip_page_context(user_input).strip()
    return bool(_TICKET_DRAFT_RE.search(text))


def is_plain_command(user_input: str) -> bool:
    """Input is a simple command that does NOT need platform tools.

    Agent-create commands (bare or detailed) are NOT plain — they route to
    platform_create_agent and the wizard automation drives the visible UI, so
    the quick-prompt "یک ایجنت جدید بساز" actually builds the agent.
    """
    text = _strip_page_context(user_input).strip()
    if is_wizard_create_intent(user_input):
        return False
    if is_agent_create_request(user_input):
        return False
    return False


def support_plain_response(user_input: str) -> str | None:
    """Deterministic support replies for underspecified commands.

    Keep these out of the LLM/tool loop so the support agent does not promise
    work, call tools without enough data, or leave the chat hanging.
    """
    if is_plain_command(user_input):
        on_wizard = is_on_agent_create_wizard(user_input)
        if on_wizard:
            return (
                "برای ساخت ایجنت جدید، همین‌جا در ویزارد نام و توضیح کوتاه ایجنت را وارد کنید "
                "(یا یک نام پیشنهادی بفرستید تا کامل کنم). "
                "مثلاً: «یک ایجنت به نام پشتیبان فروش بساز که به سوالات مشتریان درباره سفارش پاسخ بدهد»."
            )
        return (
            "برای ساخت ایجنت جدید، لطفاً حداقل نام و توضیح کوتاه ایجنت را بفرستید. "
            "مثلاً: «یک ایجنت به نام پشتیبان فروش بساز که به سوالات مشتریان درباره سفارش پاسخ بدهد»."
        )
    return None


def _strip_page_context(user_input: str) -> str:
    if "---" in user_input:
        return user_input.split("---", 1)[0].strip()
    return user_input


def _user_text_from_input(user_input: str) -> str:
    """The user's actual command — the part AFTER the first '---' separator.

    The frontend wraps each support message as '<page context>\\n---\\n<user text>',
    so _strip_page_context keeps the context and discards the command. Command
    detection must read the user text instead, otherwise 'یک ایجنت جدید بساز'
    (sent by the quick-prompt) is stripped away and never matched.
    """
    if "---" in user_input:
        return user_input.split("---", 1)[1].strip()
    return user_input.strip()


def _parse_tool_payload(content: str) -> dict[str, Any] | None:
    raw = (content or "").strip()
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def extract_platform_tool_results(messages: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for msg in messages:
        if type(msg).__name__ != "ToolMessage":
            continue
        name = getattr(msg, "name", "") or ""
        if not name.startswith(_PLATFORM_TOOL_PREFIX) and name not in ("crm_lookup",):
            continue
        content = msg.content
        if isinstance(content, list):
            content = "".join(
                p.get("text", "") if isinstance(p, dict) else str(p) for p in content
            )
        payload = _parse_tool_payload(str(content))
        if payload is not None:
            payload["_tool"] = name
            out.append(payload)
    return out


def _has_tool_calls(messages: list[Any]) -> bool:
    return any(type(m).__name__ == "ToolMessage" for m in messages)


_UI_EXECUTION_TOOLS = frozenset(
    {
        "platform_execute_ui",
        "platform_open_agent",
        "platform_create_agent",
        "platform_continue_agent_testing",
        "platform_complete_agent_training",
        "platform_approve_agent_dashboard",
        "platform_generate_widget",
        "platform_create_user",
        "platform_create_api_agent",
        "platform_provision_api_agent",
    }
)

_PROVISIONING_TOOLS = frozenset(
    {
        "platform_create_external_api",
        "platform_test_external_api",
        "platform_create_api_agent",
        "platform_provision_api_agent",
        "platform_create_user",
        "platform_create_agent",
    }
)


def has_provisioning_execution(tool_results: list[dict[str, Any]]) -> bool:
    for payload in tool_results:
        if payload.get("_tool") in _PROVISIONING_TOOLS and payload.get("success"):
            return True
    return False


def has_wizard_create_execution(tool_results: list[dict[str, Any]]) -> bool:
    for payload in tool_results:
        if payload.get("_tool") == "platform_create_agent" and payload.get("success"):
            return True
    return False


def has_continue_testing_execution(tool_results: list[dict[str, Any]]) -> bool:
    for payload in tool_results:
        tool = payload.get("_tool", "")
        if tool == "platform_continue_agent_testing" and payload.get("success"):
            return True
        if tool == "platform_create_agent" and payload.get("success"):
            return True
    return False


def has_partial_wizard_execute_ui(tool_results: list[dict[str, Any]]) -> bool:
    from src.agents_lib.platform_ui_catalog import steps_touch_agent_create_wizard

    for payload in tool_results:
        if payload.get("_tool") != "platform_execute_ui" or not payload.get("success"):
            continue
        raw_append = payload.get("append_json") or ""
        try:
            append = json.loads(raw_append) if isinstance(raw_append, str) else {}
        except json.JSONDecodeError:
            append = {}
        steps = (append.get("ui_script") or {}).get("steps") or []
        if steps_touch_agent_create_wizard(steps):
            return True
    return False


def is_navigate_only_ui(tool_results: list[dict[str, Any]]) -> bool:
    for payload in tool_results:
        if payload.get("_tool") != "platform_execute_ui" or not payload.get("success"):
            continue
        raw_append = payload.get("append_json") or ""
        try:
            append = json.loads(raw_append) if isinstance(raw_append, str) else {}
        except json.JSONDecodeError:
            append = {}
        steps = (append.get("ui_script") or {}).get("steps") or []
        if steps and all(s.get("type") == "navigate" for s in steps):
            return True
    return False


def has_ui_execution(tool_results: list[dict[str, Any]]) -> bool:
    """True when a tool returned a ui_script the player can run."""
    for payload in tool_results:
        tool = payload.get("_tool", "")
        if tool in _UI_EXECUTION_TOOLS and payload.get("success"):
            append = payload.get("append_json") or ""
            if isinstance(append, str) and "ui_script" in append:
                return True
            if payload.get("ui_script"):
                return True
    return False


def _format_agents_bullets(agents: list[dict[str, Any]], limit: int = 20) -> str:
    lines: list[str] = []
    for a in agents[:limit]:
        name = a.get("name") or "—"
        slug = a.get("slug") or ""
        kind = a.get("kind") or a.get("status") or ""
        suffix = f" ({kind})" if kind else ""
        slug_bit = f" · {slug}" if slug else ""
        lines.append(f"- {name}{suffix}{slug_bit}")
    if len(agents) > limit:
        lines.append(f"- … و {len(agents) - limit} مورد دیگر")
    return "\n".join(lines) if lines else "- موردی ثبت نشده"


def format_platform_tool_result(data: dict[str, Any]) -> str | None:
    """Deterministic user-facing text from a single tool payload."""
    if data.get("requires_superuser") and data.get("error"):
        cap = str(data.get("capability") or "admin")
        hints = {
            "create_agent": "ساخت ایجنت فقط برای ادمین است — از نوار کنار «نمای ادمین» را فعال کنید.",
            "manage_users": "مدیریت کاربران فقط برای ادمین است.",
            "access_admin": "پنل ادمین فقط برای ادمین در دسترس است.",
            "execute_admin_ui": "این کار UI فقط برای ادمین مجاز است.",
        }
        hint = hints.get(cap, "")
        base = f"⚠ {data['error']}"
        return f"{base}\n\n{hint}" if hint and hint not in str(data["error"]) else base

    if data.get("error"):
        return f"⚠ {data['error']}"

    tool = data.get("_tool", "")
    if data.get("success") is False and data.get("error"):
        return f"⚠ {data['error']}"

    if msg := data.get("message"):
        if isinstance(msg, str) and msg.strip():
            base = msg.strip()
        else:
            base = None
    else:
        base = None

    extra_parts: list[str] = []

    if dept := data.get("department_label") or data.get("department"):
        label = data.get("department_label") or department_label_fa(str(dept))
        slug = data.get("department") or dept
        if "agent_count" in data:
            extra_parts.append(f"**{label}** (`{slug}`) — {data['agent_count']} ایجنت")
        elif tool == "platform_department_overview":
            extra_parts.append(f"**{label}** (`{slug}`)")

    if agents := data.get("agents"):
        if isinstance(agents, list) and agents:
            extra_parts.append(_format_agents_bullets(agents))

    if users := data.get("users"):
        if isinstance(users, list) and users and "user_count" in data:
            extra_parts.append(f"کاربران دپارتمان: {data.get('user_count', len(users))}")
            for u in users[:10]:
                extra_parts.append(f"- {u.get('full_name', '—')} · {u.get('email', '')}")

    if departments := data.get("departments"):
        if isinstance(departments, list) and departments:
            extra_parts.append("**دپارتمان‌ها (از دیتابیس):**")
            for d in departments:
                label = d.get("label") or department_label_fa(d.get("department"))
                count = d.get("agent_count", 0)
                line = f"- {label}: {count} ایجنت"
                if "user_count" in d:
                    line += f"، {d['user_count']} کاربر"
                extra_parts.append(line)

    if tool == "platform_list_agents" and "total" in data and not agents:
        extra_parts.append(f"تعداد ایجنت: {data['total']}")

    if tool == "platform_open_agent" and data.get("slug"):
        tab = data.get("tab") or "chat"
        extra_parts.append(f"شناسه: `{data['slug']}` · تب: {tab}")

    if tool == "platform_execute_ui" and data.get("step_count"):
        extra_parts.append(f"{data['step_count']} مرحله UI در حال اجرا")

    if tool == "platform_get_user_capabilities" and data.get("capabilities"):
        caps = data["capabilities"]
        if isinstance(caps, dict):
            extra_parts.append(
                f"create_agent={caps.get('can_create_agent')} · "
                f"manage_users={caps.get('can_manage_users')}"
            )

    if tool == "platform_provision_api_agent" and data.get("agent_slug"):
        extra_parts.append(f"ایجنت: `{data['agent_slug']}`")
        if sc := data.get("status_code"):
            extra_parts.append(f"تست API: HTTP {sc}")

    if tool == "platform_create_external_api" and data.get("service_slug"):
        extra_parts.append(
            f"سرویس `{data['service_slug']}` · اندپوینت `{data.get('endpoint_slug', '')}`"
        )

    if tool == "platform_test_external_api" and data.get("status_code"):
        extra_parts.append(f"HTTP {data['status_code']}")
        if preview := data.get("response_preview"):
            extra_parts.append(f"```\n{preview}\n```")

    if tool == "platform_create_api_agent" and data.get("agent_slug"):
        extra_parts.append(f"ایجنت `{data['agent_slug']}` فعال شد")

    if pwd := data.get("temporary_password"):
        extra_parts.append(f"رمز موقت: `{pwd}`")

    if base and extra_parts:
        return f"{base}\n\n" + "\n".join(extra_parts)
    if base:
        return base
    if extra_parts:
        return "\n".join(extra_parts)
    if data.get("success"):
        return "✓ عملیات ابزار با موفقیت انجام شد."
    return None


def ground_support_output(
    user_input: str,
    messages: list[Any],
    llm_output: str,
) -> str:
    """Replace LLM prose with tool-grounded text for the support agent."""
    if is_capabilities_question(user_input):
        return _STATIC_CAPABILITIES

    tool_results = extract_platform_tool_results(messages)
    formatted_blocks: list[str] = []
    for payload in tool_results:
        block = format_platform_tool_result(payload)
        if block:
            formatted_blocks.append(block)

    if formatted_blocks:
        if is_api_provisioning_request(user_input) and not has_provisioning_execution(tool_results):
            return (
                "برای ساخت API واقعی از platform_provision_api_agent "
                "(یا create_external_api + test + create_api_agent) استفاده می‌کنم — "
                "ناوبری به /integrations کافی نیست."
            )
        if is_ui_action_request(user_input) and not has_ui_execution(tool_results):
            return (
                "در حال آماده‌سازی اجرای UI… "
                "اگر این پیام تکرار شد، همان درخواست را دوباره بفرستید."
            )
        if is_navigate_only_ui(tool_results) and is_api_provisioning_request(user_input):
            return (
                "فقط صفحه باز شد — برای ساخت API باید platform_provision_api_agent اجرا شود."
            )
        grounded = "\n\n".join(formatted_blocks)
        return grounded.strip()

    if is_ui_observation_message(user_input) and not tool_results:
        cleaned = (llm_output or "").strip()
        if cleaned:
            return cleaned
        return "✓ کار انجام شد."

    if needs_any_platform_tool(user_input) and not tool_results:
        if not _has_tool_calls(messages):
            if is_ui_action_request(user_input):
                return (
                    "این کار UI است — از platform_get_ui_catalog و platform_execute_ui استفاده می‌کنم. "
                    "لطفاً همان درخواست را دوباره بفرستید."
                )
            return (
                "برای پاسخ دقیق باید ابزار پلتفرم را اجرا کنم — لطفاً درخواست را دوباره بفرستید."
            )
        # Tools were called but produced no text output — the LLM got stuck
        # in a tool loop. Give a helpful fallback instead of generic noise.
        grounded = "\n\n".join(formatted_blocks)
        if grounded.strip():
            return grounded.strip()
        # LLM generated tool calls but no final message — offer help
        return (
            "لطفاً درخواست خود را واضح‌تر بیان کنید. برای مثال:\n"
            "• ساخت ایجنت جدید: «یک ایجنت برای پشتیبانی بساز»\n"
            "• جستجوی ایجنت: «ایجنت‌های بخش مالی را نشان بده»\n"
            "• باز کردن ایجنت: «ایجنت پشتیبانی را باز کن»"
        )

    cleaned = (llm_output or "").strip()
    if _NAVIGATION_CLAIM_RE.search(cleaned) and not tool_results:
        return "برای کارهای UI از platform_execute_ui استفاده می‌شود."
    return cleaned or "چطور می‌توانم کمک کنم؟"
