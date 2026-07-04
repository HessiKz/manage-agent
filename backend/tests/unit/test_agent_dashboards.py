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


def test_generic_chat_custom_agent_uses_name():
    custom = _agent("yjnt-pshtybny-hwshmnd", department="ops")
    custom.name = "ایجنت هوشمند سازمان"
    dash = base_dashboard_for_agent(custom)
    assert dash["profile"] == "generic_chat"
    assert custom.name[:20] in dash["stat_cards"][2]["hint"]


def test_month_end_inspector_not_resume_profile():
    agent = _agent("bazras-payane-mah", department="hr")
    agent.name = "بازرس پایان ماه"
    agent.description = "کنترل و بستن دوره مالی"
    assert resolve_profile_key(agent) == "invoice"


def test_hr_department_without_resume_keywords_defaults_karkard():
    agent = _agent("custom-hr-ops", department="hr")
    agent.name = "هماهنگ‌کننده منابع انسانی"
    assert resolve_profile_key(agent) == "karkard"
