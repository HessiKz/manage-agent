"""Agent edit PATCH + permissions replace."""

import uuid

import pytest
from pydantic import ValidationError

from src.schemas.agent import AgentDetailRead, AgentFilePolicy


def test_agent_file_policy_accepts_spreadsheet_preset():
    policy = AgentFilePolicy.model_validate(
        {
            "min_files": 1,
            "max_files": 20,
            "max_file_size_mb": 25,
            "max_total_size_mb": 200,
            "allowed_mime_types": [
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ],
            "allowed_extensions": [".xlsx", ".xls"],
            "require_files_to_invoke": False,
            "auto_ingest_to_rag": False,
        }
    )
    assert policy.max_files == 20


def test_agent_detail_read_coerces_decimal_temperature():
    from datetime import datetime, timezone
    from decimal import Decimal

    class FakeAction:
        def __init__(self) -> None:
            self.id = uuid.uuid4()
            self.agent_id = uuid.uuid4()
            self.slug = "process_karkard"
            self.label = "محاسبه"
            self.description = None
            self.icon = None
            self.input_schema = {"properties": {}}
            self.prompt_template = "run"
            self.tool_chain = ["karkard_process"]
            self.confirmation_required = False
            self.order_index = 0
            self.created_at = datetime.now(timezone.utc)
            self.updated_at = datetime.now(timezone.utc)

    class FakeAgent:
        id = uuid.uuid4()
        slug = "example-karkard"
        name = "محاسبه‌گر کارکرد"
        description = "d"
        department = "hr"
        kind = "worker"
        capabilities = {
            "chat_enabled": True,
            "file_upload_enabled": True,
            "actions_enabled": True,
            "templates_enabled": True,
            "can_call_agents": False,
            "supervisor_enabled": False,
        }
        file_policy = {
            "min_files": 1,
            "max_files": 20,
            "max_file_size_mb": 25,
            "max_total_size_mb": 200,
            "allowed_mime_types": [
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ],
            "allowed_extensions": [".xlsx"],
            "require_files_to_invoke": False,
            "auto_ingest_to_rag": False,
        }
        agent_link_policy = {"max_depth": 3, "default_requires_user_permission": True}
        model_provider = "openai"
        model_name = "auto"
        temperature = Decimal("0.20")
        max_iterations = 20
        system_prompt = "prompt"
        tool_names = ["karkard_process"]
        memory_type = "buffer"
        memory_config = {}
        cost_limit_monthly = None
        cost_limit_daily = None
        overtime_threshold_hours = None
        config_json = {
            "task_profile": "karkard",
            "widget_plan": {
                "stat_cards": {"enabled": True},
                "line_chart": {"enabled": True},
                "pie_chart": {"enabled": True},
                "review_table": {"enabled": False},
                "hr_savings": {"enabled": True},
            },
        }
        status = "active"
        owner_id = None
        created_at = datetime.now(timezone.utc)
        updated_at = datetime.now(timezone.utc)
        actions = [FakeAction()]
        templates = []
        outgoing_links = []

        @property
        def links(self):
            return self.outgoing_links

    detail = AgentDetailRead.model_validate(FakeAgent())
    assert detail.temperature == 0.2
    assert detail.actions[0].slug == "process_karkard"


def test_agent_detail_read_rejects_invalid_file_policy():
    from datetime import datetime, timezone
    from decimal import Decimal

    class BareAgent:
        id = uuid.uuid4()
        slug = "x"
        name = "x"
        description = None
        department = None
        kind = "chat"
        capabilities = {}
        file_policy = {"min_files": 10, "max_files": 2}
        agent_link_policy = {}
        model_provider = "openai"
        model_name = "auto"
        temperature = Decimal("0.2")
        max_iterations = 20
        system_prompt = None
        tool_names = []
        memory_type = "buffer"
        memory_config = {}
        cost_limit_monthly = None
        cost_limit_daily = None
        overtime_threshold_hours = None
        config_json = {}
        status = "active"
        owner_id = None
        created_at = datetime.now(timezone.utc)
        updated_at = datetime.now(timezone.utc)
        actions = []
        templates = []
        outgoing_links = []

        @property
        def links(self):
            return self.outgoing_links

    with pytest.raises(ValidationError):
        AgentDetailRead.model_validate(BareAgent())
