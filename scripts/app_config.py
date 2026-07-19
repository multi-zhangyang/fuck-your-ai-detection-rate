from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from prompt_library import (
    get_default_prompt_profile,
    get_round_model_keys,
    normalize_prompt_profile,
    normalize_prompt_sequence,
)

APP_DIR_NAME = "FYADR"
CONFIG_FILE_NAME = "config.json"
DEFAULT_REQUEST_TIMEOUT_SECONDS = 600
DEFAULT_MAX_RETRIES = 3
DEFAULT_REWRITE_CONCURRENCY = 2
MAX_REWRITE_CONCURRENCY = 16
# Generation historically used streaming for every rewrite request.  Keep that
# behaviour for configurations saved before the explicit switch existed; the
# setting is intentionally provider/model agnostic and never auto-flips.
DEFAULT_STREAMING = True
# DOCX 导出格式策略（产品硬约束）：
#   "preserve_original" — 唯一允许的产品模式。以原 DOCX 每个 run/段落 OOXML 为唯一
#       真相源，改写时只替换可编辑正文的 w:t 文字节点，其余格式与结构保持不变。
#
# ``FORMAT_MODE_SCHOOL_RULES`` 仅保留为旧配置/旧调用方的兼容标识。读取或保存时都会
# 迁移为 ``preserve_original``；旧学校规则值只作为兼容输入，不再驱动任何解析或格式写回。
FORMAT_MODE_PRESERVE_ORIGINAL = "preserve_original"
FORMAT_MODE_SCHOOL_RULES = "school_rules"
DEFAULT_FORMAT_MODE = FORMAT_MODE_PRESERVE_ORIGINAL
_ALLOWED_FORMAT_MODES = (FORMAT_MODE_PRESERVE_ORIGINAL,)
SAVED_SECRET_PLACEHOLDER = "__FYADR_SAVED_SECRET__"
_MISSING_SECRET = object()


def _normalize_format_mode(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in _ALLOWED_FORMAT_MODES:
        return normalized
    # Fail closed: legacy ``school_rules`` and every unknown value are migrated
    # to the only product-safe mode instead of retaining a formatting-mutating
    # export path.
    return DEFAULT_FORMAT_MODE


def _clamp_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        normalized = default
    return max(minimum, min(maximum, normalized))


def get_app_config_dir() -> Path:
    # Docker / explicit override: store the config (incl. provider secrets)
    # in a mountable, persistent directory instead of the user home.
    override = os.getenv("FYADR_APP_CONFIG_DIR", "").strip()
    if override:
        return Path(override)
    base_dir = os.getenv("APPDATA")
    if base_dir:
        return Path(base_dir) / APP_DIR_NAME
    return Path.home() / ".fyadr"


def get_app_config_path() -> Path:
    return get_app_config_dir() / CONFIG_FILE_NAME


def _set_private_mode(path: Path, mode: int, *, strict: bool) -> None:
    """Apply a POSIX private mode while remaining portable to Windows.

    Windows protects the default config through the user's profile ACL rather
    than POSIX mode bits.  On POSIX, a failed chmod during a save is treated as
    an error so a newly written API key is never knowingly left world-readable.
    """

    if os.name == "nt":
        return
    try:
        path.chmod(mode)
    except OSError:
        if strict:
            raise


def _harden_config_permissions(path: Path) -> None:
    """Best-effort remediation for config files created by older releases."""

    if path.parent.exists():
        _set_private_mode(path.parent, 0o700, strict=False)
    if path.exists():
        _set_private_mode(path, 0o600, strict=False)


def _write_private_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    """Atomically persist provider configuration with private permissions."""

    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    _set_private_mode(path.parent, 0o700, strict=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    file_descriptor = -1
    temporary_path: Path | None = None
    try:
        file_descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{path.name}.",
            suffix=".tmp",
            dir=str(path.parent),
            text=True,
        )
        temporary_path = Path(temporary_name)
        if os.name != "nt" and hasattr(os, "fchmod"):
            os.fchmod(file_descriptor, 0o600)
        with os.fdopen(file_descriptor, "w", encoding="utf-8", newline="\n") as handle:
            file_descriptor = -1
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
        temporary_path = None
        _set_private_mode(path, 0o600, strict=True)
    except Exception:
        if file_descriptor >= 0:
            os.close(file_descriptor)
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
        raise


def _normalize_prompt_profile(value: Any) -> str:
    fallback_profile = get_default_prompt_profile()
    try:
        return normalize_prompt_profile(str(value or fallback_profile))
    except ValueError:
        return fallback_profile


def _normalize_prompt_sequence(value: Any, prompt_profile: str | None = None) -> list[str]:
    normalized_profile = prompt_profile or get_default_prompt_profile()
    try:
        return normalize_prompt_sequence(normalized_profile, value)
    except ValueError:
        return normalize_prompt_sequence(normalized_profile, None)


def _normalize_api_type(value: Any) -> str:
    candidate = str(value or "chat_completions").strip() or "chat_completions"
    return "responses" if candidate == "responses" else "chat_completions"


def normalize_streaming(value: Any = None) -> bool:
    """Normalize the canonical ``streaming`` switch without truthy-string bugs.

    ``stream`` is accepted only by callers as a legacy/input alias; persisted
    configuration always uses ``streaming``.  Missing or malformed values keep
    the historical streaming behaviour instead of guessing from a provider or
    model name.
    """

    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if value == 0:
            return False
        if value == 1:
            return True
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"false", "0", "off", "no", "disabled"}:
            return False
        if normalized in {"true", "1", "on", "yes", "enabled"}:
            return True
    return DEFAULT_STREAMING


