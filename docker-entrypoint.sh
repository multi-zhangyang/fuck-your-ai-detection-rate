#!/usr/bin/env bash
# FYADR container entrypoint.
# Prepares writable volumes as root when available, then runs application
# commands as the non-root `fyadr` user. Gunicorn serves both the /api routes
# and the production frontend build from WEB_STATIC_DIR.

set -euo pipefail

# Ensure stateful directories exist and are owned by the runtime user.  The
# non-root branch keeps the image usable with an explicit `docker run --user`
# when the mounted directories were prepared by the operator.
mkdir -p /app/origin /app/finish /app/config /app/prompts/custom
if [ -d /app/prompt-seed ]; then
  # Three-way merge factory updates into the persistent prompt volume. This
  # also imports safe legacy custom prompt files without replacing user edits.
  python -c \
    "import sys; sys.path.insert(0, '/app/scripts'); from prompt_library import sync_prompt_seed; sync_prompt_seed('/app/prompt-seed', legacy_custom_dir='/app/legacy-prompts-custom')"
fi
if [ "$(id -u)" = "0" ]; then
  chown -R fyadr:fyadr /app/origin /app/finish /app/config /app/prompts
fi

run_as_fyadr() {
  if [ "$(id -u)" = "0" ]; then
    runuser -u fyadr -- "$@"
  else
    "$@"
  fi
}

if [ "${1:-web}" = "web" ]; then
  # Gunicorn only imports `app`; it does not execute web_app.main(). Run the
  # writable-store initialization exactly once before the WSGI worker starts.
  run_as_fyadr python -c \
    "import sys; sys.path.insert(0, '/app/scripts'); from web_app import initialize_runtime; initialize_runtime(reason='container-startup')"

  # Run one worker: in-flight task/cancel/SSE state is process-local. Threads
  # still allow concurrent API/SSE requests while background rewrites run.
  if [ "${GUNICORN_WORKERS:-1}" != "1" ]; then
    echo "FYADR requires GUNICORN_WORKERS=1 until task state is moved to a shared store." >&2
    exit 64
  fi
  if [ "$(id -u)" = "0" ]; then
    exec runuser -u fyadr -- gunicorn \
      --chdir /app/scripts \
      --bind "0.0.0.0:${WEB_PORT:-8765}" \
      --workers 1 \
      --threads "${GUNICORN_THREADS:-4}" \
      --timeout 120 \
      --no-control-socket \
      --access-logfile - \
      --error-logfile - \
      "web_app:app"
  fi
  exec gunicorn \
    --chdir /app/scripts \
    --bind "0.0.0.0:${WEB_PORT:-8765}" \
    --workers 1 \
    --threads "${GUNICORN_THREADS:-4}" \
    --timeout 120 \
    --no-control-socket \
    --access-logfile - \
    --error-logfile - \
    "web_app:app"
else
  # Fallback: run arbitrary commands as fyadr when entrypoint starts as root.
  if [ "$(id -u)" = "0" ]; then
    exec runuser -u fyadr -- "$@"
  fi
  exec "$@"
fi
