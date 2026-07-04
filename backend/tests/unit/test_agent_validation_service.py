from types import SimpleNamespace

from fastapi import HTTPException

from src.core.errors import AppError, ErrorCode
from src.services.agent_validation_service import AgentValidationService


def _svc() -> AgentValidationService:
    return AgentValidationService(db=SimpleNamespace())


def test_is_fixable_http_4xx():
    assert _svc()._is_fixable(HTTPException(status_code=422, detail="bad")) is True


def test_is_fixable_llm_unavailable_false():
    err = AppError("down", code=ErrorCode.LLM_UNAVAILABLE, status_code=503)
    assert _svc()._is_fixable(err) is False


def test_is_fixable_orchestration_permission_false():
    err = AppError(
        "failed",
        code=ErrorCode.ORCHESTRATION_FAILED,
        status_code=500,
        details={"type": "PermissionError"},
    )
    assert _svc()._is_fixable(err) is False


def test_is_fixable_orchestration_bad_request_true():
    err = AppError(
        "failed",
        code=ErrorCode.ORCHESTRATION_FAILED,
        status_code=500,
        details={"type": "BadRequestError"},
    )
    assert _svc()._is_fixable(err) is True


def test_planning_prompt_requires_persian_output():
    prompt = AgentValidationService._PLANNING_SYSTEM
    assert "fa-IR" in prompt
    assert "Persian" in prompt
    assert "analysis" in prompt
    assert "questions" in prompt


def test_planning_locale_constant():
    assert AgentValidationService.PLANNING_LOCALE == "fa-IR"


def test_action_variables_uses_defaults_and_types():
    action = SimpleNamespace(
        input_schema={
            "properties": {
                "jalali_year": {"type": "integer", "default": 1405},
                "company_name": {"type": "string"},
                "strict": {"type": "boolean"},
            }
        }
    )
    values = _svc()._action_variables(action)
    assert values["jalali_year"] == 1405
    assert values["company_name"] == "sample"
    assert values["strict"] is True
