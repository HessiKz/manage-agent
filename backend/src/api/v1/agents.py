"""Agent endpoints."""

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Body, HTTPException, Query, status
from pydantic import ValidationError
from fastapi.responses import StreamingResponse

from src.api.dependencies import CurrentSuperuser, CurrentUser, DB
from src.agents_lib.tool_registry import ToolRegistry
from src.schemas.activity import ActivityLogRead
from src.schemas.agent_dashboard import AgentDashboardRead
from src.schemas.agent_execution import AgentExecutionGuideStatusRead, AgentExecutionRead
from src.schemas.agent import (
    AgentCreate,
    AgentDetailRead,
    AgentInstructionRefreshRequest,
    AgentInvokeRequest,
    AgentInvokeResponse,
    AgentPermissionGrant,
    AgentPermissionsReplace,
    AgentRead,
    AgentRouteRequest,
    AgentRouteResponse,
    AgentUpdate,
    ValidationAnswersRequest,
)
from src.schemas.agent_dashboard_config import (
    DashboardDraftResponse,
    DashboardGenerateRequest,
    DashboardGenerateResponse,
    DashboardWidgetPatchRequest,
)
from src.schemas.agent_preview import AgentPreviewInvokeRequest, AgentPreviewInvokeResponse
from src.schemas.agent_training import TrainingCompleteRequest, TrainingCompleteResponse
from src.schemas.common import Page
from src.services.activity_service import ActivityService
from src.core.debug_session_log import debug_session_log
from src.services.agent_dashboard_config_service import AgentDashboardConfigService
from src.services.agent_dashboard_service import AgentDashboardService
from src.services.agent_execution_guide_service import execution_guide_status, mark_execution_guide_generating
from src.services.agent_execution_service import AgentExecutionService
from src.services.agent_instruction_service import AgentInstructionService
from src.services.agent_runtime_prepare_service import AgentRuntimePrepareService
from src.services.agent_service import AgentService
from src.services.agent_training_service import AgentTrainingService
from src.services.execution_guide_runner import run_execution_guide_generation
from src.services.agent_validation_runner import run_agent_validation
from src.services.invoke_service import InvokeService
from src.services.route_service import RouteService
from src.logger import get_logger

log = get_logger("agents.api")

# Ensure custom tools register themselves on import
import src.agents_lib.custom_tools  # noqa: F401
import src.agents_lib.platform_tools  # noqa: F401

router = APIRouter()


@router.post("/route", response_model=AgentRouteResponse)
async def route_prompt(payload: AgentRouteRequest, db: DB, _user: CurrentUser):
    """Suggest the best agent for a natural-language prompt (Page 2 quick prompt)."""
    return await RouteService(db).suggest(payload.prompt)


@router.get("/tools", response_model=list[dict])
async def list_available_tools(_user: CurrentUser):
    """Tools that can be assigned to an agent (used by the wizard)."""
    return ToolRegistry.describe()


@router.get("/audit")
async def audit_all_agents(db: DB, _admin: CurrentSuperuser):
    """Config sanity report across every agent (the 'hundreds of agents' check)."""
    from src.services.agent_batch_validation import audit_agents

    return await audit_agents(db)


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


@router.post("/preview-invoke", response_model=AgentPreviewInvokeResponse)
async def preview_invoke_agent(
    payload: AgentPreviewInvokeRequest,
    db: DB,
    user: CurrentSuperuser,
):
    """Run a wizard preview without persisting an agent row."""
    from src.services.agent_preview_service import AgentPreviewService

    result = await AgentPreviewService(db).preview_invoke(payload, user)
    return AgentPreviewInvokeResponse(**result.model_dump(), preview=True)


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


@router.post("/{agent_id}/validation/answers", status_code=status.HTTP_202_ACCEPTED)
async def submit_validation_answers(
    agent_id: UUID,
    payload: ValidationAnswersRequest,
    db: DB,
    user: CurrentUser,
    background_tasks: BackgroundTasks,
):
    """Submit planning answers; hand off to interactive training (no auto-validation yet)."""
    agent = await AgentService(db).submit_validation_answers(agent_id, payload.answers)
    # Ensure training session is active after answers.
    try:
        agent = await AgentTrainingService(db).start_training(agent_id)
    except Exception:  # noqa: BLE001
        agent = await AgentService(db).get(agent_id)
    validation = (agent.config_json or {}).get("validation") or {}
    return {
        "agent_id": str(agent.id),
        "status": validation.get("state", agent.status.value),
        "scheduled": False,
        "next": "training",
    }


