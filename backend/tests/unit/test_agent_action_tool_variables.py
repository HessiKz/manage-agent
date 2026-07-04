"""Action tool variable injection must pick raw runtime spreadsheets only."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime

from src.models.agent_file import AgentFile
from src.services.agent_action_service import AgentActionService


class _ScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


class _Db:
    async def execute(self, stmt):
        return _ScalarResult(self.rows)


def test_tool_variables_skips_output_sample_and_processed():
    agent_id = uuid.uuid4()
    raw = AgentFile(
        id=uuid.uuid4(),
        agent_id=agent_id,
        filename="کارکرد توسعه کارآفرینی-2.1405.xlsx",
        storage_path="/var/raw.xlsx",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    sample = AgentFile(
        id=uuid.uuid4(),
        agent_id=agent_id,
        filename="output-sample__کارکرد_توسعه_کارآفرینی_1405.2.xlsx",
        storage_path="/var/sample.xlsx",
        created_at=datetime(2026, 6, 1, tzinfo=UTC),
    )
    processed = AgentFile(
        id=uuid.uuid4(),
        agent_id=agent_id,
        filename="karkard-1405-processed.xlsx",
        storage_path="/var/out.xlsx",
        created_at=datetime(2026, 6, 2, tzinfo=UTC),
    )
    instruction = AgentFile(
        id=uuid.uuid4(),
        agent_id=agent_id,
        filename="instruction__دستور.docx",
        storage_path="/var/instruction.docx",
        created_at=datetime(2026, 6, 3, tzinfo=UTC),
    )

    db = _Db()
    db.rows = [instruction, processed, sample, raw]
    svc = AgentActionService(db)

    vars_map = asyncio.run(svc._tool_variables(agent_id, {"jalali_year": 1405}))

    assert vars_map["storage_path"] == "/var/raw.xlsx"
    assert vars_map["jalali_year"] == 1405
