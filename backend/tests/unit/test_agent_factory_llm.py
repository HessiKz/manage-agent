"""LLM factory: temperature omitted for models that reject it."""

from src.agents_lib.agent_factory import _supports_temperature, build_llm
from src.core import llm_runtime
from src.models.agent import Agent, AgentKind, AgentStatus


def _fake_agent(**kwargs) -> Agent:
    return Agent(
        name="Test",
        slug="test",
        kind=AgentKind.WORKER,
        status=AgentStatus.ACTIVE,
        model_provider="openai",
        model_name=kwargs.get("model_name", "claude-opus-4-7"),
        temperature=0.2,
        **{k: v for k, v in kwargs.items() if k != "model_name"},
    )


def _use_gateway(monkeypatch):
    monkeypatch.setattr("src.config.settings.openai_api_key", "sk-test")
    llm_runtime.update_cache({"active": "gateway"})


def test_claude_opus_4_7_omits_temperature(monkeypatch):
    _use_gateway(monkeypatch)
    llm = build_llm(_fake_agent())
    assert llm.temperature is None
    assert _supports_temperature("claude-opus-4-7") is False
    assert _supports_temperature("gpt-4o-mini") is True


def test_gpt_model_includes_temperature(monkeypatch):
    _use_gateway(monkeypatch)
    llm = build_llm(_fake_agent(model_name="gpt-4o-mini"))
    # Platform is hard-locked to claude-opus-4-8; Claude rejects temperature.
    assert llm.temperature is None
    assert llm.model_name == "claude-opus-4-8"


def test_cursor_provider_pins_model(monkeypatch):
    monkeypatch.setattr("src.config.settings.openai_api_key", "sk-test")
    llm_runtime.update_cache(
        {
            "active": "cursor",
            "cursor": {
                "base_url": "http://127.0.0.1:9191/api/v1",
                "api_key": "",
                "model": "auto",
            },
        }
    )
    llm = build_llm(_fake_agent(model_name="claude-opus-4-7"))
    assert llm.model_name == "claude-opus-4-8"
    assert str(llm.openai_api_base).rstrip("/") == "http://127.0.0.1:9191/api/v1"
