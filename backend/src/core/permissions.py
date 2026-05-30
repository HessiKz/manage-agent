"""RBAC helpers — check if a user has a given resource:action permission."""

from src.models.user import User


def user_has_permission(user: User, resource: str, action: str) -> bool:
    """Return True if user is superuser OR has a matching permission via any role."""
    if user.is_superuser:
        return True
    for role in user.roles:
        for perm in role.permissions:
            if perm.resource == resource and perm.action in (action, "manage", "*"):
                return True
    return False


def user_role_names(user: User) -> list[str]:
    return [r.name for r in user.roles]
