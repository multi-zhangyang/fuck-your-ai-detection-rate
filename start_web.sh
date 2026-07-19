#!/usr/bin/env bash

# Native macOS/Linux launcher for the FYADR development Web UI.
# Bash 3.2 compatible: keep this file free of associative arrays, mapfile,
# ${var,,}, and newer conditional operators.

set -u
set -o pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$SCRIPT_DIR
BACKEND_URL="http://127.0.0.1:8765/api/ping"
FRONTEND_URL="http://127.0.0.1:1420"
BACKEND_LOG="$REPO_ROOT/logs/web-backend.log"
FRONTEND_LOG="$REPO_ROOT/logs/web-frontend.log"

NO_BROWSER=0
INSTALL_DEPENDENCIES=0
BACKEND_PID=""
FRONTEND_PID=""
STARTED_BACKEND=0
STARTED_FRONTEND=0

usage() {
  cat <<'EOF'
论文 AI 降检平台 — macOS/Linux 启动器

用法：
  ./start_web.sh [--no-browser] [--install]
  ./start_web.sh --help

选项：
  --no-browser  服务就绪后不自动打开浏览器。
  --install     先在 .venv 安装 Python 与前端锁定依赖，然后启动服务。
  --help        显示本帮助并退出。

说明：
  - 后端仅监听 127.0.0.1:8765，前端仅监听 127.0.0.1:1420。
  - 已健康运行的 FYADR 后端会被直接复用。
  - 端口若被未知或不健康的进程占用，脚本会停止并提示，不会结束该进程。
  - 按 Ctrl+C 会清理本脚本启动的进程，不会操作复用或未知进程。
EOF
}

fail() {
  printf '%s\n' "[FYADR] $*" >&2
  exit 1
}

find_command() {
  command -v "$1" 2>/dev/null || true
}

stop_started_pid() {
  pid=$1
  label=$2
  if [ -z "$pid" ]; then
    return 0
  fi
  if kill -0 "$pid" 2>/dev/null; then
    printf '%s\n' "[FYADR] 正在停止本次启动的${label}（PID $pid）……"
    kill "$pid" 2>/dev/null || true
    attempts=0
    while kill -0 "$pid" 2>/dev/null && [ "$attempts" -lt 30 ]; do
      sleep 0.1
      attempts=$((attempts + 1))
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  wait "$pid" 2>/dev/null || true
}

cleanup_started_processes() {
  if [ "$STARTED_FRONTEND" -eq 1 ]; then
    stop_started_pid "$FRONTEND_PID" "前端"
    STARTED_FRONTEND=0
  fi
  if [ "$STARTED_BACKEND" -eq 1 ]; then
    stop_started_pid "$BACKEND_PID" "后端"
    STARTED_BACKEND=0
  fi
}

handle_signal() {
  exit_code=$1
  trap - EXIT INT TERM HUP
  cleanup_started_processes
  exit "$exit_code"
}

trap cleanup_started_processes EXIT
trap 'handle_signal 130' INT
trap 'handle_signal 143' TERM
trap 'handle_signal 129' HUP

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-browser)
      NO_BROWSER=1
      ;;
    --install)
      INSTALL_DEPENDENCIES=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "未知参数：$1"
      ;;
  esac
  shift
done

cd "$REPO_ROOT"

SYSTEM_PYTHON_BIN=$(find_command python3)
if [ -z "$SYSTEM_PYTHON_BIN" ]; then
  SYSTEM_PYTHON_BIN=$(find_command python)
fi
VENV_PYTHON="$REPO_ROOT/.venv/bin/python"
if [ "$INSTALL_DEPENDENCIES" -eq 0 ] && [ -x "$VENV_PYTHON" ]; then
  PYTHON_BIN=$VENV_PYTHON
else
  [ -n "$SYSTEM_PYTHON_BIN" ] || fail "未找到 Python。请先安装 Python 3.10 或更高版本。"
  PYTHON_BIN=$SYSTEM_PYTHON_BIN
fi

