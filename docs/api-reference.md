# API Reference (v1)

Base URL: `http://localhost:8000/api/v1`

## Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | `{email, password}` → tokens |
| POST | `/auth/refresh` | `{refresh_token}` → new tokens |
| GET | `/auth/me` | Current user (Bearer) |

## Agents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/agents` | List agents (paginated) |
| GET | `/agents/by-slug/{slug}` | Get by slug |
| POST | `/agents/route` | `{prompt}` → suggested agent |
| POST | `/agents/{id}/invoke` | Run agent (`stream: true` for SSE) |
| GET | `/agents/tools` | Available tools |

## Budgets

| Method | Path | Description |
|--------|------|-------------|
| GET | `/budgets` | List budgets with spend |
| GET | `/budgets/summary` | Totals + alerts |
| POST | `/budgets` | Create (admin) |

## Permissions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/agent-permissions` | Permission matrix |
| POST | `/agent-permissions` | Grant access |

## Dashboards

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboards/overview` | Platform stats |
| GET | `/dashboards/usage` | Daily run chart |
| GET | `/dashboards/health` | Integration health |
| GET | `/dashboards/events` | Audit feed |
