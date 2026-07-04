from src.core import llm_runtime


def test_gateway_resolve_honors_agent_model_name():
    llm_runtime.set_active("gateway")

    resolved = llm_runtime.resolve("gpt-4o-mini")

    assert resolved.model == "gpt-4o-mini"


def test_resolve_model_name_falls_back_to_default():
    llm_runtime.set_active("gateway")

    resolved = llm_runtime.resolve(None)

    assert resolved.model == llm_runtime.resolve_model_name(None)


def test_cursor_resolve_honors_agent_model():
    llm_runtime.update_cache(
        {
            "active": "cursor",
            "cursor": {
                "base_url": "http://localhost:3000/v1",
                "api_key": "test",
                "model": "auto",
            },
        }
    )

    resolved = llm_runtime.resolve("gpt-4o-mini")

    assert resolved.provider == "cursor"
    assert resolved.model == "gpt-4o-mini"
    llm_runtime.set_active("gateway")
