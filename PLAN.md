# Enterprise AI Agent Management Platform — Master Plan

> **Project**: `manage-agent`  
> **Owner**: Hessi  
> **Status**: v0.1 feature-complete (PDF parity + agent kinds); v0.2 in planning  
> **Stack**: Next.js 15 + React 19 (Frontend) · FastAPI + LangChain/LangGraph (Backend) · PostgreSQL + Redis  
> **Goal**: Multi-agent enterprise workspace per the PDF wireframes, extensible to production SaaS  
> **Progress journal**: [`PROGRESS.md`](./PROGRESS.md) · **Architecture**: [`docs/architecture.md`](./docs/architecture.md)

---

## 1. Vision

A unified workspace where employees interact with AI agents that automate finance, HR, support, sales, and ops tasks. Admins manage agent lifecycle, budgets, permissions, and monitor system health.

### PDF pages (wireframe scope)

| # | Page | Route(s) | Status |
|---|------|----------|--------|
| 1 | SSO Login | `/login` | ✅ SAML stub + password auth |
| 2 | Agent Dashboard | `/dashboard` | ✅ KPI strip, filters, quick prompt |
| 3 | Agent Detail (Payroll) | `/agents/[slug]` | ✅ Tabs, charts, chat, capability rail |
| 4 | Admin Overview | `/admin` | ✅ Health, costs, events, usage chart |
| 5 | Agent Creation Wizard | `/agents/create` | ✅ 6-step builder + testing sub-route |
| 6 | User & Access Management | `/users` | ✅ RBAC matrix, per-agent permissions |

### Beyond the PDF (shipped in v0.1)

- **Agent kinds**: `chat`, `worker`, `supervisor`, `file_intake` — each with capability gates and distinct UI rails
- **Supervisor graph**: LangGraph-style routing to linked sub-agents with synthesis
- **Worker actions**: repeatable tool-backed actions with input schemas
- **File intake + RAG hooks**: upload policy, text extraction, vector store upsert
- **External API bindings**: dynamic tool loader per agent
- **Conversations**, **knowledge**, **integrations**, **settings** pages
- **Motion kit**: staggered reveals, panel transitions, login ↔ sidebar logo morph
- **Multi-target deploy**: Docker Compose (prod nginx), Vercel frontend, Railway/Render API

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 15 App Router, RSC + client islands)        │
│  Tailwind · shadcn/ui · Zustand · TanStack Query · Framer Motion │
│  RTL Persian default · brand palette from tailwind.config.ts     │
└─────────────────────────────────────────────────────────────────┘
                          ↕ REST + SSE (invoke stream)
┌─────────────────────────────────────────────────────────────────┐
│  Backend (FastAPI 0.115+, Python 3.12, async SQLAlchemy 2)     │
│  OrchestratorService → graph_agent / supervisor_graph            │
│  agents_lib: factory, tools, memory, dynamic_tools, trace        │
└─────────────────────────────────────────────────────────────────┘
         ↕                    ↕                         ↕
┌──────────────┐    ┌─────────────────┐    ┌──────────────────────┐
│ PostgreSQL 16│    │ Redis 7         │    │ gapgpt / OpenAI API  │
│ ORM + Alembic│    │ thread memory   │    │ (or cursor-to-api)   │
└──────────────┘    └─────────────────┘    └──────────────────────┘
```

### Request flow (runtime)

```
Browser → nginx (prod) → Next.js / FastAPI
POST /agents/{id}/invoke → OrchestratorService
  ├─ chat kind     → graph_agent (ReAct + tools)
  ├─ supervisor    → supervisor_graph (route → sub-agent → FINAL)
  ├─ worker        → action runner (no free-form chat)
  └─ file_intake   → file policy gate → invoke with attachments
