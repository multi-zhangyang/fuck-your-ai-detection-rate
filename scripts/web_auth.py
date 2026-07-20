"""Optional, single-user authentication for the FYADR web API.

Authentication is deliberately opt-in.  With no ``FYADR_AUTH_PASSWORD``,
``FYADR_AUTH_PASSWORD_HASH`` or ``FYADR_AUTH_PASSWORD_FILE`` configured, the
application keeps its existing local, unauthenticated behaviour.  Once a
password source is configured, all API routes except the liveness probe,
authentication status/login, and CORS preflight require a signed session.

The module owns the security-sensitive pieces so the large Flask application
does not need authentication branches in every handler.  The session is a
signed Flask cookie (no server-side user store), while the signing key is
persisted with private permissions under ``FYADR_APP_CONFIG_DIR`` by default.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

try:
    from app_config import get_app_config_dir
except ImportError:  # pragma: no cover - useful when imported outside scripts/
    def get_app_config_dir() -> Path:
        override = os.getenv("FYADR_APP_CONFIG_DIR", "").strip()
        if override:
            return Path(override)
        appdata = os.getenv("APPDATA", "").strip()
        return Path(appdata) / "FYADR" if appdata else Path.home() / ".fyadr"


AUTH_SECRET_ENV = "FYADR_AUTH_SECRET_KEY"
AUTH_SECRET_FILE_ENV = "FYADR_AUTH_SECRET_FILE"
AUTH_USERNAME_ENV = "FYADR_AUTH_USERNAME"
AUTH_PASSWORD_ENV = "FYADR_AUTH_PASSWORD"
AUTH_PASSWORD_HASH_ENV = "FYADR_AUTH_PASSWORD_HASH"
AUTH_PASSWORD_FILE_ENV = "FYADR_AUTH_PASSWORD_FILE"
AUTH_COOKIE_SECURE_ENV = "FYADR_AUTH_COOKIE_SECURE"
AUTH_COOKIE_SAMESITE_ENV = "FYADR_AUTH_COOKIE_SAMESITE"
AUTH_SESSION_TTL_ENV = "FYADR_AUTH_SESSION_TTL_SECONDS"
AUTH_RATE_LIMIT_MAX_ENV = "FYADR_AUTH_RATE_LIMIT_MAX"
AUTH_RATE_LIMIT_WINDOW_ENV = "FYADR_AUTH_RATE_LIMIT_WINDOW_SECONDS"

SESSION_COOKIE_NAME = "fyadr_session"
CSRF_HEADER_NAME = "X-FYADR-CSRF"
DEFAULT_SESSION_TTL_SECONDS = 12 * 60 * 60
DEFAULT_RATE_LIMIT_MAX = 5
DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60
MAX_PASSWORD_FILE_BYTES = 16 * 1024
MAX_LOGIN_USERNAME_LENGTH = 80
MAX_LOGIN_PASSWORD_LENGTH = 1024
AUTH_FAILURE_CODE = "authentication_failed"
AUTH_REQUIRED_CODE = "authentication_required"
CSRF_FAILURE_CODE = "csrf_failed"
RATE_LIMIT_CODE = "rate_limited"


@dataclass(frozen=True)
class AuthSettings:
    enabled: bool
    username: str
    password_kind: str
    password_value: str
    password_digest: str
    session_ttl_seconds: int
    cookie_secure: bool
    cookie_samesite: str
    rate_limit_max: int
    rate_limit_window_seconds: int
    secret_key: str
    config_fingerprint: str


class _AttemptLimiter:
    """Small process-local failure limiter keyed by the peer address."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._failures: dict[str, list[float]] = {}

    def _prune(self, address: str, now: float, window: int) -> list[float]:
        values = [stamp for stamp in self._failures.get(address, []) if now - stamp < window]
        if values:
            self._failures[address] = values
        else:
            self._failures.pop(address, None)
        return values

    def blocked(self, address: str, *, maximum: int, window: int) -> int:
        now = time.monotonic()
        with self._lock:
            values = self._prune(address, now, window)
            if len(values) < maximum:
                return 0
            return max(1, int(window - (now - values[0]) + 0.999))

    def record_failure(self, address: str, *, maximum: int, window: int) -> None:
        now = time.monotonic()
        with self._lock:
            values = self._prune(address, now, window)
            values.append(now)
            # Keep the map bounded even if a client rotates source addresses.
            if address not in self._failures and len(self._failures) >= 4096:
                self._failures.pop(next(iter(self._failures)))
            self._failures[address] = values[-max(maximum, 1) :]

    def clear(self, address: str) -> None:
        with self._lock:
            self._failures.pop(address, None)


