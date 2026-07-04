"""Action variables must inherit input_schema defaults (wizard UI shows but may not POST)."""

from types import SimpleNamespace

from src.services.agent_action_service import render_template, variables_with_schema_defaults


def test_variables_with_schema_defaults_fills_period():
    action = SimpleNamespace(
        input_schema={
            "period": {"title": "دوره", "type": "string", "default": "اردیبهشت 1405"},
            "jalali_year": {"title": "سال", "type": "integer", "default": 1405},
        }
    )
    merged = variables_with_schema_defaults(action, {})
    assert merged["period"] == "اردیبهشت 1405"
    assert merged["jalali_year"] == 1405


def test_render_template_substitutes_defaults():
    action = SimpleNamespace(
        input_schema={"period": {"title": "دوره", "type": "string", "default": "اردیبهشت 1405"}}
    )
    variables = variables_with_schema_defaults(action, {})
    prompt = render_template("کارکرد دوره {{period}} را محاسبه کن.", variables)
    assert "{{period}}" not in prompt
    assert "اردیبهشت 1405" in prompt
