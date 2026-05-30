"""ActivityLog schemas."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from src.models.activity_log import ActivityStatus


class ActivityLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    agent_id: UUID
    user_id: UUID | None
    action: str
    status: ActivityStatus
    input_text: str | None
    output_text: str | None
    error_message: str | None
    tokens_input: int
    tokens_output: int
    cost_usd: Decimal
    duration_ms: int | None
    started_at: datetime
    completed_at: datetime | None
