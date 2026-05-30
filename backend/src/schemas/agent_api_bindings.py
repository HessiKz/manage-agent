"""External API bindings stored on agent.config_json.api_bindings."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class AgentApiBindings(BaseModel):
    """Which integration services/endpoints this agent may call as tools."""

    service_ids: list[UUID] = Field(default_factory=list)
    endpoint_ids: list[UUID] = Field(default_factory=list)

    def is_empty(self) -> bool:
        return not self.service_ids and not self.endpoint_ids


def parse_api_bindings(config_json: dict | None) -> AgentApiBindings:
    raw = (config_json or {}).get("api_bindings") or {}
    if not isinstance(raw, dict):
        return AgentApiBindings()
    service_ids = [UUID(str(x)) for x in raw.get("service_ids") or []]
    endpoint_ids = [UUID(str(x)) for x in raw.get("endpoint_ids") or []]
    return AgentApiBindings(service_ids=service_ids, endpoint_ids=endpoint_ids)


def merge_api_bindings_into_config(
    config_json: dict | None,
    bindings: AgentApiBindings | None,
) -> dict:
    base = dict(config_json or {})
    if bindings is not None:
        base["api_bindings"] = {
            "service_ids": [str(x) for x in bindings.service_ids],
            "endpoint_ids": [str(x) for x in bindings.endpoint_ids],
        }
    return base
