"""Support assistant threads — ownership and sidebar exclusion."""

from uuid import uuid4

from src.models.user import User
from src.services.conversation_service import thread_owned_by_user


def test_thread_owned_by_user_legacy_and_session():
    user = User(id=uuid4(), email="u@test.com", hashed_password="x")
    agent_id = uuid4()
    prefix = f"user-{user.id}:agent-{agent_id}"
    assert thread_owned_by_user(user, agent_id, prefix)
    assert thread_owned_by_user(user, agent_id, f"{prefix}:session-abc123")
    assert not thread_owned_by_user(user, agent_id, f"user-{uuid4()}:agent-{agent_id}")
    assert not thread_owned_by_user(user, agent_id, "evil-thread")
