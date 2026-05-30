# cursor-to-api

OpenAI-compatible HTTP API that proxies requests to the **Cursor agent CLI** (`agent`).

Point any OpenAI client at `http://127.0.0.1:9191/api/v1`.

## Requirements

- [Cursor Agent CLI](https://cursor.com) installed and logged in (`agent login`)
- Python 3.11+

## Setup

```bash
cd cursor-to-api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
python -m cursor_to_api.main
```

Server listens on **127.0.0.1:9191** by default.

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CURSOR_TO_API_HOST` | `127.0.0.1` | Bind address |
| `CURSOR_TO_API_PORT` | `9191` | Bind port |
| `CURSOR_TO_API_KEY` | _(empty)_ | Optional Bearer key for clients |
| `CURSOR_TO_API_WORKSPACE` | current directory | Workspace passed to `agent --workspace` |
| `CURSOR_TO_API_AGENT_BIN` | `agent` | Path to agent binary |
| `CURSOR_TO_API_DEFAULT_MODEL` | `auto` | Default model id |
| `CURSOR_TO_API_TRUST` | `true` | Pass `--trust` to agent |
| `CURSOR_TO_API_FORCE` | `false` | Pass `--force` / yolo mode |

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/chat/completions` | Chat (OpenAI-compatible) |
| `GET` | `/api/v1/models` | List models from `agent models` |
| `GET` | `/api/v1/health` | Health check |

## Examples

### curl (non-streaming)

```bash
curl http://127.0.0.1:9191/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Say hello in one word"}]
  }'
```

### curl (streaming)

```bash
curl http://127.0.0.1:9191/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "stream": true,
    "messages": [{"role": "user", "content": "Count to 5"}]
  }'
```

### OpenAI Python SDK

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:9191/api/v1",
    api_key="not-needed",  # or set CURSOR_TO_API_KEY
)

response = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)
```

## Notes

- Each request spawns a headless `agent --print` run. Long prompts or tool use can take a while.
- The agent has full tool access (shell, file writes) when not in plan/ask mode — use a dedicated workspace and review `CURSOR_TO_API_FORCE`.
- Session continuity is not exposed yet; send full message history in each request (standard OpenAI client behavior).
