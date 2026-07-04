# Production deployment (Ubuntu CLI)

Deploy **manage-agent** on an Ubuntu 22.04/24.04 server with Docker Compose, Nginx, PostgreSQL, and Redis. No desktop required — everything is shell-only.

## Architecture

```
Internet :80
    └── nginx (reverse proxy)
            ├── /api/*  → backend:8000  (FastAPI)
            └── /*      → frontend:3000 (Next.js standalone)
    postgres + redis (internal Docker network only)
```

Optional: `cursor-to-api` sidecar (profile `cursor`) if you use the Cursor agent CLI as LLM provider.

---

## Quick install (fresh Ubuntu server)

```bash
# 1. Clone
sudo apt-get update && sudo apt-get install -y git
sudo git clone <your-repo-url> /opt/manage-agent
cd /opt/manage-agent

# 2. Set public URL (IP or domain — no trailing slash)
export PUBLIC_URL=http://YOUR_SERVER_IP
# or: export PUBLIC_URL=https://agents.example.com

# 3. Install (Docker + compose + migrate + seed)
sudo chmod +x scripts/install-ubuntu.sh scripts/deploy-update.sh
sudo ./scripts/install-ubuntu.sh
```

The installer will:

- Install Docker Engine + Compose plugin
- Generate `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `SECRET_KEY`, admin password
- Write root `.env` and `backend/.env`
- Build and start all services behind Nginx on **port 80**
- Run `alembic upgrade head` and seed catalog agents
- Open UFW for SSH + HTTP (if UFW was inactive)

**Save the admin password** printed at the end.

---

## Manual setup (step by step)

```bash
cp .env.example .env
cp backend/.env.production.example backend/.env
# Edit both files — set PUBLIC_URL, passwords, OPENAI_API_KEY, FIRST_ADMIN_PASSWORD

docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod build
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d

docker compose exec backend alembic upgrade head
docker compose exec backend python -m src.database.seed --reset-agents
```

---

## Environment variables

### Root `.env` (Docker Compose)

| Variable | Description |
|----------|-------------|
| `PUBLIC_URL` | Public site URL, e.g. `https://agents.example.com` |
| `POSTGRES_*` | Database credentials |
| `REDIS_PASSWORD` | Redis auth |
| `COMPOSE_PROFILES=cursor` | Optional — start cursor-to-api |

### `backend/.env`

| Variable | Production |
|----------|------------|
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `SECRET_KEY` | `openssl rand -hex 32` |
| `CORS_ORIGINS` | Same as `PUBLIC_URL` |
| `OPENAI_API_KEY` | Required for gateway LLM |
| `FIRST_ADMIN_PASSWORD` | Strong password |

Frontend API URL is set at **build time** via `PUBLIC_URL` → `NEXT_PUBLIC_API_URL`. Same-origin (`/api/v1`) works when Nginx proxies `/api/`.

---

## HTTPS (recommended)

Put TLS in front of Nginx using one of:

**A. Caddy on the host** (simplest)

```bash
sudo apt install -y caddy
# /etc/caddy/Caddyfile:
# agents.example.com {
#   reverse_proxy localhost:80
# }
```

**B. Certbot + host Nginx** terminating SSL and proxying to Docker `:80`

**C. Cloud load balancer** (AWS ALB, Cloudflare) → server `:80`

After HTTPS is active, update:

```bash
# .env
PUBLIC_URL=https://agents.example.com
# backend/.env
CORS_ORIGINS=https://agents.example.com
```

Then rebuild frontend and restart:

```bash
sudo ./scripts/deploy-update.sh
```

---

## Operations

```bash
# Logs
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend

# Restart after .env change
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod restart backend

# Update after git pull
sudo ./scripts/deploy-update.sh

# Shell into backend
docker compose exec backend bash

# Backup Postgres
docker compose exec postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql
```

### Data volumes

| Volume | Contents |
|--------|----------|
| `pgdata` | PostgreSQL data |
| `redisdata` | Redis persistence |
| `backend_data` | Uploaded agent files, generated PDFs (`/app/var`) |

---

## Health checks

```bash
curl -fsS http://YOUR_SERVER/health
curl -fsS http://YOUR_SERVER/api/v1/auth/login -X POST \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"YOUR_PASSWORD"}'
```

---

## Optional: cursor-to-api

Only if the server has the [Cursor agent CLI](https://cursor.com) installed and logged in:

```bash
# In root .env
COMPOSE_PROFILES=cursor

# backend/.env
CURSOR_API_BASE_URL=http://cursor-to-api:9191/api/v1
```

Then toggle provider in **Admin → ارائه‌دهنده مدل**.

Note: the stock Docker image does **not** include the Cursor CLI — mount the binary or install on host and point `CURSOR_TO_API_AGENT_BIN` if needed.

---

## Dev vs production

| | Development | Production |
|---|-------------|------------|
| Command | `make dev` or `./scripts/dev.sh` | `./scripts/install-ubuntu.sh` |
| Frontend | Turbopack dev server | Next.js standalone |
| Backend | `--reload` | 2 uvicorn workers |
| Ports exposed | 3000, 8000, 5432 | **80** only (via nginx) |
| Source mounts | yes | no — baked in images |

---

## Fast updates (offline VPS — no 300MB upload)

If the server cannot reach Docker Hub / npm / PyPI (build fails inside Docker on the VPS), build on your laptop and push **only what changed**:

```bash
cp .deploy.env.example .deploy.env   # VPS_HOST, VPS_PASSWORD
./scripts/deploy-vps.sh              # default: sync mode
```

| Mode | When to use | Typical transfer |
|------|-------------|------------------|
| **`sync`** (default) | Code / UI changes only | backend ~2MB, frontend rsync delta |
| **`registry`** | `package.json`, `pyproject.toml`, or Dockerfile changed | only new image layers |
| **`full`** | First install or registry unavailable | ~320MB tarball |

Examples:

```bash
./scripts/deploy-vps.sh sync backend          # Python src only
./scripts/deploy-vps.sh sync frontend         # local npm build + rsync .next output
./scripts/deploy-vps.sh registry all          # incremental layer pull over SSH tunnel
./scripts/deploy-vps.sh full frontend         # legacy single-service tarball (~67MB)
```

`sync` copies files into the running `ma-backend` / `ma-frontend` containers and restarts them — no `docker save`, no full image reload.

`registry` runs a local registry on your machine (`127.0.0.1:5000`), pushes images there, then opens an SSH reverse tunnel so the VPS pulls with Docker layer deduplication (much smaller after the first push).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| 502 from nginx | `docker compose logs backend frontend` — wait for healthchecks |
| CORS errors | `CORS_ORIGINS` must match browser origin exactly |
| Login works locally not on server | Rebuild frontend with correct `PUBLIC_URL` |
| Migrations fail | `docker compose exec backend alembic upgrade head` |
| Out of disk | `docker system prune -a` (careful) |

---

## Security checklist

- [ ] Change `FIRST_ADMIN_PASSWORD` after first login
- [ ] Set strong `SECRET_KEY`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`
- [ ] Do not expose ports 5432/6379/8000/3000 publicly
- [ ] Enable HTTPS before production use
- [ ] Set `OPENAI_API_KEY` via env, never commit `.env`
