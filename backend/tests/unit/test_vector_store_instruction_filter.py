"""Vector store should ignore instruction-role chunks at search time."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.services.vector_store import VectorStore


class _Scalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _Scalars(self._rows)


class _Db:
    def __init__(self, rows):
        self._rows = rows

    async def execute(self, _stmt):
        return _Result(self._rows)


@pytest.mark.asyncio
async def test_search_skips_instruction_role_chunks(monkeypatch):
    runtime_chunk = SimpleNamespace(
        id=uuid4(),
        agent_id=uuid4(),
        content="runtime payroll data",
        embedding=[1.0, 0.0],
        meta={"role": "runtime"},
        created_at=None,
    )
    instruction_chunk = SimpleNamespace(
        id=uuid4(),
        agent_id=runtime_chunk.agent_id,
        content="پنجشنبه تعطیل",
        embedding=[1.0, 0.0],
        meta={"role": "instruction"},
        created_at=None,
    )

    async def _fake_embed(_text: str):
        return [1.0, 0.0]

    monkeypatch.setattr(
        "src.services.vector_store.EmbeddingService.embed_text",
        _fake_embed,
    )
    monkeypatch.setattr(
        "src.services.vector_store.EmbeddingService.cosine_similarity",
        lambda _a, _b: 0.99,
    )

    store = VectorStore(_Db([runtime_chunk, instruction_chunk]))
    hits = await store.search("payroll", agent_id=runtime_chunk.agent_id, limit=5)

    assert len(hits) == 1
    assert hits[0][0].content == "runtime payroll data"
