from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from src.models.agent import AgentStatus
from src.services.agent_training_service import AgentTrainingService


@pytest.mark.anyio
async def test_start_training_blocks_when_planning_questions_pending():
    agent_id = uuid4()
    agent = SimpleNamespace(
        id=agent_id,
        status=AgentStatus.DEPLOYING,
        config_json={
            "validation": {
                "state": "planning",
                "planning": {"awaiting_answers": True, "questions": [{"id": "q1"}]},
            }
        },
    )

    svc = AgentTrainingService(SimpleNamespace())

    async def fake_get(_id):
        return agent

    svc.agents = SimpleNamespace(get=fake_get)

    with pytest.raises(HTTPException) as exc:
        await svc.start_training(agent_id)
    assert exc.value.status_code == 400
    assert "سؤال" in exc.value.detail
