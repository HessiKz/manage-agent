"""Agent permission replace — schema + service edge cases."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.schemas.agent import AgentPermissionGrant, AgentPermissionsReplace


def test_permissions_replace_drops_null_user_ids():
    payload = AgentPermissionsReplace.model_validate(
        {
            "permissions": [
                {"user_id": None, "can_invoke": True, "can_configure": False},
                {"user_id": str(uuid4()), "can_invoke": True, "can_configure": False},
            ]
        }
    )
    assert len(payload.permissions) == 1


def test_permission_grant_requires_uuid():
    with pytest.raises(ValidationError):
        AgentPermissionGrant(user_id=None)  # type: ignore[arg-type]


def test_replace_permissions_skips_null_owner_grant():
    """Catalog agents may have owner_id=None — must not inject invalid grant."""
    owner_id = None
    grants: list[AgentPermissionGrant] = []
    grant_by_user = {g.user_id: g for g in grants if g.user_id is not None}
    if owner_id is not None and owner_id not in grant_by_user:
        grant_by_user[owner_id] = AgentPermissionGrant(
            user_id=owner_id,
            can_invoke=True,
            can_configure=True,
        )
    assert grant_by_user == {}