FastAPI → PostgreSQL (agents, logs, permissions)
FastAPI → Redis (ConversationMemory per thread_id)
FastAPI → VectorStore (document chunks, best-effort RAG)
FastAPI → External APIs (DynamicToolLoader)
```

### Agent kinds (capability model)

| Kind | Primary UX | Backend path | Key capabilities |
|------|------------|--------------|------------------|
| `chat` | Chat panel | `graph_agent` ReAct | `chat_enabled`, tools, memory |
| `worker` | Action grid | `AgentActionService.run` | `actions[]`, templates, no chat |
| `supervisor` | Graph + chat | `supervisor_graph` | `supervises` links, depth limit |
| `file_intake` | File upload rail | orchestrator + file policy | MIME/size/count gates, RAG |

Capabilities and policies live in JSONB on `agents`: `capabilities`, `file_policy`, `agent_link_policy`.

---

## 3. Tech Stack

### Backend

| Layer | Library / pattern |
|---|---|
| Framework | FastAPI 0.115+ |
| Agent / LLM | LangChain 0.3+, LangGraph patterns |
| ORM | SQLAlchemy 2 (asyncpg runtime, psycopg2 migrations) |
| Migrations | Alembic |
| Validation | Pydantic v2 + pydantic-settings |
| Auth | python-jose (JWT access + refresh), passlib[bcrypt] |
| HTTP | httpx |
| Tests | pytest, pytest-asyncio |
| Lint / format | ruff |

### Frontend

| Layer | Library |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 19, TypeScript 5 |
| Styles | TailwindCSS + tailwindcss-rtl |
| Components | shadcn/ui (Radix-based) |
| Motion | Framer Motion (`components/motion/`) |
| Charts | Recharts (LTR-isolated in RTL shell) |
| State | Zustand |
| Data | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Icons | lucide-react |
| Toasts | sonner |

### Infra & optional services

| Target | Docs |
|--------|------|
| Docker Compose + nginx | [`docker-compose.yml`](./docker-compose.yml), [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) |
| Vercel (frontend) | [`docs/VERCEL.md`](./docs/VERCEL.md) |
| Railway / Render (API) | [`docs/RAILWAY.md`](./docs/RAILWAY.md), [`render.yaml`](./render.yaml) |
| cursor-to-api proxy | [`cursor-to-api/README.md`](./cursor-to-api/README.md) — OpenAI-compatible Cursor CLI bridge |

Env templates: `backend/.env.example`, `frontend/.env.example` (committed).

---

## 4. Repo Layout

```
manage-agent/
├── PLAN.md                     ← this file
├── PROGRESS.md                 ← append-only build journal
├── README.md · DEMO.md · RUNNING.md
├── docker-compose.yml · docker-compose.prod.yml
├── render.yaml
├── graphify-out/               ← knowledge graph (graphify query)
├── docs/
│   ├── architecture.md · api-reference.md · langchain-guide.md
│   ├── DEPLOYMENT.md · VERCEL.md · RAILWAY.md · ERRORS.md
├── scripts/
│   ├── dev.sh · demo-prep.sh · deploy-update.sh · install-ubuntu.sh
├── cursor-to-api/              ← optional LLM proxy (Docker profile)
├── backend/
│   ├── pyproject.toml · Dockerfile · alembic/
│   └── src/
│       ├── main.py · config.py · logger.py
│       ├── api/v1/             ← REST routers (see §5)
│       ├── agents_lib/         ← runtime: factory, tools, graph, memory
│       ├── core/               ← security, permissions, costs, errors
│       ├── models/ · schemas/ · services/ · repositories/
│       ├── database/           ← session, seed, full_catalog
│       ├── demo/               ← payroll, reports, karkard helpers
│       ├── karkard/            ← spreadsheet processor
│       └── middleware/
└── frontend/
    ├── src/app/
    │   ├── (auth)/login
    │   ├── (public)/           ← marketing landing
    │   └── (dashboard)/
    │       ├── dashboard · admin · users · settings
    │       ├── agents · agents/[slug] · agents/create · agents/create/testing
    │       ├── conversations · knowledge · integrations
    │       └── agents/[slug]/fix
    ├── components/
    │   ├── ui/ · layout/ · charts/ · agents/ · motion/ · error/
    ├── providers/ · stores/ · hooks/ · types/
    └── tailwind.config.ts      ← brand / surface / sidebar tokens
