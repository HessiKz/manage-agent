# LangChain / LangGraph Guide

## Tool registry

Tools register in `backend/src/agents_lib/custom_tools.py`:

```python
@tool
def budget_lookup(agent_slug: str) -> dict: ...

ToolRegistry.register("budget_lookup", budget_lookup)
```

Assign slugs to agents via `tool_names: ["budget_lookup", ...]`.

## Execution paths

1. **No tools** → direct `ChatOpenAI.ainvoke()` (fast chat)
2. **With tools** → LangGraph `create_react_agent()` runs a ReAct loop

See `backend/src/agents_lib/graph_agent.py` and `backend/src/services/invoke_service.py`.

## Memory

Thread history stored in Redis (`chat:{thread_id}`) with 7-day TTL.
Falls back to in-memory if Redis unavailable.

## LLM config

```env
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.gapgpt.app/v1
OPENAI_DEFAULT_MODEL=gpt-5.3-chat-latest
```

## Streaming

```json
POST /agents/{id}/invoke
{"input": "...", "stream": true}
```

Returns SSE: `data: {"token": "..."}` then `data: {"done": true}`.
