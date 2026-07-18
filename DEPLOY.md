# FYADR Docker Deployment for a Trusted Host

Single-container Docker setup for running FYADR on a local machine or a
trusted private network. It is **not a public multi-user service**: the current
API has no account system or per-user authorization, and it can access uploaded
documents, saved provider credentials, paid model requests, and destructive
history-maintenance operations. Keep the default loopback port binding unless
you add a separate, reviewed authentication gateway.

The Flask backend (gunicorn) serves **both** the `/api` routes **and** the
production React build (`app/dist`) from one port. No vite dev server on the
runtime network path.

## What changed in the project (so "pull and run" works)

1. `requirements.txt` — added `gunicorn` (WSGI server) and `flask-compress`
   (gzip for `/api` + static assets).
2. `scripts/web_app.py`
   - `WEB_HOST` / `WEB_PORT` now read from env (`0.0.0.0:8765` in container).
   - New env `WEB_STATIC_DIR`: when set, Flask serves the SPA (index.html +
     hashed `/assets/*`) and adds a catch-all so the page resolves on refresh.
   - `flask_compress.Compress(app)` enabled for gzip.
   - Content-hashed `/assets/*` routes send `Cache-Control: public,
     max-age=31536000, immutable`; root logo files use a shorter cache and
     `index.html` always revalidates.
3. `scripts/app_config.py` — `get_app_config_dir()` honours `FYADR_APP_CONFIG_DIR`
   so provider secrets live on a mounted volume, never in the image (defaults to
   `~/.fyadr` locally, `/app/config` in container).
4. New files: `Dockerfile` (multi-stage), `docker-compose.yml`,
   `.dockerignore`, `docker-entrypoint.sh`.

No secrets are baked into the image; `.dockerignore` excludes `.env`, keys,
`*.sqlite3`, `finish/`, `origin/`, etc.

## Build & run

```bash
# Build the image (frontend is built inside the image).
docker compose build

# Start. Data persists in ./data/*
docker compose up -d

# Open the UI (Flask serves it on the same port):
#   http://localhost:8765/
# Health:
#   curl http://localhost:8765/api/ping
```

First run creates `./data/{origin,finish,config,prompts-custom}` on the host.
The entrypoint fixes bind-mount ownership as root, performs task/history store
readiness checks once, and then starts Gunicorn as non-root UID `10001`.

## Configure provider keys

Open the UI → Model settings, or pre-seed `./data/config/config.json`.
Do **not** put keys in the image. The `FYADR_API_KEY`/`OPENAI_API_KEY` variables
in `.env.example` are fallbacks for direct CLI/script usage; they do not
pre-seed the Web UI. For containers, use the mounted private config file and
protect its host directory with equivalent permissions.

## Network boundary and latency

- Do not change the Compose port from `127.0.0.1:8765:8765` to a public bind
  without an authentication and authorization layer. TLS encrypts traffic but
  does not decide who may read documents, change provider settings, spend API
  credit, or delete history. `FYADR_ALLOWED_ORIGINS` is a browser CORS setting,
  not access control.
- If a reverse proxy is used on a trusted network, require authentication at
  the proxy, restrict source networks, set request limits, and keep FYADR itself
  unreachable from untrusted peers.
- The vite **dev server adds avoidable latency**: it runs a TS/JS transform +
  HMR websocket + on-demand module graph on every request, so every asset is
  recompiled and re-sent uncompressed over a high-RTT link. The production build
  is pre-bundled (one `vendor` + one `index` chunk), content-hashed, gzipped by
  Flask, and cached for 1 year — so repeat visits pull almost nothing.
- Gunicorn is intentionally `1 worker × 4 threads`. Run/cancel/SSE ownership is
  currently process-local; multiple workers can duplicate tasks or misreport a
  live task as interrupted. Do not raise `GUNICORN_WORKERS` until task state is
  moved to a shared queue/store.

## Two-container variant (optional, nginx + Flask)

For independently managed static delivery you can split: keep the Flask container for `/api`
only (`WEB_STATIC_DIR=` empty) and add an `nginx` service that serves
`/app/static` and proxies `/api` to Flask. The single-container form above is
already sufficient for FYADR's load (few hundred KB of assets per visit; heavy
work is done by the upstream LLM provider, not Flask). The same trusted-network
and authentication boundary still applies.

## Volumes / state

| Host path                  | Container      | Purpose                                  |
|----------------------------|----------------|------------------------------------------|
| `./data/origin`            | `/app/origin`  | uploaded source documents (ORIGIN_DIR)  |
| `./data/finish`            | `/app/finish`  | exports, task state, history DB, backups |
| `./data/config`            | `/app/config`  | `config.json` w/ provider secrets        |
| `./data/prompts-custom`    | `/app/prompts/custom` | user custom prompts               |

All are declared `VOLUME`s in the Dockerfile and bound in compose — data
survives image/container replacement.

## Image size

- `python:3.11-slim-bookworm` base, `node:20-bookworm-slim` only for the build
  stage (discarded).
- `pip install --no-cache-dir`, `npm ci` with no dev server shipped.
- Final image contains only: Python slim + Flask/gunicorn + scripts + prompts +
  `static/` (the built frontend). No node, no `node_modules`, no source `.tsx`.

## Security

- The entrypoint starts as root only to prepare bind mounts, then runs both
  initialization and Gunicorn as non-root UID `10001` (`fyadr`). Do not add a
  Compose `user:` override unless the mounted directories are already writable
  by UID `10001`.
- `tini` as PID 1 reaps zombies / forwards signals for clean shutdown.
- `HEALTHCHECK` hits `/api/ping` (DB-free, cheap).
- Zero hardcoded secrets; `.dockerignore` blocks `.env` / keys / `*.sqlite3`.
- Saved provider credentials are stored in `/app/config/config.json`; on POSIX
  the directory/file are restricted to `0700`/`0600` and writes are atomic.
- Compose rotates the container `json-file` log at 10 MiB and retains three
  segments, preventing routine access/error logs from growing without bound.
- Reusing a saved key is bound to its existing Base URL. Changing provider URL
  requires explicitly re-entering the key.
- There is still no built-in user authentication. Treat the container as a
  single-user trusted-host application, not an Internet-facing SaaS service.
