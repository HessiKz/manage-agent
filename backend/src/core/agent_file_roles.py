"""Filename-role helpers for agent attachments.

The current storage model has no explicit file category column, so wizard-only
files are tagged with stable filename prefixes before upload.
"""

from __future__ import annotations

INSTRUCTION_FILE_PREFIX = "instruction__"
OUTPUT_SAMPLE_PREFIX = "output-sample__"


def is_instruction_file(filename: str | None) -> bool:
    name = filename or ""
    return name.startswith(INSTRUCTION_FILE_PREFIX) or INSTRUCTION_FILE_PREFIX in name


def is_output_sample_file(filename: str | None) -> bool:
    name = filename or ""
    return name.startswith(OUTPUT_SAMPLE_PREFIX) or OUTPUT_SAMPLE_PREFIX in name


def agent_file_role(filename: str | None) -> str:
    if is_instruction_file(filename):
        return "instruction"
    if is_output_sample_file(filename):
        return "output_sample"
    return "runtime"


def display_agent_filename(filename: str | None) -> str:
    name = filename or ""
    for prefix in (INSTRUCTION_FILE_PREFIX, OUTPUT_SAMPLE_PREFIX):
        if name.startswith(prefix):
            return name[len(prefix) :]
    return name
