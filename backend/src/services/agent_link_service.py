"""Agent link CRUD with cycle prevention."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.agent import Agent
from src.models.agent_link import AgentLink, AgentLinkType
from src.models.audit_log import AuditLog
from src.schemas.agent_link import AgentLinkCreate, AgentLinkGraph, AgentLinkGraphEdge, AgentLinkGraphNode, AgentLinkRead


class AgentLinkService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_agent(self, agent_id: UUID) -> Agent:
        agent = await self.db.get(Agent, agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        return agent

    async def _would_create_supervisor_cycle(
        self, caller_id: UUID, callee_id: UUID
    ) -> bool:
        """DFS from callee: can we reach caller via supervises edges?"""
        visited: set[UUID] = set()
        stack = [callee_id]
        while stack:
            current = stack.pop()
            if current in visited:
                continue
            visited.add(current)
            if current == caller_id:
                return True
            result = await self.db.execute(
                select(AgentLink.callee_agent_id).where(
                    AgentLink.caller_agent_id == current,
                    AgentLink.link_type == AgentLinkType.SUPERVISES,
                )
            )
            for (child_id,) in result.all():
                stack.append(child_id)
        return False

    async def list_links(self, agent_id: UUID) -> list[AgentLinkRead]:
        await self._get_agent(agent_id)
        result = await self.db.execute(
            select(AgentLink, Agent.name, Agent.slug)
            .join(Agent, Agent.id == AgentLink.callee_agent_id)
            .where(AgentLink.caller_agent_id == agent_id)
            .order_by(AgentLink.created_at)
        )
        out: list[AgentLinkRead] = []
        for link, name, slug in result.all():
            data = AgentLinkRead.model_validate(link)
            data.callee_name = name
            data.callee_slug = slug
            out.append(data)
        return out

    async def create(self, caller_id: UUID, payload: AgentLinkCreate) -> AgentLink:
        await self._get_agent(caller_id)
        if payload.callee_agent_id == caller_id:
            raise HTTPException(status_code=400, detail="Cannot link agent to itself")

        callee = await self.db.get(Agent, payload.callee_agent_id)
        if not callee:
            raise HTTPException(status_code=404, detail="Callee agent not found")

        if payload.link_type == AgentLinkType.SUPERVISES:
            if await self._would_create_supervisor_cycle(caller_id, payload.callee_agent_id):
                raise HTTPException(
                    status_code=400,
                    detail="Supervisor link would create a cycle",
                )

        existing = await self.db.execute(
            select(AgentLink).where(
                AgentLink.caller_agent_id == caller_id,
                AgentLink.callee_agent_id == payload.callee_agent_id,
                AgentLink.link_type == payload.link_type,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Link already exists")

        link = AgentLink(caller_agent_id=caller_id, **payload.model_dump())
        self.db.add(link)
        self.db.add(
            AuditLog(
                action="agent.link_create",
                resource_type="agent_link",
                resource_id=link.id,
                changes={
                    "caller_id": str(caller_id),
                    "callee_id": str(payload.callee_agent_id),
                    "link_type": payload.link_type.value,
                },
            )
        )
        await self.db.flush()
        return link

    async def delete(self, link_id: UUID) -> None:
        link = await self.db.get(AgentLink, link_id)
        if not link:
            raise HTTPException(status_code=404, detail="Link not found")
        self.db.add(
            AuditLog(
                action="agent.link_delete",
                resource_type="agent_link",
                resource_id=link_id,
                changes={"caller_id": str(link.caller_agent_id), "callee_id": str(link.callee_agent_id)},
            )
        )
        await self.db.delete(link)

    async def graph(self, agent_id: UUID) -> AgentLinkGraph:
        agent = await self._get_agent(agent_id)
        result = await self.db.execute(
            select(AgentLink)
            .options(selectinload(AgentLink.callee))
            .where(AgentLink.caller_agent_id == agent_id)
        )
        links = list(result.scalars().all())
        node_ids: set[str] = {str(agent.id)}
        nodes: list[AgentLinkGraphNode] = [
            AgentLinkGraphNode(
                id=str(agent.id),
                slug=agent.slug,
                name=agent.name,
                kind=agent.kind.value,
            )
        ]
        edges: list[AgentLinkGraphEdge] = []
        for link in links:
            cid = str(link.callee_agent_id)
            if cid not in node_ids:
                node_ids.add(cid)
                nodes.append(
                    AgentLinkGraphNode(
                        id=cid,
                        slug=link.callee.slug,
                        name=link.callee.name,
                        kind=link.callee.kind.value,
                    )
                )
            edges.append(
                AgentLinkGraphEdge(
                    source=str(agent.id),
                    target=cid,
                    link_type=link.link_type.value,
                )
            )
        return AgentLinkGraph(nodes=nodes, edges=edges)
