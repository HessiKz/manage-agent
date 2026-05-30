from src.core.conversation_preview import humanize_output_preview, humanize_user_message

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
