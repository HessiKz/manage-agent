"""Agent-specific dashboard payload for the agent detail overview tab."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class AgentDashboardStatCard(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    label: str
    value: str
    hint: str | None = None
    chart_variant: str | None = Field(None, serialization_alias="chartVariant")


class AgentDashboardLineSeries(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    data_key: str = Field(serialization_alias="dataKey")
    dashed: bool = False


class AgentDashboardLineChart(BaseModel):
    title: str
    series: list[AgentDashboardLineSeries]
    points: list[dict[str, str | int | float]]


class AgentDashboardPieChart(BaseModel):
    title: str
    slices: list[dict[str, str | int | float]]


class AgentDashboardReviewColumn(BaseModel):
    key: str
    label: str


class AgentDashboardReviewRow(BaseModel):
    id: str
    cells: dict[str, str]
    status: str | None = None


class AgentDashboardReviewTable(BaseModel):
    title: str
    columns: list[AgentDashboardReviewColumn]
    rows: list[AgentDashboardReviewRow]


class AgentDashboardRunSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    total_runs: int
    success_runs: int
    error_runs: int
    avg_duration_label: str
    cost_label: str
    tokens_total: int = 0


class AgentDashboardHrSavings(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    role_title: str
    period_label: str
    uses_live_activity: bool = False
    run_count: int
    tokens_total: int = 0
    employee_monthly_salary_irr: int
    employee_hourly_irr: int
    human_hours: float
    human_hours_label: str
    human_cost_irr: int
    human_cost_label: str
    agent_hours: float
    agent_hours_label: str
    agent_cost_irr: int
    agent_cost_label: str
    time_saved_hours: float
    time_saved_label: str
    money_saved_irr: int
    money_saved_label: str
    savings_percent: int
    usd_to_irr_rate: int = 620_000


class AgentDashboardRead(BaseModel):
    profile: str
    domain_label: str
    panel_title: str
    uses_live_runs: bool = False
    stat_cards: list[AgentDashboardStatCard]
    line_chart: AgentDashboardLineChart | None = None
    pie_chart: AgentDashboardPieChart | None = None
    review_table: AgentDashboardReviewTable | None = None
    run_summary: AgentDashboardRunSummary | None = None
    hr_savings: AgentDashboardHrSavings
