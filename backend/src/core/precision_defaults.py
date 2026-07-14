"""Default execution precision per agent kind.

Precision tiers (stored in `config_json.execution_precision`, no new column):
- deterministic: same input -> same output; worker tools run without the LLM.
- guided: LLM with restricted tools; human review recommended.
- autonomous: full tool access / free-form ReAct.
"""

from __future__ import annotations

import enum

from src.models.agent import AgentKind


class ExecutionPrecision(str, enum.Enum):
    DETERMINISTIC = "deterministic"
    GUIDED = "guided"
    AUTONOMOUS = "autonomous"


class ExecutionPath(str, enum.Enum):
    AUTO_TOOL = "auto_tool"
    REACT = "react"
    SUPERVISOR = "supervisor"
    PLAIN_LLM = "plain_llm"
    SANDBOX_JOB = "sandbox_job"


_KIND_DEFAULT: dict[AgentKind, ExecutionPrecision] = {
    AgentKind.WORKER: ExecutionPrecision.DETERMINISTIC,
    AgentKind.CHAT: ExecutionPrecision.AUTONOMOUS,
    AgentKind.SUPERVISOR: ExecutionPrecision.GUIDED,
    AgentKind.CUSTOM: ExecutionPrecision.GUIDED,
}


def precision_for_kind(kind: AgentKind) -> ExecutionPrecision:
    return _KIND_DEFAULT.get(kind, ExecutionPrecision.GUIDED)


def precision_from_config(config_json: dict | None) -> ExecutionPrecision | None:
    raw = (config_json or {}).get("execution_precision")
    if not raw:
        return None
    try:
        return ExecutionPrecision(raw)
    except ValueError:
        return None


def validate_execution_precision(config_json: dict | None) -> None:
    """Raise ValueError if config_json carries an unrecognized execution_precision.

    A bad value must be rejected (plan 2.1.4: invalid precision -> 422), not silently
    ignored, so unknown tiers never reach the router's fallback path.
    """
    if config_json is None:
        return
    raw = config_json.get("execution_precision")
    if raw is None:
        return
    try:
        ExecutionPrecision(raw)
    except ValueError as exc:
        raise ValueError(
            f"invalid execution_precision: {raw!r} "
            f"(expected one of {[p.value for p in ExecutionPrecision]})"
        ) from exc
