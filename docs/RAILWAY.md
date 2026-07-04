# Deploy on Railway

Railway runs the **FastAPI** API (and optionally **Next.js**). Postgres and Redis are added as plugins. The frontend can also stay on [Vercel](./VERCEL.md) and call the Railway API URL.

```
Browser → Vercel or Railway (Next.js)
              ↓ NEXT_PUBLIC_API_URL (recommended)
              → https://your-api.up.railway.app (FastAPI)
```

---

## 1. Create the project

1. [railway.app/new](https://railway.app/new) → **Deploy from GitHub repo** → select this repository.
2. **Add service → Database → PostgreSQL** (note the service name, e.g. `Postgres`).
3. **Add service → Database → Redis** (e.g. `Redis`).
4. **Add service → GitHub repo** again (or **Empty Service** → connect repo) for the API:
   - **Settings → Root Directory:** `backend`
   - Railway picks up [`backend/railway.toml`](../backend/railway.toml) (Docker build + `releaseCommand` migrations).

5. **Networking → Generate domain** on the API service (e.g. `manage-agent-api-production.up.railway.app`).

---

## 2. API environment variables

In the **backend** service → **Variables**:

| Variable | Value | Notes |
|----------|--------|--------|
| `APP_ENV` | `production` | |
| `APP_DEBUG` | `false` | |
| `SECRET_KEY` | `openssl rand -hex 32` | Required |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Reference your Postgres plugin name |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` | Reference your Redis plugin name |
| `CORS_ORIGINS` | `https://your-frontend.vercel.app` | Comma-separated production origins |
| `CORS_ALLOW_VERCEL_PREVIEWS` | `true` | If frontend is on Vercel |
| `CORS_ALLOW_RAILWAY_DOMAINS` | `true` | If frontend is on Railway (`*.up.railway.app`) |
| `OPENAI_API_KEY` | `…` | Gateway LLM (if used) |
| `OPENAI_BASE_URL` | `…` | Optional compatible gateway |
| `FIRST_ADMIN_EMAIL` | `admin@example.com` | Change before go-live |
| `FIRST_ADMIN_PASSWORD` | strong password | Change before go-live |
| `AGENT_VALIDATION_TIMEOUT_SECONDS` | `600` | Recommended with cursor provider |

See [`backend/.env.railway.example`](../backend/.env.railway.example).

**`DATABASE_SYNC_URL`:** optional. If unset, the app derives `postgresql+psycopg2://…` from `DATABASE_URL` for Alembic.

Railway injects `PORT` automatically; the Docker image binds uvicorn to it.

---

## 3. Migrations and seed

[`backend/railway.toml`](../backend/railway.toml) runs `alembic upgrade head` on each deploy (`releaseCommand`).

**One-time seed** (Railway shell on the API service):

```bash
python -m src.database.seed --reset-agents
```

Default admin comes from `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD`.

---

## 4. Frontend options

### A — Vercel (recommended for Next.js)

1. Deploy `frontend/` on Vercel ([`docs/VERCEL.md`](./VERCEL.md)).
2. Set `NEXT_PUBLIC_API_URL` to your Railway API domain (no trailing slash).
3. Set API `CORS_ORIGINS` to the Vercel production URL; keep `CORS_ALLOW_VERCEL_PREVIEWS=true`.

### B — Railway (Next.js Docker)

1. New service → same repo → **Root Directory:** `frontend`.
2. **Variables** (build + runtime):
   - `NEXT_PUBLIC_API_URL` = `https://your-api.up.railway.app`
   - `NEXT_PUBLIC_LOG_CLIENT_ERRORS` = `true`
   - `NEXT_PUBLIC_API_LONG_TIMEOUT_MS` = `600000` (optional)
3. On the **API** service add the frontend Railway URL to `CORS_ORIGINS` and set `CORS_ALLOW_RAILWAY_DOMAINS=true`.
4. Redeploy frontend after changing `NEXT_PUBLIC_*` (baked in at build time).

[`frontend/railway.toml`](../frontend/railway.toml) uses the existing [`frontend/Dockerfile`](../frontend/Dockerfile).

### C — Same-origin proxy on Railway frontend

Set `INTERNAL_API_URL` to the API Railway URL and leave `NEXT_PUBLIC_API_URL` unset. Update [`frontend/next.config.ts`](../frontend/next.config.ts) / [`api-base.ts`](../frontend/src/lib/api-base.ts) — long agent runs may hit proxy timeouts; prefer **Option A** direct API URL.

---

## 5. Ephemeral disk

Railway containers use **ephemeral** filesystems. Uploaded agent files under `/app/var/agent_files` are lost on redeploy unless you attach a [Railway Volume](https://docs.railway.com/guides/volumes) mounted at `/app/var`.

---

## 6. Optional: cursor-to-api

The Cursor CLI proxy is not included in the default API image. For `cursor` LLM provider you need a separate host (Ubuntu Docker profile `cursor`, or a dedicated Railway service from `cursor-to-api/` with a custom image). Most deployments use the **gateway** provider with `OPENAI_API_KEY` / `OPENAI_BASE_URL`.

---

## 7. Checklist

| Step | Done |
|------|------|
| Postgres + Redis plugins | |
| API root directory = `backend` | |
| `DATABASE_URL` / `REDIS_URL` referenced | |
| `SECRET_KEY` + admin password set | |
| Domain generated for API | |
| `CORS_ORIGINS` + preview flags | |
| Deploy succeeded; `/health` returns `ok` | |
| Seed run once | |
| Frontend `NEXT_PUBLIC_API_URL` points to API | |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Build fails | Confirm **Root Directory** is `backend` or `frontend`, not repo root |
| 502 / health fail | Check deploy logs; verify `PORT` is not hard-coded to 8000 in overrides |
| DB connection error | `DATABASE_URL` must reference Postgres; wait for plugin to be ready |
| CORS in browser | Add exact frontend origin to `CORS_ORIGINS`; enable Railway/Vercel preview flags |
| Alembic missing | Redeploy after pulling latest `backend/Dockerfile` (includes `alembic/`) |
| Migrations not applied | Check **Deploy** logs for `releaseCommand`; run `alembic upgrade head` in shell |
| Uploads disappear | Mount a volume on `/app/var` or use external object storage |

---

## Compare with Render

[`render.yaml`](../render.yaml) is a one-click Blueprint for the same stack on Render. Railway uses per-service `railway.toml` and dashboard variable references (`${{Postgres.DATABASE_URL}}`). Both work with the Vercel frontend guide.
