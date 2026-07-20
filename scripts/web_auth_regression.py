"""Focused regression for the optional FYADR web authentication contract."""

from __future__ import annotations

import json
import os
import stat
import tempfile
from pathlib import Path

from werkzeug.security import generate_password_hash

ROOT_DIR = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT_DIR / "finish" / "regression" / "web_auth_regression_report.json"
AUTH_ENV_NAMES = (
    "FYADR_AUTH_USERNAME",
    "FYADR_AUTH_PASSWORD",
    "FYADR_AUTH_PASSWORD_HASH",
    "FYADR_AUTH_PASSWORD_FILE",
    "FYADR_AUTH_SECRET_KEY",
    "FYADR_AUTH_SECRET_FILE",
    "FYADR_AUTH_COOKIE_SECURE",
    "FYADR_AUTH_COOKIE_SAMESITE",
    "FYADR_AUTH_SESSION_TTL_SECONDS",
    "FYADR_AUTH_RATE_LIMIT_MAX",
    "FYADR_AUTH_RATE_LIMIT_WINDOW_SECONDS",
)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _clear_auth_env() -> None:
    for name in AUTH_ENV_NAMES:
        os.environ.pop(name, None)


def _status(client, *, origin: str | None = None):
    headers = {"Origin": origin} if origin else {}
    response = client.get("/api/auth/status", headers=headers)
    _assert(response.status_code == 200, "auth status endpoint must be public")
    return response, response.get_json()


