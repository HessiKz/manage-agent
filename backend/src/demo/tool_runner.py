"""Run registered tools synchronously and format Persian output for chat/UI."""

from __future__ import annotations

import json
import re
from typing import Any

import src.agents_lib.custom_tools  # noqa: F401 — register tools
from src.agents_lib.tool_registry import ToolRegistry

_PLACEHOLDER_RE = re.compile(r"^نمونه-")


def _coerce_property_value(prop: dict[str, Any], value: Any) -> Any:
    if value is None:
        return prop.get("default")
    if isinstance(value, str) and _PLACEHOLDER_RE.match(value):
        return prop.get("default")
    typ = prop.get("type")
    if typ == "integer":
        if isinstance(value, bool):
            return prop.get("default", 0)
        if isinstance(value, int):
            return value
        try:
            return int(str(value).strip())
        except (TypeError, ValueError):
            return prop.get("default")
    if typ == "number":
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return value
        try:
            return float(str(value).strip())
        except (TypeError, ValueError):
            return prop.get("default")
    return value


def normalize_tool_args(tool, args: dict[str, Any]) -> dict[str, Any]:
    """Map incoming action variables to tool schema with defaults and coercion."""
    schema = tool.args_schema.model_json_schema() if tool.args_schema else {}
    props: dict[str, Any] = schema.get("properties", {})
    if not props:
        return dict(args)
    out: dict[str, Any] = {}
    for key, prop in props.items():
        if key in args:
            out[key] = _coerce_property_value(prop, args[key])
        elif "default" in prop:
            out[key] = prop["default"]
    return out


def run_tool_slug(slug: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
    tool = ToolRegistry.get(slug)
    args = dict(variables or {})
    agent_id = args.get("agent_id")
    if slug == "run_agent_script":
        if not agent_id:
            raise ValueError("agent_id is required for run_agent_script")
        return _run_pinned_agent_script(args)
    schema = tool.args_schema.model_json_schema() if tool.args_schema else {}
    props = schema.get("properties", {})
    filtered = normalize_tool_args(tool, args)
    if not filtered and props:
        first_key = next(iter(props.keys()))
        if first_key == "report_type":
            filtered = {"report_type": args.get("batch") or args.get("report_type") or "summary"}
        elif first_key == "employee_id":
            filtered = {"employee_id": args.get("employee_id") or "1001"}
        elif first_key == "customer_id":
            filtered = {"customer_id": args.get("customer_id") or "C-001"}
        elif first_key == "agent_slug":
            filtered = {"agent_slug": args.get("agent_slug") or "invoice"}
        elif first_key == "storage_path":
            path = args.get("storage_path") or ""
            if not path:
                raise ValueError("فایل ورودی آپلود نشده است.")
            filtered = normalize_tool_args(tool, {"storage_path": path})

    from src.core.agent_tool_files import run_with_file_pipeline

    return run_with_file_pipeline(
        agent_id,
        slug,
        tool.invoke,
        args=filtered,
    )


def _run_pinned_agent_script(args: dict[str, Any]) -> dict[str, Any]:
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session

    from src.config import settings
    from src.core.agent_tool_files import lock_tool_storage_path
    from src.core.agent_workspace_files import canonical_workspace_download_url
    from src.models.agent import Agent
    from src.services.agent_script_service import run_agent_script_file

    agent_id = str(args["agent_id"])
    storage_path = str(args.get("storage_path") or "")
    if not storage_path:
        raise ValueError("storage_path is required for run_agent_script")
    locked = lock_tool_storage_path(agent_id, storage_path, tool_slug="run_agent_script")
    engine = create_engine(str(settings.database_url).replace("+asyncpg", ""))
    with Session(engine) as session:
        agent = session.execute(select(Agent).where(Agent.id == agent_id)).scalar_one_or_none()
        if not agent:
            raise ValueError("Agent not found")
        output = run_agent_script_file(
            agent,
            locked,
            script_slug=args.get("script_slug"),
            args=args.get("extra_args") if isinstance(args.get("extra_args"), dict) else None,
        )
    return {
        "output_file": output.name,
        "download_path": canonical_workspace_download_url(agent_id, output),
        "summary": "فایل با اسکریپت تأییدشده ایجنت پردازش شد.",
    }


def format_tool_results(results: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for data in results:
        if "error" in data:
            parts.append(json.dumps(data, ensure_ascii=False, indent=2))
            continue
        if "download_path" in data:
            parts.append(
                f"✅ گزارش آماده است.\n"
                f"📥 دانلود: {data['download_path']}\n"
                f"خلاصه: {data.get('summary', '')}"
            )
        elif "url" in data:
            parts.append(f"📥 دانلود: {data['url']}\n{json.dumps(data, ensure_ascii=False)}")
        else:
            parts.append(json.dumps(data, ensure_ascii=False, indent=2))
    return "\n\n".join(parts) if parts else "اقدام انجام شد."


def run_tool_chain(tool_slugs: list[str], variables: dict[str, Any] | None = None) -> str:
    vars_map = variables or {}
    results: list[dict[str, Any]] = []
    for slug in tool_slugs:
        try:
            results.append(run_tool_slug(slug, vars_map))
        except Exception as exc:
            results.append({"error": str(exc), "tool": slug})
    return format_tool_results(results)
