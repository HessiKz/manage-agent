"""AutonomyPolicyService unit tests (plan M3.1 / M3.2)."""

import pytest

from src.models.user import User
from src.services.autonomy_policy_service import (
    DEFAULT_LEVEL,
    AutonomyLevel,
    autonomy_gates_enabled,
)


def _user(*, is_superuser=False, level=1) -> User:
    u = User(email="x@y.z", hashed_password="h", full_name="X")
    u.is_superuser = is_superuser
    u.set_support_autonomy_level(level)
    return u


# --- coercion ---


@pytest.mark.parametrize(
    "raw,expected",
    [
        (0, 0),
        (3, 3),
        (5, DEFAULT_LEVEL),
        (-1, DEFAULT_LEVEL),
        ("2", 2),
        ("9", DEFAULT_LEVEL),
        ("x", DEFAULT_LEVEL),
        (True, 1),
        (False, 0),
        (None, DEFAULT_LEVEL),
    ],
)
def test_level_coercion(raw, expected):
    assert AutonomyLevel.coerce(raw) == expected


def test_user_preference_property_defaults_to_one():
    u = User(email="x@y.z", hashed_password="h", full_name="X")
    assert u.support_autonomy_level == 1


def test_user_preference_property_and_setter():
    u = User(email="x@y.z", hashed_password="h", full_name="X")
    u.set_support_autonomy_level(3)
    assert u.support_autonomy_level == 3
    u.set_support_autonomy_level(99)  # out of range -> setter still stores; prop clamps
    assert u.support_autonomy_level == DEFAULT_LEVEL


# --- can_use_level / L3 gate ---


def test_autonomy_gates_default_off_until_enabled():
    # Flag defaults to False per M4: graduated autonomy must be explicitly enabled.
    assert autonomy_gates_enabled() is False
    u = _user(is_superuser=True)
    # can_use_level needs a db for the count path; superuser short-circuits before DB.
    from src.services.autonomy_policy_service import can_use_level

    async def run():
        return await can_use_level(db=None, user=u, level=3)  # type: ignore[arg-type]

    import asyncio

    assert asyncio.run(run()) is True


def test_levels_below_l3_always_allowed():
    from src.services.autonomy_policy_service import can_use_level

    async def run():
        return await can_use_level(db=None, user=_user(), level=2)  # type: ignore[arg-type]

    import asyncio

    assert asyncio.run(run()) is True


def test_invalid_level_coerced_below_l3():
    from src.services.autonomy_policy_service import can_use_level

    async def run():
        # level=99 coerces to DEFAULT (1) -> allowed without DB.
        return await can_use_level(db=None, user=_user(), level=99)  # type: ignore[arg-type]

    import asyncio

    assert asyncio.run(run()) is True
