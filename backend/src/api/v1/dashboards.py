"""Dashboard / analytics endpoints — aggregated stats."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from src.api.dependencies import DB, CurrentUser
from src.core.catalog import CATALOG_SLUGS
from src.models.activity_log import ActivityLog, ActivityStatus
from src.models.agent import Agent, AgentKind, AgentStatus
from src.models.agent_permission import AgentUserPermission
from src.models.access_request import AccessRequest, AccessRequestStatus
from src.models.audit_log import AuditLog
from src.models.notification import Notification
from src.models.user import User
from src.schemas.audit import PlatformEvent

router = APIRouter()


@router.get("/overview")
async def overview(db: DB, _user: CurrentUser):
    """High-level platform stats for the main admin dashboard (Page 4)."""

    catalog = Agent.slug.in_(CATALOG_SLUGS)
    total_agents = (
        await db.execute(select(func.count(Agent.id)).where(catalog))
    ).scalar_one()
    active_agents = (
        await db.execute(
            select(func.count(Agent.id)).where(catalog, Agent.status == AgentStatus.ACTIVE)
        )
    ).scalar_one()
    total_runs = (await db.execute(select(func.count(ActivityLog.id)))).scalar_one()
    successful_runs = (
        await db.execute(
            select(func.count(ActivityLog.id)).where(ActivityLog.status == ActivityStatus.SUCCESS)
        )
    ).scalar_one()
    total_cost = (
        await db.execute(select(func.coalesce(func.sum(ActivityLog.cost_usd), 0)))
    ).scalar_one()
    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    departments = (
        await db.execute(
            select(func.count(func.distinct(Agent.department))).where(
                catalog, Agent.department.isnot(None)
            )
        )
    ).scalar_one()

    # Runs in last 7 days
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    runs_this_week = (
        await db.execute(
            select(func.count(ActivityLog.id)).where(ActivityLog.started_at >= week_ago)
        )
    ).scalar_one()

    success_rate = (successful_runs / total_runs * 100) if total_runs else 100.0

    return {
        "agents": {"total": total_agents, "active": active_agents},
        "runs": {"total": total_runs, "successful": successful_runs, "this_week": runs_this_week},
        "users": {"total": total_users},
        "departments": {"total": departments},
        "success_rate": round(success_rate, 2),
        "total_cost_usd": float(total_cost or Decimal(0)),
    }


@router.get("/top-agents")
async def top_agents(db: DB, _user: CurrentUser, limit: int = 10):
    """Top agents by run count (Page 4 widget)."""
    stmt = (
        select(
            Agent.id,
            Agent.name,
            Agent.slug,
            Agent.department,
            func.count(ActivityLog.id).label("runs"),
        )
        .join(ActivityLog, ActivityLog.agent_id == Agent.id, isouter=True)
        .where(Agent.slug.in_(CATALOG_SLUGS))
        .group_by(Agent.id)
        .order_by(func.count(ActivityLog.id).desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [
        {
            "id": str(row.id),
            "name": row.name,
            "slug": row.slug,
            "department": row.department,
            "runs": row.runs,
        }
        for row in result.all()
    ]


@router.get("/usage")
async def usage_chart(db: DB, _user: CurrentUser, days: int = Query(30, ge=7, le=90)):
    """Daily run counts for chart (Page 4)."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    day_col = func.date_trunc("day", ActivityLog.started_at).label("day")
    stmt = (
        select(day_col, func.count(ActivityLog.id).label("runs"))
        .where(ActivityLog.started_at >= since)
        .group_by(day_col)
        .order_by(day_col)
    )
    result = await db.execute(stmt)
    return [{"day": row.day.isoformat() if row.day else None, "runs": row.runs} for row in result.all()]


@router.get("/health")
async def system_health(_user: CurrentUser):
    """Integration health stubs (Page 4)."""
    return [
        {"name": "بانک ملت", "status": "healthy", "latency_ms": 120, "uptime_pct": 98},
        {"name": "سامانه HR", "status": "healthy", "latency_ms": 85, "uptime_pct": 99},
        {"name": "دفتر کل ERP", "status": "degraded", "latency_ms": 450, "uptime_pct": 94},
        {"name": "مدل GPT", "status": "healthy", "latency_ms": 2100, "uptime_pct": 99},
    ]


@router.get("/events")
async def platform_events(db: DB, _user: CurrentUser, limit: int = Query(20, ge=1, le=100)):
    """Recent platform events for admin feed (Page 4)."""
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    result = await db.execute(stmt)
    logs = list(result.scalars().all())

    events: list[PlatformEvent] = []
    for log in logs:
        msg = log.changes.get("message") or f"{log.action} on {log.resource_type}"
        events.append(
            PlatformEvent(
                id=str(log.id),
                type=log.action,
                message=msg,
                severity=log.changes.get("severity", "info"),
                created_at=log.created_at,
            )
        )

    if not events:
        now = datetime.now(timezone.utc)
        events = [
            PlatformEvent(
                id="stub-1",
                type="alert",
                message="اتصال بانک ملت با تأخیر پاسخ می‌دهد — احتمال تأثیر بر مغایرت‌گیری.",
                severity="warning",
                created_at=now - timedelta(minutes=10),
            ),
            PlatformEvent(
                id="stub-2",
                type="access_request",
                message='کاربر «ر. کریمی» درخواست دسترسی به ایجنت «حقوق و دستمزد» داد.',
                severity="info",
                created_at=now - timedelta(hours=2),
            ),
        ]
    return events


@router.get("/departments")
async def department_counts(db: DB, _user: CurrentUser):
    """Agent count per department (Page 2 sidebar)."""
    stmt = (
        select(Agent.department, func.count(Agent.id).label("count"))
        .where(Agent.slug.in_(CATALOG_SLUGS), Agent.department.isnot(None))
        .group_by(Agent.department)
        .order_by(func.count(Agent.id).desc())
    )
    result = await db.execute(stmt)
    return [{"department": row.department, "count": row.count} for row in result.all()]


@router.get("/sidebar")
async def sidebar_counts(db: DB, user: CurrentUser):
    """Counts for the app shell sidebar (PDF pages 2–4)."""
    my_agents = (
        await db.execute(
            select(func.count(func.distinct(AgentUserPermission.agent_id))).where(
                AgentUserPermission.user_id == user.id,
                AgentUserPermission.can_invoke.is_(True),
            )
        )
    ).scalar_one()

    my_conversations = (
        await db.execute(
            select(func.count(ActivityLog.id)).where(
                ActivityLog.user_id == user.id, ActivityLog.action == "invoke"
            )
        )
    ).scalar_one()

    unread_notifications = (
        await db.execute(
            select(func.count(Notification.id)).where(
                Notification.user_id == user.id, Notification.is_read.is_(False)
            )
        )
    ).scalar_one()

    pending_access_requests = (
        await db.execute(
            select(func.count(AccessRequest.id)).where(
                AccessRequest.status == AccessRequestStatus.PENDING
            )
        )
    ).scalar_one()

    worker_agents = (
        await db.execute(
            select(func.count(Agent.id)).where(
                Agent.kind == AgentKind.WORKER
            )
        )
    ).scalar_one()

    return {
        "my_agents": my_agents,
        "conversations": my_conversations,
        "unread_notifications": unread_notifications,
        "pending_access_requests": pending_access_requests,
        "worker_agents": worker_agents,
    }