def _truthy(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _positive_int(value: str, default: int, *, maximum: int = 31_536_000) -> int:
    try:
        parsed = int(value.strip())
    except (TypeError, ValueError):
        return default
    if parsed <= 0:
        return default
    return min(parsed, maximum)


def _read_password_file(path_value: str) -> str:
    path = Path(path_value).expanduser()
    try:
        stat = path.lstat()
    except OSError as exc:
        raise RuntimeError("FYADR_AUTH_PASSWORD_FILE cannot be read.") from exc
    if path.is_symlink() or not path.is_file():
        raise RuntimeError("FYADR_AUTH_PASSWORD_FILE must point to a regular file.")
    if stat.st_size > MAX_PASSWORD_FILE_BYTES:
        raise RuntimeError("FYADR_AUTH_PASSWORD_FILE is too large.")
    try:
        value = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise RuntimeError("FYADR_AUTH_PASSWORD_FILE cannot be read.") from exc
    # Password files conventionally end in one newline.  Preserve every other
    # character so a deliberately chosen leading/trailing space remains valid.
    value = value.rstrip("\r\n")
    if not value:
        raise RuntimeError("FYADR_AUTH_PASSWORD_FILE must not be empty.")
    return value


def _private_mode(path: Path, mode: int) -> None:
    if os.name == "nt":
        return
    path.chmod(mode)


def _load_or_create_secret() -> str:
    explicit = os.getenv(AUTH_SECRET_ENV, "").strip()
    explicit_path = os.getenv(AUTH_SECRET_FILE_ENV, "").strip()
    if explicit and explicit_path:
        raise RuntimeError("Configure only one of FYADR_AUTH_SECRET_KEY or FYADR_AUTH_SECRET_FILE.")
    if explicit:
        return explicit

    path = Path(explicit_path).expanduser() if explicit_path else get_app_config_dir() / ".auth-secret-key"
    parent = path.parent
    parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if os.name != "nt":
        _private_mode(parent, 0o700)

    try:
        stat = path.lstat()
        if path.is_symlink() or not path.is_file() or stat.st_size > 4096:
            raise RuntimeError("FYADR_AUTH_SECRET_FILE must be a private regular file.")
        value = path.read_text(encoding="ascii").strip()
        if not value:
            raise RuntimeError("FYADR authentication secret file is empty.")
        if os.name != "nt":
            _private_mode(path, 0o600)
        return value
    except FileNotFoundError:
        value = base64.urlsafe_b64encode(secrets.token_bytes(48)).decode("ascii")
        # O_EXCL prevents two workers starting simultaneously from silently
        # replacing one another's signing key.
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        mode = 0o600 if os.name != "nt" else 0o600
        try:
            descriptor = os.open(path, flags, mode)
        except FileExistsError:
            return _load_or_create_secret()
        try:
            try:
                with os.fdopen(descriptor, "w", encoding="ascii", newline="\n") as handle:
                    handle.write(value + "\n")
                    handle.flush()
                    os.fsync(handle.fileno())
            except Exception:
                path.unlink(missing_ok=True)
                raise
        finally:
            if os.name != "nt":
                if path.exists():
                    _private_mode(path, 0o600)
        return value
    except UnicodeError as exc:
        raise RuntimeError("FYADR authentication secret file is not valid text.") from exc


def _password_source() -> tuple[str, str, bool]:
    password = os.getenv(AUTH_PASSWORD_ENV, "")
    password_hash = os.getenv(AUTH_PASSWORD_HASH_ENV, "")
    password_file = os.getenv(AUTH_PASSWORD_FILE_ENV, "")
    configured = [
        ("password", password) if password != "" else None,
        ("password_hash", password_hash) if password_hash != "" else None,
        ("password_file", password_file) if password_file != "" else None,
    ]
    selected = [item for item in configured if item is not None]
    if not selected:
        return "", "", False
    if len(selected) > 1:
        raise RuntimeError(
            "Configure exactly one of FYADR_AUTH_PASSWORD, FYADR_AUTH_PASSWORD_HASH, or FYADR_AUTH_PASSWORD_FILE."
        )
    kind, value = selected[0]
    if kind == "password_file":
        value = _read_password_file(value)
    if not value:
        raise RuntimeError("FYADR authentication password source must not be empty.")
    return kind, value, True


def _settings_from_environment() -> AuthSettings:
    kind, value, enabled = _password_source()
    username = os.getenv(AUTH_USERNAME_ENV, "").strip() or "admin"
    secure = _truthy(os.getenv(AUTH_COOKIE_SECURE_ENV, ""))
    samesite = os.getenv(AUTH_COOKIE_SAMESITE_ENV, "Lax").strip().capitalize() or "Lax"
    if samesite not in {"Lax", "Strict", "None"}:
        samesite = "Lax"
    if samesite == "None" and not secure:
        # Browsers reject SameSite=None without Secure.  Falling back to Lax
        # avoids creating a cookie that silently never returns to the server.
        samesite = "Lax"
    ttl = _positive_int(os.getenv(AUTH_SESSION_TTL_ENV, ""), DEFAULT_SESSION_TTL_SECONDS)
    rate_max = _positive_int(os.getenv(AUTH_RATE_LIMIT_MAX_ENV, ""), DEFAULT_RATE_LIMIT_MAX, maximum=1000)
    rate_window = _positive_int(
        os.getenv(AUTH_RATE_LIMIT_WINDOW_ENV, ""), DEFAULT_RATE_LIMIT_WINDOW_SECONDS, maximum=86_400
    )
    secret = _load_or_create_secret() if enabled else ""
    digest_input = "\x00".join((username, kind, value, secret)).encode("utf-8")
    config_fingerprint = hashlib.sha256(digest_input).hexdigest()
    return AuthSettings(
        enabled=enabled,
        username=username,
        password_kind=kind,
        password_value=value,
        password_digest=hashlib.sha256(value.encode("utf-8")).hexdigest() if value else "",
        session_ttl_seconds=ttl,
        cookie_secure=secure,
        cookie_samesite=samesite,
        rate_limit_max=rate_max,
        rate_limit_window_seconds=rate_window,
        secret_key=secret,
        config_fingerprint=config_fingerprint,
    )


def _json_error(code: str, message: str, status: int, *, retry_after: int | None = None) -> Response:
    response = jsonify({"ok": False, "code": code, "message": message})
    response.status_code = status
    if status == 401:
        response.headers["WWW-Authenticate"] = "Session"
    if retry_after is not None:
        response.headers["Retry-After"] = str(max(1, retry_after))
    return response


class AuthManager:
    def __init__(self, app: Flask) -> None:
        self.app = app
        self.settings = _settings_from_environment()
        self._settings_lock = threading.RLock()
        self._limiter = _AttemptLimiter()
        self._dummy_hash = generate_password_hash(secrets.token_urlsafe(24))

    def reload(self) -> None:
        with self._settings_lock:
            self.settings = _settings_from_environment()
            self._apply_flask_config()

    def _apply_flask_config(self) -> None:
        settings = self.settings
        self.app.config["SECRET_KEY"] = settings.secret_key or None
        self.app.secret_key = settings.secret_key or None
        self.app.config["SESSION_COOKIE_NAME"] = SESSION_COOKIE_NAME
        self.app.config["SESSION_COOKIE_HTTPONLY"] = True
        self.app.config["SESSION_COOKIE_PATH"] = "/"
        self.app.config["SESSION_COOKIE_SAMESITE"] = settings.cookie_samesite
        self.app.config["SESSION_COOKIE_SECURE"] = settings.cookie_secure
        self.app.config["SESSION_REFRESH_EACH_REQUEST"] = True
        self.app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(seconds=settings.session_ttl_seconds)

    def configure(self) -> None:
        self._apply_flask_config()
        if self.app.extensions.get("fyadr_auth_routes") is not True:
            self._register_routes()
            self.app.extensions["fyadr_auth_routes"] = True
        if self.app.extensions.get("fyadr_auth_hooks") is not True:
            self.app.before_request(self.before_request)
            self.app.after_request(self.after_request)
            self.app.extensions["fyadr_auth_hooks"] = True

    def _status_payload(self) -> dict[str, Any]:
        settings = self.settings
        if not settings.enabled:
            return {
                "ok": True,
                "enabled": False,
                "authenticated": True,
                "username": "",
                "csrfToken": "",
                "sessionExpiresAt": "",
            }
        token = self._ensure_csrf_token()
        authenticated = self._is_authenticated()
        return {
            "ok": True,
            "enabled": True,
            "authenticated": authenticated,
            "username": settings.username if authenticated else "",
            "csrfToken": token,
            "sessionExpiresAt": str(session.get("auth_session_expires_at", "")) if authenticated else "",
        }

    def _ensure_csrf_token(self) -> str:
        token = str(session.get("auth_csrf", ""))
        if len(token) < 32:
            token = secrets.token_urlsafe(32)
            session["auth_csrf"] = token
        session.permanent = True
        return token

    def _is_authenticated(self) -> bool:
        settings = self.settings
        if not settings.enabled:
            return True
        if session.get("auth_user") != settings.username:
            return False
        if session.get("auth_config_fingerprint") != settings.config_fingerprint:
            return False
        expires_at = str(session.get("auth_session_expires_at", ""))
        if not expires_at:
            return False
        try:
            expired = datetime.fromisoformat(expires_at.replace("Z", "+00:00")) <= datetime.now(timezone.utc)
        except ValueError:
            expired = True
        if expired:
            session.pop("auth_user", None)
            session.pop("auth_config_fingerprint", None)
            session.pop("auth_session_expires_at", None)
            return False
        return True

    def _check_password(self, username: str, password: str) -> bool:
        settings = self.settings
        username_ok = hmac.compare_digest(username, settings.username)
        if settings.password_kind == "password":
            password_ok = hmac.compare_digest(password, settings.password_value)
        elif settings.password_kind == "password_hash":
            try:
                password_ok = check_password_hash(settings.password_value, password)
            except (ValueError, TypeError):
                password_ok = False
        elif settings.password_kind == "password_file":
            password_ok = hmac.compare_digest(password, settings.password_value)
        else:
            password_ok = check_password_hash(self._dummy_hash, password)
        return username_ok and password_ok

    def _session_authenticated(self) -> bool:
        return self._is_authenticated()

    def _csrf_valid(self) -> bool:
        expected = str(session.get("auth_csrf", ""))
        supplied = request.headers.get(CSRF_HEADER_NAME, "")
        return bool(expected and supplied and hmac.compare_digest(expected, supplied))

    def before_request(self) -> Response | None:
        settings = self.settings
        if not settings.enabled:
            return None
        if not request.path.startswith("/api"):
            return None
        if request.method == "OPTIONS" or request.path == "/api/ping":
            return None
        # A CSRF check applies to every state-changing API request, including
        # the login handshake.  The public status endpoint creates the token
        # and the UI sends it back in X-FYADR-CSRF.
        if request.method not in {"GET", "HEAD"} and not self._csrf_valid():
            return _json_error(CSRF_FAILURE_CODE, "CSRF validation failed.", 403)
        if request.path in {"/api/auth/status", "/api/auth/login"}:
            return None
        if not self._session_authenticated():
            return _json_error(AUTH_REQUIRED_CODE, "Authentication required.", 401)
        return None

    def after_request(self, response: Response) -> Response:
        # These headers are useful even when authentication is disabled and
        # protect the bundled SPA as well as API responses.
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if request.path.startswith("/api/auth/") or response.status_code in {401, 403}:
            response.headers["Cache-Control"] = "no-store"
            response.headers["Pragma"] = "no-cache"
        if self.settings.cookie_secure:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

    def _register_routes(self) -> None:
        @self.app.route("/api/auth/status", methods=["GET"])
        def auth_status() -> Response:
            return jsonify(self._status_payload())

        @self.app.route("/api/auth/login", methods=["POST"])
        def auth_login() -> Response:
            if not self.settings.enabled:
                return jsonify(self._status_payload())
            address = request.remote_addr or "unknown"
            retry_after = self._limiter.blocked(
                address,
                maximum=self.settings.rate_limit_max,
                window=self.settings.rate_limit_window_seconds,
            )
            if retry_after:
                return _json_error(RATE_LIMIT_CODE, "Too many failed login attempts.", 429, retry_after=retry_after)
            payload = request.get_json(silent=True)
            if not isinstance(payload, dict):
                payload = {}
            raw_username = payload.get("username", "")
            raw_password = payload.get("password", "")
            fields_valid = (
                isinstance(raw_username, str)
                and isinstance(raw_password, str)
                and len(raw_username) <= MAX_LOGIN_USERNAME_LENGTH
                and len(raw_password) <= MAX_LOGIN_PASSWORD_LENGTH
            )
            username = raw_username if isinstance(raw_username, str) else ""
            password = raw_password if isinstance(raw_password, str) else ""
            if not fields_valid or not self._check_password(username, password):
                self._limiter.record_failure(
                    address,
                    maximum=self.settings.rate_limit_max,
                    window=self.settings.rate_limit_window_seconds,
                )
                return _json_error(AUTH_FAILURE_CODE, "用户名或密码错误。", 401)
            self._limiter.clear(address)
            token = secrets.token_urlsafe(32)
            now = datetime.now(timezone.utc)
            expires = now + timedelta(seconds=self.settings.session_ttl_seconds)
            session.clear()
            session.permanent = True
            session["auth_user"] = self.settings.username
            session["auth_config_fingerprint"] = self.settings.config_fingerprint
            session["auth_csrf"] = token
            session["auth_session_expires_at"] = expires.isoformat().replace("+00:00", "Z")
            return jsonify(self._status_payload())

        @self.app.route("/api/auth/logout", methods=["POST"])
        def auth_logout() -> Response:
            if not self.settings.enabled:
                return jsonify(self._status_payload())
            session.clear()
            # Return a fresh anonymous CSRF token so the login form works again
            # immediately without a page reload or a second status request.
            return jsonify(self._status_payload())


def configure_auth(app: Flask) -> AuthManager:
    """Load current environment settings and install auth exactly once."""

    manager = app.extensions.get("fyadr_auth")
    if not isinstance(manager, AuthManager):
        manager = AuthManager(app)
        app.extensions["fyadr_auth"] = manager
    else:
        manager.reload()
    manager.configure()
    return manager


__all__ = [
    "AUTH_FAILURE_CODE",
    "AUTH_REQUIRED_CODE",
    "CSRF_FAILURE_CODE",
    "CSRF_HEADER_NAME",
    "RATE_LIMIT_CODE",
    "AuthManager",
    "configure_auth",
]
