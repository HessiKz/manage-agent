"""Platform-wide agent tool file pipeline — lock input, enrich, finalize output.

Every file-backed tool should route through these helpers so runtime uploads,
output-sample references, and workspace downloads behave like the کارکرد agent.
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from uuid import UUID

from src.core.agent_file_roles import is_output_sample_file
from src.core.reference_workbook_enrichment import (
    enrich_workbook_from_reference,
    find_agent_output_sample,
)
from src.core.runtime_file_selection import resolve_locked_runtime_file

_SPREADSHEET_EXTS = frozenset({".xlsx", ".xls"})


def resolve_agent_reference_path(
    agent_id: str | UUID | None,
    reference_path: str | Path | None = None,
    *,
    tool_slug: str | None = None,
) -> Path | None:
    """Newest output-sample for agent, explicit path, or catalog bundled reference."""
    if reference_path:
        path = Path(reference_path)
        if path.is_file():
            return path.resolve()
    if agent_id:
        sample = find_agent_output_sample(str(agent_id))
        if sample:
            return sample
    return None


def lock_tool_storage_path(
    agent_id: str | UUID,
    storage_path_hint: str = "",
    *,
    tool_slug: str | None = None,
    extensions: tuple[str, ...] = (".xlsx", ".xls", ".pdf", ".csv", ".docx"),
) -> Path:
    """Resolve locked runtime upload; karkard keeps stricter raw-workbook rules."""
    if tool_slug == "karkard_process":
        from src.karkard.paths import resolve_locked_karkard_input

        return resolve_locked_karkard_input(agent_id, storage_path_hint)
    return resolve_locked_runtime_file(
        str(agent_id),
        storage_path_hint,
        extensions=extensions,
    )


def _is_spreadsheet(path: Path) -> bool:
    return path.suffix.lower() in _SPREADSHEET_EXTS


def prepare_tool_input_path(
    agent_id: str | UUID | None,
    input_path: Path,
    *,
    tool_slug: str | None = None,
) -> Path:
    """Gap-fill spreadsheet punches from output-sample before a tool runs."""
    input_path = input_path.resolve()
    if not agent_id or not _is_spreadsheet(input_path):
        return input_path
    ref = resolve_agent_reference_path(agent_id, tool_slug=tool_slug)
    if not ref:
        return input_path
    enriched = enrich_workbook_from_reference(input_path, ref)
    return enriched.resolve()


def finalize_workbook_output(
    agent_id: str | UUID | None,
    output_path: Path,
    *,
    tool_slug: str | None = None,
) -> Path:
    """Return processed spreadsheet path (already computed by the tool)."""
    return output_path.resolve()


def _resolve_output_path(result: dict, input_path: Path | None) -> Path | None:
    name = result.get("output_file") or result.get("filename")
    if name:
        candidate = Path(str(name))
        if candidate.is_file():
            return candidate.resolve()
        if input_path:
            beside = (input_path.parent / candidate.name).resolve()
            if beside.is_file():
                return beside
    for key in ("output_path", "path", "file"):
        raw = result.get(key)
        if raw:
            p = Path(str(raw))
            if p.is_file():
                return p.resolve()
    return None


def finalize_tool_result(
    agent_id: str | UUID | None,
    result: dict,
    *,
    tool_slug: str | None = None,
    input_path: Path | None = None,
) -> dict:
    """Post-process tool dict: align xlsx output and refresh workspace download URL."""
    if not agent_id or not isinstance(result, dict) or result.get("error"):
        return result

    out_path = _resolve_output_path(result, input_path)
    if not out_path:
        return result

    finalized = finalize_workbook_output(agent_id, out_path, tool_slug=tool_slug)
    if finalized != out_path:
        result = dict(result)

    from src.core.agent_workspace_files import (
        canonical_workspace_download_url,
        mirror_output_to_workspace,
    )

    kind = "karkard" if tool_slug == "karkard_process" else "output"
    if tool_slug == "karkard_process":
        from src.core.agent_workspace_files import mirror_karkard_output_to_workspace

        mirrored = mirror_karkard_output_to_workspace(agent_id, finalized)
    else:
        mirrored = mirror_output_to_workspace(agent_id, finalized, kind=kind)

    url = canonical_workspace_download_url(agent_id, mirrored)
    if url:
        result["download_path"] = url
        result["output_file"] = mirrored.name
    return result


def run_with_file_pipeline(
    agent_id: str | UUID | None,
    tool_slug: str,
    invoke,
    *,
    args: dict,
) -> dict:
    """Wrap a tool invoke: lock path → prepare input → run → finalize output."""
    locked: Path | None = None
    if agent_id and args.get("storage_path"):
        locked = lock_tool_storage_path(agent_id, str(args["storage_path"]), tool_slug=tool_slug)
        prepared = prepare_tool_input_path(agent_id, locked, tool_slug=tool_slug)
        if prepared.resolve() != locked.resolve():
            args = {**args, "storage_path": str(prepared)}
            locked = prepared
        else:
            args = {**args, "storage_path": str(locked)}

    result = invoke(args)
    if not isinstance(result, dict):
        result = {"result": result}

    return finalize_tool_result(
        agent_id,
        result,
        tool_slug=tool_slug,
        input_path=locked,
    )


def tool_accepts_storage_path(tool) -> bool:
    schema = getattr(tool, "args_schema", None)
    fields = getattr(schema, "model_fields", None)
    return bool(fields and "storage_path" in fields)


def wrap_tool_with_file_pipeline(slug: str, tool):
    """LangChain tool wrapper — routes file-backed tools through run_tool_slug."""
    if not tool_accepts_storage_path(tool):
        return tool
    from langchain_core.tools import StructuredTool

    schema = tool.args_schema

    def _invoke(**kwargs):
        from src.demo.tool_runner import run_tool_slug

        return run_tool_slug(slug, kwargs)

    return StructuredTool.from_function(
        func=_invoke,
        name=tool.name,
        description=tool.description or "",
        args_schema=schema,
    )
