"""Wizard-time pinned scripts for deterministic file agents."""

from __future__ import annotations

import csv
import hashlib
import json
import py_compile
import re
import runpy
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from langchain_openai import ChatOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from src.core.agent_file_roles import is_instruction_file, is_output_sample_file
from src.core.agent_workspace_files import agent_workspace_root
from src.core import llm_runtime
from src.agents_lib.agent_factory import _supports_temperature
from src.models.agent import Agent, AgentKind
from src.models.agent_action import AgentAction
from src.models.agent_file import AgentFile

SCRIPT_IMPORT_ALLOWLIST = frozenset(
    {
        "__future__",
        "csv",
        "datetime",
        "decimal",
        "json",
        "math",
        "openpyxl",
        "pandas",
        "pathlib",
        "re",
        "shutil",
        "statistics",
        "typing",
        "jdatetime",
    }
)

# Admin-editable extra imports, hydrated from platform settings at startup so a
# new library can be allowed without a code edit.
SCRIPT_IMPORT_ALLOWLIST_KEY = "script_import_allowlist"
_EXTRA_ALLOWED_IMPORTS: set[str] = set()

# ponytail: fixed retry budget; bump only if synthesis proves flaky across many agents.
_REPAIR_ATTEMPTS = 2


def set_extra_allowed_imports(items) -> set[str]:
    global _EXTRA_ALLOWED_IMPORTS
    _EXTRA_ALLOWED_IMPORTS = {str(i).strip() for i in (items or []) if str(i).strip()}
    return set(_EXTRA_ALLOWED_IMPORTS)


def allowed_imports() -> frozenset[str]:
    return frozenset(SCRIPT_IMPORT_ALLOWLIST | _EXTRA_ALLOWED_IMPORTS)


async def hydrate_import_allowlist(db) -> set[str]:
    """Load admin-configured extra imports into the process cache."""
    from src.services.platform_settings_service import PlatformSettingsService

    value = await PlatformSettingsService(db).get_value(SCRIPT_IMPORT_ALLOWLIST_KEY)
    items = value.get("imports") if isinstance(value, dict) else None
    return set_extra_allowed_imports(items or [])

_SCRIPT_KEYWORDS = (
    "xlsx",
    "xls",
    "csv",
    "pdf",
    "parse",
    "transform",
    "decode",
    "generate",
    "merge",
    "calculate",
    "ستون",
    "اکسل",
    "فایل",
    "تبدیل",
    "محاسبه",
    "گزارش",
)


@dataclass(frozen=True)
class ScriptDecision:
    needed: bool
    reason: str
    confidence: str


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _kind(agent: Agent) -> str:
    return str(getattr(getattr(agent, "kind", None), "value", getattr(agent, "kind", "")))


def _slug(agent: Agent) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in (agent.slug or "agent_script")).strip("_")[:40] or "agent_script"


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def _mark_config_modified(agent: Agent) -> None:
    try:
        flag_modified(agent, "config_json")
    except Exception:
        pass


def _safe_script_path(agent: Agent, rel_path: str) -> Path:
    root = agent_workspace_root(agent.id)
    path = (root / rel_path).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise PermissionError("Script path escapes agent workspace") from exc
    if path.suffix != ".py":
        raise ValueError("Script must be a Python file")
    return path


def _xlsx_rows(path: Path) -> list[list[Any]]:
    wb = load_workbook(path, data_only=True)
    ws = wb[wb.sheetnames[0]]
    return [[cell for cell in row] for row in ws.iter_rows(values_only=True)]


def _csv_rows(path: Path) -> list[list[str]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.reader(f))


def _rows(path: Path) -> list[list[Any]]:
    if path.suffix.lower() == ".xlsx":
        return _xlsx_rows(path)
    if path.suffix.lower() == ".csv":
        return _csv_rows(path)
    return [path.read_text(encoding="utf-8", errors="replace").splitlines()]


def _rows_preview(path: Path, *, max_rows: int = 20, limit: int = 6000) -> str:
    """JSON preview of the first rows so the LLM sees the real data shape."""
    try:
        rows = _rows(path)[:max_rows]
    except Exception as exc:  # noqa: BLE001
        return f"(unreadable: {type(exc).__name__})"
    return json.dumps(rows, ensure_ascii=False, default=str)[:limit]


