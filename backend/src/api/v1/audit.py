"""Audit log endpoints."""

from fastapi import APIRouter, Query
from sqlalchemy import select

from src.api.dependencies import DB, CurrentSuperuser
from src.models.audit_log import AuditLog
from src.schemas.audit import AuditLogRead

router = APIRouter()


@router.get("", response_model=list[AuditLogRead])
async def list_audit_logs(
    db: DB,
    _admin: CurrentSuperuser,
    limit: int = Query(50, ge=1, le=200),
):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())
