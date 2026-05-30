"""
Central tool registry.

Tools register themselves via the `@register_tool(slug)` decorator. The
`AgentFactory` can then look them up by slug when an Agent is configured
with a list of `tool_names`.

This is a classic registry pattern adapted to LangChain's `BaseTool`.
"""

from __future__ import annotations

from typing import Callable

from langchain_core.tools import BaseTool


class ToolRegistry:
    _tools: dict[str, BaseTool] = {}

    @classmethod
    def register(cls, slug: str, tool: BaseTool) -> None:
        if slug in cls._tools:
            raise ValueError(f"Tool '{slug}' is already registered")
        cls._tools[slug] = tool

    @classmethod
    def get(cls, slug: str) -> BaseTool:
        if slug not in cls._tools:
            raise KeyError(f"Tool '{slug}' is not registered")
        return cls._tools[slug]

    @classmethod
    def get_many(cls, slugs: list[str]) -> list[BaseTool]:
        return [cls.get(s) for s in slugs]

    @classmethod
    def list_slugs(cls) -> list[str]:
        return sorted(cls._tools.keys())

    @classmethod
    def describe(cls) -> list[dict]:
        """For an API to expose available tools to the wizard frontend."""
        return [
            {
                "slug": slug,
                "name": tool.name,
                "description": tool.description,
                "args_schema": tool.args_schema.model_json_schema() if tool.args_schema else None,
            }
            for slug, tool in cls._tools.items()
        ]


def register_tool(slug: str) -> Callable[[BaseTool], BaseTool]:
    """Decorator: `@register_tool("budget_lookup")` above a BaseTool instance."""

    def _wrap(tool: BaseTool) -> BaseTool:
        ToolRegistry.register(slug, tool)
        return tool

    return _wrap
