"""Agent service: CRUD + invoke."""

from uuid import UUID

from fastapi import HTTPException, status
from slugify import slugify
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from src.models.agent import Agent, AgentStatus
from src.models.agent_action import AgentAction
from src.models.agent_link import AgentLink
from src.models.agent_permission import AgentUserPermission
from src.models.agent_prompt_template import AgentPromptTemplate
from src.models.user import User
from src.repositories.agent_repo import AgentRepository
from src.schemas.agent import AgentCreate, AgentPermissionGrant, AgentUpdate
from src.schemas.agent_capabilities import AgentCapabilities, AgentFilePolicy, AgentLinkPolicy
from src.services.agent_link_service import AgentLinkService
from src.services.agent_execution_service import AgentExecutionService
from src.services.agent_execution_guide_service import mark_execution_guide_generating
from src.core.catalog import CATALOG_SLUGS
from src.core.precision_defaults import precision_for_kind
from src.services.catalog_agent_upgrade_service import (
    mark_catalog_agent_customized,
    widget_plan_for_catalog_entry,
)
from src.demo.datasets import demo_context_for_slug


class AgentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.agents = AgentRepository(db)

    def _assert_tool_config_valid(self, tool_names, actions) -> None:
        from src.core.agent_config_validation import collect_tool_config_issues

        issues = collect_tool_config_issues(tool_names, actions)
        if issues:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "message": "پیکربندی ابزارها معتبر نیست.",
                    "tool_config_issues": issues,
                },
            )

    async def create(self, payload: AgentCreate, owner: User) -> Agent:
        slug = payload.slug or slugify(payload.name)
        if await self.agents.get_by_slug(slug):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Agent slug '{slug}' already exists",
            )
        self._assert_tool_config_valid(payload.tool_names, payload.actions)
        data = payload.model_dump(
            exclude={
                "slug",
                "permissions",
                "actions",
                "templates",
                "links",
                "api_bindings",
                "knowledge_bindings",
            }
        )
        caps = data.pop("capabilities", {})
        fp = data.pop("file_policy", {})
        lp = data.pop("agent_link_policy", {})
        if isinstance(caps, AgentCapabilities):
            caps = caps.model_dump()
        if isinstance(fp, AgentFilePolicy):
            fp = fp.model_dump()
        if isinstance(lp, AgentLinkPolicy):
            lp = lp.model_dump()

        cfg = dict(data.pop("config_json", None) or {})
        if not cfg.get("execution_precision"):
            cfg["execution_precision"] = precision_for_kind(payload.kind).value
        cfg["validation"] = {
            **(cfg.get("validation") or {}),
            "state": "runtime_prepare",
            "current_phase": "runtime_prepare",
            "training_completed": False,
        }

        agent = Agent(
            slug=slug,
            owner_id=owner.id,
            status=AgentStatus.DEPLOYING,
            capabilities=caps,
            file_policy=fp,
            agent_link_policy=lp,
            config_json=cfg,
            **data,
        )
        agent = await self.agents.create(agent)

        grant_by_user = {perm.user_id: perm for perm in payload.permissions if perm.user_id}
        # Creator must always retain invoke + configure (wizard permissions step can omit them).
        grant_by_user[owner.id] = AgentPermissionGrant(
            user_id=owner.id,
            can_invoke=True,
            can_configure=True,
        )
        for grant in grant_by_user.values():
            self.db.add(
                AgentUserPermission(
                    user_id=grant.user_id,
                    agent_id=agent.id,
                    can_invoke=grant.can_invoke,
                    can_configure=grant.can_configure,
                )
            )

        for i, act in enumerate(payload.actions):
            act_data = act.model_dump()
            act_data.setdefault("order_index", i)
            self.db.add(AgentAction(agent_id=agent.id, **act_data))

        for i, tpl in enumerate(payload.templates):
            tpl_data = tpl.model_dump()
            tpl_data.setdefault("order_index", i)
            self.db.add(AgentPromptTemplate(agent_id=agent.id, **tpl_data))

        link_svc = AgentLinkService(self.db)
        for link in payload.links:
            await link_svc.create(agent.id, link)

        await self.db.commit()
        return await self.get(agent.id)

    async def finalize_quick_start(self, agent: Agent, *, description: str = "") -> Agent:
        """Mark a freshly created agent active with default widget plan and validation done."""
        cfg = dict(agent.config_json or {})
        cfg["validation"] = {
            "state": "done",
            "training_completed": True,
            "current_phase": "done",
        }
        cfg["widget_plan"] = widget_plan_for_catalog_entry(
            {
                "slug": agent.slug,
                "department": agent.department or "ops",
                "kind": agent.kind,
                "description": description or agent.description,
                "capabilities": dict(agent.capabilities or {}),
            }
        )
        agent.config_json = cfg
        agent.status = AgentStatus.ACTIVE
        if not (agent.system_prompt or "").strip():
            prompt = demo_context_for_slug("general")
            desc = (description or agent.description or "").strip()
            if desc:
                prompt = f"{prompt}\n\n{desc}"
            agent.system_prompt = prompt
        flag_modified(agent, "config_json")
        await self.db.commit()
        agent = await self.get(agent.id)
        try:
            await AgentExecutionService(self.db).build(agent, force_refresh=True)
        except Exception:  # noqa: BLE001
            pass
        return agent

    async def start_validation(self, agent_id: UUID) -> tuple[Agent, bool]:
        """Mark agent as validating. Returns (agent, should_schedule_task)."""
        agent = await self.get(agent_id)
        if agent.status not in (AgentStatus.DRAFT, AgentStatus.DEPLOYING):
            return agent, False

        cfg = dict(agent.config_json or {})
        validation = dict(cfg.get("validation") or {})
        state = validation.get("state")
        if state == "training":
            return agent, False
        if state == "dashboard_review":
            return agent, False
        if state in ("running", "done"):
            return agent, False
        if state == "pending" and not validation.get("training_completed"):
            return agent, False
        if not validation.get("training_completed"):
            # Legacy agents / fix-panel re-validation without interactive training
            validation["training_completed"] = True

        validation["state"] = "running"
        validation["current_phase"] = "starting"
        cfg["validation"] = validation
        agent.status = AgentStatus.DEPLOYING
        agent.config_json = cfg
        await self.db.commit()
        await self.db.refresh(agent)
        return agent, True

    async def submit_validation_answers(
        self, agent_id: UUID, answers: dict[str, str]
    ) -> Agent:
        """Store user answers for the planning phase and resume validation."""
        agent = await self.get(agent_id)
        cfg = dict(agent.config_json or {})
        validation = dict(cfg.get("validation") or {})
        planning = dict(validation.get("planning") or {})
        if not planning.get("awaiting_answers"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Agent is not awaiting validation answers",
            )
        if not answers:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="At least one answer is required",
            )

        questions = planning.get("questions") or []
        q_ids = {
            str(q.get("id"))
            for q in questions
            if isinstance(q, dict) and q.get("id")
        }
        missing = [qid for qid in q_ids if not str(answers.get(qid, "")).strip()]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Missing answers for: {', '.join(missing)}",
            )

        planning["answers"] = {k: str(v).strip() for k, v in answers.items()}
        planning["awaiting_answers"] = False
        validation["planning"] = planning
        # After planning answers: open interactive training (not full auto-validation).
        # Script re-synth happens later when automated validation runs post-training.
        validation["state"] = "training"
        validation["current_phase"] = "training"
        validation["training_completed"] = False
        validation["current_detail"] = "پاسخ‌ها ذخیره شد — تست تعاملی را شروع کنید."
        # Planning answers must retrain the script later: clear pin.
        ws = dict(cfg.get("workspace_script") or {})
        if ws:
            ws.pop("verified_at", None)
            ws.pop("sample_hash", None)
            cfg["workspace_script"] = ws
        cfg["validation"] = validation
        agent.config_json = cfg
        try:
            from src.services.agent_validation_service import AgentValidationService

            AgentValidationService(self.db)._stamp_planning_answers(agent, planning)
            # re-apply training handoff after stamp mutates config_json
            cfg = dict(agent.config_json or {})
            v = dict(cfg.get("validation") or {})
            v["planning"] = planning
            v["state"] = "training"
            v["current_phase"] = "training"
            v["training_completed"] = False
            cfg["validation"] = v
            agent.config_json = cfg
        except Exception:  # noqa: BLE001
            pass
        agent.status = AgentStatus.DEPLOYING
        flag_modified(agent, "config_json")
        await self.db.commit()
        await self.db.refresh(agent)
        return agent

    async def pause_deploying(self, agent_id: UUID) -> Agent:
        """Stop an in-flight deploy/validation and mark the agent paused."""
        agent = await self.get(agent_id)
        if agent.status != AgentStatus.DEPLOYING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only deploying agents can be paused from the admin pipeline",
            )
        cfg = dict(agent.config_json or {})
        validation = dict(cfg.get("validation") or {})
        validation["state"] = "cancelled"
        cfg["validation"] = validation
        agent.config_json = cfg
        agent.status = AgentStatus.PAUSED
        await self.db.commit()
        await self.db.refresh(agent)
        return agent

    async def update(self, agent_id: UUID, payload: AgentUpdate) -> Agent:
        agent = await self.agents.get(agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        data = payload.model_dump(exclude_unset=True, exclude={"api_bindings", "knowledge_bindings"})
        if "tool_names" in data:
            self._assert_tool_config_valid(data["tool_names"], [])
        for key in ("capabilities", "file_policy", "agent_link_policy"):
            if key in data and hasattr(data[key], "model_dump"):
                data[key] = data[key].model_dump()
        for k, v in data.items():
            setattr(agent, k, v)
            if k in ("capabilities", "file_policy", "agent_link_policy", "config_json", "memory_config"):
                flag_modified(agent, k)

        needs_rebuild = any(
            k in data
            for k in (
                "name",
                "description",
                "department",
                "kind",
                "capabilities",
                "file_policy",
                "agent_link_policy",
                "system_prompt",
                "tool_names",
                "actions",
                "templates",
                "links",
                "config_json",
            )
        )
        if needs_rebuild:
            cfg = mark_execution_guide_generating(dict(agent.config_json or {}))
            cfg["validation"] = {
                **(cfg.get("validation") or {}),
                "state": "runtime_prepare",
                "current_phase": "runtime_prepare",
                "training_completed": False,
            }
            cfg.pop("runtime_plan", None)
            agent.config_json = cfg
            agent.status = AgentStatus.DEPLOYING
            flag_modified(agent, "config_json")
        if agent.slug in CATALOG_SLUGS and data:
            agent.config_json = mark_catalog_agent_customized(agent.config_json)
            flag_modified(agent, "config_json")
        await self.db.commit()
        await self.db.refresh(agent)
        return agent

    async def replace_permissions(
        self, agent_id: UUID, grants: list[AgentPermissionGrant]
    ) -> None:
        agent = await self.get(agent_id)
        grant_by_user = {g.user_id: g for g in grants if g.user_id is not None}
        if agent.owner_id is not None and agent.owner_id not in grant_by_user:
            grant_by_user[agent.owner_id] = AgentPermissionGrant(
                user_id=agent.owner_id,
                can_invoke=True,
                can_configure=True,
            )
        if not grant_by_user:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="حداقل یک کاربر برای دسترسی به ایجنت انتخاب کنید.",
            )

        result = await self.db.execute(
            select(AgentUserPermission).where(AgentUserPermission.agent_id == agent_id)
        )
        existing = {p.user_id: p for p in result.scalars().all()}

        for uid, perm in list(existing.items()):
            if uid not in grant_by_user:
                await self.db.delete(perm)

        for uid, grant in grant_by_user.items():
            if uid in existing:
                row = existing[uid]
                row.can_invoke = grant.can_invoke
                row.can_configure = grant.can_configure
            else:
                self.db.add(
                    AgentUserPermission(
                        user_id=uid,
                        agent_id=agent_id,
                        can_invoke=grant.can_invoke,
                        can_configure=grant.can_configure,
                    )
                )
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="کاربر انتخاب‌شده برای دسترسی معتبر نیست.",
            ) from exc

    async def get(self, agent_id: UUID) -> Agent:
        result = await self.db.execute(
            select(Agent)
            .options(
                selectinload(Agent.actions),
                selectinload(Agent.templates),
                selectinload(Agent.outgoing_links),
            )
            .where(Agent.id == agent_id)
        )
        agent = result.scalar_one_or_none()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        return agent

    async def get_by_slug(self, slug: str) -> Agent:
        agent = await self.agents.get_by_slug(slug)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        return await self.get(agent.id)

    async def delete(self, agent_id: UUID) -> None:
        agent = await self.get(agent_id)
        await self.agents.delete(agent)
        await self.db.commit()

    async def list(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        department: str | None = None,
        status: str | None = None,
        search: str | None = None,
        catalog_only: bool = False,
    ) -> tuple[list[Agent], int]:
        return await self.agents.list_filtered(
            offset=(page - 1) * page_size,
            limit=page_size,
            department=department,
            status=status,
            search=search,
            catalog_only=catalog_only,
        )
