# Demo guide — manage-agent

Use this script when presenting to a supervisor. The app is **Persian RTL**, multi-agent, with real LLM + tools (not fake button-to-Python shortcuts).

## Before the meeting (15 min)

```bash
# 1. Environment
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Edit backend/.env: set SECRET_KEY, OPENAI_API_KEY, OPENAI_BASE_URL (e.g. https://api.gapgpt.app/v1)

# 2. Clean demo data
chmod +x scripts/demo-prep.sh
./scripts/demo-prep.sh

# 3. Start stack
docker compose up -d
# or lean dev: make dev
```

**Login:** `admin@example.com` / `admin123`

## What to show (10–15 min)

| Step | URL | Message |
|------|-----|---------|
| 1 | `/dashboard` | Home + KPI cards; type «حقوق این ماه» → **route to payroll** |
| 2 | `/agents` | **16 catalog agents** only (no test clutter) |
| 3 | `/agents/example-karkard` | **تست ادمین** → action runs via **LLM + karkard_process** → download Excel |
| 4 | `/agents/payroll` or `/agents/invoice` | Worker actions + chat |
| 5 | `/agents/example-supervisor` | Supervisor routes to sub-agent |
| 6 | `/admin` | Users, agents, usage chart |
| 7 | `/agents/create` | 5-step wizard (optional) |

## Architecture (one sentence)

**Next.js** UI → **FastAPI** → **LangGraph ReAct** → **LLM** chooses tools → domain tools (Excel, reports, API, HR).

## If LLM is offline

- Actions/chat return **503** with a clear Persian message.
- Explain: gapgpt/network must be reachable; DB and file tools are otherwise healthy.

## Reset demo data anytime

```bash
make demo-prep
# or: docker compose exec backend python -m src.database.seed --reset-agents
```

## Production checklist

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
