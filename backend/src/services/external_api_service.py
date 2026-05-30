"""CRUD + HTTP execution for user-defined external API services."""

from __future__ import annotations

from uuid import UUID

import httpx
from fastapi import HTTPException, status
from slugify import slugify
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.external_api import AuthType, ExternalApiEndpoint, ExternalApiService, HttpMethod


class ExternalApiServiceLayer:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_services(self) -> list[ExternalApiService]:
        result = await self.db.execute(
            select(ExternalApiService)
            .options(selectinload(ExternalApiService.endpoints))
            .order_by(ExternalApiService.name)
        )
        return list(result.scalars().unique().all())

    async def get_service(self, service_id: UUID) -> ExternalApiService:
        result = await self.db.execute(
            select(ExternalApiService)
            .where(ExternalApiService.id == service_id)
            .options(selectinload(ExternalApiService.endpoints))
        )
        svc = result.scalar_one_or_none()
        if not svc:
            raise HTTPException(status_code=404, detail="Service not found")
        return svc

    async def create_service(self, data: dict) -> ExternalApiService:
        slug = data.get("slug") or slugify(data["name"])
        existing = await self.db.execute(
            select(ExternalApiService).where(ExternalApiService.slug == slug)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Slug already exists")
        svc = ExternalApiService(slug=slug, **{k: v for k, v in data.items() if k != "slug"})
        self.db.add(svc)
        await self.db.commit()
        await self.db.refresh(svc)
        return await self.get_service(svc.id)

    async def update_service(self, service_id: UUID, data: dict) -> ExternalApiService:
        svc = await self.get_service(service_id)
        for k, v in data.items():
            if v is not None and hasattr(svc, k):
                setattr(svc, k, v)
        await self.db.commit()
        return await self.get_service(service_id)

    async def delete_service(self, service_id: UUID) -> None:
        svc = await self.get_service(service_id)
        await self.db.delete(svc)
        await self.db.commit()

    async def create_endpoint(self, service_id: UUID, data: dict) -> ExternalApiEndpoint:
        await self.get_service(service_id)
        slug = data.get("slug") or slugify(data["name"])
        ep = ExternalApiEndpoint(service_id=service_id, slug=slug, **{k: v for k, v in data.items() if k not in ("slug", "service_id")})
        self.db.add(ep)
        await self.db.commit()
        await self.db.refresh(ep)
        return ep

    async def update_endpoint(self, endpoint_id: UUID, data: dict) -> ExternalApiEndpoint:
        ep = await self.db.get(ExternalApiEndpoint, endpoint_id)
        if not ep:
            raise HTTPException(status_code=404, detail="Endpoint not found")
        for k, v in data.items():
            if v is not None and hasattr(ep, k):
                setattr(ep, k, v)
        await self.db.commit()
        await self.db.refresh(ep)
        return ep

    async def delete_endpoint(self, endpoint_id: UUID) -> None:
        ep = await self.db.get(ExternalApiEndpoint, endpoint_id)
        if not ep:
            raise HTTPException(status_code=404, detail="Endpoint not found")
        await self.db.delete(ep)
        await self.db.commit()

    async def test_endpoint(self, endpoint_id: UUID, params: dict | None = None, body: dict | None = None) -> dict:
        ep = await self.db.get(ExternalApiEndpoint, endpoint_id)
        if not ep:
            raise HTTPException(status_code=404, detail="Endpoint not found")
        svc = await self.get_service(ep.service_id)
        return await self._execute(svc, ep, params or {}, body or {})

    async def _execute(
        self,
        svc: ExternalApiService,
        ep: ExternalApiEndpoint,
        params: dict,
        body: dict,
    ) -> dict:
        url = svc.base_url.rstrip("/") + "/" + ep.path.lstrip("/")
        headers = dict(svc.default_headers or {})
        if svc.auth_type == AuthType.BEARER and svc.auth_config.get("token"):
            headers["Authorization"] = f"Bearer {svc.auth_config['token']}"
        elif svc.auth_type == AuthType.API_KEY:
            key_name = svc.auth_config.get("header", "X-API-Key")
            headers[key_name] = svc.auth_config.get("value", "")
        elif svc.auth_type == AuthType.BASIC:
            import base64

            creds = base64.b64encode(
                f"{svc.auth_config.get('username','')}:{svc.auth_config.get('password','')}".encode()
            ).decode()
            headers["Authorization"] = f"Basic {creds}"

        method = ep.method.value if hasattr(ep.method, "value") else str(ep.method)
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.request(method, url, params=params, json=body if body else None, headers=headers)
            try:
                data = r.json()
            except Exception:
                data = {"text": r.text[:2000]}
            return {"status_code": r.status_code, "data": data}
