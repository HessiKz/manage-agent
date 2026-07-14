"""Planning answers must clear workspace_script.verified_at so scripts retrain."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from src.services.agent_service import AgentService


class _Db:
    def __init__(self, agent):
        self.agent = agent

    async def commit(self):
        pass

    async def refresh(self, _obj):
        pass


@pytest.mark.anyio
async def test_submit_validation_answers_clears_verified_at(monkeypatch):
    agent = SimpleNamespace(
        id=uuid4(),
        status="deploying",
        config_json={
            "validation": {
                "planning": {
                    "awaiting_answers": True,
                    "questions": [{"id": "q1", "text": "rule?"}],
                    "locale": "fa-IR",
                }
            },
            "workspace_script": {
                "needed": True,
                "verified_at": "2026-01-01T00:00:00+00:00",
                "sample_hash": "abc",
            },
        },
    )

    monkeypatch.setattr(
        "src.services.agent_service.flag_modified",
        lambda *_a, **_k: None,
    )

    svc = AgentService(_Db(agent))

    async def fake_get(_id):
        return agent

    svc.get = fake_get  # type: ignore[method-assign]

    out = await svc.submit_validation_answers(agent.id, {"q1": "use output sample"})
    ws = out.config_json.get("workspace_script") or {}
    assert "verified_at" not in ws
    assert "sample_hash" not in ws
    assert out.config_json["validation"]["planning"]["awaiting_answers"] is False
    assert out.config_json["validation"]["planning"]["answers"]["q1"] == "use output sample"


@pytest.mark.anyio
async def test_submit_validation_answers_requires_awaiting():
    agent = SimpleNamespace(
        id=uuid4(),
        status="active",
        config_json={"validation": {"planning": {"awaiting_answers": False}}},
    )
    svc = AgentService(_Db(agent))

    async def fake_get(_id):
        return agent

    svc.get = fake_get  # type: ignore[method-assign]

    with pytest.raises(HTTPException) as exc:
        await svc.submit_validation_answers(agent.id, {"q1": "x"})
    assert exc.value.status_code == 400