```

> **Note:** Early plan referenced `backend/src/langchain/` — renamed to `agents_lib/` during LangGraph integration.

---

## 5. API Surface (v1)

Grouped by domain. Full detail in [`docs/api-reference.md`](./docs/api-reference.md).

| Domain | Prefix / highlights |
|--------|---------------------|
| Auth | `POST /auth/login`, `/register`, `/refresh`, `GET /me` |
| Users & roles | `GET/PATCH /users`, `/roles` |
| Agents | CRUD, `GET /by-slug/{slug}`, `POST /{id}/invoke` (SSE), `POST /route` |
| Agent sub-resources | `/actions`, `/templates`, `/links`, `/links/graph`, `/files`, `/permissions` |
| Conversations | thread list + messages |
| Dashboards | `/overview`, `/sidebar`, `/usage`, `/health`, `/events` |
| Budgets | CRUD + `/summary` |
| Knowledge | document ingestion (admin) |
| External APIs | CRUD endpoints bound to agents |
| Access requests | submit, list, approve/reject |
| Prompts | `/prompt-templates`, `/prompts/improve` |
| Platform | LLM provider settings (superuser) |
| Audit | append-only audit log |
| Notifications | inbox + read state |
| Health | `/health`, `/` |

All routes under `/api/v1` unless noted. Auth via `Authorization: Bearer` except login/register.

---

## 6. Database Schema

### Core (Phase A)

- `users` — email, password_hash, full_name, mfa_enabled, locale, department, …
- `roles`, `permissions`, `user_roles`, `role_permissions`
- `agents` — slug, status, kind, model_*, config_json, capabilities JSONB, file/link policies, tool_names[], cost limits, owner_id
- `budgets` — agent-scoped periods + alert thresholds
- `activity_logs` — tokens, cost, duration, status per run
- `audit_logs` — immutable admin actions
- `dashboard_configs` — per-user widget layout (JSONB)

### Agent platform (Phase H+)

- `agent_actions` — worker action definitions (slug, input_schema, tool binding)
- `agent_prompt_templates` — variable templates for workers/supervisors
- `agent_links` — supervisor ↔ worker edges (`supervises`, `delegates`, …)
- `agent_files` — uploaded artifacts + extraction metadata
- `document_chunks` — vector RAG chunks (embedding hooks)
- `agent_user_permissions` — per-user agent ACL overrides
- `access_requests` — pending access workflow
- `notifications` — in-app inbox
- `external_apis`, `external_api_endpoints` — dynamic HTTP tools
- `platform_settings` — global LLM provider config

### Enums worth knowing

- `AgentStatus`: draft · active · paused · archived  
- `AgentKind`: chat · worker · supervisor · file_intake  
- `ActivityStatus`, `BudgetPeriod`, `AccessRequestStatus`, `NotificationSeverity`

---

## 7. LangChain / LangGraph Learning Path

Integrated into the codebase — read [`docs/langchain-guide.md`](./docs/langchain-guide.md) alongside these steps:

1. **Tools** — `@tool`, `StructuredTool`, registry via `ToolRegistry` + `@register_tool`
2. **ReAct agent** — `graph_agent.py` + `create_react_agent` pattern
3. **Memory** — `ConversationMemory` (Redis with in-memory fallback)
4. **Supervisor routing** — `supervisor_graph.py` (iterate: route → invoke link → FINAL)
5. **Dynamic tools** — `DynamicToolLoader` from `external_apis` rows
6. **Agent-as-tool** — `agent_tools.py` delegates to linked agents with permission checks
7. **Execution trace** — structured steps returned to frontend (`execution_trace.py`)

---

## 8. Design & Motion

UI must follow workspace rule [`.cursor/rules/ui-style-and-motion.mdc`](./.cursor/rules/ui-style-and-motion.mdc):

- **Colors**: Tailwind tokens `brand`, `surface`, `sidebar`, `accent` — match PDF palette
- **Motion kit** (`frontend/src/components/motion/`): `variants.ts`, `stagger.tsx`, `transitions.tsx`, `shared.tsx`
- **Route transitions**: `PageTransition` on dashboard `<main>` only — never animate full shell
- **RTL charts**: `chart-box.tsx` + `recharts-rtl.ts` isolate LTR; metric badges use `formatMetricDelta()` for bidi safety
- **Admin grid**: `DashboardFourCardGrid` with explicit `col-start` / `row-start` — avoid implicit RTL column-flow bugs

Design skill reference: `.cursor/skills/ui-ux-pro-max/SKILL.md`

---

## 9. Implementation Phases

Each completed step is logged in [`PROGRESS.md`](./PROGRESS.md). Checkboxes here are the **master checklist**; dates live in the journal.

### Phase A — Foundation ✅

- [x] **A1** Root files: README, PLAN, PROGRESS, .gitignore, docker-compose
- [x] **A2** Backend skeleton: pyproject, Dockerfile, main, config
- [x] **A3** Database layer: SQLAlchemy base, session, Alembic
- [x] **A4** Models: User, Role, Permission, Agent, Budget, ActivityLog, AuditLog
- [x] **A5** Schemas (Pydantic v2)
- [x] **A6** Auth: JWT, login/register/me

### Phase B — Core Backend ✅

- [x] **B1** Repositories · **B2** Services · **B3** API routes
- [x] **B4** Middleware: CORS, logging, rate-limit
- [x] **B5** Seed data

### Phase C — LangChain Integration ✅

- [x] **C1** `tool_registry.py` · **C2** custom tools · **C3** `agent_factory.py`
- [x] **C4** `memory.py` · **C5** invoke + SSE streaming

### Phase D — Frontend Foundation ✅

- [x] **D1** Next.js init, Tailwind, shadcn, RTL
- [x] **D2** Layout: sidebar, header, cmdk stub
- [x] **D3** API client + TanStack Query
- [x] **D4** Auth pages + protected routes

### Phase E — PDF Pages ✅

- [x] **E1** Dashboard · **E2** Agent detail/chat · **E3** Admin
- [x] **E4** Creation wizard · **E5** Users & access

### Phase F — Polish ✅

- [x] **F1** Tests · **F2** Docs · **F3** Docker + nginx · **F4** Demo seed

### Phase G — Post-PDF Hardening ✅

- [x] **G1–G10** CORS, expanded pytest, vitest, docs, nginx, Redis memory, LangGraph, budgets API, per-agent permissions, routing + refresh tokens

### Phase H — PDF Full Parity ✅

- [x] **H1** Sidebar counts + workspace/admin view toggle
- [x] **H2** Agent files upload + RAG ingestion
- [x] **H3** Prompt templates + improve endpoint
- [x] **H4** Access request workflow
- [x] **H5** Page-level PDF UI parity (all 6 pages)

### Phase I — UI Motion & Layout ✅

- [x] **I1** Motion kit (variants, stagger, panel/page transitions)
- [x] **I2** Login ↔ sidebar logo morph, logout flow
- [x] **I3** RTL chart fixes, metric badge bidi
- [x] **I4** Admin 2×2 grid (`DashboardFourCardGrid`)
- [x] **I5** Wizard autosave isolation, reduced nested motion

### Phase J — Agent Kinds & Capabilities ✅

- [x] **J1** Schema: kind, capabilities, file/link policies, actions, templates, links
- [x] **J2** `OrchestratorService` capability gates + supervisor path
- [x] **J3** Wizard 6 steps + capability-aware detail rails
- [x] **J4** Demo agents: chat, worker, file_intake, supervisor
- [x] **J5** Tests: `test_agent_capabilities.py`, vitest presets

---

## 10. Roadmap — v0.2 (next)

Prioritized backlog. Pick up any `[ ]` item and log completion in `PROGRESS.md`.

### Phase K — Agent UX & editing

- [ ] **K1** Edit-agent flow reusing wizard sub-components (not create-only)
- [ ] **K2** `input_schema` mini-builder for worker actions (replace key/title dict)
- [ ] **K3** Chat markdown rendering polish (`chat-markdown.tsx`) — tables, code blocks, streaming
- [ ] **K4** Agent fix panel workflow (`/agents/[slug]/fix`) wired to validation runner
- [ ] **K5** Conversations page: thread search, resume, delete

### Phase L — Quality & observability

- [ ] **L1** E2E supervisor invoke with mocked LLM in CI
- [ ] **L2** Playwright smoke: login → dashboard → invoke demo-chat
- [ ] **L3** Structured client error reporting (`client_logs` → admin digest)
- [ ] **L4** Execution trace UI: expand/collapse tool steps, copy debug bundle
- [ ] **L5** Audit remaining dashboard pages for RTL grid pitfalls (knowledge, settings)

### Phase M — Knowledge & integrations

- [ ] **M1** Knowledge page: org-wide doc upload, chunk browser, re-embed
- [ ] **M2** Integrations page: external API wizard + test connection
- [ ] **M3** Vector store backend switch (pgvector or dedicated) — replace in-memory stub
- [ ] **M4** RAG quality: citation snippets in chat responses
- [ ] **M5** cursor-to-api production hardening (auth, rate limits, health)

### Phase N — Enterprise readiness (v1 candidates)

- [ ] **N1** Real SAML/OIDC SSO (replace stub button)
- [ ] **N2** httpOnly cookie auth option (replace localStorage JWT)
- [ ] **N3** MFA (TOTP) on login
- [ ] **N4** Multi-tenant org isolation (schema + middleware)
- [ ] **N5** Budget enforcement hard-stop (not just alerts)
- [ ] **N6** SOC2-oriented audit export + retention policies

---

## 11. Quality Gates

Run before merging significant work:

```bash
# Backend
cd backend && alembic upgrade head
pytest tests/ -q

