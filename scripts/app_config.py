from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

APP_DIR_NAME = "FYADR"
CONFIG_FILE_NAME = "config.json"
DEFAULT_REQUEST_TIMEOUT_SECONDS = 600
DEFAULT_MAX_RETRIES = 3
SUPPORTED_PROMPT_PROFILES = {"cn", "cn_prewrite", "cn_custom"}
SUPPORTED_PROMPT_IDS = {"prewrite", "classical", "round1", "round2"}
SUPPORTED_REWRITE_CANDIDATE_MODES = {"economy", "quality"}
ROUND_MODEL_KEYS = {
    "cn_prewrite:1",
    "cn_prewrite:2",
    "cn_prewrite:3",
    "cn:1",
    "cn:2",
    "cn_custom:1",
    "cn_custom:2",
    "cn_custom:3",
}


def _clamp_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        normalized = default
    return max(minimum, min(maximum, normalized))


def get_app_config_dir() -> Path:
    base_dir = os.getenv("APPDATA")
    if base_dir:
        return Path(base_dir) / APP_DIR_NAME
    return Path.home() / ".fyadr"


def get_app_config_path() -> Path:
    return get_app_config_dir() / CONFIG_FILE_NAME


def _normalize_prompt_profile(value: Any) -> str:
    candidate = str(value or "cn_prewrite").strip().lower() or "cn_prewrite"
    if candidate not in SUPPORTED_PROMPT_PROFILES:
        return "cn_prewrite"
    return candidate


def _normalize_prompt_sequence(value: Any) -> list[str]:
    raw_items = value if isinstance(value, list) else []
    normalized: list[str] = []
    for raw_item in raw_items:
        prompt_id = str(raw_item or "").strip().lower()
        if prompt_id in SUPPORTED_PROMPT_IDS:
            normalized.append(prompt_id)
    return normalized[:3] or ["prewrite", "round1", "round2"]


def _normalize_api_type(value: Any) -> str:
    candidate = str(value or "chat_completions").strip() or "chat_completions"
    return "responses" if candidate == "responses" else "chat_completions"


def _normalize_rewrite_candidate_mode(value: Any) -> str:
    candidate = str(value or "economy").strip().lower() or "economy"
    return candidate if candidate in SUPPORTED_REWRITE_CANDIDATE_MODES else "economy"


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


def _normalize_round_models(value: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(value, dict):
        return {}
    normalized: dict[str, dict[str, Any]] = {}
    for key, raw_config in value.items():
        normalized_key = str(key).strip()
        if normalized_key not in ROUND_MODEL_KEYS or not isinstance(raw_config, dict):
            continue
        normalized[normalized_key] = {
            "enabled": bool(raw_config.get("enabled", False)),
            "providerId": str(raw_config.get("providerId", "")).strip(),
            "providerName": str(raw_config.get("providerName", "")).strip(),
            "baseUrl": str(raw_config.get("baseUrl", "")).strip(),
            "apiKey": str(raw_config.get("apiKey", "")).strip(),
            "model": str(raw_config.get("model", "")).strip(),
            "apiType": _normalize_api_type(raw_config.get("apiType", "chat_completions")),
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
    for index, raw_config in enumerate(value[:50]):
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
    if not path.exists():
        return {
            "baseUrl": "",
            "apiKey": "",
            "model": "",
            "apiType": "chat_completions",
            "temperature": 0.7,
            "offlineMode": False,
            "promptProfile": "cn_prewrite",
            "promptSequence": ["prewrite", "round1", "round2"],
            "rewriteCandidateMode": "economy",
            "requestTimeoutSeconds": DEFAULT_REQUEST_TIMEOUT_SECONDS,
            "maxRetries": DEFAULT_MAX_RETRIES,
            "modelProviders": [],
            "roundModels": {},
        }
    data = json.loads(path.read_text(encoding="utf-8"))
    return {
        "baseUrl": str(data.get("baseUrl", "")),
        "apiKey": str(data.get("apiKey", "")),
        "model": str(data.get("model", "")),
        "apiType": _normalize_api_type(data.get("apiType", "chat_completions")),
        "temperature": float(data.get("temperature", 0.7)),
        "offlineMode": bool(data.get("offlineMode", False)),
        "promptProfile": _normalize_prompt_profile(data.get("promptProfile", "cn_prewrite")),
        "promptSequence": _normalize_prompt_sequence(data.get("promptSequence")),
        "rewriteCandidateMode": _normalize_rewrite_candidate_mode(data.get("rewriteCandidateMode", "economy")),
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
        "modelProviders": _normalize_model_providers(data.get("modelProviders", [])),
        "roundModels": _normalize_round_models(data.get("roundModels", {})),
    }


def save_app_config(config: dict[str, Any]) -> dict[str, Any]:
    existing: dict[str, Any] = {}
    path = get_app_config_path()
    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            existing = {}
    raw_round_models = config.get("roundModels", existing.get("roundModels", {}))
    raw_model_providers = config.get("modelProviders", existing.get("modelProviders", []))
    normalized = {
        "baseUrl": str(config.get("baseUrl", "")).strip(),
        "apiKey": str(config.get("apiKey", "")).strip(),
        "model": str(config.get("model", "")).strip(),
        "apiType": _normalize_api_type(config.get("apiType", "chat_completions")),
        "temperature": float(config.get("temperature", 0.7)),
        "offlineMode": bool(config.get("offlineMode", False)),
        "promptProfile": _normalize_prompt_profile(config.get("promptProfile", "cn_prewrite")),
        "promptSequence": _normalize_prompt_sequence(config.get("promptSequence", existing.get("promptSequence", []))),
        "rewriteCandidateMode": _normalize_rewrite_candidate_mode(config.get("rewriteCandidateMode", existing.get("rewriteCandidateMode", "economy"))),
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
        "modelProviders": _normalize_model_providers(raw_model_providers),
        "roundModels": _normalize_round_models(raw_round_models),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    return normalized
