"""Every catalog slug has a dedicated execution profile."""

from types import SimpleNamespace

from src.database.full_catalog import FULL_AGENT_CATALOG
from src.demo.agent_execution_profiles import AGENT_EXECUTION_BY_SLUG, execution_profile_for_agent
from src.models.agent import AgentKind


def _agent_from_catalog(entry: dict):
    return SimpleNamespace(
        slug=entry["slug"],
        kind=entry["kind"],
        department=entry.get("department", "ops"),
        name=entry["name"],
        description=entry.get("description", ""),
    )


def test_all_catalog_slugs_have_execution_profile():
    missing = [e["slug"] for e in FULL_AGENT_CATALOG if e["slug"] not in AGENT_EXECUTION_BY_SLUG]
    assert missing == [], f"Add execution profile for: {missing}"


def test_execution_profiles_are_distinct():
    payroll = execution_profile_for_agent(_agent_from_catalog({"slug": "payroll", "kind": AgentKind.WORKER, "department": "finance", "name": "p", "description": ""}))
    invoice = execution_profile_for_agent(_agent_from_catalog({"slug": "invoice", "kind": AgentKind.CHAT, "department": "finance", "name": "i", "description": ""}))
    assert payroll["domain_label"] != invoice["domain_label"]
    assert payroll["profile"] != invoice["profile"]
