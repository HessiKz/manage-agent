# Error handling & logging

## API error format

All errors return JSON:

```json
{
  "error": true,
  "code": "NOT_FOUND",
  "message": "مورد درخواستی یافت نشد.",
  "request_id": "a1b2c3d4e5f6",
  "errors": [{ "field": "email", "message": "field required" }]
}
```

| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 422 | Invalid request body/query |
| `AUTHENTICATION_REQUIRED` | 401 | Missing or invalid JWT |
| `NOT_FOUND` | 404 | Resource missing |
| `LLM_UNAVAILABLE` | 503 | OpenAI/gapgpt unreachable |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unhandled server error |

Every response includes header `x-request-id` for support correlation.

## Backend logging

Configured via `backend/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `LOG_JSON` | `false` | Force JSON lines (auto on in production) |
| `LOG_FILE` | empty | Optional rotating file path |

Logs use **structlog** with `request_id`, `method`, and `path` on each HTTP request.

### Client log ingestion

`POST /api/v1/logs/client` accepts batched browser warnings/errors (rate-limited, no auth).

## Frontend

- **`parseApiError` / `getErrorMessage`** — normalize axios and API envelope errors
- **Sonner toasts** — mutation failures show Persian messages + request id
- **Error boundaries** — dashboard segment + Next.js `error.tsx` / `global-error.tsx`
- **`NEXT_PUBLIC_LOG_CLIENT_ERRORS`** — set `false` to disable remote client logs

## Raising errors in services

```python
from src.core.errors import NotFoundError, LlmUnavailableError

raise NotFoundError("ایجنت یافت نشد")
raise LlmUnavailableError()
```

Or keep `HTTPException`; handlers normalize both.
