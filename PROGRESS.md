# Implementation Progress Log

> Append-only journal of completed steps. Future AI agents / developers read this top-to-bottom to understand state.
> Format: `## <STEP-ID> — <Title>   (✅ <date time>)`

---

## A1 — Root scaffolding   (✅ 2026-05-18 10:27)

**Created files:**
- `PLAN.md` — master plan, architecture, phases, schema
- `PROGRESS.md` — this log
- `README.md` — quick-start & project overview
- `.gitignore` — Python + Node + IDE + env ignores
- `docker-compose.yml` — postgres + redis + backend + frontend services

**Decisions:**
- Docker Compose v2 syntax (no `version:` key)
- Service names: `postgres`, `redis`, `backend`, `frontend` (nginx added in Phase F3)
- Database name: `manage_agent`, user: `admin`, password via env var
- Default ports: frontend 3000, backend 8000, postgres 5432, redis 6379

**Next:** A2 — Backend skeleton (pyproject.toml, Dockerfile, src/main.py, config.py)

---

<!-- New entries appended below this line -->

## A2 — Backend skeleton   (✅ 2026-05-18 10:31)

**Created files:**
- `backend/pyproject.toml` — dependencies (FastAPI, LangChain, SQLAlchemy 2, Pydantic v2, alembic, etc.) + dev tools (ruff, pytest, mypy)
- `backend/Dockerfile` — Python 3.12-slim, installs `-e .[dev]`
- `backend/.env.example` — all env vars with sensible defaults
- `backend/src/__init__.py` — package marker
- `backend/src/config.py` — `Settings` class via pydantic-settings, `get_settings()` singleton
- `backend/src/logger.py` — structlog setup (console in dev, JSON in prod)
- `backend/src/main.py` — FastAPI app factory with lifespan, CORS, `/` and `/health` endpoints

**Decisions:**
- Used `[project]` (PEP 621) format in pyproject; setuptools backend (works with `pip install -e .`)
- Pinned `bcrypt==4.0.1` because newer versions broke passlib
- `Settings` uses `model_config = SettingsConfigDict(env_file=".env", extra="ignore")`
- `cors_origins` is stored as a CSV string and exposed via `cors_origins_list` property (works with both env strings and python lists)
- Logger emits structured JSON in prod, pretty colored output in dev/test

**Next:** A3 — Database layer (DONE in same batch); A4 — Models (DONE)

---

## A3 — Database layer   (✅ 2026-05-18 10:32)

**Created files:**
- `backend/src/database/__init__.py` — re-exports Base, engine, session
- `backend/src/database/base.py` — `Base` (DeclarativeBase) + `UUIDPkMixin` + `TimestampMixin`
- `backend/src/database/session.py` — async engine + `async_session_maker` + `get_db()` FastAPI dep
- `backend/alembic.ini` — script_location=alembic, URL set dynamically in env.py
- `backend/alembic/env.py` — uses `settings.database_sync_url` + imports all models
- `backend/alembic/script.py.mako` — migration template
- `backend/alembic/versions/.gitkeep`

