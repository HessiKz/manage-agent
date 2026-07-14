"""Failure ledger endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Query, status

from src.api.dependencies import DB, CurrentSuperuser, CurrentUser
from src.schemas.failure_ledger import (
    FailureRead,
    FailureRecordRequest,
    FailureRelevantQuery,
)
from src.services.failure_ledger_service import FailureLedgerService

router = APIRouter(prefix="/failures", tags=["failures"])


@router.get("/relevant", response_model=list[FailureRead])
async def get_relevant_failures(
    db: DB,
    _user: CurrentUser,
    phase: str | None = None,
    pathname: str | None = None,
    error_substring: str | None = None,
    top: int = Query(default=3, ge=1, le=50),
):
    """Return top-N recurring patterns matching the given hints."""
    # Validate via the query model too (keeps schema as source of truth for bounds).
    FailureRelevantQuery(phase=phase, pathname=pathname, error_substring=error_substring, top=top)
    rows = await FailureLedgerService(db).relevant(
        phase=phase,
        pathname=pathname,
        error_substring=error_substring,
        top=top,
    )
    return [FailureRead.model_validate(r) for r in rows]


@router.get("/top", response_model=list[FailureRead])
async def get_top_failures(
    db: DB,
    _admin: CurrentSuperuser,
    limit: int = Query(default=20, ge=1, le=200),
):
    """Admin view: top patterns by occurrence_count."""
    rows = await FailureLedgerService(db).top(limit=limit)
    return [FailureRead.model_validate(r) for r in rows]


@router.post("/record", response_model=FailureRead, status_code=status.HTTP_201_CREATED)
async def record_failure(
    payload: FailureRecordRequest,
    db: DB,
    _user: CurrentUser,
):
    """Internal FE hook — record a recurring failure (idempotent upsert)."""
    row = await FailureLedgerService(db).record(payload)
    await db.commit()
    await db.refresh(row)
    return FailureRead.model_validate(row)