def _norm_cell(value: Any, *, ndigits: int) -> Any:
    """Normalize a cell for tolerant comparison (None==\"\", numbers rounded)."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        try:
            return round(float(value), ndigits)
        except (TypeError, ValueError, OverflowError):
            return value
    text = str(value).strip()
    if not text:
        return ""
    try:
        return round(float(text.replace(",", "").replace("٫", ".")), ndigits)
    except ValueError:
        return text


def verify_file_matches(actual: Path, expected: Path, *, ndigits: int = 2) -> None:
    """Tolerant verifier: rounds numbers, trims strings, gives a precise diff.

    Rejecting a correct script on cosmetic formatting (a trailing space, 3.10 vs
    3.1) is the main reason generated scripts fail validation, so compare
    normalized cells and report the first real mismatch for the repair loop.
    """
    if actual.suffix.lower() != expected.suffix.lower():
        raise ValueError(f"Output suffix mismatch: {actual.suffix} != {expected.suffix}")
    a_rows, e_rows = _rows(actual), _rows(expected)
    if len(a_rows) != len(e_rows):
        raise ValueError(
            f"Row count mismatch: produced {len(a_rows)} rows, expected {len(e_rows)}"
        )
    for r, (arow, erow) in enumerate(zip(a_rows, e_rows), start=1):
        if len(arow) != len(erow):
            raise ValueError(
                f"Row {r} has {len(arow)} columns, expected {len(erow)}"
            )
        for c, (av, ev) in enumerate(zip(arow, erow), start=1):
            if _norm_cell(av, ndigits=ndigits) != _norm_cell(ev, ndigits=ndigits):
                raise ValueError(
                    f"Cell mismatch at row {r}, col {c}: produced {av!r}, expected {ev!r}"
                )


def _script_source() -> str:
    return '''from pathlib import Path
from shutil import copy2


def main(input_path: Path, output_dir: Path, *, agent_id: str, args: dict) -> Path:
    """Return the primary output file."""
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / input_path.name
    copy2(input_path, output)
    return output
'''


def _parse_code(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:python)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _build_llm() -> ChatOpenAI | None:
    resolved = llm_runtime.resolve()
    if not resolved.api_key:
        return None
    kwargs: dict = {
        "model": resolved.model,
        "api_key": resolved.api_key,
        "timeout": 180,
        "max_retries": 1,
    }
    if _supports_temperature(resolved.model):
        kwargs["temperature"] = 0.1
    if resolved.base_url:
        kwargs["base_url"] = resolved.base_url
    if resolved.provider == "cursor":
        kwargs["use_responses_api"] = False
    return ChatOpenAI(**kwargs)


class AgentScriptService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def evaluate(self, agent: Agent) -> ScriptDecision:
        rows = await self._files(agent)
        has_output_sample = any(is_output_sample_file(r.filename) for r in rows)
        has_runtime_sample = any(
            not is_output_sample_file(r.filename) and not is_instruction_file(r.filename) for r in rows
        )
        caps = agent.capabilities or {}
        text = " ".join(
            [
                agent.name or "",
                agent.description or "",
                agent.system_prompt or "",
                json.dumps(agent.config_json.get("instruction_rules", []) if agent.config_json else [], ensure_ascii=False),
                " ".join(f.filename or "" for f in rows),
            ]
        ).lower()
        actions = await self._actions(agent)
        has_tool_chain = any(getattr(a, "tool_chain", None) for a in actions)
        worker = _kind(agent) in {AgentKind.WORKER.value, AgentKind.FILE_INTAKE.value, AgentKind.SPREADSHEET.value}

        if caps.get("file_upload_enabled") and has_output_sample and (has_runtime_sample or worker):
            return ScriptDecision(True, "file_upload + output-sample + worker/sample input", "high")
        if caps.get("file_upload_enabled") and worker and any(k in text for k in _SCRIPT_KEYWORDS):
            return ScriptDecision(True, "worker file upload + deterministic file keywords", "medium")
        if has_tool_chain and caps.get("file_upload_enabled") and any(k in text for k in _SCRIPT_KEYWORDS):
            return ScriptDecision(True, "file action tool_chain + deterministic file keywords", "medium")
        return ScriptDecision(False, "chat/API/routing agent or no deterministic file signal", "high")

    async def generate_if_needed(self, agent: Agent, *, use_llm: bool = False) -> dict[str, Any]:
        decision = await self.evaluate(agent)
        cfg = dict(agent.config_json or {})
        meta = dict(cfg.get("workspace_script") or {})
        meta.update(
            {
                "needed": decision.needed,
                "decision_reason": decision.reason,
                "confidence": decision.confidence,
                "language": "python",
            }
        )
        if not decision.needed:
            cfg["workspace_script"] = meta
            agent.config_json = cfg
            _mark_config_modified(agent)
            await self.db.flush()
            return meta

        slug = meta.get("slug") or f"process_{_slug(agent)}"
        rel = f"scripts/{slug}.py"
        path = _safe_script_path(agent, rel)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Real file workers get an LLM-synthesized script. Regenerate while
        # unverified so a stale copy-stub never lingers; once verified, keep it.
        regenerate = not path.exists() or (use_llm and not meta.get("verified_at"))
        if regenerate:
            source = await self._synthesize_script(agent) if use_llm else _script_source()
            if use_llm:
                try:
                    compile(source, "<agent_script>", "exec")  # noqa: S102
                except SyntaxError:
                    source = _script_source()
            path.write_text(source, encoding="utf-8")
        py_compile.compile(str(path), doraise=True)
        meta.update(
            {
                "slug": slug,
                "path": rel,
                "entrypoint": "main",
                "synthesized": bool(use_llm),
                "created_at": meta.get("created_at") or _now(),
            }
        )
        cfg["workspace_script"] = meta
        agent.config_json = cfg
        _mark_config_modified(agent)
        await self.db.flush()
        return meta

    async def verify(self, agent: Agent, *, use_llm: bool = False) -> dict[str, Any]:
        meta = await self.generate_if_needed(agent, use_llm=use_llm)
        if not meta.get("needed"):
            return meta
        input_file, output_sample = await self._sample_pair(agent)
        if not input_file or not output_sample:
            missing: list[str] = []
            if not input_file:
                missing.append("فایل نمونه ورودی (مرحله «فایل و سیاست»)")
            if not output_sample:
                missing.append("فایل نمونه خروجی (آیکن اکسل در دستورالعمل)")
            raise ValueError(
                "برای پردازش فایل، علاوه بر فایل دستورالعمل، "
                + " و ".join(missing)
                + " لازم است."
            )

        path = _safe_script_path(agent, str(meta.get("path") or ""))
        attempts = _REPAIR_ATTEMPTS if use_llm else 0
        last_err: Exception | None = None
        used = 0
        for used in range(attempts + 1):
            try:
                output = run_agent_script_file(agent, input_file, script_slug=meta.get("slug"))
                verify_file_matches(output, output_sample)
                last_err = None
                break
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                if not use_llm or used >= attempts:
                    break
                repaired = await self._synthesize_script(
                    agent,
                    feedback=f"{type(exc).__name__}: {exc}",
                    prior_code=path.read_text(encoding="utf-8") if path.is_file() else None,
                )
                path.write_text(repaired, encoding="utf-8")
                py_compile.compile(str(path), doraise=True)
        if last_err is not None:
            raise last_err

        cfg = dict(agent.config_json or {})
        meta = dict(cfg.get("workspace_script") or meta)
        meta.update(
            {"verified_at": _now(), "sample_hash": _sha(output_sample), "repair_attempts_used": used}
        )
        cfg["workspace_script"] = meta
        agent.config_json = cfg
        _mark_config_modified(agent)
        await self.db.flush()
        return meta

    async def _files(self, agent: Agent) -> list[AgentFile]:
        result = await self.db.execute(
            select(AgentFile).where(AgentFile.agent_id == agent.id).order_by(AgentFile.created_at.desc())
        )
        return list(result.scalars().all())

    async def _actions(self, agent: Agent) -> list[AgentAction]:
        result = await self.db.execute(select(AgentAction).where(AgentAction.agent_id == agent.id))
        return list(result.scalars().all())

    async def _sample_pair(self, agent: Agent) -> tuple[Path | None, Path | None]:
        input_path: Path | None = None
        output_path: Path | None = None
        for row in await self._files(agent):
            path = Path(row.storage_path)
            if not path.is_file():
                continue
            if is_output_sample_file(row.filename):
                output_path = output_path or path
            elif not is_instruction_file(row.filename):
                input_path = input_path or path
        return input_path, output_path

    async def _synthesize_script(
        self,
        agent: Agent,
        *,
        feedback: str | None = None,
        prior_code: str | None = None,
    ) -> str:
        input_path, output_path = await self._sample_pair(agent)
        llm = _build_llm()
        if not llm or not input_path or not output_path:
            return _script_source()
        cfg = agent.config_json or {}
        allowed = ", ".join(sorted(allowed_imports() - {"__future__"}))
        sys = (
            "Write a deterministic Python script for a Persian enterprise file agent. "
            "Return ONLY Python code. No markdown. "
            "The script must define exactly: "
            "def main(input_path: Path, output_dir: Path, *, agent_id: str, args: dict) -> Path. "
            "It must COMPUTE the output from the input data; never hardcode values or copy the "
            "reference output sample. Match the output sample's columns, row order, and formatting. "
            f"Allowed imports only: {allowed}. "
            "No network, subprocess, eval, exec, shell, or absolute paths."
        )
        user_parts = [
            f"Agent name: {agent.name}",
            f"Description: {agent.description or '—'}",
            f"Rules: {json.dumps(cfg.get('instruction_rules') or [], ensure_ascii=False)[:8000]}",
            f"Input sample filename: {input_path.name}",
            f"Input sample rows (preview): {_rows_preview(input_path)}",
            f"Output sample filename: {output_path.name}",
            f"Expected output rows (preview): {_rows_preview(output_path)}",
            "Write code that reads the runtime input file and writes the primary output file "
            "in output_dir, reproducing the expected output for this input.",
        ]
        if feedback:
            user_parts.append(
                "\nThe previous attempt FAILED verification with this error:\n"
                f"{feedback}\n"
                "Fix the script so its output matches the expected output exactly."
            )
        if prior_code:
            user_parts.append(f"\nPrevious script:\n{prior_code[:6000]}")
        try:
            result = await llm.ainvoke(
                [{"role": "system", "content": sys}, {"role": "user", "content": "\n".join(user_parts)}]
            )
            code = _parse_code(getattr(result, "content", None) or str(result))
            if "def main(" in code:
                return code
        except Exception:
            pass
        return prior_code or _script_source()


def _load_main(script_path: Path):
    source = script_path.read_text(encoding="utf-8")
    for bad in ("subprocess", "socket", "requests", "urllib", "http.client", "os.system", "eval(", "exec("):
        if bad in source:
            raise PermissionError(f"Script uses forbidden capability: {bad}")
    for line in source.splitlines():
        stripped = line.strip()
        if stripped.startswith("import ") or stripped.startswith("from "):
            root = stripped.split()[1].split(".", 1)[0]
            if root not in allowed_imports():
                raise PermissionError(f"Import not allowed: {root}")
    ns = runpy.run_path(str(script_path))
    main = ns.get("main")
    if not callable(main):
        raise ValueError("Script missing main(input_path, output_dir, *, agent_id, args)")
    return main


def run_agent_script_file(
    agent: Agent,
    input_path: Path,
    *,
    script_slug: str | None = None,
    args: dict | None = None,
) -> Path:
    meta = dict((agent.config_json or {}).get("workspace_script") or {})
    if not meta.get("needed"):
        raise ValueError("Agent has no pinned workspace script")
    if script_slug and script_slug != meta.get("slug"):
        raise PermissionError("Requested script_slug is not pinned for this agent")
    script_path = _safe_script_path(agent, str(meta.get("path") or ""))
    if not script_path.is_file():
        raise FileNotFoundError("Pinned script file not found")

    root = agent_workspace_root(agent.id)
    input_path = input_path.resolve()
    try:
        input_path.relative_to(root)
    except ValueError as exc:
        raise PermissionError("Input path escapes agent workspace") from exc

    output_dir = root / "output"

    def _execute() -> Path:
        out = _load_main(script_path)(
            input_path,
            output_dir,
            agent_id=str(agent.id),
            args=dict(args or {}),
        )
        out_path = Path(out).resolve()
        try:
            out_path.relative_to(root)
        except ValueError as exc:
            raise PermissionError("Script output escapes agent workspace") from exc
        if not out_path.is_file():
            raise FileNotFoundError("Script did not create output file")
        return out_path

    # ponytail: in-process runner; move to subprocess+rlimits when untrusted script complexity grows.
    return _execute()