@router.post("/{agent_id}/planning/preflight", response_model=AgentDetailRead)
async def planning_preflight(
    agent_id: UUID,
    db: DB,
    user: CurrentUser,
    background_tasks: BackgroundTasks,
):
    """Run planning Q&A before interactive training (questions first).

    Returns immediately and schedules planning in the background so the
    single uvicorn worker is not blocked for minutes (which would stall
    every other API call and trigger client timeouts).
    """
    from src.services.agent_validation_runner import run_planning_preflight_runner

    agent = await AgentService(db).get(agent_id)
    # If planning already completed or questions are pending, do not re-run.
    validation = (agent.config_json or {}).get("validation") or {}
    planning = validation.get("planning") or {}
    already_planned = bool(planning.get("analysis")) and not planning.get(
        "awaiting_answers"
    )
    if not already_planned:
        # Mark pending so frontend shows "در حال تحلیل…" immediately.
        cfg = dict(agent.config_json or {})
        v = dict(cfg.get("validation") or {})
        v["state"] = "planning"
        v["current_phase"] = "planning"
        v["current_detail"] = "در حال تحلیل و سؤالات قبل از تست تعاملی…"
        p = dict(v.get("planning") or {})
        p["awaiting_answers"] = False
        v["planning"] = p
        cfg["validation"] = v
        agent.config_json = cfg
        flag_modified(agent, "config_json")
        await db.commit()
        await db.refresh(agent)
        background_tasks.add_task(run_planning_preflight_runner, agent_id, user.id)
    return AgentDetailRead.model_validate(agent)


@router.post("/{agent_id}/training/start", response_model=AgentDetailRead)
async def start_agent_training(agent_id: UUID, db: DB, _user: CurrentUser):
    """Begin interactive admin training after planning answers (if any)."""
    agent = await AgentTrainingService(db).start_training(agent_id)
    return AgentDetailRead.model_validate(agent)


@router.post("/{agent_id}/runtime/prepare", response_model=AgentDetailRead)
async def prepare_agent_runtime(agent_id: UUID, db: DB, _user: CurrentUser):
    """Infer and verify runtime tool/script plan before interactive training."""
    await AgentRuntimePrepareService(db).prepare(agent_id)
    agent = await AgentService(db).get(agent_id)
    return AgentDetailRead.model_validate(agent)


@router.post("/{agent_id}/instructions/refresh", response_model=AgentDetailRead)
async def refresh_agent_instruction_prompt(
    agent_id: UUID,
    payload: AgentInstructionRefreshRequest,
    db: DB,
    _user: CurrentUser,
    background_tasks: BackgroundTasks,
):
    """Build the system prompt from instruction text + instruction attachments."""
    await AgentInstructionService(db).refresh_from_instructions(
        agent_id,
        instruction_text=payload.instruction_text or "",
        force=payload.force,
    )
    background_tasks.add_task(run_execution_guide_generation, agent_id)
    agent = await AgentService(db).get(agent_id)
    return AgentDetailRead.model_validate(agent)


@router.post("/{agent_id}/training/complete", response_model=TrainingCompleteResponse)
async def complete_agent_training(
    agent_id: UUID,
    payload: TrainingCompleteRequest,
    db: DB,
    user: CurrentUser,
    background_tasks: BackgroundTasks,
):
    """Save training profile from chat transcript, then generate dashboard draft for admin review."""
    await AgentTrainingService(db).complete_training(agent_id, user, payload)
    background_tasks.add_task(run_execution_guide_generation, agent_id)
    return TrainingCompleteResponse(
        agent_id=str(agent_id),
        training_saved=True,
        validation_scheduled=False,
    )


@router.get("/{agent_id}/dashboard/draft", response_model=DashboardDraftResponse)
async def get_agent_dashboard_draft(agent_id: UUID, db: DB, _user: CurrentUser):
    agent = await AgentService(db).get(agent_id)
    svc = AgentDashboardConfigService(db)
    bucket, _, approved = svc.get_stored(agent)
    draft = svc.get_draft(agent)
    return DashboardDraftResponse(
        agent_id=str(agent_id),
        has_draft=draft is not None,
        approved=approved,
        draft=draft,
    )


