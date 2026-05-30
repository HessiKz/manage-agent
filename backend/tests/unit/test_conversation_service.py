"""Conversation resume message resolution."""

from types import SimpleNamespace

from src.services.conversation_service import ConversationService


def test_resolve_messages_falls_back_to_log_when_history_empty():
    svc = ConversationService(db=SimpleNamespace())
    log = SimpleNamespace(
        input_text="Context for tools (hidden)\n\nفایل کارکرد را پردازش کن",
        output_text="فایل پردازش شد.",
    )
    messages = svc._resolve_messages(log, thread_id=None)
    assert len(messages) >= 2
    assert messages[0].role == "user"
    assert "کارکرد" in messages[0].content
    assert messages[-1].role == "assistant"


def test_resolve_messages_keeps_raw_user_when_humanize_strips_all():
    svc = ConversationService(db=SimpleNamespace())
    raw = '{"agent_id": "x", "storage_path": "var/agent_files/demo.xlsx"}'
    log = SimpleNamespace(input_text=raw, output_text="done")
    messages = svc._resolve_messages(log, thread_id=None)
    assert messages
    assert messages[0].role == "user"
    assert "agent_id" in messages[0].content
