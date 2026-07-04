"""UI paths and wizard state helpers for platform support tools."""

from __future__ import annotations

from urllib.parse import quote, urlencode

from src.models.agent import Agent, AgentStatus


def validation_state(agent: Agent) -> str:
    return ((agent.config_json or {}).get("validation") or {}).get("state") or "pending"


def agent_in_wizard(agent: Agent) -> bool:
    """True only while an agent is still in the creation/testing pipeline."""
    if agent.status == AgentStatus.ACTIVE:
        # Published catalog agents stay ACTIVE — never send users to /agents/create/testing.
        return False
    if agent.status == AgentStatus.DEPLOYING:
        state = validation_state(agent)
        if state in ("done", "cancelled"):
            return False
        return True
    return validation_state(agent) in ("training", "dashboard_review", "running", "pending")


def agent_ui_path(
    agent: Agent,
    *,
    tab: str | None = None,
    draft: bool = False,
    highlight_widget: str | None = None,
    open_widget_builder: bool = False,
    widget_type: str | None = None,
) -> str:
    params: dict[str, str] = {}

    if agent_in_wizard(agent):
        params["slug"] = agent.slug
        params["name"] = agent.name or agent.slug
        if draft:
            params["draft"] = "1"
        if highlight_widget:
            params["highlight_widget"] = highlight_widget
        qs = urlencode(params, quote_via=quote)
        return f"/agents/create/testing?{qs}"

    if tab:
        params["tab"] = tab
    elif draft or highlight_widget or open_widget_builder or widget_type:
        params["tab"] = "overview"
    if draft:
        params["draft"] = "1"
    if highlight_widget:
        params["highlight_widget"] = highlight_widget
    if open_widget_builder:
        params["open_widget_builder"] = "1"
    if widget_type:
        params["widget_type"] = widget_type
    qs = urlencode(params, quote_via=quote)
    return f"/agents/{agent.slug}?{qs}" if qs else f"/agents/{agent.slug}"


def wizard_step_label(agent: Agent) -> str:
    state = validation_state(agent)
    if state == "training":
        return "training"
    if state == "dashboard_review":
        return "dashboard_review"
    if state == "running":
        return "testing"
    return "wizard"
