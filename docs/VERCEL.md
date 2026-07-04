# Deploy on Vercel (frontend) + hosted API (backend)

Vercel runs the **Next.js** app. The **FastAPI** backend (Postgres, Redis, LLM, file uploads) must run on a host that supports long-lived Python processes — e.g. [Railway](https://railway.app) ([`docs/RAILWAY.md`](./RAILWAY.md)), [Render](https://render.com), or Fly.io.

```
Browser → Vercel (Next.js)
              ↓ NEXT_PUBLIC_API_URL (direct, recommended)
              → https://your-api.onrender.com (FastAPI)
```

---

## 1. Deploy the API (Render — included blueprint)

1. Push this repo to GitHub.
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → connect the repo.
3. Render creates `manage-agent-api`, Postgres, and Redis from [`render.yaml`](../render.yaml).
4. Set **manual** env vars on the web service:
   - `CORS_ORIGINS` = your Vercel production URL, e.g. `https://manage-agent.vercel.app`
   - `OPENAI_API_KEY` / `OPENAI_BASE_URL` (if using gateway LLM)
   - Fix DB URLs if needed (see below).
5. **Shell** on the web service (or one-off job):

```bash
alembic upgrade head
python -m src.database.seed --reset-agents
```

6. Copy the service URL, e.g. `https://manage-agent-api.onrender.com`.

### Render database URL format

Render provides `postgresql://…`. The app expects async SQLAlchemy URLs. After the DB is created, set:

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | `postgresql+asyncpg://USER:PASS@HOST/DB` |
| `DATABASE_SYNC_URL` | `postgresql+psycopg2://USER:PASS@HOST/DB` |

(`CORS_ALLOW_VERCEL_PREVIEWS=true` is already in the blueprint for `*.vercel.app` previews.)

---

## 2. Deploy the frontend on Vercel

### Import project

1. [vercel.com/new](https://vercel.com/new) → import the Git repo.
2. **Root Directory:** `frontend`
3. Framework: **Next.js** (auto-detected)
4. **Environment variables** (Production + Preview):

| Variable | Example | Required |
|----------|---------|----------|
| `NEXT_PUBLIC_API_URL` | `https://manage-agent-api.onrender.com` | **Yes** (recommended) |
| `NEXT_PUBLIC_LOG_CLIENT_ERRORS` | `true` | Optional |
| `NEXT_PUBLIC_API_TIMEOUT_MS` | `30000` | Optional |
| `NEXT_PUBLIC_API_LONG_TIMEOUT_MS` | `600000` | Optional |

See [`frontend/.env.vercel.example`](../frontend/.env.vercel.example).

5. **Deploy**.

### Option B — proxy via Vercel rewrites (same domain)

Instead of `NEXT_PUBLIC_API_URL`, set:

| Variable | Value |
|----------|--------|
| `INTERNAL_API_URL` | `https://manage-agent-api.onrender.com` |

Leave `NEXT_PUBLIC_API_URL` unset. The browser calls `/api/v1/…` on your Vercel domain; Next rewrites to the API.

**Caveat:** Vercel serverless proxy timeouts (10s Hobby / up to 300s Pro) can break long agent runs. Prefer **Option A** (direct `NEXT_PUBLIC_API_URL`).

---

## 3. CORS checklist

On the API host:

```env
CORS_ORIGINS=https://your-production.vercel.app
CORS_ALLOW_VERCEL_PREVIEWS=true
```

Redeploy the API after changing env.

---

## 4. Verify

1. `https://your-api.onrender.com/health` → `{"status":"ok"}`
2. Open the Vercel URL → login with seeded admin (from Render `FIRST_ADMIN_PASSWORD` in env / logs).
3. Create or open an agent → chat invoke works.

---

## 5. Vercel CLI (optional)

```bash
npm i -g vercel
cd frontend
vercel link
vercel env pull .env.local
# Edit .env.local — set NEXT_PUBLIC_API_URL to your API
vercel --prod
```

---

## 6. What runs where

| Component | Vercel | Render / other |
|-----------|--------|----------------|
| Next.js UI | ✅ | — |
| FastAPI | — | ✅ |
| PostgreSQL | — | ✅ |
| Redis | — | ✅ |
| Agent files (`var/`) | — | ✅ persistent disk / volume |
| cursor-to-api | — | Optional separate service |

---

## 7. Troubleshooting

| Issue | Fix |
|-------|-----|
| CORS error in browser | Set `CORS_ORIGINS` + `CORS_ALLOW_VERCEL_PREVIEWS` on API |
| 401 on all requests | API URL wrong in `NEXT_PUBLIC_API_URL` |
| Invoke timeout | Use direct API URL; increase `NEXT_PUBLIC_API_LONG_TIMEOUT_MS` |
| Build fails on Vercel | Root Directory must be `frontend`; use `npm ci --legacy-peer-deps` |
| Migrations missing | Run `alembic upgrade head` on API host |

---

## Local dev unchanged

```bash
cp frontend/.env.example frontend/.env
make dev
```

Docker production deploy: [`DEPLOYMENT.md`](./DEPLOYMENT.md).
