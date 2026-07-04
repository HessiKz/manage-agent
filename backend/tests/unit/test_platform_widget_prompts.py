"""Default widget prompts for platform support tools."""

from types import SimpleNamespace

from src.models.agent import AgentKind
from src.services.platform_widget_prompts import default_widget_prompt


def test_stat_cards_prompt_includes_agent_name():
    agent = SimpleNamespace(name="ایجنت تست", slug="test")
    prompt = default_widget_prompt(agent, "stat_cards")
    assert "ایجنت تست" in prompt
    assert "KPI" in prompt or "کارت" in prompt
