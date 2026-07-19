from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import ProxyHandler, Request, build_opener


ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
PROMPTS_DIR = ROOT_DIR / "prompts"
REFERENCES_DIR = ROOT_DIR / "references"
STATIC_DIR = ROOT_DIR / "app" / "dist"
MAX_RESPONSE_BYTES = 4 * 1024 * 1024
LOCAL_OPENER = build_opener(ProxyHandler({}))


class PlatformSmokeError(RuntimeError):
    pass


class _StaticReferenceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.references: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {str(key).lower(): str(value or "") for key, value in attrs}
        candidate = ""
        if tag.lower() == "script":
            candidate = values.get("src", "")
        elif tag.lower() == "link":
            candidate = values.get("href", "")
        if candidate and candidate not in self.references:
            self.references.append(candidate)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise PlatformSmokeError(message)


def _same_path(left: Path, right: Path) -> bool:
    return os.path.normcase(str(left.resolve())) == os.path.normcase(str(right.resolve()))


def _is_under(path: Path, root: Path) -> bool:
    normalized_path = os.path.normcase(str(path.resolve()))
    normalized_root = os.path.normcase(str(root.resolve()))
    try:
        return os.path.commonpath((normalized_path, normalized_root)) == normalized_root
    except ValueError:
        return False


def _copy_runtime_source(runtime_root: Path) -> None:
    runtime_scripts = runtime_root / "scripts"
    runtime_scripts.mkdir(parents=True, exist_ok=True)
    python_sources = sorted(SCRIPTS_DIR.glob("*.py"))
    _assert(bool(python_sources), "No Python runtime sources were found.")
    for source in python_sources:
        shutil.copy2(source, runtime_scripts / source.name)

    def ignore_private_prompt_paths(_directory: str, names: list[str]) -> set[str]:
        return {name for name in names if name in {"custom", "__pycache__"}}

    shutil.copytree(
        PROMPTS_DIR,
        runtime_root / "prompts",
        ignore=ignore_private_prompt_paths,
    )

    runtime_references = runtime_root / "references"
    runtime_references.mkdir(parents=True, exist_ok=True)


def _reserve_loopback_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def _fetch(url: str, *, timeout: float = 8.0) -> tuple[int, dict[str, str], bytes]:
    request = Request(url, headers={"User-Agent": "FYADR-platform-install-smoke/1.0"})
    try:
        with LOCAL_OPENER.open(request, timeout=timeout) as response:
            status = int(response.status)
            headers = {str(key).lower(): str(value) for key, value in response.headers.items()}
            body = response.read(MAX_RESPONSE_BYTES + 1)
    except HTTPError as exc:
        status = int(exc.code)
        headers = {str(key).lower(): str(value) for key, value in exc.headers.items()}
        body = exc.read(MAX_RESPONSE_BYTES + 1)
    _assert(len(body) <= MAX_RESPONSE_BYTES, f"Response exceeded {MAX_RESPONSE_BYTES} bytes: {url}")
    return status, headers, body


def _fetch_json(url: str, *, timeout: float = 8.0) -> tuple[int, dict[str, str], dict[str, Any]]:
    status, headers, body = _fetch(url, timeout=timeout)
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PlatformSmokeError(f"Endpoint did not return valid UTF-8 JSON: {url} ({type(exc).__name__})") from exc
    _assert(isinstance(payload, dict), f"Endpoint returned a non-object JSON payload: {url}")
    return status, headers, payload


def _wait_for_backend(base_url: str, process: subprocess.Popen[bytes], timeout_seconds: float) -> dict[str, Any]:
    deadline = time.monotonic() + max(1.0, timeout_seconds)
    last_error = "backend did not respond"
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise PlatformSmokeError(f"Backend exited before readiness with code {process.returncode}.")
        try:
            status, _headers, payload = _fetch_json(f"{base_url}/api/ping", timeout=1.5)
            if status == 200 and payload.get("ok") is True and payload.get("service") == "fyadr-web":
                return payload
            last_error = f"unexpected ping status/payload: HTTP {status}"
        except (OSError, URLError, PlatformSmokeError) as exc:
            last_error = f"{type(exc).__name__}: {exc}"
        time.sleep(0.25)
    raise PlatformSmokeError(f"Backend readiness timed out: {last_error}")


def _read_log_tail(log_path: Path, limit: int = 8000) -> str:
    try:
        text = log_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    return text[-limit:]


