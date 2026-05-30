"""Unit tests for cursor-to-api OpenAI compatibility layer."""

import pytest

from cursor_to_api.openai_schema import ChatCompletionRequest, messages_to_prompt


def test_request_accepts_langchain_extra_fields():
    body = ChatCompletionRequest.model_validate(
        {
            "model": "auto",
            "messages": [{"role": "user", "content": "hi"}],
            "tools": [{"type": "function", "function": {"name": "resume_screen", "parameters": {}}}],
            "tool_choice": "auto",
            "stream": False,
            "parallel_tool_calls": True,
        }
    )
    assert body.model == "auto"
    assert body.tools is not None


def test_messages_include_tool_role_and_tools_block():
    prompt = messages_to_prompt(
        [
            {"role": "system", "content": "You are helpful"},
            {"role": "user", "content": "run screening"},
            {"role": "tool", "content": '{"ok": true}', "name": "resume_screen"},
        ],
        tools=[
            {
                "type": "function",
                "function": {
                    "name": "resume_screen",
                    "description": "Screen resumes",
                    "parameters": {"type": "object", "properties": {"role": {"type": "string"}}},
                },
            }
        ],
    )
    assert "Tool result (resume_screen)" in prompt
    assert "resume_screen" in prompt
    assert "Available tools" in prompt


def test_assistant_tool_calls_in_prompt():
    prompt = messages_to_prompt(
        [
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {
                        "id": "call_1",
                        "type": "function",
                        "function": {"name": "karkard_process", "arguments": '{"storage_path": "x"}'},
                    }
                ],
            }
        ]
    )
    assert "karkard_process" in prompt
