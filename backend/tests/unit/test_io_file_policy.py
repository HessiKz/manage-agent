"""Per-kind I/O file-policy split: presets, legacy compat, role routing."""

from types import SimpleNamespace
from typing import Any

import pytest

from src.core.agent_file_roles import OUTPUT_SAMPLE_PREFIX
from src.core.file_policy import resolve_io_policies, validate_upload
from src.schemas.agent_capabilities import (
    AgentFilePolicy,
    FILE_POLICY_BULK_INTAKE,
    FILE_POLICY_DOCS_OUTPUT,
    FILE_POLICY_LOOSE,
    IoFilePolicy,
    file_policy_for_kind,
)


class _FakeDb:
    """Stub AsyncSession: count_agent_files returns zero/zero."""

    async def execute(self, *args: Any, **kwargs: Any) -> SimpleNamespace:
        return SimpleNamespace(one=lambda: (0, 0))


def _agent(file_policy: dict) -> SimpleNamespace:
    return SimpleNamespace(
        id="00000000-0000-0000-0000-000000000000",
        kind="chat",
        capabilities={"chat_enabled": True, "file_upload_enabled": True},
        config_json={},
        file_policy=file_policy,
    )


def _validate_upload(file_policy: dict, filename: str, mime: str = "x") -> Any:
    return validate_upload(
        _FakeDb(), _agent(file_policy), filename=filename, mime_type=mime, size_bytes=10
    )


# --- file_policy_for_kind: distinct per-kind presets ---


def test_file_policy_for_kind_chat_is_loose_in_docs_out():
    io = file_policy_for_kind("chat")
    assert io["input"] == FILE_POLICY_LOOSE.model_dump()
    assert io["input"]["allow_all_types"] is True
    assert io["output"] == FILE_POLICY_DOCS_OUTPUT.model_dump()


def test_file_policy_for_kind_worker_is_bulk_intake_in():
    io = file_policy_for_kind("worker")
    assert io["input"] == FILE_POLICY_BULK_INTAKE.model_dump()
    assert io["input"]["require_files_to_invoke"] is True
    assert io["output"] == FILE_POLICY_DOCS_OUTPUT.model_dump()


def test_file_policy_for_kind_supervisor_uses_defaults():
    io = file_policy_for_kind("supervisor")
    assert io["input"] == AgentFilePolicy().model_dump()
    assert io["output"] == AgentFilePolicy().model_dump()


def test_file_policy_for_kind_custom_uses_defaults():
    io = file_policy_for_kind("custom")
    assert io["input"] == AgentFilePolicy().model_dump()
    assert io["output"] == AgentFilePolicy().model_dump()


def test_file_policy_for_kind_legacy_kind_maps():
    io = file_policy_for_kind("spreadsheet")
    assert io["input"] == FILE_POLICY_BULK_INTAKE.model_dump()


# --- resolve_io_policies: legacy flat vs new shape ---


def test_resolve_io_policies_legacy_flat_maps_to_input():
    flat = {"allowed_extensions": [".pdf"], "allowed_mime_types": ["application/pdf"]}
    inp, out = resolve_io_policies(_agent(flat))
    assert inp.allowed_extensions == [".pdf"]
    assert out == AgentFilePolicy()


def test_resolve_io_policies_new_shape_parses_both():
    new = {
        "input": {"allowed_extensions": [".csv"], "allow_all_types": True},
        "output": {"allowed_extensions": [".xlsx"]},
    }
    inp, out = resolve_io_policies(_agent(new))
    assert inp.allowed_extensions == [".csv"]
    assert inp.allow_all_types is True
    assert out.allowed_extensions == [".xlsx"]


def test_resolve_io_policies_empty_defaults():
    inp, out = resolve_io_policies(_agent({}))
    assert inp == AgentFilePolicy()
    assert out == AgentFilePolicy()


# --- validate_upload routes by role ---


async def test_output_sample_passes_when_only_output_allows_exe():
    # Input policy rejects exe; output policy allows all.
    file_policy = IoFilePolicy(
        input=AgentFilePolicy(allowed_extensions=[".pdf"], allow_all_types=False),
        output=AgentFilePolicy(allow_all_types=True),
    ).model_dump()
    # Should not raise: role = output (prefix on filename).
    await _validate_upload(file_policy, f"{OUTPUT_SAMPLE_PREFIX}report.exe", mime="application/x-msdownload")


async def test_bare_exe_rejected_by_input_only_text_policy():
    file_policy = IoFilePolicy(
        input=AgentFilePolicy(allowed_extensions=[".txt"], allow_all_types=False),
        output=AgentFilePolicy(allow_all_types=True),
    ).model_dump()
    with pytest.raises(Exception):
        await _validate_upload(file_policy, "bad.exe", mime="application/x-msdownload")


async def test_legacy_flat_exe_rejected():
    flat = {"allowed_extensions": [".txt"], "allow_all_types": False}
    with pytest.raises(Exception):
        await _validate_upload(flat, "bad.exe", mime="application/x-msdownload")