# Frontend
cd frontend && npm run typecheck
npm run test -- --run
npm run build

# Optional: demo seed
./scripts/demo-prep.sh
```

**Definition of done** for a feature:

1. API + schema + migration (if needed)
2. Service layer + permission checks
3. Frontend surface with loading/error/empty states
4. At least one automated test (unit or integration)
5. Entry in `PROGRESS.md`
6. `graphify update .` if graph exists (keeps `graphify-out/` current)

---

## 12. Step Logging Convention

Every completed step appends to `PROGRESS.md`:

```
## K1 — Edit-agent flow   (✅ 2026-06-01 14:00)
**Created:** ...
**Decisions:** ...
**Next:** K2
```

Future agents resume by reading `PROGRESS.md` top-down, then this plan for context.

---

## 13. Running Locally

Quick path — see [`RUNNING.md`](./RUNNING.md) for native vs Docker details.

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

docker compose up -d          # postgres + redis (+ optional full stack)
cd backend && alembic upgrade head && python -m src.database.seed
cd frontend && npm run dev

open http://localhost:3000    # admin@example.com / admin123
```

Production Ubuntu: [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) · `./scripts/install-ubuntu.sh`

---

## 14. Scope Boundaries

### In scope for v0.1 (done)

Single-tenant enterprise demo with Persian RTL UI, JWT auth, agent CRUD + invoke, budgets, RBAC, audit hooks, four agent kinds, PDF page parity, Docker + cloud deploy docs.

