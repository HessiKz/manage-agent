from types import SimpleNamespace

from src.core.agent_file_roles import (
    agent_file_role,
    display_agent_filename,
    is_instruction_file,
    is_output_sample_file,
)
from src.services.agent_instruction_service import AgentInstructionService


def test_agent_file_roles_from_filename_prefixes():
    assert is_instruction_file("instruction__rules.docx")
    assert is_output_sample_file("output-sample__report.xlsx")
    assert agent_file_role("instruction__rules.docx") == "instruction"
    assert agent_file_role("output-sample__report.xlsx") == "output_sample"
    assert agent_file_role("raw.xlsx") == "runtime"
    assert display_agent_filename("instruction__rules.docx") == "rules.docx"


def test_instruction_fallback_prompt_uses_text_and_file_content():
    svc = AgentInstructionService(db=SimpleNamespace())
    agent = SimpleNamespace(
        name="محاسبه کارکرد",
        description="پردازش فایل کارکرد ماهانه",
        department="hr",
        kind="worker",
        capabilities={"file_upload_enabled": True, "actions_enabled": True},
        tool_names=["run_agent_script"],
    )
    blocks = [{"filename": "دستور کارکرد.docx", "text": "ستون تاریخ و اضافه‌کار را دقیق محاسبه کن."}]
    rules = [{"text": "پنجشنبه و جمعه روز کاری نیست", "source": "doc", "confidence": "heuristic"}]

    prompt = svc.fallback_prompt(
        agent,
        "خروجی باید اکسل نهایی HR باشد.",
        blocks,
        rules,
    )

    assert "محاسبه کارکرد" in prompt
    assert "خروجی باید اکسل نهایی HR باشد" in prompt
    assert "ستون تاریخ" in prompt
    assert "پنجشنبه" in prompt
    assert "دوباره فایل دستورالعمل" in prompt


def test_heuristic_rules_extract_bullet_lines():
    from src.services.agent_instruction_service import _heuristic_rules_from_text

    text = "- پنجشنبه تعطیل است\n• اضافه‌کار بعد از ۹ ساعت"
    extracted = _heuristic_rules_from_text(text, source="doc")
    assert any("پنجشنبه" in r["text"] for r in extracted)
