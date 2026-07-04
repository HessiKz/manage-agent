from types import SimpleNamespace

import jdatetime

from src.agents_lib.agent_factory import build_system_prompt
from src.karkard.processor import PERSIAN_MONTHS, _infer_work_month


def test_system_prompt_includes_gregorian_and_jalali_dates():
    agent = SimpleNamespace(
        slug="date-test",
        system_prompt="دستور پایه",
        kind="chat",
        tool_names=[],
        config_json={},
    )

    prompt = build_system_prompt(agent)

    assert "تاریخ امروز میلادی" in prompt
    assert "تاریخ امروز شمسی" in prompt
    assert jdatetime.date.today().strftime("%Y/%m/%d") in prompt


def test_karkard_empty_date_fallback_uses_current_jalali_year():
    month, year = _infer_work_month([])
    today = jdatetime.date.today()

    assert month == PERSIAN_MONTHS[today.month - 1]
    assert year == today.year
