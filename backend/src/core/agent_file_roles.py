"""Filename-role helpers for agent attachments.

Roles may also live on ``AgentFile.role`` (nullable DB column). Filename
prefixes remain the backward-compatible source of truth for uploads that
predate the column.
"""

from __future__ import annotations

INSTRUCTION_FILE_PREFIX = "instruction__"
OUTPUT_SAMPLE_PREFIX = "output-sample__"
INPUT_SAMPLE_PREFIX = "input-sample__"

# Canonical role strings stored on AgentFile.role / config / meta.
ROLE_INSTRUCTION = "instruction"
ROLE_OUTPUT_SAMPLE = "output_sample"
ROLE_INPUT_SAMPLE = "input_sample"
ROLE_RUNTIME = "runtime"

VALID_ROLES = frozenset(
    {ROLE_INSTRUCTION, ROLE_OUTPUT_SAMPLE, ROLE_INPUT_SAMPLE, ROLE_RUNTIME}
)


def is_instruction_file(filename: str | None) -> bool:
    name = filename or ""
    return name.startswith(INSTRUCTION_FILE_PREFIX) or INSTRUCTION_FILE_PREFIX in name


def is_output_sample_file(filename: str | None) -> bool:
    name = filename or ""
    return name.startswith(OUTPUT_SAMPLE_PREFIX) or OUTPUT_SAMPLE_PREFIX in name


def is_input_sample_file(filename: str | None) -> bool:
    name = filename or ""
    return name.startswith(INPUT_SAMPLE_PREFIX) or INPUT_SAMPLE_PREFIX in name


def agent_file_role(filename: str | None, *, role: str | None = None) -> str:
    """Resolve role: explicit DB role wins when valid, else filename prefixes."""
    if role and role in VALID_ROLES:
        return role
    if is_instruction_file(filename):
        return ROLE_INSTRUCTION
    if is_output_sample_file(filename):
        return ROLE_OUTPUT_SAMPLE
    if is_input_sample_file(filename):
        return ROLE_INPUT_SAMPLE
    return ROLE_RUNTIME


def is_training_input_sample(filename: str | None, *, role: str | None = None) -> bool:
    """True for files used as verify/synth *input* samples (not instruction/output)."""
    r = agent_file_role(filename, role=role)
    return r in {ROLE_INPUT_SAMPLE, ROLE_RUNTIME} and r != ROLE_INSTRUCTION


def display_agent_filename(filename: str | None) -> str:
    name = filename or ""
    for prefix in (INSTRUCTION_FILE_PREFIX, OUTPUT_SAMPLE_PREFIX, INPUT_SAMPLE_PREFIX):
        if name.startswith(prefix):
            return name[len(prefix) :]
        # uuid_prefix__name storage form
        if prefix in name:
            idx = name.find(prefix)
            if idx >= 0:
                return name[idx + len(prefix) :]
    return name


def pair_id_from_filename(filename: str | None) -> str | None:
    """Optional pair tag: ``pairN__`` segment after role prefix, or ``pairN`` in stem."""
    import re

    name = display_agent_filename(filename)
    m = re.search(r"(?:^|[_\-])pair([a-zA-Z0-9]+)(?:[_\-]|$)", name, flags=re.I)
    if m:
        return f"pair{m.group(1)}"
    m2 = re.match(r"pair([a-zA-Z0-9]+)[_\-]", name, flags=re.I)
    if m2:
        return f"pair{m2.group(1)}"
    return None
