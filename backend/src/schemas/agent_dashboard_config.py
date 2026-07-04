"""Persisted per-agent dashboard configuration (AI-generated + admin-approved)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from src.schemas.agent_dashboard import (
    AgentDashboardLineChart,
    AgentDashboardPieChart,
    AgentDashboardReviewTable,
    AgentDashboardStatCard,
)

WidgetKind = Literal["stat_cards", "line_chart", "pie_chart", "review_table", "hr_savings"]


class AgentDashboardCustomConfig(BaseModel):
    """Stored dashboard layout — merged over demo fallback when approved."""

    panel_title: str
    domain_label: str
    profile: str = "custom"
    stat_cards: list[AgentDashboardStatCard] = Field(default_factory=list)
    line_chart: AgentDashboardLineChart | None = None
    pie_chart: AgentDashboardPieChart | None = None
    review_table: AgentDashboardReviewTable | None = None
    disabled_widgets: list[WidgetKind] = Field(default_factory=list)


class DashboardGenerateRequest(BaseModel):
    prompt: str | None = Field(default=None, max_length=4000)
    context_notes: str | None = Field(default=None, max_length=2000)
    widget_type: WidgetKind | None = Field(
        default=None,
        description="Target widget kind — AI focuses on this widget; others are preserved when merge_with_existing=true",
    )
    merge_with_existing: bool = Field(
        default=True,
        description="When true, merge AI output into current draft/custom instead of replacing entire dashboard",
    )


class DashboardGenerateResponse(BaseModel):
    agent_id: str
    has_draft: bool = True
    preview_summary: str
    widgets_added: list[str] = Field(default_factory=list)
    widgets_modified: list[str] = Field(default_factory=list)
    draft: AgentDashboardCustomConfig


class DashboardApproveRequest(BaseModel):
    accept_draft: bool = True


class DashboardWidgetPatchRequest(BaseModel):
    disabled_widgets: list[WidgetKind] | None = None
    remove_widgets: list[WidgetKind] | None = None
    enable_widgets: list[WidgetKind] | None = None
    remove_stat_card_ids: list[str] | None = None


class DashboardDraftResponse(BaseModel):
    agent_id: str
    has_draft: bool
    approved: bool
    draft: AgentDashboardCustomConfig | None = None