def _streaming_value(raw_config: dict[str, Any]) -> Any:
    return raw_config.get("streaming", raw_config.get("stream", DEFAULT_STREAMING))


def _normalize_rate_limit(value: Any) -> int:
    return _clamp_int(value, default=0, minimum=0, maximum=10000)


def _normalize_rate_window_minutes(raw_config: dict[str, Any]) -> float:
    try:
        value = float(raw_config.get("rateLimitWindowMinutes", 0) or 0)
    except (TypeError, ValueError):
        value = 0.0
    if value > 0:
        return min(1440.0, value)
    if _normalize_rate_limit(raw_config.get("rateLimitPerFiveMinutes", 0)) > 0:
        return 5.0
    if _normalize_rate_limit(raw_config.get("rateLimitPerMinute", 0)) > 0:
        return 1.0
    return 0.0


def _normalize_rate_max_requests(raw_config: dict[str, Any]) -> int:
    value = _normalize_rate_limit(raw_config.get("rateLimitMaxRequests", 0))
    if value > 0:
        return value
    five_minute_value = _normalize_rate_limit(raw_config.get("rateLimitPerFiveMinutes", 0))
    if five_minute_value > 0:
        return five_minute_value
    return _normalize_rate_limit(raw_config.get("rateLimitPerMinute", 0))


def _is_saved_secret_placeholder(value: Any) -> bool:
    return str(value or "").strip() == SAVED_SECRET_PLACEHOLDER


def _secret_destination(value: Any) -> str:
    """Return a stable destination identity for binding a saved API key.

    Saved secrets may only be reused for the exact provider endpoint they were
    stored with.  Normalising the scheme/host/default port and a trailing slash
    avoids false mismatches without treating a different path or query as the
    same destination.
    """

    candidate = str(value or "").strip()
    if not candidate:
        return ""
    try:
        parsed = urlsplit(candidate)
        if not parsed.scheme or not parsed.hostname:
            return candidate.rstrip("/")
        scheme = parsed.scheme.lower()
        hostname = parsed.hostname.rstrip(".").lower()
        port = parsed.port
        if port is None:
            port = 443 if scheme == "https" else 80 if scheme == "http" else None
        netloc = f"{hostname}:{port}" if port is not None else hostname
        path = parsed.path.rstrip("/")
        return urlunsplit((scheme, netloc, path, parsed.query, ""))
    except (TypeError, ValueError):
        return candidate.rstrip("/")


