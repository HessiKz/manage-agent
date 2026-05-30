"""Budget endpoints."""

from fastapi import APIRouter, status

from src.api.dependencies import DB, CurrentSuperuser, CurrentUser
from src.schemas.budget import BudgetCreate, BudgetRead, BudgetSummary
from src.services.budget_service import BudgetService

router = APIRouter()


@router.get("", response_model=list[BudgetRead])
async def list_budgets(db: DB, _user: CurrentUser):
    return await BudgetService(db).list_all()


@router.get("/summary", response_model=BudgetSummary)
async def budget_summary(db: DB, _user: CurrentUser):
    data = await BudgetService(db).summary()
    return BudgetSummary(**data)


@router.post("", response_model=BudgetRead, status_code=status.HTTP_201_CREATED)
async def create_budget(payload: BudgetCreate, db: DB, _admin: CurrentSuperuser):
    return await BudgetService(db).create(payload)
