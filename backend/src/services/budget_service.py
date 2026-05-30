"""Budget service."""

from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.activity_log import ActivityLog
from src.models.budget import Budget
from src.repositories.budget_repo import BudgetRepository
from src.schemas.budget import BudgetCreate, BudgetRead


class BudgetService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.budgets = BudgetRepository(db)

    async def _spent_for_agent(self, agent_id: UUID | None) -> Decimal:
        if not agent_id:
            return Decimal(0)
        stmt = select(func.coalesce(func.sum(ActivityLog.cost_usd), 0)).where(
            ActivityLog.agent_id == agent_id
        )
        return Decimal(str((await self.db.execute(stmt)).scalar_one() or 0))

    async def _enrich(self, budget: Budget) -> BudgetRead:
        spent = await self._spent_for_agent(budget.agent_id)
        remaining = max(Decimal(0), budget.amount - spent)
        util = float(spent / budget.amount * 100) if budget.amount else 0.0
        data = BudgetRead.model_validate(budget)
        return data.model_copy(
            update={
                "spent_usd": spent,
                "remaining_usd": remaining,
                "utilization_pct": round(util, 2),
            }
        )

    async def list_all(self) -> list[BudgetRead]:
        items = await self.budgets.list(limit=200)
        return [await self._enrich(b) for b in items]

    async def create(self, payload: BudgetCreate) -> BudgetRead:
        budget = Budget(**payload.model_dump())
        budget = await self.budgets.create(budget)
        await self.db.commit()
        await self.db.refresh(budget)
        return await self._enrich(budget)

    async def summary(self) -> dict:
        budgets = await self.budgets.list(limit=200, is_active=True)
        total_budget = sum(b.amount for b in budgets)
        alerts = []
        total_spent = Decimal(0)
        for b in budgets:
            spent = await self._spent_for_agent(b.agent_id)
            total_spent += spent
            if b.amount and spent / b.amount >= b.alert_threshold:
                alerts.append(
                    {
                        "budget_id": str(b.id),
                        "name": b.name,
                        "utilization_pct": round(float(spent / b.amount * 100), 2),
                    }
                )
        return {
            "total_budget_usd": float(total_budget),
            "total_spent_usd": float(total_spent),
            "alerts": alerts,
        }