@router.post("/{agent_id}/dashboard/generate", response_model=DashboardGenerateResponse)
async def generate_agent_dashboard(
    agent_id: UUID,
    payload: DashboardGenerateRequest,
    db: DB,
    _user: CurrentUser,
):
    """AI-generate or regenerate dashboard draft from admin prompt; returns preview summary."""
    return await AgentDashboardConfigService(db).generate_with_preview(agent_id, payload)


@router.post("/{agent_id}/dashboard/draft/reject", response_model=DashboardDraftResponse)
async def reject_agent_dashboard_draft(agent_id: UUID, db: DB, _user: CurrentUser):
    """Discard the latest AI draft and restore the previous draft snapshot if available."""
    agent = await AgentDashboardConfigService(db).reject_draft(agent_id)
    svc = AgentDashboardConfigService(db)
    bucket, _, approved = svc.get_stored(agent)
    draft = svc.get_draft(agent)
    return DashboardDraftResponse(
        agent_id=str(agent_id),
        has_draft=draft is not None,
        approved=approved,
        draft=draft,
    )


@router.post("/{agent_id}/dashboard/approve", status_code=status.HTTP_202_ACCEPTED)
async def approve_agent_dashboard(
    agent_id: UUID,
    db: DB,
    user: CurrentUser,
    background_tasks: BackgroundTasks,
    schedule_validation: bool = Query(True, description="Start auto validation after approve (wizard only)"),
):
    """Approve dashboard draft; optionally start automated validation."""
    await AgentDashboardConfigService(db).approve_draft(agent_id)
    background_tasks.add_task(run_execution_guide_generation, agent_id)
    scheduled = False
    if schedule_validation:
        agent, scheduled = await AgentService(db).start_validation(agent_id)
        if scheduled:
            background_tasks.add_task(run_agent_validation, agent_id, user.id)
    return {
        "agent_id": str(agent_id),
        "approved": True,
        "validation_scheduled": scheduled,
    }


@router.patch("/{agent_id}/dashboard/widgets", response_model=AgentDetailRead)
async def patch_agent_dashboard_widgets(
    agent_id: UUID,
    db: DB,
    _user: CurrentUser,
    payload: DashboardWidgetPatchRequest = Body(default_factory=DashboardWidgetPatchRequest),
):
    # #region agent log
    debug_session_log(
        "agents.py:patch_agent_dashboard_widgets:entry",
        "PATCH dashboard/widgets handler entered",
        {
            "agent_id": str(agent_id),
            "payload": payload.model_dump(),
        },
        hypothesis_id="H2",
    )
    # #endregion
    try:
        await AgentDashboardConfigService(db).patch_widgets(agent_id, payload)
        agent = await AgentService(db).get(agent_id)
        # #region agent log
        dash = (agent.config_json or {}).get("dashboard")
        debug_session_log(
            "agents.py:patch_agent_dashboard_widgets:patched",
            "patch_widgets returned agent",
            {
                "agent_id": str(agent_id),
                "dashboard_keys": list(dash.keys()) if isinstance(dash, dict) else type(dash).__name__,
            },
            hypothesis_id="H1",
        )
        # #endregion
        result = AgentDetailRead.model_validate(agent)
        # #region agent log
        debug_session_log(
            "agents.py:patch_agent_dashboard_widgets:ok",
            "AgentDetailRead validation ok",
            {"agent_id": str(agent_id)},
            hypothesis_id="H6",
        )
        # #endregion
        return result
    except HTTPException as exc:
        # #region agent log
        debug_session_log(
            "agents.py:patch_agent_dashboard_widgets:http_exc",
            "HTTPException in patch widgets",
            {"status": exc.status_code, "detail": exc.detail},
            hypothesis_id="H1",
        )
        # #endregion
        raise
    except Exception as exc:
        # #region agent log
        debug_session_log(
            "agents.py:patch_agent_dashboard_widgets:exc",
            "Unhandled exception in patch widgets",
            {"type": type(exc).__name__, "msg": str(exc)[:500]},
            hypothesis_id="H5",
        )
        # #endregion
        raise


@router.get("/by-slug/{slug}", response_model=AgentDetailRead)
async def get_agent_by_slug(slug: str, db: DB, _user: CurrentUser):
    agent = await AgentService(db).get_by_slug(slug)
    return AgentDetailRead.model_validate(agent)


