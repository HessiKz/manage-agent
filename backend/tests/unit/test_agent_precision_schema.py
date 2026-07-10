"""Schema validation for config_json.execution_precision (plan 2.1.4)."""

import pytest
from pydantic import ValidationError

from src.schemas.agent import AgentCreate, AgentUpdate


def _base_create(kind="worker", precision=None):
    cfg = {}
    if precision is not None:
        cfg["execution_precision"] = precision
    return AgentCreate(
        name="x",
        kind=kind,
        capabilities={"chat_enabled": False},
        config_json=cfg,
    )


def test_valid_precision_accepted_on_create():
    agent = _base_create("worker", "deterministic")
    assert agent.config_json["execution_precision"] == "deterministic"


def test_invalid_precision_rejected_on_create_422():
    with pytest.raises(ValidationError):
        _base_create("worker", "bogus")


def test_missing_precision_defaults_via_kind_not_here_but_valid():
    # Absence is allowed; the service fills the default by kind.
    agent = _base_create("worker")
    assert "execution_precision" not in agent.config_json


def test_valid_precision_accepted_on_update():
    upd = AgentUpdate(config_json={"execution_precision": "guided"})
    assert upd.config_json["execution_precision"] == "guided"


def test_invalid_precision_rejected_on_update():
    with pytest.raises(ValidationError):
        AgentUpdate(config_json={"execution_precision": "maybe"})


def test_precision_case_not_normalized():
    with pytest.raises(ValidationError):
        AgentUpdate(config_json={"execution_precision": "Deterministic"})
