"""Unit tests for cursor direct tool runner."""

from src.agents_lib.cursor_tool_runner import (
    build_tool_args,
    extract_tool_context,
    format_tool_output,
    select_tools_for_request,
)
from src.agents_lib.custom_tools import resume_screen


def test_extract_tool_context_from_action_prompt():
    text = (
        "Process payroll\n\n"
        'Context for tools (use these exact values when calling tools):\n'
        '{"role": "Backend Engineer", "min_score": 6, "storage_path": "/tmp/x.xlsx"}'
    )
    ctx = extract_tool_context(text)
    assert ctx["role"] == "Backend Engineer"
    assert ctx["storage_path"] == "/tmp/x.xlsx"


def test_build_tool_args_resume_screen():
    ctx = {"role": "sample", "min_score": 7}
    args = build_tool_args(resume_screen, "resume_screen", ctx, "غربال رزومه")
    assert args["role"] == "Backend Engineer"
    assert args["min_score"] == 7


def test_select_tools_validation_smoke_skips_tools():
    chosen = select_tools_for_request(
        "This is an automatic validation run. Return a one-line successful response.",
        ["hr_lookup", "report_generate"],
    )
    assert chosen == []


def test_select_tools_user_resume_request():
    chosen = select_tools_for_request(
        "همه رزومه‌های جدید را برای نقش بک‌اند غربال کن.",
        ["resume_screen", "hr_lookup"],
    )
    assert chosen == ["resume_screen"]


def test_format_resume_screen_persian():
    text = format_tool_output(
        "resume_screen",
        {
            "role": "Backend Engineer",
            "shortlisted_count": 3,
            "total_resumes": 5,
            "threshold": 6,
            "shortlisted": [{"name": "Ali", "score": 10, "category": "قوی", "top_skills": ["Python"]}],
        },
        validation=False,
    )
    assert "غربالگری رزومه" in text
    assert "Ali" in text
    assert "Resume screening" not in text


def test_extract_storage_path_from_orchestrator_context():
    text = (
        "Automatic validation run.\n\n---\n"
        "فایل‌های آپلودشده:\n"
        "- sample.xlsx  ←  storage_path=var/agent_files/abc/file_sample.xlsx\n"
        'برای پردازش، agent_id="abc-123" استفاده کن.'
    )
    ctx = extract_tool_context(text)
    assert ctx["storage_path"] == "var/agent_files/abc/file_sample.xlsx"
    assert ctx["agent_id"] == "abc-123"
