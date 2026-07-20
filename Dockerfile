# FYADR production image: build the React frontend, then serve it with the
# Flask API from a slim Python runtime.

# Frontend build
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /frontend

# Install deps (npm ci needs a lockfile; package-lock.json is present).
COPY app/package.json app/package-lock.json ./
RUN npm ci

# Build (tsc typecheck + vite build). Output: app/dist (but we copied app/).
COPY app/ ./
RUN npm run build

# Backend runtime
FROM python:3.11-slim-bookworm AS runtime

LABEL org.opencontainers.image.source="https://github.com/multi-zhangyang/fuck-your-ai-detection-rate" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# Runtime deps: tini (PID 1 reaper) and util-linux (runuser — drops to the
# non-root fyadr user without pulling in the gosu package).
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini util-linux \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for running the service.
RUN groupadd --system --gid 10001 fyadr \
    && useradd --system --uid 10001 --gid fyadr --home /app --shell /usr/sbin/nologin fyadr

WORKDIR /app

# 1) Python deps first (best layer caching).
COPY requirements.txt ./
COPY LICENSE ./LICENSE
RUN pip install --no-cache-dir -r requirements.txt

# 2) Backend source. scripts/ is flat (sibling imports), so it lives at
#    /app/scripts and ROOT_DIR resolves to /app (repo root equivalent).
COPY scripts/ ./scripts/

# 3) Immutable prompt seed. The entrypoint merges factory updates and safely
#    migrates legacy custom prompts into the writable /app/prompts volume.
COPY prompts/ ./prompt-seed/

# 4) Production frontend build from stage A.
COPY --from=frontend-build /frontend/dist ./static

# 5) Entrypoint + healthcheck support.
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Stateful paths (mount volumes / named volumes here):
#   /app/origin   - uploaded source documents (ORIGIN_DIR)
#   /app/finish   - exports, task state, history DB, prompt backups (EXPORT_DIR,
#                   TASK_STATE_DIR, fyadr_history.sqlite3, history_db_backups)
#   /app/config   - config.json (AI provider keys) — FYADR_APP_CONFIG_DIR
#   /app/prompts  - prompt content, registries, workflows, and custom prompts
VOLUME ["/app/origin", "/app/finish", "/app/config", "/app/prompts"]

# Config + runtime tuning (overridable via docker-compose / .env).
ENV WEB_HOST=0.0.0.0 \
    WEB_PORT=8765 \
    WEB_STATIC_DIR=/app/static \
    FYADR_APP_CONFIG_DIR=/app/config \
    FYADR_ALLOWED_ORIGINS= \
    FYADR_MAX_REQUEST_BYTES=67108864 \
    FYADR_MAX_UPLOAD_BYTES=41943040 \
    GUNICORN_WORKERS=1 \
    GUNICORN_THREADS=4

EXPOSE 8765

# Liveness/readiness: /api/ping is cheap and does not touch the DB.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8765/api/ping').status==200 else 1)"

ENTRYPOINT ["/usr/bin/tini", "--", "./docker-entrypoint.sh"]
CMD ["web"]
