"""Agent service: CRUD + invoke."""

from uuid import UUID

from fastapi import HTTPException, status
from slugify import slugify
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.agent import Agent, AgentStatus
from src.models.agent_action import AgentAction
from src.models.agent_link import AgentLink
from src.models.agent_permission import AgentUserPermission
from src.models.agent_prompt_template import AgentPromptTemplate
from src.models.user import User
from src.repositories.agent_repo import AgentRepository
from src.schemas.agent import AgentCreate, AgentUpdate
from src.schemas.agent_capabilities import AgentCapabilities, AgentFilePolicy, AgentLinkPolicy
from src.services.agent_link_service import AgentLinkService


class AgentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.agents = AgentRepository(db)

    async def create(self, payload: AgentCreate, owner: User) -> Agent:
        slug = payload.slug or slugify(payload.name)
        if await self.agents.get_by_slug(slug):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Agent slug '{slug}' already exists",
            )
        data = payload.model_dump(
            exclude={"slug", "permissions", "actions", "templates", "links", "api_bindings"}
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
        cfg.setdefault("validation", {})["state"] = "pending"

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

        granted_users = {perm.user_id for perm in payload.permissions}
        if owner.id not in granted_users:
            self.db.add(
                AgentUserPermission(
                    user_id=owner.id,
                    agent_id=agent.id,
                    can_invoke=True,
                    can_configure=True,
                )
            )

        for perm in payload.permissions:
            self.db.add(
                AgentUserPermission(
                    user_id=perm.user_id,
                    agent_id=agent.id,
                    can_invoke=perm.can_invoke,
                    can_configure=perm.can_configure,
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

    async def start_validation(self, agent_id: UUID) -> tuple[Agent, bool]:
        """Mark agent as validating. Returns (agent, should_schedule_task)."""
        agent = await self.get(agent_id)
        if agent.status not in (AgentStatus.DRAFT, AgentStatus.DEPLOYING):
            return agent, False

        cfg = dict(agent.config_json or {})
        validation = dict(cfg.get("validation") or {})
        if validation.get("state") in ("running", "done"):
            return agent, False

        validation["state"] = "running"
        validation["current_phase"] = "starting"
        cfg["validation"] = validation
        agent.status = AgentStatus.DEPLOYING
        agent.config_json = cfg
        await self.db.commit()
        await self.db.refresh(agent)
        return agent, True

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
        data = payload.model_dump(exclude_unset=True, exclude={"api_bindings"})
        for key in ("capabilities", "file_policy", "agent_link_policy"):
            if key in data and hasattr(data[key], "model_dump"):
                data[key] = data[key].model_dump()
        for k, v in data.items():
            setattr(agent, k, v)
        await self.db.commit()
        await self.db.refresh(agent)
        return agent

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
