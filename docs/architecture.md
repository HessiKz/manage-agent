# Architecture

## Overview

`manage-agent` is an enterprise AI agent workspace:

- **Frontend**: Next.js 15 (App Router), RTL Persian UI, TanStack Query, Zustand
- **Backend**: FastAPI, SQLAlchemy 2 async, LangChain + LangGraph
- **Data**: PostgreSQL 16, Redis 7

## Request flow

```
Browser → nginx (prod) → Next.js / FastAPI
FastAPI → PostgreSQL (ORM)
FastAPI → Redis (chat memory)
FastAPI → gapgpt OpenAI-compatible API (LLM)
```

## Key modules

| Module | Path | Role |
|--------|------|------|
| Auth | `backend/src/api/v1/auth.py` | JWT login + refresh |
| Agents | `backend/src/api/v1/agents.py` | CRUD, invoke, route |
| LangGraph | `backend/src/agents_lib/graph_agent.py` | Tool-calling agents |
| Memory | `backend/src/agents_lib/memory.py` | Redis thread history |
| Budgets | `backend/src/api/v1/budgets.py` | Cost limits + alerts |

## CORS (development)

In `development`, FastAPI uses `allow_origin_regex` for `localhost`, `127.0.0.1`, and `[::1]` on any port.

## Deployment

```bash
docker compose up -d   # includes nginx on :80 when enabled
```
