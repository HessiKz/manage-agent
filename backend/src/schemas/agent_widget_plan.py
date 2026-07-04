"""Per-agent dashboard widget plan — set during agent creation wizard."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

WidgetPlanKind = Literal["stat_cards", "line_chart", "pie_chart", "review_table", "hr_savings"]

ALL_WIDGET_PLAN_KINDS: tuple[WidgetPlanKind, ...] = (
    "stat_cards",
    "line_chart",
    "pie_chart",
    "review_table",
    "hr_savings",
)


class ReviewAlertRule(BaseModel):
    description: str = Field(default="", max_length=300)
    threshold: str | None = Field(default=None, max_length=120)


class ReviewWidgetSpec(BaseModel):
    enabled: bool = False
    title: str | None = Field(default=None, max_length=120)
    scope: str | None = Field(
        default=None,
        max_length=2000,
        description="What the agent outputs need human review (fa-IR)",
    )
    alert_rules: list[ReviewAlertRule] = Field(default_factory=list)


class StatCardsWidgetSpec(BaseModel):
    enabled: bool = True
    hints: list[str] = Field(default_factory=list, max_length=6)


class ChartWidgetSpec(BaseModel):
    enabled: bool = True
    hint: str | None = Field(default=None, max_length=500)


class HrSavingsWidgetSpec(BaseModel):
    enabled: bool = False


class AgentWidgetPlan(BaseModel):
    stat_cards: StatCardsWidgetSpec = Field(default_factory=StatCardsWidgetSpec)
    line_chart: ChartWidgetSpec = Field(default_factory=ChartWidgetSpec)
    pie_chart: ChartWidgetSpec = Field(default_factory=ChartWidgetSpec)
    review_table: ReviewWidgetSpec = Field(default_factory=ReviewWidgetSpec)
    hr_savings: HrSavingsWidgetSpec = Field(default_factory=HrSavingsWidgetSpec)

    def enabled_kinds(self) -> set[WidgetPlanKind]:
        out: set[WidgetPlanKind] = set()
        if self.stat_cards.enabled:
            out.add("stat_cards")
        if self.line_chart.enabled:
            out.add("line_chart")
        if self.pie_chart.enabled:
            out.add("pie_chart")
        if self.review_table.enabled:
            out.add("review_table")
        if self.hr_savings.enabled:
            out.add("hr_savings")
        return out

    def is_enabled(self, kind: str) -> bool:
        return kind in self.enabled_kinds()
