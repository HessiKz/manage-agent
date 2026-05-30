# Enterprise AI Agent Management Platform — Master Plan

> **Project**: `manage-agent`
> **Owner**: Hessi
> **Stack**: Next.js 15 + React 19 (Frontend) · FastAPI + LangChain (Backend) · PostgreSQL + Redis
> **Goal**: Build a multi-agent enterprise platform per the PDF wireframes

---

## 1. Vision

A unified workspace where employees of a company can interact with AI agents that automate finance, HR, support, sales, and ops tasks. Admins manage agent lifecycle, budgets, permissions, and monitor system health.

The PDF defines 6 pages:
1. **SSO Login** — enterprise sign-in
2. **Agent Dashboard** — main user workspace
3. **Agent Detail (Payroll)** — agent execution view with chat
4. **Admin Overview** — system health, costs, alerts
5. **Agent Creation Wizard** — 5-step builder
6. **User & Access Management** — RBAC, per-agent permissions

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────┐
│  Frontend (Next.js 15, App Router, RSC, TS)         │
│  Tailwind · shadcn/ui · Zustand · TanStack Query    │
└──────────────────────────────────────────────────────┘
                       ↕ REST / SSE
┌──────────────────────────────────────────────────────┐
│  Backend (FastAPI, Python 3.12, async)              │
│  LangChain · SQLAlchemy 2 · Alembic · Pydantic v2   │
└──────────────────────────────────────────────────────┘
                       ↕
┌──────────────────────────────────────────────────────┐
│  PostgreSQL 16 │ Redis 7 │ (optional MinIO/S3)      │
└──────────────────────────────────────────────────────┘
```

---

## 3. Tech Stack

### Backend
| Layer | Library |
|---|---|
| Framework | FastAPI 0.115+ |
| Agent / LLM | LangChain 0.3+, LangGraph |
| ORM | SQLAlchemy 2 (async) |
| Migrations | Alembic |
| Validation | Pydantic v2 + pydantic-settings |
| Auth | python-jose (JWT), passlib[bcrypt] |
| HTTP | httpx |
| Tests | pytest, pytest-asyncio |
| Lint/Format | ruff |

### Frontend
| Layer | Library |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 19, TypeScript 5 |
| Styles | TailwindCSS + tailwindcss-rtl |
| Components | shadcn/ui (Radix-based) |
| Charts | Recharts |
| State | Zustand |
| Data | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Icons | lucide-react |
| ⌘K | cmdk |
| Toasts | sonner |

### Infra
- Docker Compose (Postgres, Redis, backend, frontend, nginx)
- `.env` files (`.env.example` committed)

---

## 4. Repo Layout

```
manage-agent/
├── PLAN.md                  ← this file
├── PROGRESS.md              ← step-by-step log (auto-updated)
├── README.md
├── docker-compose.yml
├── .gitignore
├── docs/
│   ├── architecture.md
│   ├── api-reference.md
│   ├── langchain-guide.md
│   └── deployment.md
├── backend/
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── .env.example
│   ├── alembic/
│   ├── src/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── api/v1/{auth,agents,users,budgets,activity,dashboards,health}.py
│   │   ├── core/{security,permissions,costs}.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── langchain/
│   │   │   ├── agent_factory.py
│   │   │   ├── tool_registry.py
│   │   │   ├── custom_tools.py
│   │   │   ├── prompt_templates.py
│   │   │   └── memory.py
│   │   ├── database/{session,base,seed}.py
│   │   └── middleware/
│   └── tests/
└── frontend/
    ├── package.json
    ├── next.config.ts
    ├── tailwind.config.ts
    ├── Dockerfile
    └── src/
        ├── app/
        │   ├── (auth)/login
        │   ├── (dashboard)/
        │   │   ├── page.tsx
        │   │   ├── agents/
        │   │   ├── agents/create (wizard)
        │   │   ├── dashboards/
        │   │   ├── security/
        │   │   ├── users/
        │   │   └── settings/
        │   └── layout.tsx
        ├── components/{ui,layout,charts,forms,data-display}
        ├── lib/{api-client,utils,routes}
        ├── hooks/
        ├── stores/
        └── types/