### Out of scope for v0.1 (explicit deferrals)

| Item | Target | Notes |
|------|--------|-------|
| Real SAML/SSO | v1 / N1 | Button + flow stubbed |
| Multi-tenant isolation | v1 / N4 | Single org assumed |
| Production SOC 2 | v1 / N6 | Basic audit log only |
| Production vector DB | v0.2 / M3 | Hooks exist; default is lightweight |
| cmdk global search | v0.2 | Header search stub |
| httpOnly cookies | v1 / N2 | localStorage JWT today |

### Non-goals

- Building a generic low-code platform unrelated to agents
- Supporting non-Persian-primary UX (i18n framework can come later)
- On-prem air-gapped LLM (document cursor-to-api as bridge only)

---

## 15. Technical Debt & Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM gateway downtime | Invoke 503 | `LLM_UNAVAILABLE` envelope, retry UX, platform settings failover |
| Inferred graph/code edges | Wrong mental model | Prefer AST + docs; verify with tests |
| RTL + Recharts | Clipped charts | Keep LTR isolation pattern |
| Long agent runs on Vercel | Timeout | Direct `NEXT_PUBLIC_API_URL` to Railway/Render (see VERCEL.md) |
| Import cycles in API modules | Startup fragility | Lazy imports where needed; track in graphify report |
| localStorage JWT | XSS surface | Move to httpOnly in N2 |

---

## 16. References

- PDF wireframe: `پلتفرم سازمانی AI — PDF.pdf`
- Demo script: [`DEMO.md`](./DEMO.md)
- Error codes: [`docs/ERRORS.md`](./docs/ERRORS.md)
- Knowledge graph: `graphify-out/graph.html` (run `/graphify .` to rebuild)
