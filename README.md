# manage-agent — Enterprise AI Agent Workspace

A multi-agent enterprise platform built with **Next.js 15** + **FastAPI** + **LangChain**.

> Inspired by the wireframe spec in `/docs/پلتفرم سازمانی AI — PDF.pdf`.
> Full implementation plan is in [`PLAN.md`](./PLAN.md).
> Step-by-step build log is in [`PROGRESS.md`](./PROGRESS.md).

---

## Features (target)

- 🔐 Enterprise auth (SSO/SAML stub + password + MFA-ready)
- 🤖 24+ AI agents across finance, HR, support, sales, ops
- 🛠️ 5-step agent creation wizard with live preview
- 📊 Real-time dashboards: costs, uptime, performance, alerts
- 👥 RBAC with per-agent permissions
- 🧾 Audit log + activity history
- 💸 Budget tracking & cost limits per agent
- 🌐 Persian (RTL) + English locales

---

## Quick start

```bash
# 1. Copy env files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 2. Bring everything up
docker compose up -d

# 3. Demo-ready seed (catalog agents only, no test clutter)
chmod +x scripts/demo-prep.sh
./scripts/demo-prep.sh

# 4. Open
xdg-open http://localhost:3000
```

Default admin: **admin@example.com** / **admin123** (change in production).

**Supervisor demo:** see [`DEMO.md`](./DEMO.md) · **Production (Ubuntu CLI):** [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) · **Errors/logging:** [`docs/ERRORS.md`](./docs/ERRORS.md)

### Production on Ubuntu (CLI)

```bash
git clone <repo> /opt/manage-agent && cd /opt/manage-agent
export PUBLIC_URL=http://YOUR_SERVER_IP
sudo ./scripts/install-ubuntu.sh
```

---

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | Next.js 15 · React 19 · TypeScript · TailwindCSS · shadcn/ui · TanStack Query · Zustand |
| Backend | FastAPI · Python 3.12 · LangChain · SQLAlchemy 2 · Pydantic v2 · Alembic |
| Data | PostgreSQL 16 · Redis 7 |
| Infra | Docker Compose · Nginx (prod) |

---

## Repository structure

See [`PLAN.md` §4](./PLAN.md#4-repo-layout) for the full layout.

```
manage-agent/
├── backend/    # FastAPI + LangChain
├── frontend/   # Next.js 15
├── docs/       # architecture, API, deployment
├── PLAN.md     # master plan
└── PROGRESS.md # build journal
```

---

## Development

**One command** (Postgres/Redis in Docker; API + Next on host — lower RAM than `docker compose up`):

```bash
make dev
# or: ./scripts/dev.sh
```

Stops API + Next on Ctrl+C; leaves Postgres/Redis running.

Manual split:

```bash
# Backend
cd backend
uv sync             # or: pip install -e .
uvicorn src.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

---

## License

Proprietary — internal project.
