"""Budget repository."""

from src.models.budget import Budget
from src.repositories.base import BaseRepository


class BudgetRepository(BaseRepository[Budget]):
    model = Budget
