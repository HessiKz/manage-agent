FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY cursor_to_api ./cursor_to_api

ENV CURSOR_TO_API_HOST=0.0.0.0 \
    CURSOR_TO_API_PORT=9191

EXPOSE 9191

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -fsS http://127.0.0.1:9191/api/v1/health || exit 1

CMD ["python", "-m", "cursor_to_api.main"]
