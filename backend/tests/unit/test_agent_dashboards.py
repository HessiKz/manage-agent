"""Per-agent dashboard profile resolution."""

from types import SimpleNamespace

from src.demo.agent_dashboards import base_dashboard_for_agent, resolve_profile_key
from src.models.agent import AgentKind


def _agent(slug: str, kind: AgentKind = AgentKind.CHAT, department: str = "ops"):
    return SimpleNamespace(slug=slug, kind=kind, department=department, name=f"Agent {slug}")


def test_resolve_profile_by_slug():
    assert resolve_profile_key(_agent("invoice")) == "invoice"
    assert resolve_profile_key(_agent("example-karkard")) == "karkard"
    assert resolve_profile_key(_agent("payroll")) == "payroll"


def test_profiles_differ():
    invoice = base_dashboard_for_agent(_agent("invoice"))
    karkard = base_dashboard_for_agent(_agent("example-karkard"))
    assert invoice["profile"] != karkard["profile"]
    assert invoice["stat_cards"][0]["label"] != karkard["stat_cards"][0]["label"]


def test_payroll_profile_domain_kpis():
    payroll = base_dashboard_for_agent(_agent("payroll"))
    assert payroll["profile"] == "payroll"
    labels = {c["label"] for c in payroll["stat_cards"]}
    assert "کل کارمندان" in labels or "جمع پرداختی" in labels