```

---

## 5. Database Schema

- `users` (id, email, password_hash, full_name, mfa_enabled, locale, …)
- `roles` (id, name, is_system)
- `permissions` (id, resource, action)
- `role_permissions`, `user_roles` (M2M)
- `agents` (id, name, slug, status, model_provider, model_name, config_json, tool_names[], cost_limit_*, owner_id)
- `budgets` (id, agent_id, period, amount, alert_threshold)
- `activity_logs` (agent_id, user_id, action, tokens_in/out, cost, duration, status)
- `audit_logs` (user_id, action, resource_type, resource_id, changes, ip)
- `dashboard_configs` (user_id, layout, widgets)

---

## 6. LangChain Learning Path (Integrated)

1. **Tools** — `@tool` decorator, `StructuredTool` with Pydantic args
2. **Agents** — `create_tool_calling_agent`, `AgentExecutor`
3. **Memory** — `ConversationBufferMemory`, `VectorStoreRetrieverMemory`
4. **LCEL** — `|` chaining, `RunnablePassthrough`
5. **LangGraph** — multi-step workflows, human-in-the-loop
6. **Custom tool registry** — runtime tool injection per agent config

---

## 7. Implementation Phases & Steps

Each numbered step gets logged in `PROGRESS.md` when completed.
See `PROGRESS.md` for the detailed journal of completed work.

### Phase A — Foundation
- [x] **A1** Create root files: README, PLAN, PROGRESS, .gitignore, docker-compose
- [x] **A2** Backend skeleton: pyproject, Dockerfile, src/main.py, config
- [x] **A3** Database layer: SQLAlchemy base, session, Alembic init
- [x] **A4** Models: User, Role, Permission, Agent, Budget, ActivityLog, AuditLog
- [x] **A5** Schemas (Pydantic v2): auth, user, agent, budget, activity
- [x] **A6** Auth: JWT, password hashing, login/register/me endpoints

### Phase B — Core Backend
- [x] **B1** Repositories layer (base + per-model)
- [x] **B2** Services layer (business logic)
- [x] **B3** API routes: users, agents, budgets, activity, dashboards
- [x] **B4** Middleware: auth, logging, CORS, rate-limit
- [x] **B5** Seed data script

### Phase C — LangChain Integration
- [x] **C1** `tool_registry.py` with `@register` decorator
- [x] **C2** Custom tools: budget_lookup, hr_lookup, report_gen, etc.
- [x] **C3** `agent_factory.py` — build `AgentExecutor` from DB config
- [x] **C4** `memory.py` — per-agent memory backends *(in-memory placeholder; Redis swap later)*
- [x] **C5** Agent execution endpoint (`POST /agents/{id}/invoke`) with SSE streaming

### Phase D — Frontend Foundation
- [x] **D1** Next.js 15 init, Tailwind, shadcn/ui, RTL setup
- [x] **D2** Layout: sidebar, header, command palette (⌘K)  *(sidebar/header done; cmdk search stub)*
- [x] **D3** API client (typed), TanStack Query setup
- [x] **D4** Auth pages (login) + auth store/hooks + protected routes

### Phase E — Frontend Pages (matching PDF)
- [x] **E1** Main dashboard (Page 2): stats cards, recent agents, quick prompt
- [x] **E2** Agent detail / chat view (Page 3): chat panel + charts
- [x] **E3** Admin overview (Page 4): health, costs, alerts, top agents
- [x] **E4** Agent creation wizard (Page 5): 5-step stepper with live preview
- [x] **E5** Users & access (Page 6): table, role matrix, per-agent perms

### Phase F — Polish
- [x] **F1** Tests (pytest + vitest)
- [x] **F2** Docs (architecture, API, LangChain guide)
- [x] **F3** Dockerize end-to-end + nginx reverse proxy
- [x] **F4** Seed script + demo data

### Phase G — Post-PDF hardening (G1–G10)
- [x] **G1** CORS fix — dev regex for localhost/127.0.0.1/[::1] any port; skip OPTIONS in rate limit
- [x] **G2** Expanded pytest — CORS, auth flow, route, budgets (9 tests)
- [x] **G3** Vitest frontend tests — `utils.test.ts`
- [x] **G4** Docs — `docs/architecture.md`, `api-reference.md`, `langchain-guide.md`
- [x] **G5** nginx reverse proxy — `nginx/nginx.conf` + compose `prod` profile
- [x] **G6** Redis conversation memory — `ConversationMemory` with fallback
- [x] **G7** LangGraph tool-calling — `graph_agent.py` + invoke integration
- [x] **G8** Budget API — `/budgets`, `/budgets/summary` + admin widgets
- [x] **G9** Per-agent permissions — model, migration, API, users UI matrix
- [x] **G10** Quick-prompt routing + JWT refresh + auto-refresh interceptor

### Bonus — Local development
- [x] **LOCAL-RUN** Run backend + frontend natively (Postgres/Redis in Docker)
- [x] **LOCAL-RUN-FIX** Fixed email validation + verified auth flow

---

## 8. Step Logging Convention

Every completed step appends to `PROGRESS.md` like:

```
## A1 — Root scaffolding   (✅ 2026-05-18 10:30)
Created: README.md, PLAN.md, PROGRESS.md, .gitignore, docker-compose.yml
Notes: chose Docker Compose v2 syntax; named services postgres/redis/backend/frontend/nginx.
Next: A2 (backend skeleton)
```

This ensures any future AI agent (or human) can resume work mid-stream.

---

## 9. Running Locally (target UX)

```bash
# one-time
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# everything up
docker compose up -d

# DB migrations + seed
docker compose exec backend alembic upgrade head
docker compose exec backend python -m src.database.seed

# open
open http://localhost:3000
```

---

## 10. Out-of-Scope (for v0.1)

- Real SAML/SSO provider integration (we stub the button + flow)
- Multi-tenant isolation (single tenant for v0.1)
- Production-grade SOC 2 controls
- Vector DB for advanced RAG (we leave hooks; default = in-memory)
