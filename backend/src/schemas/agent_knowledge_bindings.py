"""Knowledge dataset bindings stored on agent.config_json.knowledge_bindings."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class AgentKnowledgeBindings(BaseModel):
    dataset_ids: list[UUID] = Field(default_factory=list)

    def is_empty(self) -> bool:
        return not self.dataset_ids


def parse_knowledge_bindings(config_json: dict | None) -> AgentKnowledgeBindings:
    raw = (config_json or {}).get("knowledge_bindings") or {}
    if not isinstance(raw, dict):
        return AgentKnowledgeBindings()
    dataset_ids = [UUID(str(x)) for x in raw.get("dataset_ids") or []]
    return AgentKnowledgeBindings(dataset_ids=dataset_ids)


def merge_knowledge_bindings_into_config(
    config_json: dict | None,
    bindings: AgentKnowledgeBindings | None,
) -> dict:
    base = dict(config_json or {})
    if bindings is not None:
        base["knowledge_bindings"] = {
            "dataset_ids": [str(x) for x in bindings.dataset_ids],
        }
    return base
