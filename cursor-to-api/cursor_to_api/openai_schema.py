"""OpenAI-compatible request parsing and prompt building."""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    role: str
    content: str | list[dict[str, Any]] | None = None
    name: str | None = None
    tool_call_id: str | None = None
    tool_calls: list[dict[str, Any]] | None = None


class ChatCompletionRequest(BaseModel):
    """Accepts the fields LangChain / OpenAI clients send; unknown keys are ignored."""

    model_config = ConfigDict(extra="ignore")

    model: str = "auto"
    messages: list[ChatMessage] = Field(default_factory=list)
    stream: bool = False
    temperature: float | None = None
    max_tokens: int | None = None
    top_p: float | None = None
    n: int | None = None
    stop: str | list[str] | None = None
    presence_penalty: float | None = None
    frequency_penalty: float | None = None
    user: str | None = None
    tools: list[dict[str, Any]] | None = None
    tool_choice: str | dict[str, Any] | None = None
    functions: list[dict[str, Any]] | None = None
    function_call: str | dict[str, Any] | None = None
    response_format: dict[str, Any] | None = None
    seed: int | None = None


def _content_to_text(content: str | list[dict[str, Any]] | None) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    bits: list[str] = []
    for block in content:
        if isinstance(block, dict):
            if block.get("type") == "text":
                bits.append(str(block.get("text", "")))
            elif block.get("type") == "tool_result":
                bits.append(str(block.get("content", "")))
            elif "text" in block:
                bits.append(str(block["text"]))
        else:
            bits.append(str(block))
    return "\n".join(bits)


def messages_to_prompt(
    messages: list[dict[str, Any]],
    *,
    tools: list[dict[str, Any]] | None = None,
    functions: list[dict[str, Any]] | None = None,
) -> str:
    parts: list[str] = []
    for msg in messages:
        role = msg.get("role", "user")
        content = _content_to_text(msg.get("content"))

        if role == "tool":
            tool_name = msg.get("name") or msg.get("tool_call_id") or "tool"
            parts.append(f"Tool result ({tool_name}):\n{content}")
            continue

        if role == "assistant" and msg.get("tool_calls"):
            tc_lines = []
            for tc in msg["tool_calls"]:
                fn = tc.get("function") or {}
                tc_lines.append(
                    f"- {fn.get('name', tc.get('name', 'tool'))}: {fn.get('arguments', tc.get('args', {}))}"
                )
            parts.append("Assistant (tool calls):\n" + "\n".join(tc_lines))
            if content.strip():
                parts.append(f"Assistant:\n{content}")
            continue

        if role == "system":
            parts.append(f"System:\n{content}")
        elif role == "user":
            parts.append(f"User:\n{content}")
        elif role == "assistant":
            parts.append(f"Assistant:\n{content}")
        elif role == "function":
            name = msg.get("name") or "function"
            parts.append(f"Function ({name}):\n{content}")
        else:
            parts.append(f"{role.capitalize()}:\n{content}")

    tool_defs = tools or []
    if not tool_defs and functions:
        tool_defs = [{"type": "function", "function": fn} for fn in functions]

    if tool_defs:
        lines: list[str] = []
        for t in tool_defs:
            fn = t.get("function") if t.get("type") == "function" else t
            if not isinstance(fn, dict):
                fn = t
            name = fn.get("name", "tool")
            desc = fn.get("description", "")
            params = fn.get("parameters") or {}
            lines.append(f"- {name}: {desc}\n  parameters: {json.dumps(params, ensure_ascii=False)}")
        parts.append(
            "Available tools (call via JSON array in your reply when needed):\n"
            + "\n".join(lines)
            + '\n\nWhen calling tools, include a JSON block like:\n'
            + '[{"name": "tool_name", "arguments": {...}}]'
        )

    return "\n\n".join(p for p in parts if p.strip())
