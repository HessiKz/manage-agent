"""Agent endpoints."""

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Query, status
from fastapi.responses import StreamingResponse

from src.api.dependencies import CurrentSuperuser, CurrentUser, DB
from src.agents_lib.tool_registry import ToolRegistry
from src.schemas.activity import ActivityLogRead
from src.schemas.agent_dashboard import AgentDashboardRead
from src.schemas.agent_execution import AgentExecutionRead
from src.schemas.agent import (
    AgentCreate,
    AgentDetailRead,
    AgentInvokeRequest,
    AgentInvokeResponse,
    AgentRead,
    AgentRouteRequest,
    AgentRouteResponse,
    AgentUpdate,
)
from src.schemas.common import Page
from src.services.activity_service import ActivityService
from src.services.agent_dashboard_service import AgentDashboardService
from src.services.agent_execution_service import AgentExecutionService
from src.services.agent_service import AgentService
from src.services.agent_validation_runner import run_agent_validation
from src.services.invoke_service import InvokeService
from src.services.route_service import RouteService

# Ensure custom tools register themselves on import
import src.agents_lib.custom_tools  # noqa: F401

router = APIRouter()


@router.post("/route", response_model=AgentRouteResponse)
async def route_prompt(payload: AgentRouteRequest, db: DB, _user: CurrentUser):
    """Suggest the best agent for a natural-language prompt (Page 2 quick prompt)."""
    return await RouteService(db).suggest(payload.prompt)


@router.get("/tools", response_model=list[dict])
async def list_available_tools(_user: CurrentUser):
    """Tools that can be assigned to an agent (used by the wizard)."""
    return ToolRegistry.describe()


@router.get("", response_model=Page[AgentRead])
async def list_agents(
    db: DB,
    _user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    department: str | None = None,
    agent_status: str | None = Query(None, alias="status"),
    search: str | None = None,
    catalog_only: bool = Query(
        False,
        description="If true, return only seeded demo catalog agents (active, sorted by name).",
    ),
):
    items, total = await AgentService(db).list(
        page=page,
        page_size=page_size,
        department=department,
        status=agent_status,
        search=search,
        catalog_only=catalog_only,
    )
    return Page[AgentRead](
        items=[AgentRead.model_validate(a) for a in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/check-availability")
async def check_agent_availability(name: str, db: DB, _user: CurrentUser):
    """Live wizard check: slug derived from name must be unique."""
    from slugify import slugify

    slug = slugify(name or "", lowercase=True)
    if not slug:
        return {"slug": "", "available": False, "reason": "empty"}
    existing = await AgentService(db).agents.get_by_slug(slug)
    return {
        "slug": slug,
        "available": existing is None,
        "reason": "duplicate" if existing else None,
    }


@router.post("", response_model=AgentDetailRead, status_code=status.HTTP_201_CREATED)
async def create_agent(payload: AgentCreate, db: DB, user: CurrentUser):
    agent = await AgentService(db).create(payload, user)
    return AgentDetailRead.model_validate(agent)


@router.post("/{agent_id}/pause-deploy", response_model=AgentDetailRead)
async def pause_deploying_agent(agent_id: UUID, db: DB, _user: CurrentUser):
    agent = await AgentService(db).pause_deploying(agent_id)
    return AgentDetailRead.model_validate(agent)


@router.post("/{agent_id}/validate", status_code=status.HTTP_202_ACCEPTED)
async def start_agent_validation(
    agent_id: UUID,
    db: DB,
    user: CurrentUser,
    background_tasks: BackgroundTasks,
):
    """Start background AI smoke-test after wizard publish + file uploads."""
    agent, schedule = await AgentService(db).start_validation(agent_id)
    if schedule:
        background_tasks.add_task(run_agent_validation, agent_id, user.id)
    validation = (agent.config_json or {}).get("validation") or {}
    return {
        "agent_id": str(agent.id),
        "status": validation.get("state", agent.status.value),
        "scheduled": schedule,
    }


@router.get("/by-slug/{slug}", response_model=AgentDetailRead)
async def get_agent_by_slug(slug: str, db: DB, _user: CurrentUser):
    agent = await AgentService(db).get_by_slug(slug)
    return AgentDetailRead.model_validate(agent)


@router.get("/{agent_id}", response_model=AgentDetailRead)
async def get_agent(agent_id: UUID, db: DB, _user: CurrentUser):
    agent = await AgentService(db).get(agent_id)
    return AgentDetailRead.model_validate(agent)


@router.patch("/{agent_id}", response_model=AgentDetailRead)
async def update_agent(agent_id: UUID, payload: AgentUpdate, db: DB, _user: CurrentUser):
    await AgentService(db).update(agent_id, payload)
    agent = await AgentService(db).get(agent_id)
    return AgentDetailRead.model_validate(agent)


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(agent_id: UUID, db: DB, _admin: CurrentSuperuser):
    await AgentService(db).delete(agent_id)


@router.post("/{agent_id}/invoke")
async def invoke_agent(
    agent_id: UUID,
    payload: AgentInvokeRequest,
    db: DB,
    user: CurrentUser,
):
    """Run the LangChain agent. Supports SSE when stream=true."""
    svc = InvokeService(db)
    if payload.stream:
        return StreamingResponse(
            svc.invoke_stream(agent_id, payload, user),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    return await svc.invoke(agent_id, payload, user)


@router.get("/{agent_id}/dashboard", response_model=AgentDashboardRead)
async def agent_dashboard(agent_id: UUID, db: DB, _user: CurrentUser):
    """Per-agent overview metrics, charts, and domain tables."""
    return await AgentDashboardService(db).get_for_agent_id(agent_id)


@router.get("/{agent_id}/execution", response_model=AgentExecutionRead)
async def agent_execution(agent_id: UUID, db: DB, _user: CurrentUser):
    """Per-agent run guide: documentation, steps, and live action/template refs."""
    return await AgentExecutionService(db).get_for_agent_id(agent_id)


@router.get("/{agent_id}/activity", response_model=list[ActivityLogRead])
async def agent_activity(
    agent_id: UUID,
    db: DB,
    _user: CurrentUser,
    limit: int = Query(20, ge=1, le=200),
):
    """Recent activity log for an agent (for chart + history panel)."""
    return await ActivityService(db).recent_for_agent(agent_id, limit=limit)