def _secret_or_existing(
    value: Any = _MISSING_SECRET,
    existing_value: Any = "",
    *,
    base_url: Any = "",
    existing_base_url: Any = "",
) -> str:
    """Resolve a submitted secret without sending it to a new destination.

    The UI sends either a placeholder or omits ``apiKey`` when a saved key is
    unchanged.  Reusing that key is safe only while the Base URL remains bound
    to the same endpoint.  An explicit secret (including an explicit empty
    string used to clear it) never falls through to the saved value.
    """

    existing_candidate = str(existing_value or "").strip()
    reuse_requested = value is _MISSING_SECRET or _is_saved_secret_placeholder(value)
    if not reuse_requested:
        return str(value or "").strip()
    if not existing_candidate:
        return ""

    submitted_destination = _secret_destination(base_url)
    saved_destination = _secret_destination(existing_base_url)
    if not saved_destination or submitted_destination != saved_destination:
        raise ValueError("API key must be re-entered when the provider Base URL changes.")
    return existing_candidate


def _secret_for_client(value: Any) -> str:
    return SAVED_SECRET_PLACEHOLDER if str(value or "").strip() else ""


def _redact_secret_fields(config: dict[str, Any]) -> dict[str, Any]:
    redacted = dict(config)
    api_key = str(redacted.get("apiKey", "") or "").strip()
    redacted["apiKey"] = _secret_for_client(api_key)
    redacted["hasApiKey"] = bool(api_key)
    redacted["apiKeyPreview"] = f"...{api_key[-4:]}" if api_key else ""
    return redacted


def redact_app_config(config: dict[str, Any]) -> dict[str, Any]:
    redacted = _redact_secret_fields(config)
    providers = []
    for provider in redacted.get("modelProviders", []) or []:
        if isinstance(provider, dict):
            providers.append(_redact_secret_fields(provider))
    redacted["modelProviders"] = providers

    round_models: dict[str, Any] = {}
    raw_round_models = redacted.get("roundModels", {})
    if isinstance(raw_round_models, dict):
        for key, round_config in raw_round_models.items():
            if isinstance(round_config, dict):
                round_models[str(key)] = _redact_secret_fields(round_config)
    redacted["roundModels"] = round_models
    return redacted


def _existing_providers_by_key(existing: dict[str, Any]) -> dict[str, dict[str, Any]]:
    providers: dict[str, dict[str, Any]] = {}
    for provider in existing.get("modelProviders", []) or []:
        if not isinstance(provider, dict):
            continue
        provider_id = str(provider.get("id", "") or "").strip()
        provider_name = str(provider.get("name", "") or "").strip()
        if provider_id:
            providers[f"id:{provider_id}"] = provider
        if provider_name:
            providers[f"name:{provider_name}"] = provider
    return providers


def _matching_saved_secrets(existing: dict[str, Any], base_url: Any) -> set[str]:
    """Find unambiguous saved credentials already bound to ``base_url``."""

    destination = _secret_destination(base_url)
    if not destination:
        return set()
    candidates: list[dict[str, Any]] = [existing]
    candidates.extend(item for item in existing.get("modelProviders", []) or [] if isinstance(item, dict))
    round_models = existing.get("roundModels", {})
    if isinstance(round_models, dict):
        candidates.extend(item for item in round_models.values() if isinstance(item, dict))
    return {
        str(item.get("apiKey", "") or "").strip()
        for item in candidates
        if _secret_destination(item.get("baseUrl", "")) == destination
        and str(item.get("apiKey", "") or "").strip()
    }


