"""Tests for per-agent dashboard widget plans."""

from types import SimpleNamespace

from src.schemas.agent_dashboard_config import AgentDashboardCustomConfig
from src.schemas.agent_widget_plan import AgentWidgetPlan, ReviewWidgetSpec
from src.services.agent_widget_plan_service import (
    apply_widget_plan_to_raw,
    assert_widget_enabled,
    enforce_widget_plan,
    parse_widget_plan,
    review_table_from_plan,
)


def _agent(**kwargs):
    defaults = {
        "name": "تست",
        "description": "ایجنت تست",
        "department": "finance",
        "config_json": {},
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_parse_legacy_agent_all_widgets_addable():
    plan = parse_widget_plan(_agent())
    assert plan.review_table.enabled is True
    assert plan.stat_cards.enabled is True


def test_parse_explicit_plan_review_disabled():
    plan = parse_widget_plan(
        _agent(config_json={"widget_plan": {"review_table": {"enabled": False}}})
    )
    assert plan.review_table.enabled is False


def test_review_table_from_plan_uses_alert_rules():
    agent = _agent(
        config_json={
            "widget_plan": {
                "review_table": {
                    "enabled": True,
                    "title": "بازبینی حقوق",
                    "alert_rules": [
                        {"description": "اضافه‌کار غیرعادی", "threshold": "بیش از ۱۲ ساعت"},
                        {"description": "مغایرت بانکی", "threshold": None},
                    ],
                }
            }
        }
    )
    plan = parse_widget_plan(agent)
    table = review_table_from_plan(agent, plan)
    assert table is not None
    assert len(table.rows) == 2
    assert "آستانه" in table.rows[0].cells["item"]
    assert "مغایرت بانکی" in table.rows[1].cells["item"]


def test_review_table_from_plan_uses_scope_lines():
    agent = _agent(
        config_json={
            "widget_plan": {
                "review_table": {
                    "enabled": True,
                    "title": "بازبینی فاکتور",
                    "scope": "فاکتور بالا\nتراکنش مشکوک",
                }
            }
        }
    )
    plan = parse_widget_plan(agent)
    table = review_table_from_plan(agent, plan)
    assert table is not None
    assert table.title == "بازبینی فاکتور"
    assert len(table.rows) == 2
    assert "فاکتور بالا" in table.rows[0].cells["item"]


def test_enforce_widget_plan_strips_disabled_review():
    agent = _agent(
        config_json={
            "widget_plan": {
                "review_table": {"enabled": False},
                "stat_cards": {"enabled": True},
            }
        }
    )
    config = AgentDashboardCustomConfig(
        panel_title="p",
        domain_label="d",
        review_table={
            "title": "x",
            "columns": [{"key": "item", "label": "مورد"}],
            "rows": [{"id": "1", "cells": {"item": "y"}}],
        },
    )
    out = enforce_widget_plan(config, agent)
    assert out.review_table is None
    assert "review_table" in out.disabled_widgets


def test_enforce_widget_plan_strips_disabled_pie_chart():
    agent = _agent(
        config_json={
            "widget_plan": {
                "pie_chart": {"enabled": False},
                "stat_cards": {"enabled": True},
                "line_chart": {"enabled": True},
            }
        }
    )
    config = AgentDashboardCustomConfig(
        panel_title="p",
        domain_label="d",
        pie_chart={"title": "توزیع", "slices": [{"name": "الف", "value": 50}]},
    )
    out = enforce_widget_plan(config, agent)
    assert out.pie_chart is None
    assert "pie_chart" in out.disabled_widgets


def test_apply_widget_plan_to_raw_strips_demo_pie():
    agent = _agent(
        config_json={
            "widget_plan": {
                "pie_chart": {"enabled": False},
            }
        }
    )
    raw = {
        "stat_cards": [{"label": "x", "value": "1"}],
        "pie_chart": {"title": "دمو", "slices": [{"name": "a", "value": 1}]},
        "line_chart": {"title": "روند", "series": [], "points": []},
    }
    out = apply_widget_plan_to_raw(agent, raw)
    assert out["pie_chart"] is None
    assert out["line_chart"] is not None


def test_assert_widget_enabled_raises_for_locked_review():
    agent = _agent(config_json={"widget_plan": {"review_table": {"enabled": False}}})
    try:
        assert_widget_enabled(agent, "review_table")
        raised = False
    except Exception as exc:
        raised = True
        assert exc.status_code == 422
    assert raised
