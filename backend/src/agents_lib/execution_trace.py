"""Structured execution trace for admin visibility (LLM + tools)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AgentRunResult:
    output: str
    trace: list[dict[str, Any]] = field(default_factory=list)
    llm_provider: str = "openai"
    model_name: str = ""
    tokens_input: int = 0
    tokens_output: int = 0
    ui_actions: list[dict[str, Any]] = field(default_factory=list)
    ui_scripts: list[dict[str, Any]] = field(default_factory=list)


def trace_step(
    kind: str,
    label: str,
    *,
    detail: str | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    row: dict[str, Any] = {"kind": kind, "label": label}
    if detail:
        row["detail"] = detail
    if payload:
        row["payload"] = payload
    return row


def numbered_trace(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{**step, "step": i + 1} for i, step in enumerate(steps)]