"""Per-kind I/O file-policy split: presets, legacy compat, role routing."""

from types import SimpleNamespace
from typing import Any

import pytest

from src.core.agent_file_roles import OUTPUT_SAMPLE_PREFIX
from src.core.file_policy import resolve_io_policies, validate_upload
from src.schemas.agent_capabilities import (
    AgentFilePolicy,
    FILE_POLICY_BULK_INTAKE,
    FILE_POLICY_DOCS_OUTPUT,
    FILE_POLICY_LOOSE,
    IoFilePolicy,
    file_policy_for_kind,
)


class _FakeDb:
    """Stub AsyncSession: count_agent_files returns zero/zero."""

    async def execute(self, *args: Any, **kwargs: Any) -> SimpleNamespace:
        return SimpleNamespace(one=lambda: (0, 0))


def _agent(file_policy: dict) -> SimpleNamespace:
    return SimpleNamespace(
        id="00000000-0000-0000-0000-000000000000",
        kind="chat",
        capabilities={"chat_enabled": True, "file_upload_enabled": True},
        config_json={},
        file_policy=file_policy,
    )


def _validate_upload(file_policy: dict, filename: str, mime: str = "x") -> Any:
    return validate_upload(
        _FakeDb(), _agent(file_policy), filename=filename, mime_type=mime, size_bytes=10
    )


# --- file_policy_for_kind: distinct per-kind presets ---


def test_file_policy_for_kind_chat_is_loose_in_docs_out():
    io = file_policy_for_kind("chat")
    assert io["input"] == FILE_POLICY_LOOSE.model_dump()
    assert io["input"]["allow_all_types"] is True
    assert io["output"] == FILE_POLICY_DOCS_OUTPUT.model_dump()


def test_file_policy_for_kind_worker_is_bulk_intake_in():
    io = file_policy_for_kind("worker")
    assert io["input"] == FILE_POLICY_BULK_INTAKE.model_dump()
    assert io["input"]["require_files_to_invoke"] is True
    assert io["output"] == FILE_POLICY_DOCS_OUTPUT.model_dump()


def test_file_policy_for_kind_supervisor_uses_defaults():
    io = file_policy_for_kind("supervisor")
    assert io["input"] == AgentFilePolicy().model_dump()
    assert io["output"] == AgentFilePolicy().model_dump()


def test_file_policy_for_kind_custom_uses_defaults():
    io = file_policy_for_kind("custom")
    assert io["input"] == AgentFilePolicy().model_dump()
    assert io["output"] == AgentFilePolicy().model_dump()


def test_file_policy_for_kind_legacy_kind_maps():
    io = file_policy_for_kind("spreadsheet")
    assert io["input"] == FILE_POLICY_BULK_INTAKE.model_dump()


# --- resolve_io_policies: legacy flat vs new shape ---


def test_resolve_io_policies_legacy_flat_maps_to_input():
    flat = {"allowed_extensions": [".pdf"], "allowed_mime_types": ["application/pdf"]}
    inp, out = resolve_io_policies(_agent(flat))
    assert inp.allowed_extensions == [".pdf"]
    assert out == AgentFilePolicy()


def test_resolve_io_policies_new_shape_parses_both():
    new = {
        "input": {"allowed_extensions": [".csv"], "allow_all_types": True},
        "output": {"allowed_extensions": [".xlsx"]},
    }
    inp, out = resolve_io_policies(_agent(new))
    assert inp.allowed_extensions == [".csv"]
    assert inp.allow_all_types is True
    assert out.allowed_extensions == [".xlsx"]


def test_resolve_io_policies_empty_defaults():
    inp, out = resolve_io_policies(_agent({}))
    assert inp == AgentFilePolicy()
    assert out == AgentFilePolicy()


# --- validate_upload routes by role ---


async def test_output_sample_passes_when_only_output_allows_exe():
    # Input policy rejects exe; output policy allows all.
    file_policy = IoFilePolicy(
        input=AgentFilePolicy(allowed_extensions=[".pdf"], allow_all_types=False),
        output=AgentFilePolicy(allow_all_types=True),
    ).model_dump()
    # Should not raise: role = output (prefix on filename).
    await _validate_upload(file_policy, f"{OUTPUT_SAMPLE_PREFIX}report.exe", mime="application/x-msdownload")


async def test_bare_exe_rejected_by_input_only_text_policy():
    file_policy = IoFilePolicy(
        input=AgentFilePolicy(allowed_extensions=[".txt"], allow_all_types=False),
        output=AgentFilePolicy(allow_all_types=True),
    ).model_dump()
    with pytest.raises(Exception):
        await _validate_upload(file_policy, "bad.exe", mime="application/x-msdownload")


async def test_legacy_flat_exe_rejected():
    flat = {"allowed_extensions": [".txt"], "allow_all_types": False}
    with pytest.raises(Exception):
        await _validate_upload(flat, "bad.exe", mime="application/x-msdownload")
