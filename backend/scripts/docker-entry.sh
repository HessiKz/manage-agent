#!/bin/sh
set -e

echo "▶ Applying database migrations…"
alembic upgrade head

exec uvicorn src.main:app --host 0.0.0.0 --port "${PORT:-8000}" "$@"
