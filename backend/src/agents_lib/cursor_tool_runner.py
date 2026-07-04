"""Direct tool execution when the cursor-to-api provider is active.

LangGraph ReAct expects OpenAI function-calling; cursor-to-api wraps the Cursor
agent CLI and only exposes plain chat completions. We run manage-agent tools
locally and format Persian user-facing answers from structured tool output.
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from langchain_core.tools import BaseTool

from src.agents_lib.execution_trace import AgentRunResult, numbered_trace, trace_step
from src.agents_lib.tool_registry import ToolRegistry
from src.core import llm_runtime
from src.models.agent import Agent


def _truncate(value: str, limit: int = 1200) -> str:
    value = (value or "").strip()
    if len(value) <= limit:
        return value
    return value[: limit - 1] + "…"


def _is_validation_run(user_input: str) -> bool:
    return "automatic validation" in user_input.lower()


def _extract_json_object(text: str) -> str | None:
    if not text.startswith("{"):
        return None
    depth = 0
    for i, ch in enumerate(text):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[: i + 1]
    return None


def extract_tool_context(user_input: str) -> dict[str, Any]:
    """Pull tool args from JSON blocks and orchestrator file-context lines."""
    ctx: dict[str, Any] = {}

    marker = "Context for tools"
    if marker in user_input:
        rest = user_input.split(marker, 1)[1]
        brace = rest.find("{")
        if brace >= 0:
            blob = _extract_json_object(rest[brace:])
            if blob:
                try:
                    parsed = json.loads(blob)
                    if isinstance(parsed, dict):
                        ctx.update(parsed)
                except json.JSONDecodeError:
                    pass

    if not ctx:
        for match in re.finditer(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", user_input, re.DOTALL):
            try:
                parsed = json.loads(match.group())
                if isinstance(parsed, dict):
                    ctx.update(parsed)
                    break
            except json.JSONDecodeError:
                continue

    for pattern in (
        r'storage_path="([^"]+)"',
        r"storage_path='([^']+)'",
        r"storage_path=(\S+)",
    ):
        path_match = re.search(pattern, user_input)
        if path_match and "storage_path" not in ctx:
            ctx["storage_path"] = path_match.group(1).rstrip(".,;")
            break

    agent_match = re.search(r'agent_id="([^"]+)"', user_input)
    if agent_match and "agent_id" not in ctx:
        ctx["agent_id"] = agent_match.group(1)

    return ctx


def _infer_role_from_text(text: str) -> str | None:
    lower = text.lower()
    if any(k in lower for k in ("بک‌اند", "backend", "back-end", "back end")):
        return "Backend Engineer"
    if any(k in lower for k in ("فرانت", "frontend", "front-end")):
        return "Frontend Engineer"
    if any(k in lower for k in ("devops", "دواپس")):
        return "DevOps Engineer"
    return None


_TOOL_KEYWORDS: dict[str, tuple[str, ...]] = {
    "resume_screen": ("رزومه", "resume", "cv", "غربال", "screen", "کاندید", "مصاحبه"),
    "report_generate": ("فیش", "گزارش", "report", "pdf", "حقوق", "payroll", "payslip", "فاکتور"),
    "karkard_process": ("کارکرد", "karkard", "اکسل", "xlsx", "spreadsheet"),
    "hr_lookup": ("پرسنل", "کارمند", "employee", "hr", "حقوق پرسنل"),
    "budget_lookup": ("بودجه", "budget", "هزینه"),
    "crm_lookup": ("crm", "مشتری", "customer", "تیکت"),
}


_STOPWORDS = frozenset(
    {"the", "and", "for", "with", "from", "this", "that", "tool", "use", "used",
     "run", "data", "file", "files", "input", "output", "based", "given", "into",
     "your", "you", "are", "via", "lookup", "process", "generate"}
)


def _keyword_hints(name: str) -> tuple[str, ...]:
    """Keywords for a tool: static map first, else derived from name/description.

    Lets brand-new tools be selectable on the cursor fallback path without
    editing _TOOL_KEYWORDS — native FC handles selection on the primary path.
    """
    static = _TOOL_KEYWORDS.get(name)
    if static:
        return static
    tokens: set[str] = set(re.split(r"[_\s]+", name.lower()))
    try:
        desc = (ToolRegistry.get(name).description or "").lower()
    except KeyError:
        desc = ""
    tokens.update(re.findall(r"[a-zA-Z\u0600-\u06FF]{3,}", desc))
    return tuple(t for t in tokens if t and t not in _STOPWORDS)


def select_tools_for_request(user_input: str, tool_names: list[str]) -> list[str]:
    """Pick which registered tools to run — never blast every tool on each message."""
    if not tool_names:
        return []

    explicit = re.search(
        r"calling these tools via function calling:\s*([^.\\n]+)",
        user_input,
        re.IGNORECASE,
    )
    if explicit:
        listed = [t.strip() for t in explicit.group(1).split(",") if t.strip()]
        chosen = [t for t in listed if t in tool_names]
        if chosen:
            return chosen

    lower = user_input.lower()

    if _is_validation_run(user_input):
        if "must call resume_screen" in lower or "resume_screen" in lower:
            if "resume_screen" in tool_names:
                return ["resume_screen"]
        if any(w in lower for w in ("report_generate", "فیش", "گزارش", "pdf")):
            if "report_generate" in tool_names:
                return ["report_generate"]
        if "karkard_process" in tool_names and any(w in lower for w in ("karkard", "کارکرد", "file")):
            return ["karkard_process"]
        return []

    scores: dict[str, int] = {}
    for name in tool_names:
        for kw in _keyword_hints(name):
            if kw in lower:
                scores[name] = scores.get(name, 0) + 1

    if scores:
        best = max(scores.values())
        return [n for n, s in scores.items() if s == best]

    if len(tool_names) == 1:
        return tool_names

    return []


def _default_args(tool_name: str, ctx: dict[str, Any], user_input: str) -> dict[str, Any]:
    lower = user_input.lower()
    if tool_name == "resume_screen":
        role = str(ctx.get("role", "")).strip() or (_infer_role_from_text(user_input) or "")
        if not role or role.lower() in {"sample", "python", "test"}:
            role = "Backend Engineer"
        return {"role": role, "min_score": int(ctx.get("min_score", 6))}
    if tool_name == "report_generate":
        report_type = str(ctx.get("report_type", "")).strip()
        if not report_type:
            if any(w in lower for w in ("فیش", "payslip")):
                report_type = "payslip"
            elif any(w in lower for w in ("فاکتور", "invoice")):
                report_type = "invoice"
            else:
                report_type = "payroll"
        period = ctx.get("period") or ctx.get("jalali_year") or "1404/12"
        if isinstance(period, int):
            period = f"{period}/12"
        return {"report_type": str(report_type), "period": str(period)}
    if tool_name == "karkard_process":
        args: dict[str, Any] = {}
        if ctx.get("storage_path"):
            args["storage_path"] = ctx["storage_path"]
        if ctx.get("agent_id"):
            args["agent_id"] = str(ctx["agent_id"])
        if ctx.get("jalali_year") is not None:
            args["jalali_year"] = int(ctx["jalali_year"])
        if ctx.get("company_name"):
            args["company_name"] = ctx["company_name"]
        return args
    if tool_name == "hr_lookup":
        return {"employee_id": str(ctx.get("employee_id", "E-1001"))}
    if tool_name == "budget_lookup":
        return {"agent_slug": str(ctx.get("agent_slug", ctx.get("slug", "agent")))}
    if tool_name == "crm_lookup":
        return {"customer_id": str(ctx.get("customer_id", "C-001"))}
    return {k: v for k, v in ctx.items() if not str(k).startswith("_")}


def build_tool_args(tool: BaseTool, tool_name: str, ctx: dict[str, Any], user_input: str) -> dict[str, Any]:
    defaults = _default_args(tool_name, ctx, user_input)
    schema = getattr(tool, "args_schema", None)
    if not schema or not hasattr(schema, "model_fields"):
        return defaults

    out: dict[str, Any] = dict(defaults)
    for field_name in schema.model_fields:
        if field_name in ctx and field_name not in out:
            out[field_name] = ctx[field_name]
    if tool_name == "resume_screen":
        role = str(out.get("role", "")).strip()
        if not role or role.lower() in {"sample", "python", "test"}:
            out["role"] = _infer_role_from_text(user_input) or "Backend Engineer"
    return out


async def _invoke_tool(tool_name: str, args: dict[str, Any]) -> Any:
    from src.demo.tool_runner import run_tool_slug

    return await asyncio.to_thread(run_tool_slug, tool_name, args)


def format_tool_output(tool_name: str, result: Any, *, validation: bool) -> str:
    if validation:
        if isinstance(result, dict) and result.get("summary"):
            return str(result["summary"])[:200]
        if tool_name == "resume_screen" and isinstance(result, dict):
            return (
                f"{result.get('shortlisted_count', 0)}/{result.get('total_resumes', 0)} passed"
            )
        return "OK"

    if not isinstance(result, dict):
        return str(result)

    if tool_name == "resume_screen":
        role = result.get("role", "")
        lines = [
            f"غربالگری رزومه برای نقش «{role}» انجام شد.",
            f"{result.get('shortlisted_count', 0)} نفر از {result.get('total_resumes', 0)} "
            f"کاندید حداقل امتیاز {result.get('threshold', 6)} را کسب کردند.",
            "",
        ]
        for i, c in enumerate(result.get("shortlisted") or [], 1):
            skills = "، ".join(c.get("top_skills") or [])[:80]
            lines.append(
                f"{i}. {c.get('name', '—')} — امتیاز {c.get('score', 0)}/12 "
                f"({c.get('category', '')})"
                + (f" · {skills}" if skills else "")
            )
        if result.get("next_step"):
            lines.extend(["", str(result["next_step"])])
        return "\n".join(lines)

    if tool_name.startswith("platform_") or tool_name == "crm_lookup":
        from src.agents_lib.platform_support_grounding import format_platform_tool_result

        payload = dict(result)
        payload["_tool"] = tool_name
        grounded = format_platform_tool_result(payload)
        if grounded:
            return grounded

    summary = result.get("summary")
    download = result.get("download_path")
    message = result.get("message")
    parts: list[str] = []
    if message:
        parts.append(str(message))
    if summary:
        parts.append(str(summary))
    if download:
        parts.append(f"دانلود: {download}")
    if parts:
        return "\n\n".join(parts)

    return json.dumps(result, ensure_ascii=False)[:2000]


async def run_cursor_tools_agent(
    agent: Agent,
    user_input: str,
    history: list[dict] | None,
    *,
    tool_names: list[str],
) -> AgentRunResult | None:
    """Execute selected tools directly. Returns None when plain chat should run instead."""
    resolved = llm_runtime.resolve(agent.model_name)
    selected = select_tools_for_request(user_input, tool_names)
    if not selected:
        return None

    ctx = extract_tool_context(user_input)
    if not ctx.get("agent_id"):
        ctx["agent_id"] = str(getattr(agent, "id", ""))
    ctx.setdefault("agent_slug", agent.slug)

    # Drop tools that still lack required args (e.g. karkard without uploaded file path).
    runnable: list[str] = []
    for name in selected:
        tool = ToolRegistry.get(name)
        args = build_tool_args(tool, name, ctx, user_input)
        if name == "karkard_process" and not args.get("storage_path"):
            continue
        runnable.append(name)
    selected = runnable
    if not selected:
        return None

    validation = _is_validation_run(user_input)
    trace: list[dict[str, Any]] = [
        trace_step(
            "llm_config",
            "پیکربندی مدل (cursor + ابزار محلی)",
            detail=f"{resolved.provider} · {resolved.model} · direct tools",
        ),
        trace_step("user_input", "ورودی", detail=_truncate(user_input, 800)),
        trace_step(
            "llm_request",
            "اجرای مستقیم ابزارها",
            detail=f"ابزارها: {', '.join(selected)}",
            payload={"tools": selected, "mode": "cursor_direct"},
        ),
    ]

    segments: list[str] = []
    for name in selected:
        tool = ToolRegistry.get(name)
        args = build_tool_args(tool, name, ctx, user_input)
        if ctx.get("agent_id") and "agent_id" not in args:
            args["agent_id"] = str(ctx["agent_id"])
        trace.append(
            trace_step(
                "tool_call",
                f"فراخوانی ابزار: {name}",
                detail=_truncate(json.dumps(args, ensure_ascii=False), 600),
                payload={"tool": name, "args": args},
            )
        )
        try:
            result = await _invoke_tool(name, args)
        except Exception as exc:  # noqa: BLE001
            trace.append(
                trace_step(
                    "tool_result",
                    f"خطای ابزار: {name}",
                    detail=f"{type(exc).__name__}: {exc}",
                    payload={"tool": name, "error": True},
                )
            )
            raise
        formatted = format_tool_output(name, result, validation=validation)
        trace.append(
            trace_step(
                "tool_result",
                f"نتیجه ابزار: {name}",
                detail=_truncate(formatted, 1200),
                payload={"tool": name},
            )
        )
        segments.append(formatted)

    output = "\n\n".join(segments).strip()
    trace.append(
        trace_step("llm_response", "پاسخ نهایی", detail=_truncate(output, 1200))
    )

    return AgentRunResult(
        output=output or "انجام شد.",
        trace=numbered_trace(trace),
        llm_provider=resolved.provider,
        model_name=resolved.model,
    )
