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
    assert is_agent_create_request("یک ایجنت جدید بساز")
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