def run_regression() -> dict[str, object]:
    checks: list[str] = []
    original_env = {name: os.environ.get(name) for name in AUTH_ENV_NAMES}
    original_config_dir = os.environ.get("FYADR_APP_CONFIG_DIR")
    try:
        import sys

        sys.path.insert(0, str(ROOT_DIR / "scripts"))
        import web_app

        with tempfile.TemporaryDirectory(prefix="fyadr_web_auth_") as temp_dir:
            config_dir = Path(temp_dir) / "config"
            os.environ["FYADR_APP_CONFIG_DIR"] = str(config_dir)
            _clear_auth_env()
            web_app.create_app()
            client = web_app.app.test_client()

            response, payload = _status(client)
            _assert(
                payload == {
                    "ok": True,
                    "enabled": False,
                    "authenticated": True,
                    "username": "",
                    "csrfToken": "",
                    "sessionExpiresAt": "",
                },
                "auth-disabled status must preserve the explicit frontend contract",
            )
            _assert(client.get("/api/model-config").status_code == 200, "auth-disabled API access must remain compatible")
            _assert("X-Frame-Options" in response.headers, "security headers must be present when auth is disabled")
            checks.append("authentication is disabled by default without changing local API access")

            os.environ["FYADR_AUTH_USERNAME"] = "operator"
            os.environ["FYADR_AUTH_PASSWORD"] = "correct horse"
            os.environ["FYADR_AUTH_RATE_LIMIT_MAX"] = "2"
            os.environ["FYADR_AUTH_RATE_LIMIT_WINDOW_SECONDS"] = "120"
            web_app.create_app()
            client = web_app.app.test_client()
            status_response, status_payload = _status(client, origin="http://127.0.0.1:1420")
            _assert(status_payload["enabled"] is True and status_payload["authenticated"] is False, "password config must enable auth")
            csrf_token = status_payload["csrfToken"]
            _assert(len(csrf_token) >= 32, "anonymous status must issue a CSRF token for login")
            _assert(status_response.headers.get("Access-Control-Allow-Credentials") == "true", "allowed origins must allow credentialed requests")
            _assert("X-FYADR-CSRF" in status_response.headers.get("Access-Control-Allow-Headers", ""), "CORS must allow the CSRF header")
            _assert("HttpOnly" in status_response.headers.get("Set-Cookie", ""), "session cookie must be HttpOnly")
            _assert("SameSite=Lax" in status_response.headers.get("Set-Cookie", ""), "session cookie must default to SameSite=Lax")
            _assert("Path=/" in status_response.headers.get("Set-Cookie", ""), "session cookie must use an explicit root path")
            _assert(status_response.headers.get("Cache-Control") == "no-store", "authentication responses must not be cached")
            _assert(status_response.headers.get("X-Content-Type-Options") == "nosniff", "responses must disable MIME sniffing")

            _assert(client.get("/api/health").status_code == 401, "protected GET API routes must require authentication")
            _assert(client.get("/api/not-a-route").get_json()["code"] == "authentication_required", "unknown API routes must not disclose route state before login")
            _assert(client.options("/api/health").status_code in {200, 204}, "API OPTIONS must remain public for browser preflight")
            csrf_missing = client.post("/api/auth/login", json={"username": "operator", "password": "wrong"})
            _assert(csrf_missing.status_code == 403 and csrf_missing.get_json()["code"] == "csrf_failed", "state-changing requests must require CSRF")

            oversized = client.post(
                "/api/auth/login",
                json={"username": "operator", "password": "x" * 1025},
                headers={"X-FYADR-CSRF": csrf_token},
            )
            _assert(oversized.status_code == 401 and oversized.get_json()["code"] == "authentication_failed", "oversized login fields must fail generically")
            web_app.app.extensions["fyadr_auth"]._limiter.clear("127.0.0.1")

            for _ in range(2):
                failed = client.post(
                    "/api/auth/login",
                    json={"username": "operator", "password": "wrong"},
                    headers={"X-FYADR-CSRF": csrf_token},
                )
                _assert(failed.status_code == 401, "invalid credentials must return a generic 401")
                _assert("operator" not in failed.get_data(as_text=True), "login failures must not echo the configured username")
            limited = client.post(
                "/api/auth/login",
                json={"username": "operator", "password": "wrong"},
                headers={"X-FYADR-CSRF": csrf_token},
            )
            _assert(limited.status_code == 429 and limited.headers.get("Retry-After"), "repeated login failures must be rate limited")
            web_app.app.extensions["fyadr_auth"]._limiter.clear("127.0.0.1")

            login = client.post(
                "/api/auth/login",
                json={"username": "operator", "password": "correct horse"},
                headers={"X-FYADR-CSRF": csrf_token},
            )
            login_payload = login.get_json()
            _assert(login.status_code == 200 and login_payload["authenticated"] is True, "valid credentials must create a session")
            _assert(login_payload["username"] == "operator" and login_payload["csrfToken"] != csrf_token, "login must rotate the CSRF token")
            logged_in_csrf = login_payload["csrfToken"]
            _assert(client.get("/api/model-config").status_code == 200, "authenticated sessions must access protected APIs")
            logout_missing_csrf = client.post("/api/auth/logout")
            _assert(logout_missing_csrf.status_code == 403, "logout must be CSRF protected")
            logout = client.post("/api/auth/logout", headers={"X-FYADR-CSRF": logged_in_csrf})
            logout_payload = logout.get_json()
            _assert(logout.status_code == 200 and logout_payload["enabled"] is True and logout_payload["authenticated"] is False, "logout response must match the frontend contract")
            _assert(len(logout_payload["csrfToken"]) >= 32, "logout must return a fresh anonymous CSRF token")
            _assert(client.get("/api/model-config").status_code == 401, "logout must invalidate the session")
            relogin = client.post(
                "/api/auth/login",
                json={"username": "operator", "password": "correct horse"},
                headers={"X-FYADR-CSRF": logout_payload["csrfToken"]},
            )
            _assert(relogin.status_code == 200, "logout must allow immediate login without a page refresh")
            client.post("/api/auth/logout", headers={"X-FYADR-CSRF": relogin.get_json()["csrfToken"]})
            checks.append("session login, input bounds, CSRF rotation, generic failures, rate limiting, and logout are enforced")

            # Password hashes are accepted without ever exposing the original
            # password in a response or persisted auth setting.
            _clear_auth_env()
            os.environ["FYADR_AUTH_PASSWORD_HASH"] = generate_password_hash("hashed-pass")
            os.environ["FYADR_AUTH_SECRET_KEY"] = "regression-secret-key"
            web_app.create_app()
            client = web_app.app.test_client()
            _, status_payload = _status(client)
            hash_login = client.post(
                "/api/auth/login",
                json={"username": "admin", "password": "hashed-pass"},
                headers={"X-FYADR-CSRF": status_payload["csrfToken"]},
            )
            _assert(hash_login.status_code == 200, "Werkzeug password hashes must authenticate")
            checks.append("Werkzeug password hash authentication works")

            # A password file and an auto-generated persistent signing key are
            # suitable for Compose secrets and survive app-factory reloads.
            _clear_auth_env()
            password_file = Path(temp_dir) / "auth-password"
            password_file.write_text("file-pass\n", encoding="utf-8")
            os.environ["FYADR_AUTH_PASSWORD_FILE"] = str(password_file)
            web_app.create_app()
            secret_file = config_dir / ".auth-secret-key"
            _assert(secret_file.is_file(), "auth must persist a signing key under FYADR_APP_CONFIG_DIR")
            secret_before = secret_file.read_bytes()
            if os.name != "nt":
                _assert(stat.S_IMODE(secret_file.stat().st_mode) == 0o600, "persisted signing key must be owner-readable only")
            web_app.create_app()
            _assert(secret_file.read_bytes() == secret_before, "persistent signing key must remain stable across reloads")
            client = web_app.app.test_client()
            _, status_payload = _status(client)
            file_login = client.post(
                "/api/auth/login",
                json={"username": "admin", "password": "file-pass"},
                headers={"X-FYADR-CSRF": status_payload["csrfToken"]},
            )
            _assert(file_login.status_code == 200, "password-file authentication must work")
            checks.append("password-file authentication and persistent signing-key permissions work")

            # Explicit secure cookies opt in to Secure and HSTS; no trusted
            # forwarded header is consulted.
            _clear_auth_env()
            os.environ["FYADR_AUTH_PASSWORD"] = "secure-pass"
            os.environ["FYADR_AUTH_COOKIE_SECURE"] = "1"
            web_app.create_app()
            client = web_app.app.test_client()
            secure_status, _ = _status(client)
            _assert("Secure" in secure_status.headers.get("Set-Cookie", ""), "secure-cookie mode must mark the session Secure")
            _assert("max-age=31536000" in secure_status.headers.get("Strict-Transport-Security", ""), "secure-cookie mode must emit HSTS")
            checks.append("secure-cookie mode emits Secure and explicit HSTS")

            # Ambiguous credential sources fail closed at application setup.
            os.environ["FYADR_AUTH_PASSWORD_HASH"] = generate_password_hash("also-pass")
            try:
                web_app.create_app()
            except RuntimeError:
                checks.append("ambiguous password sources fail closed")
            else:
                raise AssertionError("multiple password sources must fail closed")

            _clear_auth_env()
            os.environ["FYADR_AUTH_PASSWORD"] = "secret-source-pass"
            os.environ["FYADR_AUTH_SECRET_KEY"] = "inline-signing-key"
            os.environ["FYADR_AUTH_SECRET_FILE"] = str(config_dir / ".auth-secret-key")
            try:
                web_app.create_app()
            except RuntimeError:
                checks.append("ambiguous signing-key sources fail closed")
            else:
                raise AssertionError("multiple signing-key sources must fail closed")
    finally:
        for name, value in original_env.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        if original_config_dir is None:
            os.environ.pop("FYADR_APP_CONFIG_DIR", None)
        else:
            os.environ["FYADR_APP_CONFIG_DIR"] = original_config_dir
        # Leave the imported app in the caller's original auth mode.
        try:
            import web_app

            web_app.create_app()
        except Exception:
            pass
    return {"ok": True, "checks": checks}


def main() -> int:
    report = run_regression()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
