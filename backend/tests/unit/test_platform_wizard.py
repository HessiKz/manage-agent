"""Platform wizard path helpers."""

from unittest.mock import MagicMock

from src.models.agent import AgentStatus
from src.services.platform_wizard_service import agent_in_wizard, agent_ui_path, validation_state


def _agent(*, status=AgentStatus.DEPLOYING, validation: dict | None = None, slug="test-agent", name="تست"):
    agent = MagicMock()
    agent.slug = slug
    agent.name = name
    agent.status = status
    agent.config_json = {"validation": validation or {"state": "training"}}
    return agent


def test_validation_state_defaults_pending():
    agent = MagicMock()
    agent.config_json = {}
    assert validation_state(agent) == "pending"


def test_agent_in_wizard_deploying_training():
    agent = _agent(validation={"state": "training"})
    assert agent_in_wizard(agent) is True


def test_agent_in_wizard_active_done():
    agent = _agent(status=AgentStatus.ACTIVE, validation={"state": "done"})
    assert agent_in_wizard(agent) is False


def test_agent_in_wizard_active_pending_catalog_default():
    agent = _agent(status=AgentStatus.ACTIVE, validation={})
    assert agent_in_wizard(agent) is False


def test_agent_ui_path_wizard_training():
    agent = _agent(validation={"state": "training"})
    path = agent_ui_path(agent)
    assert path.startswith("/agents/create/testing?")
    assert "slug=test-agent" in path
    assert "name=" in path


def test_agent_ui_path_wizard_draft_highlight():
    agent = _agent(validation={"state": "dashboard_review"})
    path = agent_ui_path(agent, draft=True, highlight_widget="pie_chart")
    assert "/agents/create/testing?" in path
    assert "draft=1" in path
    assert "highlight_widget=pie_chart" in path


def test_agent_ui_path_active_agent():
    agent = _agent(status=AgentStatus.ACTIVE, validation={"state": "done"})
    path = agent_ui_path(agent, draft=True, highlight_widget="stat_cards")
    assert path.startswith("/agents/test-agent?")
    assert "tab=overview" in path
    assert "draft=1" in path
