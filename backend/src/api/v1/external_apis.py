"""External API service management."""

from uuid import UUID

from fastapi import APIRouter, status

from src.api.dependencies import DB, CurrentSuperuser, CurrentUser
from src.schemas.external_api import (
    ExternalApiEndpointCreate,
    ExternalApiEndpointRead,
    ExternalApiServiceCreate,
    ExternalApiServiceRead,
    ExternalApiTestRequest,
)
from src.agents_lib.dynamic_tools import DynamicToolLoader
from src.services.external_api_service import ExternalApiServiceLayer

router = APIRouter()


@router.get("", response_model=list[ExternalApiServiceRead])
async def list_services(db: DB, _user: CurrentUser):
    return await ExternalApiServiceLayer(db).list_services()


@router.post("", response_model=ExternalApiServiceRead, status_code=status.HTTP_201_CREATED)
async def create_service(payload: ExternalApiServiceCreate, db: DB, _admin: CurrentSuperuser):
    svc = await ExternalApiServiceLayer(db).create_service(payload.model_dump())
    await DynamicToolLoader.register_all(db)
    return svc


@router.get("/{service_id}", response_model=ExternalApiServiceRead)
async def get_service(service_id: UUID, db: DB, _user: CurrentUser):
    return await ExternalApiServiceLayer(db).get_service(service_id)


@router.patch("/{service_id}", response_model=ExternalApiServiceRead)
async def update_service(
    service_id: UUID, payload: ExternalApiServiceCreate, db: DB, _admin: CurrentSuperuser
):
    svc = await ExternalApiServiceLayer(db).update_service(
        service_id, payload.model_dump(exclude_unset=True)
    )
    await DynamicToolLoader.register_all(db)
    return svc


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_service(service_id: UUID, db: DB, _admin: CurrentSuperuser):
    await ExternalApiServiceLayer(db).delete_service(service_id)


@router.post(
    "/{service_id}/endpoints",
    response_model=ExternalApiEndpointRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_endpoint(
    service_id: UUID,
    payload: ExternalApiEndpointCreate,
    db: DB,
    _admin: CurrentSuperuser,
):
    ep = await ExternalApiServiceLayer(db).create_endpoint(service_id, payload.model_dump())
    await DynamicToolLoader.register_all(db)
    return ep


@router.post("/endpoints/{endpoint_id}/test")
async def test_endpoint(
    endpoint_id: UUID,
    payload: ExternalApiTestRequest,
    db: DB,
    _user: CurrentUser,
):
    return await ExternalApiServiceLayer(db).test_endpoint(
        endpoint_id, payload.params, payload.body
    )