def _stop_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def _sanitized_child_environment(*, runtime_root: Path, config_dir: Path, port: int) -> dict[str, str]:
    environment = os.environ.copy()
    for key in list(environment):
        normalized = key.upper()
        if normalized.startswith("FYADR_") or normalized.startswith("OPENAI_") or normalized.startswith("FLASK_"):
            environment.pop(key, None)
    environment.pop("PYTHONPATH", None)
    environment.update(
        {
            "FYADR_APP_CONFIG_DIR": str(config_dir),
            "FYADR_HISTORY_BACKUP_DIR": str(runtime_root / "finish" / "history_db_backups"),
            "FYADR_RUN_REAL_LLM": "0",
            "WEB_HOST": "127.0.0.1",
            "WEB_PORT": str(port),
            "WEB_STATIC_DIR": str(STATIC_DIR.resolve()),
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONIOENCODING": "utf-8",
            "PYTHONUTF8": "1",
            "PYTHONUNBUFFERED": "1",
        }
    )
    return environment


def _verify_health_is_isolated(payload: dict[str, Any], *, runtime_root: Path, config_dir: Path) -> None:
    _assert(payload.get("ok") is True, "Health diagnostics reported an error-level runtime failure.")
    workspace_value = payload.get("workspace")
    _assert(isinstance(workspace_value, str) and workspace_value, "Health diagnostics omitted the workspace path.")
    _assert(_same_path(Path(workspace_value), runtime_root), "Backend health escaped the isolated smoke workspace.")

    config = payload.get("config")
    _assert(isinstance(config, dict), "Health diagnostics omitted config evidence.")
    config_path_value = config.get("path")
    _assert(isinstance(config_path_value, str) and config_path_value, "Health diagnostics omitted config path evidence.")
    _assert(_is_under(Path(config_path_value), config_dir), "Backend did not use the temporary config directory.")
    _assert(config.get("hasApiKey") is False, "Smoke backend unexpectedly loaded an API key.")
    _assert(config.get("hasBaseUrl") is False, "Smoke backend unexpectedly loaded a provider Base URL.")

    paths = payload.get("paths")
    _assert(isinstance(paths, list) and bool(paths), "Health diagnostics omitted workspace path evidence.")
    for item in paths:
        if not isinstance(item, dict) or item.get("key") == "config":
            continue
        path_value = item.get("path")
        _assert(isinstance(path_value, str) and path_value, "Health diagnostics exposed an invalid runtime path.")
        _assert(_is_under(Path(path_value), runtime_root), f"Runtime path escaped the isolated workspace: {item.get('key')}")


def _verify_frontend_and_assets(base_url: str) -> dict[str, Any]:
    status, headers, body = _fetch(f"{base_url}/")
    _assert(status == 200, f"Frontend root returned HTTP {status}.")
    _assert("text/html" in headers.get("content-type", "").lower(), "Frontend root has the wrong content type.")
    html = body.decode("utf-8", errors="strict")
    _assert("论文 AI 降检平台" in html, "Frontend root does not contain the product name.")
    _assert('id="root"' in html, "Frontend root does not contain the React mount point.")

    parser = _StaticReferenceParser()
    parser.feed(html)
    local_references: list[str] = []
    for reference in parser.references:
        parsed = urlsplit(reference)
        if parsed.scheme or parsed.netloc or reference.startswith(("data:", "#")):
            continue
        resolved = urljoin(f"{base_url}/", reference)
        if resolved not in local_references:
            local_references.append(resolved)
    _assert(bool(local_references), "Frontend index did not reference any local static assets.")

    checked_assets: list[dict[str, Any]] = []
    for asset_url in local_references:
        asset_status, asset_headers, asset_body = _fetch(asset_url)
        _assert(asset_status == 200, f"Static asset returned HTTP {asset_status}: {asset_url}")
        _assert(bool(asset_body), f"Static asset was empty: {asset_url}")
        suffix = Path(urlsplit(asset_url).path).suffix.lower()
        content_type = asset_headers.get("content-type", "").lower()
        if suffix == ".js":
            _assert("javascript" in content_type, f"JavaScript asset has the wrong content type: {asset_url}")
        elif suffix == ".css":
            _assert("text/css" in content_type, f"CSS asset has the wrong content type: {asset_url}")
        elif suffix in {".png", ".webp", ".jpg", ".jpeg", ".gif", ".ico"}:
            _assert(content_type.startswith("image/"), f"Image asset has the wrong content type: {asset_url}")
        checked_assets.append(
            {
                "path": urlsplit(asset_url).path,
                "status": asset_status,
                "contentType": content_type,
                "bytes": len(asset_body),
            }
        )

    missing_status, _missing_headers, _missing_body = _fetch(
        f"{base_url}/assets/fyadr-platform-smoke-missing.js"
    )
    _assert(missing_status == 404, "Missing hashed static assets must return HTTP 404.")
    return {
        "status": status,
        "contentType": headers.get("content-type", ""),
        "assetCount": len(checked_assets),
        "assets": checked_assets,
        "missingAssetStatus": missing_status,
    }


