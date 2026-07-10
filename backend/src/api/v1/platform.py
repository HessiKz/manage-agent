"""Platform settings endpoints — LLM provider toggle + autonomy default."""

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


@router.get("/feature-flags", response_model=dict)
async def get_feature_flags(_user: CurrentUser):
    """Frontend-visible rollout flags (Phase 1 M4.1)."""
    from src.config import settings

    return {
        "run_state_v1": settings.run_state_v1,
        "precision_routing_v1": settings.precision_routing_v1,
        "graduated_autonomy_v1": settings.graduated_autonomy_v1,
    }


@router.get("/autonomy-default", response_model=dict)
async def get_autonomy_default(db: DB, _user: CurrentUser):
    level = await PlatformSettingsService(db).get_autonomy_default()
    return {"level": level}


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


@router.put("/autonomy-default", response_model=dict)
async def set_autonomy_default(payload: dict, db: DB, _admin: CurrentSuperuser):
    level = await PlatformSettingsService(db).set_autonomy_default(int(payload.get("level", 1)))
    return {"level": level}
