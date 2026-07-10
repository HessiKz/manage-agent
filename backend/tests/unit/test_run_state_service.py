"""RunStateService unit tests (in-memory fake session, no DB needed)."""

import pytest

from src.models.agent import Agent
from src.models.run_state import RunState
from src.schemas.run_state import RunStatePatch, RunStateUpsert
from src.services.run_state_service import (
    RunStateConflict,
    RunStateNotFound,
    RunStateService,
)


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None

    def scalar_one(self):
        return self._rows[0]

    def all(self):
        return self._rows


class FakeSession:
    """Minimal async SQLAlchemy stand-in for the service's queries."""

    def __init__(self):
        self.rows: list[RunState] = []
        self.agents: dict[str, Agent] = {}
        self.flushed: list[object] = []
        self._get_results: dict[type, object] = {}

    async def execute(self, stmt):
        if "run_state" in str(stmt).lower():
            criteria = getattr(stmt, "_where_criteria", ())
            match = [r for r in self.rows if _matches(r, criteria)]
            return FakeResult(match)
        if "agents" in str(stmt).lower():
            criteria = getattr(stmt, "_where_criteria", ())
            match = [a for a in self.agents.values() if _matches_agent(a, criteria)]
            return FakeResult(match)
        return FakeResult([])

    async def get(self, cls, pk):
        if cls is Agent:
            return self._get_results.get(Agent)
        return None

    def add(self, obj):
        self.flushed.append(obj)
        if isinstance(obj, RunState):
            self.rows.append(obj)

    async def flush(self):
        pass

    async def delete(self, obj):
        if obj in self.rows:
            self.rows.remove(obj)


def _value(expr):
    """Pull a literal value out of a SQLAlchemy expression's right side."""
    right = getattr(expr, "right", None)
    if right is None:
        return None
    if hasattr(right, "value"):
        return right.value
    if hasattr(right, "effective_value"):
        return right.effective_value
    return getattr(right, "comparator", None)


def _matches(state: RunState, criteria) -> bool:
    for crit in criteria:
        left = getattr(crit, "left", None)
        col = getattr(left, "name", None)
        val = _value(crit)
        if col in ("scope_type", "scope_key") and getattr(state, col) != val:
            return False
        if col == "user_id" and str(state.user_id) != str(val):
            return False
    return True


def _matches_agent(agent: Agent, criteria) -> bool:
    for crit in criteria:
        left = getattr(crit, "left", None)
        col = getattr(left, "name", None)
        val = _value(crit)
        if col == "slug" and getattr(agent, "slug", None) != val:
            return False
    return True


def _new_state(scope_type="wizard", scope_key="k1", user_id=None, slug=None):
    return RunState(
        scope_type=scope_type,
        scope_key=scope_key,
        user_id=user_id or __import__("uuid").uuid4(),
        slug=slug,
        phase="unknown",
        payload={},
        version=1,
    )


async def test_get_missing_raises_not_found():
    svc = RunStateService(FakeSession())
    with pytest.raises(RunStateNotFound):
        await svc.get("wizard", "missing", __import__("uuid").uuid4())


async def test_upsert_creates_then_get_reads_it():
    sess = FakeSession()
    user_id = __import__("uuid").uuid4()
    svc = RunStateService(sess)
    await svc.upsert(
        RunStateUpsert(scope_type="wizard", scope_key="k1", phase="wizard_form"),
        user_id,
    )
    got = await svc.get("wizard", "k1", user_id)
    assert got.phase == "wizard_form"
    assert got.version == 1


async def test_upsert_optimistic_lock_conflict():
    sess = FakeSession()
    user_id = __import__("uuid").uuid4()
    svc = RunStateService(sess)
    await svc.upsert(RunStateUpsert(scope_type="wizard", scope_key="k1"), user_id)
    with pytest.raises(RunStateConflict):
        await svc.upsert(
            RunStateUpsert(scope_type="wizard", scope_key="k1", version=99),
            user_id,
        )


async def test_patch_merges_payload_without_clobber():
    sess = FakeSession()
    user_id = __import__("uuid").uuid4()
    svc = RunStateService(sess)
    await svc.upsert(
        RunStateUpsert(
            scope_type="wizard",
            scope_key="k1",
            payload={"attempt_counts": {"continue_testing": 2}},
        ),
        user_id,
    )
    await svc.patch(
        "wizard",
        "k1",
        RunStatePatch(payload={"user_choices": {"skip": False}}),
        user_id,
    )
    got = await svc.get("wizard", "k1", user_id)
    assert got.payload["attempt_counts"] == {"continue_testing": 2}
    assert got.payload["user_choices"] == {"skip": False}
    assert got.version == 2


async def test_slug_requires_verified_agent():
    sess = FakeSession()
    user_id = __import__("uuid").uuid4()
    svc = RunStateService(sess)
    from fastapi import HTTPException

    # No agent with this slug exists anywhere -> 422
    with pytest.raises(HTTPException) as exc:
        await svc.upsert(
            RunStateUpsert(scope_type="wizard", scope_key="k1", slug="unverified-slug"),
            user_id,
        )
    assert exc.value.status_code == 422

    # Agent exists with the slug -> accepted
    agent = Agent(slug="verified-slug", name="A")
    sess._get_results[Agent] = agent
    sess.agents["verified-slug"] = agent
    await svc.upsert(
        RunStateUpsert(scope_type="wizard", scope_key="k2", slug="verified-slug"),
        user_id,
    )
    got = await svc.get("wizard", "k2", user_id)
    assert got.slug == "verified-slug"


async def test_patch_on_missing_creates_state():
    sess = FakeSession()
    user_id = __import__("uuid").uuid4()
    svc = RunStateService(sess)
    await svc.patch("support", "thread-9", RunStatePatch(phase="training"), user_id)
    got = await svc.get("support", "thread-9", user_id)
    assert got.phase == "training"


async def test_delete_clears_state():
    sess = FakeSession()
    user_id = __import__("uuid").uuid4()
    svc = RunStateService(sess)
    await svc.upsert(RunStateUpsert(scope_type="wizard", scope_key="k1"), user_id)
    await svc.delete("wizard", "k1", user_id)
    with pytest.raises(RunStateNotFound):
        await svc.get("wizard", "k1", user_id)