NODE_BIN=$(find_command node)
NPM_BIN=$(find_command npm)
[ -n "$NODE_BIN" ] || fail "未找到 Node.js。请安装 Node.js 20.19+ 或 22.12+。"
[ -n "$NPM_BIN" ] || fail "未找到 npm。请安装带 npm 的 Node.js。"

if ! "$NODE_BIN" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit((major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22 ? 0 : 1)' >/dev/null 2>&1; then
  fail "Node.js 版本不受支持；需要 20.19+，或 22.12+。"
fi

[ -f "$REPO_ROOT/requirements.txt" ] || fail "缺少 requirements.txt；请从项目根目录运行。"
[ -f "$REPO_ROOT/app/package.json" ] || fail "缺少 app/package.json；请确认仓库完整。"
[ -f "$REPO_ROOT/app/package-lock.json" ] || fail "缺少 app/package-lock.json；无法安装锁定依赖。"

export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8

if [ "$INSTALL_DEPENDENCIES" -eq 1 ]; then
  if ! "$SYSTEM_PYTHON_BIN" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1; then
    fail "Python 版本过低；需要 Python 3.10 或更高版本。"
  fi
  printf '%s\n' "[FYADR] 正在准备项目虚拟环境……"
  "$SYSTEM_PYTHON_BIN" -m venv "$REPO_ROOT/.venv" || fail "无法创建 .venv；请确认 Python venv 模块可用。"
  PYTHON_BIN=$VENV_PYTHON
  [ -x "$PYTHON_BIN" ] || fail "虚拟环境未生成可执行 Python。"
  printf '%s\n' "[FYADR] 正在安装 Python 依赖……"
  "$PYTHON_BIN" -m pip install --upgrade pip || fail "虚拟环境 pip 初始化失败。"
  "$PYTHON_BIN" -m pip install -r "$REPO_ROOT/requirements.txt" || fail "Python 依赖安装失败。"
  printf '%s\n' "[FYADR] 正在安装前端锁定依赖……"
  "$NPM_BIN" --prefix "$REPO_ROOT/app" ci || fail "前端依赖安装失败。"
fi

if ! "$PYTHON_BIN" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1; then
  fail "当前 Python 环境版本过低；需要 Python 3.10 或更高版本。"
fi

if ! "$PYTHON_BIN" -c 'import flask, flask_compress, docx, pypdf' >/dev/null 2>&1; then
  fail "Python 依赖不完整。请运行 ./start_web.sh --install。"
fi

[ -f "$REPO_ROOT/app/node_modules/vite/bin/vite.js" ] || fail "前端依赖未安装。请运行 ./start_web.sh --install。"

mkdir -p "$REPO_ROOT/logs"

probe_backend() {
  "$PYTHON_BIN" - "$BACKEND_URL" <<'PY' >/dev/null 2>&1
import json
import sys
from urllib.request import ProxyHandler, Request, build_opener

url = sys.argv[1]
try:
    request = Request(url, headers={"User-Agent": "FYADR-launcher/1.0"})
    with build_opener(ProxyHandler({})).open(request, timeout=1.0) as response:
        payload = json.loads(response.read(65536).decode("utf-8"))
        ok = response.status == 200 and payload.get("ok") is True and payload.get("service") == "fyadr-web"
except Exception:
    ok = False
raise SystemExit(0 if ok else 1)
PY
}

probe_frontend() {
  "$PYTHON_BIN" - "$FRONTEND_URL" <<'PY' >/dev/null 2>&1
import sys
from urllib.request import ProxyHandler, Request, build_opener

url = sys.argv[1]
try:
    request = Request(url, headers={"User-Agent": "FYADR-launcher/1.0"})
    with build_opener(ProxyHandler({})).open(request, timeout=1.0) as response:
        body = response.read(262144).decode("utf-8", errors="replace")
        ok = response.status == 200 and "论文 AI 降检平台" in body and 'id="root"' in body
except Exception:
    ok = False
raise SystemExit(0 if ok else 1)
PY
}

port_is_in_use() {
  "$PYTHON_BIN" - "$1" <<'PY' >/dev/null 2>&1
import socket
import sys

port = int(sys.argv[1])
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(0.5)
try:
    occupied = sock.connect_ex(("127.0.0.1", port)) == 0
finally:
    sock.close()
raise SystemExit(0 if occupied else 1)
PY
}

wait_for_backend() {
  elapsed=0
  while [ "$elapsed" -lt 30 ]; do
    if probe_backend; then
      return 0
    fi
    if [ -n "$BACKEND_PID" ] && ! kill -0 "$BACKEND_PID" 2>/dev/null; then
      return 1
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

wait_for_frontend() {
  elapsed=0
  while [ "$elapsed" -lt 45 ]; do
    if probe_frontend; then
      return 0
    fi
    if [ -n "$FRONTEND_PID" ] && ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
      return 1
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

if probe_backend; then
  printf '%s\n' "[FYADR] 已复用健康后端：$BACKEND_URL"
else
  if port_is_in_use 8765; then
    fail "端口 8765 已被未知或不健康的进程占用；为保护现有进程，本脚本不会结束它。"
  fi
  : > "$BACKEND_LOG"
  printf '%s\n' "[FYADR] 正在启动后端……日志：$BACKEND_LOG"
  (
    cd "$REPO_ROOT"
    exec env WEB_HOST=127.0.0.1 WEB_PORT=8765 WEB_STATIC_DIR= "$PYTHON_BIN" scripts/web_app.py
  ) >> "$BACKEND_LOG" 2>&1 &
  BACKEND_PID=$!
  STARTED_BACKEND=1
  if ! wait_for_backend; then
    printf '%s\n' "[FYADR] 后端未能就绪。最近日志：" >&2
    tail -n 30 "$BACKEND_LOG" >&2 || true
    fail "后端启动失败。"
  fi
  printf '%s\n' "[FYADR] 后端已就绪：$BACKEND_URL"
fi

if probe_frontend; then
  printf '%s\n' "[FYADR] 已复用健康前端：$FRONTEND_URL"
else
  if port_is_in_use 1420; then
    fail "端口 1420 已被未知或不健康的进程占用；为保护现有进程，本脚本不会结束它。"
  fi
  : > "$FRONTEND_LOG"
  printf '%s\n' "[FYADR] 正在启动前端……日志：$FRONTEND_LOG"
  (
    cd "$REPO_ROOT/app"
    exec "$NODE_BIN" node_modules/vite/bin/vite.js
  ) >> "$FRONTEND_LOG" 2>&1 &
  FRONTEND_PID=$!
  STARTED_FRONTEND=1
  if ! wait_for_frontend; then
    printf '%s\n' "[FYADR] 前端未能就绪。最近日志：" >&2
    tail -n 30 "$FRONTEND_LOG" >&2 || true
    fail "前端启动失败。"
  fi
  printf '%s\n' "[FYADR] 前端已就绪：$FRONTEND_URL"
fi

printf '\n%s\n' "[FYADR] 论文 AI 降检平台已就绪：$FRONTEND_URL"

if [ "$NO_BROWSER" -eq 0 ]; then
  if ! "$PYTHON_BIN" "$REPO_ROOT/scripts/open_web_ui.py" --url "$FRONTEND_URL"; then
    printf '%s\n' "[FYADR] 浏览器未能自动打开，请手动访问：$FRONTEND_URL"
  fi
else
  printf '%s\n' "[FYADR] 已禁用自动打开浏览器，请手动访问：$FRONTEND_URL"
fi

if [ "$STARTED_BACKEND" -eq 0 ] && [ "$STARTED_FRONTEND" -eq 0 ]; then
  printf '%s\n' "[FYADR] 后端和前端均为已有健康进程，本脚本不接管其生命周期。"
  exit 0
fi

printf '%s\n' "[FYADR] 按 Ctrl+C 停止本脚本启动的服务。"
while :; do
  if [ "$STARTED_BACKEND" -eq 1 ] && ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    fail "本次启动的后端进程已退出，请检查 $BACKEND_LOG。"
  fi
  if [ "$STARTED_FRONTEND" -eq 1 ] && ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    fail "本次启动的前端进程已退出，请检查 $FRONTEND_LOG。"
  fi
  sleep 1
done
