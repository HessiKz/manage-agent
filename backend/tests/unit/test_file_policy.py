"""File policy schema."""

from src.schemas.agent_capabilities import AgentFilePolicy


def test_allow_all_types_policy_accepts_empty_lists():
    policy = AgentFilePolicy(allow_all_types=True, allowed_mime_types=[], allowed_extensions=[])
    assert policy.allow_all_types is True


def test_word_mime_in_default_chips_style_policy():
    policy = AgentFilePolicy(
        allowed_extensions=[".doc", ".docx"],
        allowed_mime_types=[
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
    )
    assert ".docx" in policy.allowed_extensions
