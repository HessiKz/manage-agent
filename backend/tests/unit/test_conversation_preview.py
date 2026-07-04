from src.core.conversation_preview import (
    humanize_output_preview,
    humanize_user_message,
    plain_text_preview,
)

SAMPLE_ACTION_INPUT = """فیش حقوق بهمن را بساز

Context for tools (use these exact values when calling tools):
{"month": "بهمن", "agent_id": "7aaf74c0-3160-463c-8059-98bc5a6dfefc"}

Complete this action by calling these tools via function calling: hr_lookup, report_generate."""

SAMPLE_OUTPUT = (
    "فیش حقوقی بهمن آماده شد. دانلود: /api/v1/demo-files/reports/payslip-بهmen.pdf"
)


def test_strips_tool_context_and_json_from_input():
    out = humanize_user_message(SAMPLE_ACTION_INPUT)
    assert "Context for tools" not in out
    assert "agent_id" not in out
    assert "بهمن" in out
    assert "فیش حقوق" in out


def test_output_preview_hides_api_path():
    out = humanize_output_preview(SAMPLE_OUTPUT)
    assert "/api/v1/" not in out
    assert "فیش حقوقی" in out


SAMPLE_SUPPORT_INPUT = """[زمینه صفحه — فقط برای راهنمایی، به کاربر نگو]
نقش: ادمین
صفحه: صفحه ایجنت
مسیر: /agents/demo
---
یک ایجنت جدید بساز"""


def test_strips_support_page_context_from_input():
    out = humanize_user_message(SAMPLE_SUPPORT_INPUT)
    assert "زمینه صفحه" not in out
    assert "مسیر" not in out
    assert "ایجنت جدید" in out


def test_strips_markdown_from_output_preview():
    out = humanize_output_preview("### دستیار پیگیری فاکتور\n\n**مهر ۱۴۰۳** گزارش آماده است.")
    assert "###" not in out
    assert "**" not in out
    assert "دستیار پیگیری فاکتور" in out
    assert "مهر ۱۴۰۳" in out


def test_strips_ma_inputs_marker_from_user_message():
    raw = "گزارش حقوق\n<!--ma-inputs-->\nدوره: {{period}}\nسال: {{jalali_year}}"
    out = humanize_user_message(raw)
    assert "<!--" not in out
    assert "{{" not in out
    assert "گزارش حقوق" in out
    assert "دوره" not in out


def test_validation_system_prompt_becomes_friendly_label():
    raw = "automatic validation run. Return a one-line successful response."
    assert humanize_user_message(raw) == "اجرای تست خودکار"
    assert plain_text_preview(raw) == "اجرای تست خودکار"