@router.get("/{agent_id}", response_model=AgentDetailRead)
async def get_agent(agent_id: UUID, db: DB, _user: CurrentUser):
    agent = await AgentService(db).get(agent_id)
    return AgentDetailRead.model_validate(agent)


@router.patch("/{agent_id}", response_model=AgentDetailRead)
async def update_agent(
    agent_id: UUID,
    payload: AgentUpdate,
    db: DB,
    _user: CurrentUser,
    background_tasks: BackgroundTasks,
):
    payload_data = payload.model_dump(exclude_unset=True)
    guide_stale = any(
        k in payload_data
        for k in (
            "name",
            "description",
            "department",
            "kind",
            "capabilities",
            "file_policy",
            "system_prompt",
            "tool_names",
        )
    )
    await AgentService(db).update(agent_id, payload)
    agent = await AgentService(db).get(agent_id)
    if guide_stale:
        background_tasks.add_task(run_execution_guide_generation, agent_id)
    try:
        return AgentDetailRead.model_validate(agent)
    except ValidationError as exc:
        log.error(
            "agent.update.response_validation_failed",
            agent_id=str(agent_id),
            errors=exc.errors(),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ذخیره انجام شد اما پاسخ سرور معتبر نبود — لطفاً صفحه را رفرش کنید.",
        ) from exc


@router.put("/{agent_id}/permissions", status_code=status.HTTP_204_NO_CONTENT)
async def replace_agent_permissions(
    agent_id: UUID,
    payload: AgentPermissionsReplace,
    db: DB,
    _user: CurrentUser,
):
    await AgentService(db).replace_permissions(agent_id, payload.permissions)


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
async def agent_dashboard(
    agent_id: UUID,
    db: DB,
    _user: CurrentUser,
    draft: bool = Query(False, description="Preview unapproved dashboard draft"),
):
    """Per-agent overview metrics, charts, and domain tables."""
    return await AgentDashboardService(db).get_for_agent_id(agent_id, use_draft=draft)


@router.get("/{agent_id}/execution/status", response_model=AgentExecutionGuideStatusRead)
async def agent_execution_guide_status(
    agent_id: UUID,
    db: DB,
    _user: CurrentUser,
):
    """Poll after admin edit — ready when background LLM guide generation finishes."""
    agent = await AgentService(db).get(agent_id)
    meta = execution_guide_status(agent)
    return AgentExecutionGuideStatusRead(state=meta["state"] or "idle", source=meta["source"])


@router.post("/{agent_id}/execution/regenerate", status_code=status.HTTP_202_ACCEPTED)
async def regenerate_agent_execution_guide(
    agent_id: UUID,
    db: DB,
    _user: CurrentUser,
    background_tasks: BackgroundTasks,
    wait: bool = Query(
        False,
        description="If true, run guide generation in-request (reliable on multi-worker deploys).",
    ),
):
    """Schedule LLM execution-guide rebuild (e.g. after action/template edits)."""
    agent = await AgentService(db).get(agent_id)
    cfg = mark_execution_guide_generating(dict(agent.config_json or {}))
    agent.config_json = cfg
    from sqlalchemy.orm.attributes import flag_modified

    flag_modified(agent, "config_json")
    await db.commit()
    if wait:
        try:
            await run_execution_guide_generation(agent_id)
            return {"agent_id": str(agent_id), "scheduled": True, "completed": True}
        except Exception:  # noqa: BLE001
            return {"agent_id": str(agent_id), "scheduled": True, "completed": False}
    background_tasks.add_task(run_execution_guide_generation, agent_id)
    return {"agent_id": str(agent_id), "scheduled": True, "completed": False}


@router.get("/{agent_id}/execution", response_model=AgentExecutionRead)
async def agent_execution(
    agent_id: UUID,
    db: DB,
    _user: CurrentUser,
    refresh: bool = Query(False, description="Regenerate AI execution guide"),
):
    """Per-agent run guide: documentation, steps, and live action/template refs."""
    return await AgentExecutionService(db).get_for_agent_id(agent_id, force_refresh=refresh)


@router.get("/{agent_id}/activity", response_model=list[ActivityLogRead])
async def agent_activity(
    agent_id: UUID,
    db: DB,
    _user: CurrentUser,
    limit: int = Query(20, ge=1, le=200),
):
    """Recent activity log for an agent (for chart + history panel)."""
    return await ActivityService(db).recent_for_agent(agent_id, limit=limit)