def run_smoke(*, timeout_seconds: float) -> dict[str, Any]:
    _assert(STATIC_DIR.joinpath("index.html").is_file(), "Frontend build is missing; run npm --prefix app run build first.")
    _assert(SCRIPTS_DIR.joinpath("web_app.py").is_file(), "Backend entry point is missing.")
    started_at = time.monotonic()

    with tempfile.TemporaryDirectory(prefix="fyadr-platform-smoke-") as temporary_directory:
        runtime_root = Path(temporary_directory) / "runtime"
        runtime_root.mkdir(parents=True, exist_ok=True)
        _copy_runtime_source(runtime_root)
        config_dir = Path(temporary_directory) / "config"
        port = _reserve_loopback_port()
        base_url = f"http://127.0.0.1:{port}"
        log_path = Path(temporary_directory) / "backend.log"
        environment = _sanitized_child_environment(
            runtime_root=runtime_root,
            config_dir=config_dir,
            port=port,
        )

        process: subprocess.Popen[bytes] | None = None
        try:
            with log_path.open("wb") as log_handle:
                process = subprocess.Popen(
                    [sys.executable, str(runtime_root / "scripts" / "web_app.py")],
                    cwd=str(runtime_root),
                    env=environment,
                    stdin=subprocess.DEVNULL,
                    stdout=log_handle,
                    stderr=subprocess.STDOUT,
                )
                ping = _wait_for_backend(base_url, process, timeout_seconds)
                health_status, health_headers, health = _fetch_json(f"{base_url}/api/health", timeout=15.0)
                _assert(health_status == 200, f"Health endpoint returned HTTP {health_status}.")
                _assert("application/json" in health_headers.get("content-type", "").lower(), "Health endpoint has the wrong content type.")
                _verify_health_is_isolated(health, runtime_root=runtime_root, config_dir=config_dir)
                frontend = _verify_frontend_and_assets(base_url)
        except Exception as exc:
            if process is not None:
                _stop_process(process)
            log_tail = _read_log_tail(log_path)
            if log_tail:
                raise PlatformSmokeError(f"{exc}\n--- isolated backend log tail ---\n{log_tail}") from exc
            raise
        finally:
            if process is not None:
                _stop_process(process)

        _assert(not config_dir.joinpath("config.json").exists(), "Smoke run unexpectedly persisted a model configuration.")
        return {
            "ok": True,
            "platform": platform.system(),
            "python": platform.python_version(),
            "durationMs": round((time.monotonic() - started_at) * 1000),
            "checks": {
                "temporaryLoopbackBackend": True,
                "temporaryConfigDirectory": True,
                "isolatedRuntimeWorkspace": True,
                "realProviderConfigurationLoaded": False,
                "modelCallsMade": False,
                "ping": {
                    "ok": ping.get("ok") is True,
                    "service": ping.get("service"),
                },
                "health": {
                    "status": health_status,
                    "ok": health.get("ok") is True,
                },
                "frontend": frontend,
            },
        }


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(
        description="Start an isolated temporary FYADR backend and verify its production frontend assets."
    )
    parser.add_argument("--timeout", type=float, default=45.0, help="Backend readiness timeout in seconds.")
    args = parser.parse_args(argv)
    try:
        report = run_smoke(timeout_seconds=max(5.0, float(args.timeout)))
    except Exception as exc:
        report = {
            "ok": False,
            "platform": platform.system(),
            "python": platform.python_version(),
            "errorType": type(exc).__name__,
            "error": str(exc),
        }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report.get("ok") is True else 1


if __name__ == "__main__":
    raise SystemExit(main())