**Decisions:**
- Use **async** SQLAlchemy with `asyncpg` driver for runtime, but **sync** psycopg2 for Alembic (Alembic doesn't fully support async migrations yet — keep separate `DATABASE_SYNC_URL`)
- UUID PKs everywhere (PG_UUID native, generated via `default=uuid4` in Python — works without `pgcrypto` extension)
- TimestampMixin uses `server_default=func.now()` + `onupdate=func.now()` (server-side, timezone-aware)

**Next:** A4 — Models (DONE)

---

## A4 — ORM Models   (✅ 2026-05-18 10:33)

**Created files (`backend/src/models/`):**
- `__init__.py` — re-exports all models for Alembic discovery
- `user.py` — `User` (email, hashed_password, MFA, locale, department, …)
- `permission.py` — `Role`, `Permission`, `user_roles`, `role_permissions` (M2M tables)
- `agent.py` — `Agent` with `AgentStatus` enum, LLM config, tools array, memory config, cost limits, owner FK
- `budget.py` — `Budget` with `BudgetPeriod` enum, agent-scoped
- `activity_log.py` — `ActivityLog` with `ActivityStatus`, tokens, cost, duration
- `audit_log.py` — `AuditLog` (append-only, with INET ip_address)
- `dashboard.py` — `DashboardConfig` (per-user JSONB widgets/layout)

**Decisions:**
- `tool_names: list[str]` stored as Postgres `ARRAY(String)` — efficient, allows GIN index later
- `memory_config`, `config_json` as JSONB for flexible schemas without migrations
- `cost_usd` uses `Numeric(10, 6)` — cents-level precision over millions of dollars
- All relationships use `back_populates` (bidirectional, explicit)
- `ondelete="SET NULL"` for owner (preserve audit trail), `CASCADE` for owned children
- Pylance "Import could not be resolved" warnings are because dependencies aren't installed locally yet — will resolve once `pip install -e .` runs in Docker

**Next:** A5 — Pydantic schemas, then A6 — Auth (JWT)

---

## A5 — Pydantic schemas   (✅ 2026-05-18 10:35)

**Created (`backend/src/schemas/`):** `__init__.py`, `common.py` (Page, ResponseEnvelope), `auth.py` (LoginRequest, TokenPair, TokenPayload), `user.py` (UserCreate/Update/Read + RoleRead), `agent.py` (AgentCreate/Update/Read + AgentInvokeRequest/Response), `budget.py`, `activity.py`.

**Decisions:**
- All read schemas use `model_config = ConfigDict(from_attributes=True)` (Pydantic v2 way to enable ORM mode)
- Reused `AgentStatus`, `BudgetPeriod`, `ActivityStatus` enums from models (no duplication)
- `AgentInvokeRequest.thread_id` for memory continuity across calls

---

## A6 — Auth + B1-B3 (repos, services, API)   (✅ 2026-05-18 10:38)

**Created:**
- `backend/src/core/{__init__,security,permissions,costs}.py` — JWT/bcrypt, RBAC check, naive cost estimator
- `backend/src/api/dependencies.py` — `oauth2_scheme`, `get_current_user`, `get_current_superuser`, `DB`/`CurrentUser`/`CurrentSuperuser` Annotated aliases
- `backend/src/repositories/{__init__,base,user_repo,agent_repo,budget_repo,activity_repo}.py` — generic `BaseRepository[T]` + specifics
- `backend/src/services/{__init__,auth_service,agent_service}.py` — orchestrate business logic
- `backend/src/api/v1/{__init__,router,auth,users,agents,dashboards}.py` — REST endpoints
- Wired into `main.py` via `app.include_router(api_router, prefix=settings.api_v1_prefix)`

**Endpoints now live:**
- `POST /api/v1/auth/register` — sign up
- `POST /api/v1/auth/login` — JSON body login
- `POST /api/v1/auth/token` — OAuth2 form (used by /docs)
- `GET  /api/v1/auth/me` — current user
- `GET  /api/v1/users` — list users (superuser only)
- `GET/POST/PATCH/DELETE /api/v1/agents[/{id}]` — agent CRUD
- `GET  /api/v1/dashboards/overview` — platform stats
- `GET  /api/v1/dashboards/top-agents` — top by run count

**Decisions:**
- JWT with `sub` = user UUID, `type` = `access` or `refresh`, HS256
- Bcrypt via passlib (pinned `bcrypt==4.0.1`)
- Used `python-slugify` for auto-generating agent slugs from name
- All endpoints require auth except `register` and `login`
- Pylance errors are expected (deps not installed locally) — will resolve via Docker

---

## C1-C4 — LangChain core   (✅ 2026-05-18 10:40)

**Created (`backend/src/langchain/`):**
- `tool_registry.py` — `ToolRegistry` class + `@register_tool` decorator
- `custom_tools.py` — 4 stub business tools: `budget_lookup`, `hr_lookup`, `report_generate`, `crm_lookup` (all `@tool`-decorated, registered in registry)
- `agent_factory.py` — `build_agent_executor(agent: Agent)` builds an `AgentExecutor` from an ORM row using `create_tool_calling_agent` + `ChatOpenAI`
- `memory.py` — in-memory thread store (placeholder, swap for Redis later)

**Decisions:**
- Pattern: DB Agent row → factory → fully-configured runtime AgentExecutor
- Tools register via slug; `agent.tool_names: list[str]` references them
- LLM provider switchable; currently OpenAI only (Anthropic stub for later)
- `agent_scratchpad` + `chat_history` placeholders in the prompt enable tool-calling + memory

**Next:** B5 (seed), then frontend (D1-E5)

---

## B5 — Seed script + tests   (✅ 2026-05-18 10:41)

**Created:**
- `backend/src/database/seed.py` — creates admin user + 5 sample agents (Payroll, Bank Recon, Invoice, Resume, Support)
- `backend/tests/conftest.py` + `backend/tests/test_health.py` — smoke test

**Run:**
```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python -m src.database.seed
```

---

## D1-D4 + E1 — Frontend foundation + dashboard   (✅ 2026-05-18 10:43)

**Created (`frontend/`):**
- `package.json` — Next.js 15 (App Router), React 19, Tailwind v3, TanStack Query, Zustand, react-hook-form, zod, axios, recharts, lucide-react, shadcn-style deps (Radix primitives, clsx, tailwind-merge, cva)
- `Dockerfile` — node:20-alpine, `npm install --legacy-peer-deps`, `npm run dev`
- `.env.example` — `NEXT_PUBLIC_API_URL`, `INTERNAL_API_URL`
- `tsconfig.json`, `next.config.ts` (with rewrite for backend), `tailwind.config.ts` (brand colors, Vazirmatn font), `postcss.config.js`
- `src/app/globals.css` — Tailwind base + Vazirmatn font import
- `src/app/layout.tsx` — root layout (`<html lang="fa" dir="rtl">`)
- `src/app/page.tsx` — landing page with CTAs
- `src/app/login/page.tsx` — login form (client component, calls `/auth/login`)
- `src/app/dashboard/page.tsx` — overview dashboard (calls `/dashboards/overview`)
- `src/lib/api.ts` — axios client with JWT interceptor + `login()`/`logout()` helpers
- `src/lib/utils.ts` — `cn()` (tailwind-merge + clsx)

**Decisions:**
- Next.js **15 + React 19 RC** (matches latest stable in 2026)
- App Router (`src/app/...`), no Pages Router
- RTL by default for Persian UI; LTR class on individual elements when needed
- Vazirmatn font loaded via CDN @import (no `next/font` to keep Docker simpler)
- JWT stored in `localStorage` (simple); upgrade to httpOnly cookies in Phase F1
- TS path alias `@/* → ./src/*`
- All `Cannot find module` errors are expected — `npm install` runs in Docker

**Next:** E2-E5 — agent detail, admin, wizard, users pages; then F1-F4 — tests/dockerize/polish

---




## LOCAL-RUN — Local development setup (without Docker)   (✅ 2026-05-18 11:37)

**Setup:**
- PostgreSQL and Redis running in Docker containers (ma-postgres, ma-redis) on ports 5432 and 6379
- Backend running locally with Python virtual environment
- Frontend running locally with Node.js

**Backend setup:**
- Created Python virtual environment: `backend/venv/`
- Installed all dependencies via pip (FastAPI, LangChain, SQLAlchemy, etc.)
- Updated `backend/.env` to use `localhost` instead of Docker service names
- Database already migrated and seeded (admin user exists)

**Frontend setup:**
- Installed Node.js dependencies with `npm install --legacy-peer-deps`
- Fixed permission issues with node_modules directory

**Running services:**
- Backend: `cd backend && ./venv/bin/uvicorn src.main:app --host 0.0.0.0 --port 8000`
  - Running on http://localhost:8000
  - Health endpoint: http://localhost:8000/health
- Frontend: `cd frontend && npm run dev`
  - Running on http://localhost:3000
  - Landing page loads successfully with Persian RTL layout

**Credentials:**
- Admin user: admin@manage-agent.local / admin123
- Database: admin / admin
- Redis password: redis

**Next steps:**
- Test login functionality
- Verify API endpoints
- Test agent creation and management

---


## LOCAL-RUN-FIX — Fixed email validation and CORS   (✅ 2026-05-18 11:41)

**Issues resolved:**
- Email validator was rejecting `.local` TLD domains
- Updated admin email from `admin@manage-agent.local` to `admin@example.com`
- Backend restarted and confirmed working on http://localhost:8000
- CORS configured correctly for http://localhost:3000

**Updated credentials:**
- Email: `admin@example.com`
- Password: `admin123`

**Verified endpoints:**
- GET http://localhost:8000/ → Returns app info
- GET http://localhost:8000/health → Returns {"status":"ok"}
- POST http://localhost:8000/api/v1/auth/login → Returns JWT tokens successfully

**Both services running:**
- Backend: Session 38941 (uvicorn with --reload)
- Frontend: Session 99464 (npm run dev)

---

## PDF-BUILD — Full PDF wireframe implementation   (✅ 2026-05-18)

**Scope:** Complete all 6 PDF pages + backend APIs + SSE invoke + gapgpt LLM config.

**Backend changes:**
- Configured OpenAI-compatible gateway: `OPENAI_BASE_URL=https://api.gapgpt.app/v1`, model `gpt-5.3-chat-latest`
- Added routes: `/roles`, `/audit`, extended `/dashboards` (usage, health, events, departments)
- Added `GET /agents/by-slug/{slug}` for frontend routing
- SSE streaming on `POST /agents/{id}/invoke?stream=true`
- Seed: sample roles + audit events

**Frontend changes:**
- App shell: sidebar, header, auth guard, Zustand store, TanStack Query provider
- Page 1: Enhanced login with SSO stub + branding (`(auth)/login`)
- Page 2: Dashboard with agent grid, quick prompt, KPI cards (`(dashboard)/dashboard`)
- Page 3: Agent chat + activity chart (`(dashboard)/agents/[slug]`)
- Page 4: Admin overview with Recharts (`(dashboard)/admin`)
- Page 5: 5-step agent wizard (`(dashboard)/agents/create`)
- Page 6: Users & access table (`(dashboard)/users`)

**Next:** Run E2E tests (login → dashboard → invoke agent)

---

## PDF-TEST — E2E verification   (✅ 2026-05-18 12:30)

**API tests (all 200):**
- Auth login, dashboards (overview, top-agents, departments, health, events, usage)
- Agents list, by-slug, tools; users, roles

**Frontend tests (all 200):**
- `/`, `/login`, `/dashboard`, `/admin`, `/users`, `/agents/create`, `/agents/payroll`
- `npm run typecheck` — pass
- `npm run build` — pass (9 routes)

**LLM invoke note:**
- `POST /agents/{id}/invoke` returns timeout when calling `https://api.gapgpt.app/v1` from this environment (gateway connection stalls >90s). Config is correct in `backend/.env`; retry when network to gapgpt is available.

**Updated agents DB:** all agents set to `gpt-5.3-chat-latest`.

---

## G1 — CORS fix   (✅ 2026-05-18 13:05)

**Problem:** Browser OPTIONS to `/auth/login` returned 400 when frontend ran on port 3001 or `[::1]:3000`.

**Fix:**
- Dev mode uses `allow_origin_regex` for localhost / 127.0.0.1 / [::1] on any port
- Rate limit middleware skips OPTIONS preflight
- Updated `CORS_ORIGINS` in `.env` and `.env.example`

**Verified:** OPTIONS → 200 for ports 3000, 3001, IPv6.

---

## G2 — Expanded pytest   (✅ 2026-05-18 13:08)

**Added:** `tests/test_cors.py`, `tests/test_auth.py` (login, refresh, route, budgets, keyword routing).

**Result:** 9 passed.

---

## G3 — Vitest frontend   (✅ 2026-05-18 13:08)

**Added:** `vitest.config.ts`, `src/lib/utils.test.ts`, `npm run test`.

**Result:** 2 passed.

---

## G4 — Documentation   (✅ 2026-05-18 13:06)

**Created:** `docs/architecture.md`, `docs/api-reference.md`, `docs/langchain-guide.md`.

---

## G5 — nginx reverse proxy   (✅ 2026-05-18 13:06)

**Created:** `nginx/nginx.conf`, docker-compose `nginx` service (profile: `prod`).

**Usage:** `docker compose --profile prod up -d` → http://localhost:80

---

## G6 — Redis conversation memory   (✅ 2026-05-18 13:05)

**Updated:** `backend/src/agents_lib/memory.py` — Redis list per thread, 7-day TTL, in-memory fallback.

---

## G7 — LangGraph tool-calling   (✅ 2026-05-18 13:05)

**Created:** `backend/src/agents_lib/graph_agent.py` using `create_react_agent`.
Agents with `tool_names` use ReAct loop; others use direct ChatOpenAI.

---

## G8 — Budget API   (✅ 2026-05-18 13:07)

**Created:** `BudgetService`, `/api/v1/budgets`, `/budgets/summary`.
**Seed:** monthly budgets for finance agents.
**Frontend:** budget KPI cards on admin page.

---

## G9 — Per-agent permissions   (✅ 2026-05-18 13:07)

**Created:** `AgentUserPermission` model + migration, `/api/v1/agent-permissions`.
**Seed:** admin granted invoke+configure on all agents.
**Frontend:** permission matrix table on `/users`.

---

## G10 — Routing + refresh tokens   (✅ 2026-05-18 13:08)

**Backend:** `POST /agents/route` (keyword router), `POST /auth/refresh`.
**Frontend:** dashboard quick-prompt uses route API; axios 401 interceptor auto-refreshes JWT.

**E2E verified:** login → route payroll → budgets summary (pytest).

---

## PRO-UI — Orange UI, real routes, orchestration panel   (✅ 2026-05-19 11:00)

**Backend:**
- `orchestrator_service.py` — cache → RAG → dynamic tools → invoke → notifications
- `external_apis`, `notifications`, `knowledge`, `conversations` APIs
- `dynamic_tools.py` — external endpoints as LangGraph tools
- Migration `b2c3d4e5f6a7` (notifications, external APIs, document chunks)
- Enum fix: `values_callable` on `AuthType` / `NotificationSeverity` for PostgreSQL
- Seed: 3 sample notifications for admin
- Tests: `tests/test_platform.py` (13 pytest total passing)

**Frontend:**
- Orange brand theme (`tailwind.config.ts`, `globals.css`)
- Sidebar routes: `/conversations`, `/integrations`, `/knowledge`, `/agents`, `/settings` (no dashboard stubs)
- `NotificationsPanel` wired to API
- Agent wizard step 4: per-user `can_invoke` / `can_configure` grants
- Pages: integrations CRUD + endpoint test, knowledge ingest/search, agents list, settings

**Verified:** `pytest tests/` (13), `npm run typecheck`, `vitest`, `next build` (14 routes).

---

## PDF-FULL — PDF parity build (6 pages)   (✅ 2026-05-20 11:56)

**Backend:**
- Added sidebar counts endpoint: `GET /api/v1/dashboards/sidebar` (includes `my_agents`, `conversations`, `unread_notifications`, `pending_access_requests`) in `backend/src/api/v1/dashboards.py`.
- Added agent file upload + RAG ingestion:
  - Model: `backend/src/models/agent_file.py`
  - Migration: `backend/alembic/versions/c3d4e5f6a7b8_agent_files.py`
  - API: `POST/GET /api/v1/agents/{agent_id}/files` in `backend/src/api/v1/agent_files.py`
  - Service: `backend/src/services/agent_file_service.py` (stores raw file + best-effort text extract + vector upsert)
- Added prompt templates + improve endpoint:
  - `GET /api/v1/prompt-templates`
  - `POST /api/v1/prompts/improve`
  - Implementation: `backend/src/api/v1/prompts.py`, schemas in `backend/src/schemas/prompt.py`
- Added access request workflow:
  - Model: `backend/src/models/access_request.py`
  - Migration: `backend/alembic/versions/d4e5f6a7b8c9_access_requests.py`
  - API: `POST /api/v1/access-requests`, `GET /api/v1/access-requests`, `POST /api/v1/access-requests/{id}/approve|reject` in `backend/src/api/v1/access_requests.py`
- Updated `backend/src/api/v1/router.py` to mount `agent-files`, `prompts`, and `access-requests`.

**Frontend (PDF pages 1–6):**
- Shell parity:
  - Sidebar has **workspace/admin view-mode toggle**, identity block, per-item counts, and department chips: `frontend/src/components/layout/sidebar.tsx`
  - Header shows workspace label + breadcrumb and keeps notifications working: `frontend/src/components/layout/header.tsx`
  - Persisted view mode in `frontend/src/stores/ui-store.ts`
- Login page parity (SAML stub, remember-me, version footer): `frontend/src/app/(auth)/login/page.tsx`
- Dashboard parity (greeting + pending, filter chips, example prompts, KPI strip, monthly runs): `frontend/src/app/(dashboard)/dashboard/page.tsx`
- Agent detail parity (tabs, KPI strip, line + donut charts, review table, chat): `frontend/src/app/(dashboard)/agents/[slug]/page.tsx`
- Admin overview parity (time-range segmented control, usage chart, top agents, health, events, header CTAs): `frontend/src/app/(dashboard)/admin/page.tsx`
- Users parity (stat chips, filter bar, two-pane master/detail, CSV export, invite modal): `frontend/src/app/(dashboard)/users/page.tsx`
- Wizard parity (5 steps, autosave indicator, templates + variables, improve button, risk actions, policies, live preview): `frontend/src/app/(dashboard)/agents/create/page.tsx`
- UI primitives tightened toward the PDF: updated `frontend/src/components/ui/{input,button,badge}.tsx`.

**Tests executed (full run):**
- Backend: `alembic upgrade head` then `pytest backend/tests/ -q` → **15 passed**
- Frontend: `npm run typecheck` → pass; `npm run test -- --run` → pass; `rm -rf .next && npm run build` → pass

---

## UI-MOTION-LAYOUT — Motion kit, RTL layout fixes, admin grid   (✅ 2026-05-20)

> **Chat session context** (Cursor agent transcript `fd8f3f51-8784-4603-b925-b23ad91b5aed`).  
> User goal: visible page transitions/animations, fix chart/badge/layout regressions on dashboard pages, especially `/admin` and `/users`.

### User requests (chronological)

1. **Motion / animations** — logout animation, home ↔ login transitions, home page component loading animations.
2. **“Animations did nothing”** — prior motion work was not visible at runtime.
3. **Chart bugs** — Persian text misaligned in Recharts; pie chart clipping outside container.
4. **Badge bug** — metric delta like `+177%` split into two boxes (`177%` / `+`) in agent detail review table (RTL bidi).
5. **Agent creation wizard** — laggy animations; simplify motion.
6. **Pages loading twice / broken UI** — especially `/users` (duplicate stacked content) and admin layout.
7. **Admin layout** — «سلامت سامانه» (System Health) box too low vs «رویدادهای اخیر» (Recent Events); chart card had huge empty vertical space.
8. **Regression feedback** — user reported fixes made things worse (crushed bottom cards, only headers visible).
9. **“Still the same”** — after flex-row fix, layout still looked like column stacking (chart above health on the right).
10. **Save chat context** — append full session notes to this `PROGRESS.md` file.

### Root causes identified

| Symptom | Root cause |
|--------|------------|
| No visible animations | `Stagger` gated by `disabled`; `template.tsx` `AnimatePresence` remounted on navigation; plain `<Link>` on home with no exit |
| Duplicate pages / stacked routes | `PageTransition` with `AnimatePresence mode="sync"` showed old + new routes at once |
| Crushed admin cards | `PageTransition` `min-h-full` + shell `Stagger`/`StaggerItem` flex stretched row 2 |
| Health box too low vs events | Single CSS grid (or RTL column-flow): chart + health stacked in **right column** while events sat left |
| Badge `+` split | RTL bidi: trailing `+` in `۱۷۷٪+` wrapped to new line |
| Chart text / clipping | RTL page + Recharts; pie too large, missing margins |
| Wizard lag | Nested `Stagger` + `PanelTransition` + 1s autosave re-rendering whole page |

### Motion kit (workspace rule: `.cursor/rules/ui-style-and-motion.mdc`)

**Location:** `frontend/src/components/motion/`

| File | Role |
|------|------|
| `variants.ts` | `slideRight`, `slideLeft`, `slideUp`, `slideDown`, `scaleIn`, `popIn`, `fadeIn` (+ reduced-motion opacity fallbacks); chart RTL helpers |
| `stagger.tsx` | `<Stagger>` + `<StaggerItem>`; added `initial` prop so items can exit without entering |
| `shared.tsx` | `<SharedLogo layoutId="brand-logo" />` for login ↔ sidebar morph |
| `transitions.tsx` | `PageTransition` (main content only), `PanelTransition` (tabs/steps) |

**Conventions:** ~140–200ms, ease-out `[0.22, 1, 0.36, 1]`; no blur on layout-sized containers; `sessionStorage` key `ma_shell_revealed` for one-shot shell intro.

### Files changed — motion & navigation

| File | Change |
|------|--------|
| `frontend/src/components/motion/stagger.tsx` | `initial` prop; hooks before conditional branches |
| `frontend/src/components/motion/transitions.tsx` | `PageTransition`: `mode="wait"`, removed `min-h-full`, `layout={false}`; `PanelTransition`: `preset="fade"`, `mode="wait"` |
| `frontend/src/components/motion/variants.ts` | `getFadePanelVariants`, `getMarketingRouteVariantsDirected`, chart RTL helpers |
| `frontend/src/lib/logout-flow.ts` | `performLogout()` with `loggingOut` + brand morph |
| `frontend/src/app/template.tsx` | Pass-through (cross-route `AnimatePresence` does not work reliably in App Router) |
| `frontend/src/app/(public)/page.tsx` | Intercepted nav with `leaving` exit before `router.push` |
| `frontend/src/app/(auth)/login/page.tsx` | Stagger + leaving flow (existing pattern extended) |

### Files changed — shell & layout

| File | Change |
|------|--------|
| `frontend/src/components/layout/app-shell.tsx` | Rewritten: plain `div` flex, **no** shell-level `Stagger`/`PageTransition`; `min-h-0` on column + `main`; logout via opacity on content column |
| `frontend/src/components/layout/header.tsx` | Static header, no motion wrappers |
| `frontend/src/components/layout/sidebar.tsx` | `Stagger` only when `shellReveal \|\| loggingOut` (`disabled` otherwise) |
| `frontend/src/components/layout/dashboard-card-grid.tsx` | Evolved through iterations → **`DashboardFourCardGrid`** + `dashboardGridSlot` (explicit 2×2 placement); kept `DashboardTwoColRow` as deprecated |

### Files changed — admin page layout (final approach)

**Problem:** In RTL, implicit grid column-flow placed items vertically in the right column: chart → health, while events stayed left — health appeared far below events.

**Solution:** One grid, `grid-flow-row`, explicit `col-start` / `row-start` per card (`md` breakpoint, not `lg`, so 2-column works with sidebar on ~900–1100px viewports).

**Target desktop layout (RTL, col 1 = right):**

```
[ پرکارترین ایجنت‌ها ]  [ مصرف ایجنت‌ها ]
[ سلامت سامانه      ]  [ رویدادهای اخیر  ]
```

| Slot | Grid placement | Card |
|------|----------------|------|
| `topRight` | `md:col-start-1 md:row-start-1` | Usage chart (`مصرف ایجنت‌ها`) |
| `topLeft` | `md:col-start-2 md:row-start-1` | Top agents |
| `bottomLeft` | `md:col-start-2 md:row-start-2` | System health (under agents) |
| `bottomRight` | `md:col-start-1 md:row-start-2` | Recent events |

**`frontend/src/app/(dashboard)/admin/page.tsx`:**
- Replaced two `DashboardTwoColRow` wrappers with single `DashboardFourCardGrid`.
- Chart: `Card` `h-fit`, `CardBody` `h-[200px] max-h-[200px] shrink-0 overflow-hidden`, `ChartBox` `!h-[200px]`.
- Mobile stack order via `max-md:order-*` on cards.

### Files changed — charts

| File | Change |
|------|--------|
| `frontend/src/components/charts/chart-box.tsx` | LTR isolate (`dir="ltr"`), `overflow-hidden` |
| `frontend/src/components/charts/recharts-rtl.ts` | Margins, axis helpers, pie geometry (~74% outer radius) |

### Files changed — badges & metrics

| File | Change |
|------|--------|
| `frontend/src/lib/utils.ts` | `formatMetricDelta()`, `hasMetricSymbols()` |
| `frontend/src/components/ui/badge.tsx` | `whitespace-nowrap`, `shrink-0`, optional `dir="ltr"` |
| `frontend/src/app/(dashboard)/agents/[slug]/page.tsx` | Delta badges with LTR when needed; `DashboardTwoColRow` for charts |

### Files changed — other pages

| File | Change |
|------|--------|
| `frontend/src/app/(dashboard)/users/page.tsx` | Full rewrite: no page-level `Stagger`, plain layout, `Badge` for deltas |
| `frontend/src/app/(dashboard)/agents/create/page.tsx` | Removed nested stagger; isolated autosave |
| `frontend/src/app/(dashboard)/agents/create/autosave-line.tsx` | **New** — timer isolated from wizard body |
| Dashboard pages | `replayOnRoute` → `initial={false}` on outer `Stagger` where kept |

### Layout iterations attempted (admin)

1. Single 2×2 CSS `grid` with `items-stretch` — RTL column-flow bug persisted.
2. Two separate `DashboardTwoColRow` flex rows — user still saw stacking (likely same visual column or cache).
3. Removed `min-h-full` from `PageTransition`.
4. Removed shell `Stagger`.
5. Flex rows + `DashboardCol` (`lg:flex-row`) — user: «still the same».
6. **Final:** `DashboardFourCardGrid` + explicit grid slots + `md` breakpoint + chart height cap.

### Verification

- `npm run typecheck` — pass after grid refactor.
- Browser smoke on `http://localhost:3000/admin` (login `admin@example.com` / `admin123`): title «نمای کلی پلتفرم» loads; narrow side-panel viewport stacks cards (expected below `md`); wide viewport should show 2×2 grid.

### Remaining / follow-up for future agents

- [ ] User hard-refresh on `/admin` (Ctrl+Shift+R) if layout looks stale (HMR/cache).
- [ ] Audit other 2-col dashboard pages (`knowledge`, `settings`, `agents/[slug]`) for same RTL grid pitfall; migrate to `DashboardFourCardGrid` if needed.
- [ ] Re-add subtle `PageTransition` on `<main>` only **without** `min-h-full` or flex-breaking wrappers.
- [ ] Fix login page React hydration warning seen in browser automation (unrelated to admin grid).
- [ ] Optional: container queries (`@container`) if sidebar-heavy layouts need 2-col below viewport `md`.

### Credentials (local dev, unchanged)

- Email: `admin@example.com`
- Password: `admin123`
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`

---

## CAPS — Agent Kinds & Capabilities   (✅ 2026-05-20)

### Schema

- Migration `e5f6a7b8c9d0_agent_kinds.py`: `agents.kind`, `capabilities`, `file_policy`, `agent_link_policy` (JSONB); tables `agent_actions`, `agent_prompt_templates`, `agent_links`.
- Backfill: existing agents → `kind=chat`, `capabilities={"chat_enabled": true}`.

### Backend endpoints

| Method | Path |
|--------|------|
| CRUD | `/api/v1/agents/{id}/actions`, `.../actions/{slug}/run` |
| CRUD | `/api/v1/agents/{id}/templates` |
| CRUD + graph | `/api/v1/agents/{id}/links`, `.../links/graph` |
| Upload (policy) | `POST /api/v1/agents/{id}/files` (validates MIME/size/count) |

### Runtime

- `OrchestratorService`: capability gates (`chat_enabled`, `require_files_to_invoke`), depth limit, supervisor vs react paths.
- `agents_lib/agent_tools.py`: agent-as-tool delegation with permission checks + audit `agent.link_call`.
- `agents_lib/supervisor_graph.py`: router LLM picks sub-agent or `FINAL`.

### Frontend

- Wizard: 6 steps (Basics → Kind & Capabilities → Files & Policy [conditional] → Logic → Permissions → Review).
- Components: `kind-picker`, `capability-toggles`, `file-policy-form`, `action-repeater`, `template-repeater`, `linked-agents-picker`, `worker-action-grid`, `template-quick-picker`, `file-intake-panel`, `supervisor-graph`, `capability-aware-panel`.
- Detail page: capability-driven right rail (chat / actions / files / supervisor graph).
- Sidebar: `worker_agents` count on `/dashboards/sidebar`.

### Seed

- Demo agents: `demo-chat`, `demo-worker` (+ action + template), `demo-file-intake`, `demo-supervisor` (+ supervises links).

### Tests

- `backend/tests/test_agent_capabilities.py` (8 cases) — requires DB reachable from host.
- Vitest: `agent-presets.test.ts`, `linked-agents-picker.test.ts` — **11 passed**.
- `npm run typecheck` — pass.

### Verification note

- Host→Postgres on `localhost:5432` timed out in this environment; run `docker compose up -d`, `alembic upgrade head`, then `pytest` when DB is reachable.
- After migration: hard-refresh wizard and `/agents/demo-*` detail pages.

### Follow-up

- [ ] Wire `input_schema` mini-builder (currently key/title dict in seed + repeater).
- [ ] E2E supervisor invoke with mocked LLM in CI.
- [ ] Edit-agent page reusing wizard sub-components.

---
