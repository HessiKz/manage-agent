"""Support agent anti-hallucination grounding."""

import importlib.util
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2] / "src" / "agents_lib" / "platform_support_grounding.py"
_spec = importlib.util.spec_from_file_location("platform_support_grounding", _ROOT)
_mod = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_mod)

ground_support_output = _mod.ground_support_output
format_platform_tool_result = _mod.format_platform_tool_result
needs_grounded_tools = _mod.needs_grounded_tools
is_capabilities_question = _mod.is_capabilities_question
is_agent_create_request = _mod.is_agent_create_request
infer_agent_create_defaults = _mod.infer_agent_create_defaults
needs_any_platform_tool = _mod.needs_any_platform_tool


class ToolMessage:
    def __init__(self, name: str, content: str):
        self.name = name
        self.content = content


def test_capabilities_question_uses_static_reply():
    assert is_capabilities_question("چه کارهایی میتونی بکنی")
    out = ground_support_output("چه کارهایی میتونی بکنی", [], "من همه کار می‌کنم و ۹۹ ایجنت دارم")
    assert "۹۹" not in out
    assert "ابزار" in out


def test_factual_without_tools_rejects_llm_hallucination():
    assert needs_grounded_tools("دپارتمان عملیات رو بیار")
    out = ground_support_output(
        "دپارتمان عملیات رو بیار",
        [],
        "۶ ایجنت در ops وجود دارد: دستیار عمومی، API…",
    )
    assert "۶ ایجنت" not in out
    assert "ابزار" in out


def test_grounded_from_tool_payload_only():
    payload = {
        "_tool": "platform_department_overview",
        "success": True,
        "department": "ops",
        "department_label": "عملیات",
        "agent_count": 6,
        "message": "دپارتمان عملیات (ops): 6 ایجنت.",
        "agents": [
            {"name": "دستیار عمومی", "slug": "general", "kind": "chat"},
            {"name": "یکپارچه‌ساز API", "slug": "example-api-connector", "kind": "chat"},
        ],
    }
    msgs = [ToolMessage("platform_department_overview", __import__("json").dumps(payload))]
    out = ground_support_output(
        "دپارتمان عملیات رو بیار",
        msgs,
        "من صفحه را باز کردم و ۱۰ ایجنت دیدم",
    )
    assert "۱۰ ایجنت" not in out
    assert "دستیار عمومی" in out
    assert "general" in out
    assert "باز کردم" not in out


def test_format_tool_error():
    text = format_platform_tool_result({"_tool": "platform_open_agent", "error": "ایجنت پیدا نشد"})
    assert "ایجنت پیدا نشد" in text


def test_agent_create_request_defaults():
    # Bare "create agent" commands reach the tool path with sensible defaults
    # so the quick-prompt actually drives the wizard end-to-end.
    assert is_agent_create_request("یک ایجنت جدید بساز")
    # Detailed requests reach the tool path and infer sensible defaults.
    assert is_agent_create_request("یک ایجنت برای پشتیبانی بساز")
    defaults = infer_agent_create_defaults("یک ایجنت جدید بساز")
    assert defaults["name"] == "ایجنت جدید"
    assert defaults["department"] == "ops"
    assert defaults["kind"] == "chat"

    named = infer_agent_create_defaults('ایجنت «پشتیبان فروش» بساز')
    assert named["name"] == "پشتیبان فروش"


if __name__ == "__main__":
    test_capabilities_question_uses_static_reply()
    test_factual_without_tools_rejects_llm_hallucination()
    test_grounded_from_tool_payload_only()
    test_format_tool_error()
    print("ok")

def test_ticket_drafting_does_not_require_platform_tools():
    text = "پاسخ پیشنهادی برای بستن تیکت\n\nفرمت: عنوان کوتاه + ۲–۳ bullet؛ لحن رسمی."
    assert not needs_grounded_tools(text)
    assert not needs_any_platform_tool(text)
    out = ground_support_output(text, [], "عنوان رسمی\n- مشکل بررسی شد.\n- دسترسی کاربر اصلاح شد.")
    assert "برای پاسخ دقیق باید ابزار پلتفرم" not in out
    assert "عنوان رسمی" in out


def test_bare_create_command_drives_wizard_on_create_page():
    """Bare 'build a new agent' routes through platform_create_agent (with
    defaults) so the quick-prompt actually builds the agent end-to-end via the
    wizard.create bridge — instead of a dead-end 'please give a name' reply.

    The frontend always sends the support message as '<page context>\\n---\\n<user
    text>', so the command lives AFTER the '---' separator.
    """
    mod = _mod
    on_wizard = "زمینه صفحه\nصفحه: ساخت ایجنت\nمسیر فعلی: /agents/create\n---\nیک ایجنت جدید بساز"
    assert mod.is_wizard_create_intent(on_wizard)
    assert mod.is_on_agent_create_wizard(on_wizard)
    # Now a tool trigger — NOT a deterministic 'ask for name' reply — so the
    # wizard automation runs and the agent actually gets created.
    assert not mod.is_plain_command(on_wizard)
    assert mod.is_agent_create_request(on_wizard)
    assert mod.needs_any_platform_tool(on_wizard)
    assert mod.support_plain_response(on_wizard) is None
    defaults = mod.infer_agent_create_defaults(on_wizard)
    assert defaults["name"] == "ایجنت جدید"


def test_enriched_create_command_gets_tools_not_flagged_as_observation():
    """The real frontend support message embeds a live-UI snapshot (<context
    block with '[مشاهده UI زنده …]' line>\\n---\\n<user text>). Before the fix:

    - is_ui_observation_message matched the bare substring '[مشاهده UI', which
      is present in the context block, so every user command was treated as a
      post-UI observation callback.
    - needs_any_platform_tool (the gate that decides whether the support agent
      gets ANY platform tools) stripped the context and discarded the user text
      after '---', so the create command was never seen -> tool_names=[] -> the
      LLM had no platform_create_agent tool and just narrated forever (the
      reported 'stuck on یک ایجنت جدید بساز' hang).

    Now the command (after '---') is detected and tools are bound.
    """
    mod = _mod
    ctx = (
        "[زمینه صفحه — فقط برای راهنمایی]\n"
        "نقش: ادمین\n"
        "صفحه: فضای کار\n"
        "مسیر فعلی: /dashboard\n"
        "[مشاهده UI زنده — مثل دیدن صفحه؛ از refها برای platform_execute_ui استفاده کن]\n"
        "- ref:ui-1: heading «سلام System»"
    )
    enriched = ctx + "\n---\nیک ایجنت جدید بساز"

    # The live-UI context line must NOT make a user command look like the
    # post-execution observation callback.
    assert mod.is_ui_observation_message(enriched) is False
    # The create command (after '---') must be detected.
    assert mod.is_agent_create_request(enriched) is True
    assert mod.is_wizard_create_intent(enriched) is True
    # And it must receive platform tools — the regression that hung the agent.
    assert mod.needs_any_platform_tool(enriched) is True
    assert mod.support_plain_response(enriched) is None

    # A genuine post-UI observation callback (carries 'پس از اجرای UI') is still
    # recognised as an observation — so the retry/continue logic keeps working.
    observation = ctx + "\n---\n[مشاهده UI — پس از اجرای UI]\nوضعیت ویزارد را ببین."
    assert mod.is_ui_observation_message(observation) is True