def _hydrate_connection_secret(config: dict[str, Any], existing: dict[str, Any]) -> str:
    """Hydrate a top-level connection from any saved entry at the same URL.

    Provider catalog actions flatten a selected provider into the top-level
    connection fields before calling the backend.  Matching by destination
    preserves that workflow while preventing a saved key from crossing to a
    caller-controlled host. Multiple different saved keys at one URL are
    intentionally considered ambiguous and require explicit re-entry.
    """

    value = config.get("apiKey", _MISSING_SECRET)
    if value is not _MISSING_SECRET and not _is_saved_secret_placeholder(value):
        return str(value or "").strip()
    base_url = config.get("baseUrl", existing.get("baseUrl", ""))
    matching = _matching_saved_secrets(existing, base_url)
    if len(matching) == 1:
        return next(iter(matching))
    if len(matching) > 1:
        raise ValueError("Multiple saved API keys match this Base URL; re-enter the intended key.")
    has_any_saved_secret = bool(_matching_saved_secrets(existing, existing.get("baseUrl", ""))) or any(
        str(item.get("apiKey", "") or "").strip()
        for item in (existing.get("modelProviders", []) or [])
        if isinstance(item, dict)
    ) or any(
        str(item.get("apiKey", "") or "").strip()
        for item in (existing.get("roundModels", {}) or {}).values()
        if isinstance(item, dict)
    )
    if has_any_saved_secret:
        raise ValueError("API key must be re-entered when the provider Base URL changes.")
    return ""


def _merge_existing_provider_secrets(value: Any, existing: dict[str, Any]) -> Any:
    if not isinstance(value, list):
        return value
    existing_by_key = _existing_providers_by_key(existing)
    merged: list[Any] = []
    for provider in value:
        if not isinstance(provider, dict):
            merged.append(provider)
            continue
        provider_id = str(provider.get("id", "") or "").strip()
        provider_name = str(provider.get("name", "") or "").strip()
        existing_provider = (
            existing_by_key.get(f"id:{provider_id}")
            or existing_by_key.get(f"name:{provider_name}")
            or {}
        )
        next_provider = dict(provider)
        next_provider["apiKey"] = _secret_or_existing(
            next_provider.get("apiKey", _MISSING_SECRET),
            existing_provider.get("apiKey") if isinstance(existing_provider, dict) else "",
            base_url=next_provider.get("baseUrl", existing_provider.get("baseUrl", "")),
            existing_base_url=existing_provider.get("baseUrl", "") if isinstance(existing_provider, dict) else "",
        )
        merged.append(next_provider)
    return merged


def _merge_existing_round_model_secrets(value: Any, existing: dict[str, Any]) -> Any:
    if not isinstance(value, dict):
        return value
    existing_round_models = existing.get("roundModels", {})
    if not isinstance(existing_round_models, dict):
        existing_round_models = {}
    merged: dict[str, Any] = {}
    for key, round_config in value.items():
        if not isinstance(round_config, dict):
            merged[key] = round_config
            continue
        existing_round = existing_round_models.get(str(key), {})
        next_round = dict(round_config)
        next_round["apiKey"] = _secret_or_existing(
            next_round.get("apiKey", _MISSING_SECRET),
            existing_round.get("apiKey") if isinstance(existing_round, dict) else "",
            base_url=next_round.get("baseUrl", existing_round.get("baseUrl", "")),
            existing_base_url=existing_round.get("baseUrl", "") if isinstance(existing_round, dict) else "",
        )
        merged[key] = next_round
    return merged


def hydrate_app_config_secrets(config: dict[str, Any]) -> dict[str, Any]:
    existing = load_app_config()
    hydrated = dict(config)
    hydrated["apiKey"] = _hydrate_connection_secret(hydrated, existing)
    hydrated["modelProviders"] = _merge_existing_provider_secrets(
        hydrated.get("modelProviders", existing.get("modelProviders", [])),
        existing,
    )
    hydrated["roundModels"] = _merge_existing_round_model_secrets(
        hydrated.get("roundModels", existing.get("roundModels", {})),
        existing,
    )
    return hydrated


