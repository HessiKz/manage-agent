"""Platform settings endpoints — LLM provider toggle (superuser only)."""

from __future__ import annotations

from fastapi import APIRouter

from src.api.dependencies import DB, CurrentSuperuser, CurrentUser
from src.schemas.platform import (
    AvailableModelsRead,
    LlmProviderHealth,
    LlmProviderRead,
    LlmProviderUpdate,
)
from src.services.platform_settings_service import PlatformSettingsService

router = APIRouter()


@router.get("/models", response_model=AvailableModelsRead)
async def list_available_models(_user: CurrentUser):
    from src.config import settings
    from src.core import llm_runtime

    models = llm_runtime.available_models()
    return AvailableModelsRead(
        models=models,
        default=settings.openai_default_model or models[0],
    )


@router.get("/llm-provider", response_model=LlmProviderRead)
async def get_llm_provider(db: DB, _user: CurrentUser):
    return await PlatformSettingsService(db).get_llm_provider()


@router.get("/llm-provider/health", response_model=LlmProviderHealth)
async def llm_provider_health(db: DB, _user: CurrentUser):
    return await PlatformSettingsService(db).provider_health()


@router.put("/llm-provider", response_model=LlmProviderRead)
async def set_llm_provider(payload: LlmProviderUpdate, db: DB, _admin: CurrentSuperuser):
    return await PlatformSettingsService(db).set_llm_provider(
        active=payload.active,
        cursor_base_url=payload.cursor_base_url,
        cursor_api_key=payload.cursor_api_key,
        cursor_model=payload.cursor_model,
    )
