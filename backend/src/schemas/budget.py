"""Budget schemas."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.models.budget import BudgetPeriod


class BudgetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    amount: Decimal = Field(..., gt=0)
    currency: str = "USD"
    period: BudgetPeriod = BudgetPeriod.MONTHLY
    agent_id: UUID | None = None
    alert_threshold: float = Field(0.8, ge=0.1, le=1.0)
    start_date: date | None = None
    end_date: date | None = None


class BudgetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    amount: Decimal
    currency: str
    period: BudgetPeriod
    agent_id: UUID | None
    alert_threshold: float
    is_active: bool
    spent_usd: Decimal = Decimal(0)
    remaining_usd: Decimal = Decimal(0)
    utilization_pct: float = 0.0
    created_at: datetime


class BudgetSummary(BaseModel):
    total_budget_usd: float
    total_spent_usd: float
    alerts: list[dict]


class BudgetUpdate(BaseModel):
    name: str | None = None
    amount: Decimal | None = None
    alert_threshold: float | None = None
    is_active: bool | None = None