def _normalize_round_models(value: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(value, dict):
        return {}
    normalized: dict[str, dict[str, Any]] = {}
    for key, raw_config in value.items():
        normalized_key = str(key).strip()
        if normalized_key not in get_round_model_keys() or not isinstance(raw_config, dict):
            continue
        normalized[normalized_key] = {
            "enabled": bool(raw_config.get("enabled", False)),
            "providerId": str(raw_config.get("providerId", "")).strip(),
            "providerName": str(raw_config.get("providerName", "")).strip(),
            "baseUrl": str(raw_config.get("baseUrl", "")).strip(),
            "apiKey": str(raw_config.get("apiKey", "")).strip(),
            "model": str(raw_config.get("model", "")).strip(),
            "apiType": _normalize_api_type(raw_config.get("apiType", "chat_completions")),
            "streaming": normalize_streaming(_streaming_value(raw_config)),
            "temperature": float(raw_config.get("temperature", 0.7)),
            "requestTimeoutSeconds": _clamp_int(
                raw_config.get("requestTimeoutSeconds", DEFAULT_REQUEST_TIMEOUT_SECONDS),
                default=DEFAULT_REQUEST_TIMEOUT_SECONDS,
                minimum=30,
                maximum=3600,
            ),
            "maxRetries": _clamp_int(
                raw_config.get("maxRetries", DEFAULT_MAX_RETRIES),
                default=DEFAULT_MAX_RETRIES,
                minimum=0,
                maximum=10,
            ),
            "rateLimitWindowMinutes": _normalize_rate_window_minutes(raw_config),
            "rateLimitMaxRequests": _normalize_rate_max_requests(raw_config),
        }
    return normalized


def _normalize_model_providers(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    normalized: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, raw_config in enumerate(value):
        if not isinstance(raw_config, dict):
            continue
        provider_id = str(raw_config.get("id", "")).strip() or f"provider-{index + 1}"
        if provider_id in seen_ids:
            provider_id = f"{provider_id}-{index + 1}"
        seen_ids.add(provider_id)
        raw_models = raw_config.get("models", [])
        models = []
        if isinstance(raw_models, list):
            models = [str(item).strip() for item in raw_models if str(item).strip()][:500]
        normalized.append(
            {
                "id": provider_id,
                "name": str(raw_config.get("name", "")).strip() or provider_id,
                "enabled": bool(raw_config.get("enabled", True)),
                "baseUrl": str(raw_config.get("baseUrl", "")).strip(),
                "apiKey": str(raw_config.get("apiKey", "")).strip(),
                "apiType": _normalize_api_type(raw_config.get("apiType", "chat_completions")),
                "streaming": normalize_streaming(_streaming_value(raw_config)),
                "temperature": float(raw_config.get("temperature", 0.7)),
                "requestTimeoutSeconds": _clamp_int(
                    raw_config.get("requestTimeoutSeconds", DEFAULT_REQUEST_TIMEOUT_SECONDS),
                    default=DEFAULT_REQUEST_TIMEOUT_SECONDS,
                    minimum=30,
                    maximum=3600,
                ),
                "maxRetries": _clamp_int(
                    raw_config.get("maxRetries", DEFAULT_MAX_RETRIES),
                    default=DEFAULT_MAX_RETRIES,
                    minimum=0,
                    maximum=10,
                ),
                "rateLimitWindowMinutes": _normalize_rate_window_minutes(raw_config),
                "rateLimitMaxRequests": _normalize_rate_max_requests(raw_config),
                "models": models,
                "defaultModel": str(raw_config.get("defaultModel", "")).strip(),
                "updatedAt": str(raw_config.get("updatedAt", "")).strip(),
            }
        )
    return normalized


def load_app_config() -> dict[str, Any]:
    path = get_app_config_path()
    _harden_config_permissions(path)
    if not path.exists():
        prompt_profile = get_default_prompt_profile()
        return {
            "baseUrl": "",
            "apiKey": "",
            "model": "",
            "apiType": "chat_completions",
            "streaming": DEFAULT_STREAMING,
            "temperature": 0.7,
            "promptProfile": prompt_profile,
            "promptSequence": normalize_prompt_sequence(prompt_profile, None),
            "requestTimeoutSeconds": DEFAULT_REQUEST_TIMEOUT_SECONDS,
            "maxRetries": DEFAULT_MAX_RETRIES,
            "rewriteConcurrency": DEFAULT_REWRITE_CONCURRENCY,
            "modelProviders": [],
            "roundModels": {},
            "formatMode": DEFAULT_FORMAT_MODE,
        }
    data = json.loads(path.read_text(encoding="utf-8"))
    prompt_profile = _normalize_prompt_profile(data.get("promptProfile", get_default_prompt_profile()))
    return {
        "baseUrl": str(data.get("baseUrl", "")),
        "apiKey": str(data.get("apiKey", "")),
        "model": str(data.get("model", "")),
        "apiType": _normalize_api_type(data.get("apiType", "chat_completions")),
        "streaming": normalize_streaming(_streaming_value(data)),
        "temperature": float(data.get("temperature", 0.7)),
        "promptProfile": prompt_profile,
        "promptSequence": _normalize_prompt_sequence(data.get("promptSequence"), prompt_profile),
        "requestTimeoutSeconds": _clamp_int(
            data.get("requestTimeoutSeconds", DEFAULT_REQUEST_TIMEOUT_SECONDS),
            default=DEFAULT_REQUEST_TIMEOUT_SECONDS,
            minimum=30,
            maximum=3600,
        ),
        "maxRetries": _clamp_int(
            data.get("maxRetries", DEFAULT_MAX_RETRIES),
            default=DEFAULT_MAX_RETRIES,
            minimum=0,
            maximum=10,
        ),
        "rewriteConcurrency": _clamp_int(
            data.get("rewriteConcurrency", DEFAULT_REWRITE_CONCURRENCY),
            default=DEFAULT_REWRITE_CONCURRENCY,
            minimum=1,
            maximum=MAX_REWRITE_CONCURRENCY,
        ),
        "modelProviders": _normalize_model_providers(data.get("modelProviders", [])),
        "roundModels": _normalize_round_models(data.get("roundModels", {})),
        "formatMode": _normalize_format_mode(data.get("formatMode", DEFAULT_FORMAT_MODE)),
    }


def save_app_config(config: dict[str, Any]) -> dict[str, Any]:
    existing: dict[str, Any] = {}
    path = get_app_config_path()
    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            existing = {}
    raw_round_models = _merge_existing_round_model_secrets(
        config.get("roundModels", existing.get("roundModels", {})),
        existing,
    )
    raw_model_providers = _merge_existing_provider_secrets(
        config.get("modelProviders", existing.get("modelProviders", [])),
        existing,
    )
    prompt_profile = _normalize_prompt_profile(config.get("promptProfile", get_default_prompt_profile()))
    normalized = {
        "baseUrl": str(config.get("baseUrl", "")).strip(),
        "apiKey": _secret_or_existing(
            config.get("apiKey", _MISSING_SECRET),
            existing.get("apiKey"),
            base_url=config.get("baseUrl", existing.get("baseUrl", "")),
            existing_base_url=existing.get("baseUrl", ""),
        ),
        "model": str(config.get("model", "")).strip(),
        "apiType": _normalize_api_type(config.get("apiType", "chat_completions")),
        "streaming": normalize_streaming(_streaming_value(config)),
        "temperature": float(config.get("temperature", 0.7)),
        "promptProfile": prompt_profile,
        "promptSequence": _normalize_prompt_sequence(config.get("promptSequence", existing.get("promptSequence", [])), prompt_profile),
        "requestTimeoutSeconds": _clamp_int(
            config.get("requestTimeoutSeconds", DEFAULT_REQUEST_TIMEOUT_SECONDS),
            default=DEFAULT_REQUEST_TIMEOUT_SECONDS,
            minimum=30,
            maximum=3600,
        ),
        "maxRetries": _clamp_int(
            config.get("maxRetries", DEFAULT_MAX_RETRIES),
            default=DEFAULT_MAX_RETRIES,
            minimum=0,
            maximum=10,
        ),
        "rewriteConcurrency": _clamp_int(
            config.get("rewriteConcurrency", DEFAULT_REWRITE_CONCURRENCY),
            default=DEFAULT_REWRITE_CONCURRENCY,
            minimum=1,
            maximum=MAX_REWRITE_CONCURRENCY,
        ),
        "modelProviders": _normalize_model_providers(raw_model_providers),
        "roundModels": _normalize_round_models(raw_round_models),
        "formatMode": _normalize_format_mode(config.get("formatMode", existing.get("formatMode", DEFAULT_FORMAT_MODE))),
    }
    _write_private_json_atomic(path, normalized)
    return normalized
