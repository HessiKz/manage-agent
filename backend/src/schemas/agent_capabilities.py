"""Agent kind presets and capability schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

from src.models.agent import AgentKind, canonical_agent_kind
from src.models.agent_link import AgentLinkType


class AgentCapabilities(BaseModel):
    chat_enabled: bool = True
    file_upload_enabled: bool = False
    actions_enabled: bool = False
    templates_enabled: bool = False
    can_call_agents: bool = False
    supervisor_enabled: bool = False
    external_apis_enabled: bool = False


class AgentFilePolicy(BaseModel):
    min_files: int = Field(1, ge=0, le=10000)
    max_files: int = Field(100, ge=1, le=10000)
    max_file_size_mb: int = Field(25, ge=1, le=500)
    max_total_size_mb: int = Field(500, ge=1, le=50000)
    allowed_mime_types: list[str] = Field(default_factory=lambda: ["application/pdf", "text/plain", "text/csv"])
    allowed_extensions: list[str] = Field(default_factory=lambda: [".pdf", ".txt", ".csv"])
    require_files_to_invoke: bool = False
    auto_ingest_to_rag: bool = True
    allow_all_types: bool = False

    @model_validator(mode="after")
    def validate_ranges(self) -> AgentFilePolicy:
        if self.min_files > self.max_files:
            raise ValueError("min_files must be <= max_files")
        if self.max_file_size_mb > self.max_total_size_mb:
            raise ValueError("max_file_size_mb must be <= max_total_size_mb")
        return self


class AgentLinkPolicy(BaseModel):
    max_depth: int = Field(3, ge=1, le=5)
    default_requires_user_permission: bool = True


KIND_PRESETS: dict[AgentKind, AgentCapabilities] = {
    AgentKind.CHAT: AgentCapabilities(
        chat_enabled=True,
        file_upload_enabled=False,
        actions_enabled=False,
        templates_enabled=False,
        can_call_agents=False,
        supervisor_enabled=False,
    ),
    AgentKind.WORKER: AgentCapabilities(
        chat_enabled=False,
        file_upload_enabled=False,
        actions_enabled=True,
        templates_enabled=False,
        can_call_agents=False,
        supervisor_enabled=False,
    ),
    AgentKind.SUPERVISOR: AgentCapabilities(
        chat_enabled=True,
        file_upload_enabled=False,
        actions_enabled=False,
        templates_enabled=False,
        can_call_agents=False,
        supervisor_enabled=True,
    ),
    AgentKind.CUSTOM: AgentCapabilities(
        supervisor_enabled=False,
    ),
}


def clamp_capabilities_for_kind(kind: AgentKind, caps: AgentCapabilities | dict) -> dict:
    """Enforce per-kind capability locks (worker ≠ supervisor, etc.)."""
    if isinstance(caps, AgentCapabilities):
        data = caps.model_dump()
    else:
        data = dict(caps)

    canonical = canonical_agent_kind(kind)
    preset = KIND_PRESETS.get(canonical, AgentCapabilities()).model_dump()
    merged = {**preset, **{k: v for k, v in data.items() if v is not None}}

    if canonical != AgentKind.SUPERVISOR:
        merged["supervisor_enabled"] = False

    if canonical == AgentKind.WORKER:
        merged["chat_enabled"] = False
        merged["can_call_agents"] = False
        merged["templates_enabled"] = False

    if canonical == AgentKind.SUPERVISOR:
        merged["supervisor_enabled"] = True
        merged["chat_enabled"] = True
        merged["can_call_agents"] = False
        merged["actions_enabled"] = False
        merged["templates_enabled"] = False

    if merged.get("supervisor_enabled"):
        merged["can_call_agents"] = False

    return merged


def capabilities_for_kind(kind: AgentKind, overrides: dict | None = None) -> dict:
    canonical = canonical_agent_kind(kind)
    base = KIND_PRESETS.get(canonical, AgentCapabilities()).model_dump()
    if overrides:
        base.update({k: v for k, v in overrides.items() if v is not None})
    return clamp_capabilities_for_kind(kind, base)


# Capability-driven file policies (not separate agent kinds).
FILE_POLICY_BULK_INTAKE = AgentFilePolicy(
    min_files=10,
    max_files=1000,
    max_file_size_mb=25,
    max_total_size_mb=5000,
    require_files_to_invoke=True,
)

FILE_POLICY_SPREADSHEET = AgentFilePolicy(
    min_files=1,
    max_files=20,
    max_file_size_mb=25,
    max_total_size_mb=200,
    require_files_to_invoke=False,
    allowed_mime_types=[
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
    ],
    allowed_extensions=[".xlsx", ".xls"],
    auto_ingest_to_rag=False,
)


class IoFilePolicy(BaseModel):
    """Per-agent file policy split into input and output roles.

    Stored as a single JSONB column on Agent.file_policy with shape
    {"input": {...}, "output": {...}}. Legacy flat shapes are interpreted
    as the input policy by resolve_io_policies.
    """

    input: AgentFilePolicy = Field(default_factory=AgentFilePolicy)
    output: AgentFilePolicy = Field(default_factory=AgentFilePolicy)

    @model_validator(mode="after")
    def validate_input_output_ranges(self) -> IoFilePolicy:
        self.input.validate_ranges()
        self.output.validate_ranges()
        return self


FILE_POLICY_LOOSE = AgentFilePolicy(
    min_files=0,
    max_files=20,
    max_file_size_mb=50,
    max_total_size_mb=500,
    allowed_mime_types=[],
    allowed_extensions=[],
    require_files_to_invoke=False,
    auto_ingest_to_rag=True,
    allow_all_types=True,
)

FILE_POLICY_DOCS_OUTPUT = AgentFilePolicy(
    min_files=0,
    max_files=20,
    max_file_size_mb=50,
    max_total_size_mb=500,
    allowed_mime_types=[
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "application/pdf",
        "text/plain",
        "text/csv",
    ],
    allowed_extensions=[".xlsx", ".xls", ".docx", ".doc", ".pdf", ".txt", ".csv"],
    require_files_to_invoke=False,
    auto_ingest_to_rag=False,
)


def file_policy_for_kind(kind: AgentKind, overrides: dict | None = None) -> dict:
    """Per-kind I/O file-policy preset container.

    Returns a dict shaped {"input": {...}, "output": {...}}. A legacy flat
    override dict is interpreted as the input policy (backward-compat).
    """
    canonical = canonical_agent_kind(kind)
    if canonical == AgentKind.CHAT:
        io = IoFilePolicy(input=FILE_POLICY_LOOSE, output=FILE_POLICY_DOCS_OUTPUT)
    elif canonical == AgentKind.WORKER:
        io = IoFilePolicy(input=FILE_POLICY_BULK_INTAKE, output=FILE_POLICY_DOCS_OUTPUT)
    elif canonical == AgentKind.SUPERVISOR:
        io = IoFilePolicy()
    else:
        io = IoFilePolicy()
    return _apply_io_overrides(io, overrides)


def _apply_io_overrides(io: IoFilePolicy, overrides: dict | None) -> dict:
    if not overrides:
        return io.model_dump()
    if isinstance(overrides.get("input"), dict) or isinstance(overrides.get("output"), dict):
        inp = AgentFilePolicy.model_validate(overrides.get("input") or io.input.model_dump())
        out = AgentFilePolicy.model_validate(overrides.get("output") or io.output.model_dump())
        return IoFilePolicy(input=inp, output=out).model_dump()
    inp = AgentFilePolicy.model_validate({**io.input.model_dump(), **overrides})
    return IoFilePolicy(input=inp, output=io.output).model_dump()


def file_policy_for_capabilities(
    caps: AgentCapabilities | dict,
    *,
    tool_names: list[str] | None = None,
    overrides: dict | None = None,
) -> dict:
    if isinstance(caps, dict):
        caps = AgentCapabilities.model_validate(caps)
    base = AgentFilePolicy().model_dump()
    if caps.file_upload_enabled:
        if tool_names and "run_agent_script" in tool_names:
            base = FILE_POLICY_SPREADSHEET.model_dump()
        elif caps.actions_enabled is False and caps.chat_enabled is False:
            base = FILE_POLICY_BULK_INTAKE.model_dump()
    if overrides:
        base.update({k: v for k, v in overrides.items() if v is not None})
    return base
