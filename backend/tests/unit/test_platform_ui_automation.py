"""General UI automation catalog + validation."""

import importlib.util
import json
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2] / "src" / "agents_lib" / "platform_ui_catalog.py"
_spec = importlib.util.spec_from_file_location("platform_ui_catalog", _ROOT)
_mod = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_mod)

validate_ui_steps = _mod.validate_ui_steps
catalog_for_llm = _mod.catalog_for_llm
path_requires_superuser = _mod.path_requires_superuser
steps_require_superuser = _mod.steps_require_superuser

_GROUND = Path(__file__).resolve().parents[2] / "src" / "agents_lib" / "platform_support_grounding.py"
_gspec = importlib.util.spec_from_file_location("platform_support_grounding", _GROUND)
_gmod = importlib.util.module_from_spec(_gspec)
assert _gspec.loader is not None
_gspec.loader.exec_module(_gmod)

is_ui_action_request = _gmod.is_ui_action_request
is_api_provisioning_request = _gmod.is_api_provisioning_request
is_agent_testing_on_create_page = _gmod.is_agent_testing_on_create_page
is_wizard_steps_incomplete = _gmod.is_wizard_steps_incomplete
needs_grounded_tools = _gmod.needs_grounded_tools
needs_any_platform_tool = _gmod.needs_any_platform_tool
has_ui_execution = _gmod.has_ui_execution
has_provisioning_execution = _gmod.has_provisioning_execution
ground_support_output = _gmod.ground_support_output


def test_knowledge_ingest_example_validates():
    example = catalog_for_llm()["examples"][0]["steps"]
    steps, err = validate_ui_steps(example)
    assert err is None
    assert len(steps) == 3
    assert steps[-1]["type"] == "type"
    assert steps[-1]["text"] == "سلام"


def test_rejects_bad_selector():
    steps, err = validate_ui_steps(
        [{"type": "click", "selector": "#save-button"}],
    )
    assert steps == []
    assert err is not None


def test_accepts_ref_from_snapshot():
    steps, err = validate_ui_steps(
        [
            {"type": "type", "ref": "ui-2", "text": "سلام"},
            {"type": "click", "ref": "ui-5"},
        ],
    )
    assert err is None
    assert steps[0]["ref"] == "ui-2"


def test_ui_action_not_factual_grounding():
    text = "تب فایل‌ها رو باز کن و توی درج دانش بنویس سلام ولی ذخیره نزن"
    assert is_ui_action_request(text)
    assert not needs_grounded_tools(text)


def test_api_provisioning_not_navigate_only():
    text = "یه api اضافه کن و یک ایجنت براش بساز و تستش کن"
    assert is_api_provisioning_request(text)
    assert not is_ui_action_request(text)
    assert not needs_grounded_tools(text)


def test_observation_does_not_require_tools():
    obs = (
        "[مشاهده UI زنده]\n---\n[مشاهده UI — پس از اجرای UI]\n"
        "یه api اضافه کن و ایجنت بساز"
    )
    assert not is_api_provisioning_request(obs)
    assert not needs_any_platform_tool(obs)
    out = ground_support_output(obs, [], "✓ API و ایجنت آماده است.")
    assert "دوباره بفرست" not in out
    assert "آماده" in out


def test_has_provisioning_execution():
    payload = {"_tool": "platform_provision_api_agent", "success": True}
    assert has_provisioning_execution([payload])


def test_rejects_wizard_execute_ui():
    steps, err = validate_ui_steps(
        [
            {"type": "navigate", "path": "/agents/create"},
            {"type": "type", "selector": '[data-ma-support="wizard-name"]', "text": "تست"},
        ],
    )
    assert steps == []
    assert err is not None
    assert "platform_create_agent" in err


def test_steps_require_superuser_for_wizard_navigate():
    assert path_requires_superuser("/agents/create")
    assert path_requires_superuser("/users")
    assert not path_requires_superuser("/knowledge")
    assert steps_require_superuser([{"type": "navigate", "path": "/agents/create"}])
    assert not steps_require_superuser([{"type": "navigate", "path": "/knowledge"}])


def test_catalog_tools_require_superuser_flags():
    catalog = catalog_for_llm()
    assert catalog["pages"]["users"]["requires_superuser"] is True
    assert catalog["pages"]["agents_create"]["requires_superuser"] is True
    assert catalog["tools"]["platform_create_agent"]["requires_superuser"] is True


def test_has_ui_execution_from_append_json():
    payload = {
        "_tool": "platform_execute_ui",
        "success": True,
        "append_json": json.dumps({"ui_script": {"label": "x", "steps": []}}),
    }
    assert has_ui_execution([payload])


def test_testing_page_detected_from_snapshot_not_incomplete_wizard():
    obs = (
        "[زمینه صفحه]\nمسیر فعلی: /agents/create?slug=ops-agent-11\n"
        "[مشاهده UI زنده]\n"
        'data-ma-support="wizard-planning-questions"'
    )
    assert is_agent_testing_on_create_page(obs)
    assert not is_wizard_steps_incomplete(obs)


if __name__ == "__main__":
    test_knowledge_ingest_example_validates()
    test_rejects_bad_selector()
    test_ui_action_not_factual_grounding()
    test_observation_does_not_require_tools()
    test_api_provisioning_not_navigate_only()
    test_has_provisioning_execution()
    test_has_ui_execution_from_append_json()
    print("ok")
