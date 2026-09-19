from __future__ import annotations

import json
import os
import shutil
import threading
import uuid
import hashlib
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ROOT_DIR = Path(__file__).resolve().parents[1]
APP_DIR_NAME = "FYADR"
CONFIG_FILE_NAME = "config.json"
SCHEMA_VERSION = 8
SECRET_PLACEHOLDER = "__FYADR_SAVED_SECRET__"
_LOCK = threading.RLock()

PROGRAM_APPENDED_TEMPLATE_SUFFIX = "\n\n待改写内容：\n{{text}}"

DEEPSEEK_PROFILE_ID = "builtin-deepseek-official"
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
REASONING_EFFORTS = {"auto", "none", "minimal", "low", "medium", "high", "xhigh", "max"}
CHUNK_PRESETS = {"fine", "standard", "long"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_config_dir() -> Path:
    override = os.getenv("FYADR_CONFIG_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    app_data = os.getenv("APPDATA", "").strip()
    return (Path(app_data) / APP_DIR_NAME) if app_data else (Path.home() / ".fyadr")


def get_config_path() -> Path:
    return get_config_dir() / CONFIG_FILE_NAME


def get_data_dir() -> Path:
    override = os.getenv("FYADR_DATA_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return get_config_dir() / "data"


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


BUILTIN_TEMPLATE_ID = "builtin-classical-rewrite"
BUILTIN_CREATED_AT = "2026-01-01T00:00:00+00:00"
DEPRECATED_BUILTIN_TEMPLATE_IDS = {
    "builtin-natural-rewrite",
    "builtin-prewrite",
    "builtin-rewrite-pass-1",
    "builtin-rewrite-pass-2",
}
LEGACY_BUILTIN_PLAN_ID = "builtin-classical-plan"
LEGACY_BUILTIN_PLAN_IDS = {
    LEGACY_BUILTIN_PLAN_ID,
    "builtin-default-plan",
    "builtin-two-pass-plan",
    "builtin-three-pass-plan",
}

LEGACY_PROMPT_ALIASES = {
    "classical": "classical",
    BUILTIN_TEMPLATE_ID: "classical",
    "prewrite": "prewrite",
    "builtin-prewrite": "prewrite",
    "round1": "round1",
    "builtin-rewrite-pass-1": "round1",
    "round2": "round2",
    "builtin-rewrite-pass-2": "round2",
    "builtin-natural-rewrite": "round1",
}
LEGACY_PROMPT_FALLBACKS = {
    "prewrite": {
        "name": "原有润色步骤",
        "description": "从旧版本配置迁移的保守润色步骤。",
        "content": (
            "请在不改变事实、术语、数字、引用和结论的前提下，对以下正文进行保守润色。"
            "保持原有段落作用，只输出润色后的正文，不要附加说明。"
        ),
    },
    "round1": {
        "name": "原有改写步骤一",
        "description": "从旧版本配置迁移的第一步改写。",
        "content": (
            "请保持原意、技术信息、数字和引用不变，重新组织以下正文的表达，使其自然、清楚。"
            "不要新增观点，不要输出解释或前后缀。"
        ),
    },
    "round2": {
        "name": "原有改写步骤二",
        "description": "从旧版本配置迁移的第二步改写。",
        "content": (
            "请在完整保留事实、术语、数字、引用和论证关系的前提下，继续自然化改写以下正文。"
            "只输出最终正文，不要评价或说明。"
        ),
    },
}


def _builtin_prompt_content(filename: str, fallback: str) -> str:
    path = ROOT_DIR / "prompts" / "defaults" / filename
    try:
        content = path.read_text(encoding="utf-8").strip()
    except OSError:
        content = fallback.strip()
    return content


def remove_program_appended_template_suffix(content: Any) -> str:
    value = str(content or "")
    normalized = value.replace("\r\n", "\n")
    if normalized.endswith(PROGRAM_APPENDED_TEMPLATE_SUFFIX):
        return normalized[: -len(PROGRAM_APPENDED_TEMPLATE_SUFFIX)].rstrip()
    return value


BUILTIN_TEMPLATE = {
    "id": BUILTIN_TEMPLATE_ID,
    "name": "经典改写",
    "description": "保留原意和技术信息，进行自然、清晰的学术改写。",
    "content": _builtin_prompt_content(
        "classical-rewrite.md",
        "请在保持事实与技术含义不变的前提下，将正文改写得自然、清楚。",
    ),
    "builtIn": True,
    "readOnly": True,
    "createdAt": BUILTIN_CREATED_AT,
    "updatedAt": BUILTIN_CREATED_AT,
}
BUILTIN_TEMPLATES = [BUILTIN_TEMPLATE]
def builtin_deepseek_profile() -> dict[str, Any]:
    return {
        "id": DEEPSEEK_PROFILE_ID,
        "provider": "deepseek",
        "builtIn": True,
        "name": "DeepSeek 官方",
        "baseUrl": DEEPSEEK_BASE_URL,
        "apiKey": "",
        "model": "",
        "protocol": "chat_completions",
        "reasoningEffort": "high",
        "temperature": None,
        "connectTimeoutSeconds": 15,
        "firstEventTimeoutSeconds": 300,
        "idleTimeoutSeconds": 180,
        "maxRetries": 2,
        "knownModels": [],
        "createdAt": BUILTIN_CREATED_AT,
        "updatedAt": BUILTIN_CREATED_AT,
    }


def default_config() -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "defaultModelProfileId": "",
        "modelProfiles": [builtin_deepseek_profile()],
        "promptTemplates": deepcopy(BUILTIN_TEMPLATES),
        "preferences": {
            "rewriteConcurrency": 1,
            "protectedTerms": [],
            "chunkPreset": "standard",
            "roundTemplateIds": [BUILTIN_TEMPLATE_ID, BUILTIN_TEMPLATE_ID],
        },
        "migration": {"completedAt": "", "sourceSchema": None},
    }


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def _backup_legacy_config(path: Path) -> Path | None:
    if not path.exists():
        return None
    backup = path.with_name(f"config.before-v{SCHEMA_VERSION}.json")
    if not backup.exists():
        shutil.copy2(path, backup)
    return backup


def _float(value: Any, default: float, minimum: float, maximum: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def _int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def normalize_chunk_preset(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in CHUNK_PRESETS else "standard"


def _normalize_preferences(raw: Any) -> dict[str, Any]:
    value = raw if isinstance(raw, dict) else {}
    terms = value.get("protectedTerms", [])
    if isinstance(terms, str):
        terms = [part.strip() for part in terms.replace("，", ",").split(",")]
    if not isinstance(terms, list):
        terms = []
    round_template_ids = value.get("roundTemplateIds")
    if isinstance(round_template_ids, list):
        normalized_round_template_ids = [
            str(item).strip() for item in round_template_ids if str(item).strip()
        ][:3]
    else:
        legacy_round_count = _int(value.get("singleTemplateRounds"), 2, 1, 3)
        normalized_round_template_ids = [BUILTIN_TEMPLATE_ID] * legacy_round_count
    if not normalized_round_template_ids:
        normalized_round_template_ids = [BUILTIN_TEMPLATE_ID, BUILTIN_TEMPLATE_ID]
    return {
        "rewriteConcurrency": _int(value.get("rewriteConcurrency"), 1, 1, 16),
        "protectedTerms": list(
            dict.fromkeys(str(item).strip() for item in terms if str(item).strip())
        )[:200],
        "chunkPreset": normalize_chunk_preset(value.get("chunkPreset")),
        "roundTemplateIds": normalized_round_template_ids,
    }


def normalize_protocol(value: Any) -> str:
    return "responses" if str(value or "").strip().lower() == "responses" else "chat_completions"


def normalize_reasoning_effort(value: Any, provider: str = "custom") -> str:
    normalized = str(value or "").strip().lower()
    if normalized not in REASONING_EFFORTS:
        return "high" if provider == "deepseek" else "auto"
    if provider == "deepseek" and normalized == "auto":
        return "high"
    return normalized


def normalize_profile(raw: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
    existing = existing or {}
    raw_id = str(raw.get("id") or existing.get("id") or "").strip()
    provider = (
        "deepseek"
        if raw_id == DEEPSEEK_PROFILE_ID or str(existing.get("provider") or "").strip() == "deepseek"
        else "custom"
    )
    incoming_key = raw.get("apiKey", "")
    if incoming_key == SECRET_PLACEHOLDER:
        incoming_key = existing.get("apiKey", "")
    temperature = raw.get("temperature")
    normalized_temperature = None if temperature in (None, "") else _float(temperature, 0.7, 0.0, 2.0)
    models = raw.get("knownModels", raw.get("models", []))
    if not isinstance(models, list):
        models = []
    model = str(raw.get("model") or raw.get("defaultModel") or "").strip()
    profile_id = DEEPSEEK_PROFILE_ID if provider == "deepseek" else (raw_id or _id("model"))
    return {
        "id": profile_id,
        "provider": provider,
        "builtIn": provider == "deepseek",
        "name": (
            "DeepSeek 官方"
            if provider == "deepseek"
            else str(raw.get("name") or existing.get("name") or model or "未命名连接").strip()[:80]
        ),
        "baseUrl": (
            DEEPSEEK_BASE_URL
            if provider == "deepseek"
            else str(raw.get("baseUrl") or "").strip().rstrip("/")
        ),
        "apiKey": str(incoming_key or "").strip(),
        "model": model,
        "protocol": normalize_protocol(raw.get("protocol", raw.get("apiType"))),
        "reasoningEffort": normalize_reasoning_effort(
            raw.get("reasoningEffort", existing.get("reasoningEffort")), provider
        ),
        "temperature": normalized_temperature,
        "connectTimeoutSeconds": _float(raw.get("connectTimeoutSeconds"), 15, 1, 120),
        "firstEventTimeoutSeconds": _float(
            raw.get("firstEventTimeoutSeconds", raw.get("requestTimeoutSeconds")), 300, 5, 3600
        ),
        "idleTimeoutSeconds": _float(raw.get("idleTimeoutSeconds"), 180, 5, 3600),
        "maxRetries": _int(raw.get("maxRetries"), 2, 0, 10),
        "knownModels": list(dict.fromkeys(str(item).strip() for item in models if str(item).strip()))[:500],
        "createdAt": str(existing.get("createdAt") or raw.get("createdAt") or utc_now()),
        "updatedAt": str(raw.get("updatedAt") or existing.get("updatedAt") or utc_now()),
    }


def _stable_migration_id(kind: str, source_id: str) -> str:
    digest = hashlib.sha256(source_id.encode("utf-8")).hexdigest()[:12]
    return f"{kind}-migrated-{digest}"


def _migrate_prompt_sequence(config: dict[str, Any], raw: dict[str, Any]) -> None:
    raw_sequence = raw.get("promptSequence")
    if not isinstance(raw_sequence, list):
        return
    sequence = [str(item).strip() for item in raw_sequence if str(item).strip()][:3]
    if not sequence:
        return

    templates = [
        deepcopy(item)
        for item in config.get("promptTemplates", [])
        if isinstance(item, dict)
    ]
    template_by_id = {
        str(item.get("id") or ""): item
        for item in templates
        if str(item.get("id") or "")
    }
    template_ids: list[str] = []
    created_at = utc_now()

    for source_id in sequence:
        legacy_key = LEGACY_PROMPT_ALIASES.get(source_id, source_id)
        if legacy_key == "classical":
            template_ids.append(BUILTIN_TEMPLATE_ID)
            continue

        existing = template_by_id.get(source_id)
        if existing and source_id not in DEPRECATED_BUILTIN_TEMPLATE_IDS:
            template_ids.append(source_id)
            continue

        migrated_id = _stable_migration_id("template", source_id)
        if migrated_id not in template_by_id:
            fallback = LEGACY_PROMPT_FALLBACKS.get(legacy_key)
            content = str((existing or {}).get("content") or (fallback or {}).get("content") or "").strip()
            if not content:
                content = (
                    "请在保持原意、事实、术语、数字和引用不变的前提下改写以下正文。"
                    "只输出改写后的正文。"
                )
            migrated = {
                "id": migrated_id,
                "name": str((existing or {}).get("name") or (fallback or {}).get("name") or f"原有步骤 {source_id}")[:80],
                "description": str(
                    (existing or {}).get("description")
                    or (fallback or {}).get("description")
                    or "从旧版本配置迁移的提示词步骤。"
                )[:300],
                "content": content,
                "builtIn": False,
                "readOnly": False,
                "createdAt": str((existing or {}).get("createdAt") or created_at),
                "updatedAt": str((existing or {}).get("updatedAt") or created_at),
            }
            templates.append(migrated)
            template_by_id[migrated_id] = migrated
        template_ids.append(migrated_id)

    config["promptTemplates"] = templates
    config.setdefault("preferences", {})["roundTemplateIds"] = template_ids


def _legacy_round_template_ids(raw: dict[str, Any]) -> list[str]:
    raw_preferences = raw.get("preferences") if isinstance(raw.get("preferences"), dict) else {}
    explicit = raw_preferences.get("roundTemplateIds", raw.get("roundTemplateIds"))
    if isinstance(explicit, list):
        values = [str(item).strip() for item in explicit if str(item).strip()][:3]
        if values:
            return values

    plans = [item for item in raw.get("promptPlans", []) if isinstance(item, dict)]
    default_plan_id = str(raw.get("defaultPromptPlanId") or "")
    plan = next((item for item in plans if str(item.get("id") or "") == default_plan_id), None)
    if plan is None and plans:
        plan = next(
            (item for item in plans if str(item.get("id") or "") == LEGACY_BUILTIN_PLAN_ID),
            plans[0],
        )
    template_ids = [
        BUILTIN_TEMPLATE_ID if str(item) in DEPRECATED_BUILTIN_TEMPLATE_IDS else str(item)
        for item in (plan or {}).get("templateIds", [])
        if str(item)
    ][:3]
    if len(template_ids) == 1:
        repeat_count = _int(
            raw_preferences.get("singleTemplateRounds", raw.get("singleTemplateRounds")),
            2,
            1,
            3,
        )
        template_ids *= repeat_count
    return template_ids or [BUILTIN_TEMPLATE_ID, BUILTIN_TEMPLATE_ID]


def migrate_legacy_config(raw: dict[str, Any]) -> dict[str, Any]:
    config = default_config()
    profiles: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()

    def add_profile(value: dict[str, Any], fallback_name: str) -> None:
        candidate = dict(value)
        candidate["name"] = str(candidate.get("name") or fallback_name)
        normalized = normalize_profile(candidate)
        identity = (normalized["baseUrl"], normalized["model"], normalized["name"])
        if not normalized["baseUrl"] or identity in seen:
            return
        seen.add(identity)
        profiles.append(normalized)

    top_level = {
        "name": "默认连接",
        "baseUrl": raw.get("baseUrl", ""),
        "apiKey": raw.get("apiKey", ""),
        "model": raw.get("model", ""),
        "apiType": raw.get("apiType", "chat_completions"),
        "temperature": raw.get("temperature"),
        "requestTimeoutSeconds": raw.get("requestTimeoutSeconds"),
        "maxRetries": raw.get("maxRetries", 2),
    }
    if str(top_level["baseUrl"]).strip():
        add_profile(top_level, "默认连接")
    providers = raw.get("modelProviders", [])
    if isinstance(providers, list):
        for index, provider in enumerate(providers):
            if isinstance(provider, dict):
                add_profile(provider, f"模型连接 {index + 1}")
    config["modelProfiles"] = profiles
    if profiles:
        top_identity = (str(raw.get("baseUrl", "")).strip().rstrip("/"), str(raw.get("model", "")).strip())
        default_profile = next(
            (item for item in profiles if (item["baseUrl"], item["model"]) == top_identity), profiles[0]
        )
        config["defaultModelProfileId"] = default_profile["id"]

    config["preferences"] = _normalize_preferences(
        {
            "rewriteConcurrency": raw.get("rewriteConcurrency"),
            "protectedTerms": raw.get("protectedTerms", []),
            "chunkPreset": raw.get("chunkPreset"),
            "singleTemplateRounds": raw.get("singleTemplateRounds"),
            "roundTemplateIds": _legacy_round_template_ids(raw),
        }
    )
    _migrate_prompt_sequence(config, raw)
    config["migration"] = {"completedAt": utc_now(), "sourceSchema": raw.get("schemaVersion", 1)}
    return config


def migrate_v2_config(raw: dict[str, Any]) -> dict[str, Any]:
    config = default_config()
    profiles = []
    for item in raw.get("modelProfiles", []):
        if isinstance(item, dict):
            profiles.append(normalize_profile(item, item))
    config["modelProfiles"] = profiles
    config["defaultModelProfileId"] = str(raw.get("defaultModelProfileId") or "")
    raw_templates = raw.get("promptTemplates")
    if isinstance(raw_templates, list):
        config["promptTemplates"] = [deepcopy(item) for item in raw_templates if isinstance(item, dict)]
        for template in config["promptTemplates"]:
            if template.get("builtIn") is not True:
                template["content"] = remove_program_appended_template_suffix(
                    template.get("content")
                )
    raw_preferences = raw.get("preferences") if isinstance(raw.get("preferences"), dict) else {}
    config["preferences"] = _normalize_preferences(
        {
            **raw_preferences,
            "rewriteConcurrency": raw_preferences.get("rewriteConcurrency", raw.get("rewriteConcurrency")),
            "protectedTerms": raw_preferences.get("protectedTerms", raw.get("protectedTerms", [])),
            "chunkPreset": raw_preferences.get("chunkPreset", raw.get("chunkPreset")),
            "singleTemplateRounds": raw_preferences.get(
                "singleTemplateRounds", raw.get("singleTemplateRounds")
            ),
            "roundTemplateIds": _legacy_round_template_ids(raw),
        }
    )
    _migrate_prompt_sequence(config, raw)
    config["migration"] = {"completedAt": utc_now(), "sourceSchema": raw.get("schemaVersion", 2)}
    return config


def _profile_is_configured(profile: dict[str, Any]) -> bool:
    if not profile.get("baseUrl") or not profile.get("model"):
        return False
    key = bool(profile.get("apiKey"))
    if profile.get("provider") == "deepseek":
        return key
    try:
        host = (urlparse(str(profile.get("baseUrl") or "")).hostname or "").casefold()
    except ValueError:
        host = ""
    return key or host in {"localhost", "127.0.0.1", "::1"} or host.endswith(".local")


def _is_deepseek_candidate(item: dict[str, Any]) -> bool:
    base_url = str(item.get("baseUrl") or "").strip().rstrip("/").casefold()
    name = str(item.get("name") or "").replace(" ", "").casefold()
    return bool(
        item.get("id") == DEEPSEEK_PROFILE_ID
        or item.get("provider") == "deepseek"
        or (base_url == DEEPSEEK_BASE_URL.casefold() and name == "deepseek官方".casefold())
    )


def _ensure_deepseek_profile(config: dict[str, Any]) -> dict[str, Any]:
    profiles = [item for item in config.get("modelProfiles", []) if isinstance(item, dict)]
    deepseek_candidate: dict[str, Any] | None = None
    for item in profiles:
        if _is_deepseek_candidate(item):
            deepseek_candidate = item
            break

    if deepseek_candidate:
        official = normalize_profile(
            {
                **deepseek_candidate,
                "id": DEEPSEEK_PROFILE_ID,
                "provider": "deepseek",
                "updatedAt": deepseek_candidate.get("updatedAt") or BUILTIN_CREATED_AT,
            },
            deepseek_candidate,
        )
    else:
        official = builtin_deepseek_profile()

    custom_profiles = [normalize_profile(item, item) for item in profiles if item is not deepseek_candidate and not _is_deepseek_candidate(item)]
    config["modelProfiles"] = [official, *custom_profiles]
    candidate_id = str((deepseek_candidate or {}).get("id") or "")
    if candidate_id and config.get("defaultModelProfileId") == candidate_id:
        config["defaultModelProfileId"] = DEEPSEEK_PROFILE_ID
    configured_ids = {
        item["id"] for item in config["modelProfiles"] if _profile_is_configured(item)
    }
    default_profile_id = str(config.get("defaultModelProfileId") or "")
    if default_profile_id and default_profile_id not in configured_ids:
        config["defaultModelProfileId"] = ""
    return config


def _ensure_builtins(config: dict[str, Any]) -> dict[str, Any]:
    raw_templates = [
        deepcopy(item)
        for item in config.get("promptTemplates", [])
        if isinstance(item, dict)
    ]
    template_replacements = {
        template_id: BUILTIN_TEMPLATE_ID for template_id in DEPRECATED_BUILTIN_TEMPLATE_IDS
    }
    templates: list[dict[str, Any]] = []
    seen_template_ids: set[str] = set()
    for item in raw_templates:
        template_id = str(item.get("id") or "")
        if template_id == BUILTIN_TEMPLATE_ID:
            continue
        if template_id in DEPRECATED_BUILTIN_TEMPLATE_IDS:
            is_user_owned = item.get("builtIn") is False and item.get("readOnly") is not True
            if not is_user_owned:
                continue
            migrated_id = _stable_migration_id("template", template_id)
            template_replacements[template_id] = migrated_id
            item.update({"id": migrated_id, "builtIn": False, "readOnly": False})
            template_id = migrated_id
        if not template_id or template_id in seen_template_ids:
            continue
        seen_template_ids.add(template_id)
        templates.append(item)
    config["promptTemplates"] = [*deepcopy(BUILTIN_TEMPLATES), *templates]
    preferences = _normalize_preferences(config.get("preferences", {}))
    available_template_ids = {str(item.get("id") or "") for item in config["promptTemplates"]}
    round_template_ids = [
        template_replacements.get(str(template_id), str(template_id))
        for template_id in preferences.get("roundTemplateIds", [])
        if str(template_id)
    ][:3]
    preferences["roundTemplateIds"] = [
        template_id if template_id in available_template_ids else BUILTIN_TEMPLATE_ID
        for template_id in round_template_ids
    ] or [BUILTIN_TEMPLATE_ID, BUILTIN_TEMPLATE_ID]
    config["preferences"] = preferences
    config.pop("promptPlans", None)
    config.pop("defaultPromptPlanId", None)
    return config


def load_config() -> dict[str, Any]:
    with _LOCK:
        path = get_config_path()
        if not path.exists():
            config = default_config()
            _write_json_atomic(path, config)
            return config
        raw = _read_json(path)
        if raw.get("schemaVersion") != SCHEMA_VERSION:
            _backup_legacy_config(path)
            source_schema = raw.get("schemaVersion")
            config = (
                migrate_v2_config(raw)
            if source_schema in {2, 3, 4, 5, 6, 7}
                else migrate_legacy_config(raw)
            )
            config = _ensure_builtins(config)
            config = _ensure_deepseek_profile(config)
            config["preferences"] = _normalize_preferences(config.get("preferences", {}))
            config["schemaVersion"] = SCHEMA_VERSION
            _write_json_atomic(path, config)
            return config
        config = _ensure_deepseek_profile(_ensure_builtins(raw))
        config["preferences"] = _normalize_preferences(config.get("preferences", {}))
        if config != raw:
            _write_json_atomic(path, config)
        return config


def save_config(config: dict[str, Any]) -> dict[str, Any]:
    with _LOCK:
        config = _ensure_deepseek_profile(_ensure_builtins(deepcopy(config)))
        config["preferences"] = _normalize_preferences(config.get("preferences", {}))
        config["schemaVersion"] = SCHEMA_VERSION
        _write_json_atomic(get_config_path(), config)
        return config


def public_profile(profile: dict[str, Any]) -> dict[str, Any]:
    result = {key: value for key, value in profile.items() if key != "apiKey"}
    key = str(profile.get("apiKey") or "")
    result["apiKey"] = SECRET_PLACEHOLDER if key else ""
    result["hasApiKey"] = bool(key)
    result["apiKeyPreview"] = f"…{key[-4:]}" if key else ""
    result["configured"] = _profile_is_configured(profile)
    return result


def public_config(config: dict[str, Any] | None = None) -> dict[str, Any]:
    value = deepcopy(config or load_config())
    value["modelProfiles"] = [public_profile(item) for item in value.get("modelProfiles", [])]
    return value


def find_profile(profile_id: str, config: dict[str, Any] | None = None) -> dict[str, Any] | None:
    for profile in (config or load_config()).get("modelProfiles", []):
        if profile.get("id") == profile_id:
            return profile
    return None


def upsert_profile(raw: dict[str, Any], profile_id: str | None = None) -> dict[str, Any]:
    with _LOCK:
        config = load_config()
        target_id = profile_id or str(raw.get("id") or "")
        existing = find_profile(target_id, config) if target_id else None
        normalized = normalize_profile(
            {**raw, "id": target_id or raw.get("id"), "updatedAt": utc_now()}, existing
        )
        if not normalized["baseUrl"] or not normalized["model"]:
            raise ValueError("请填写接口地址和模型。")
        profiles = config.get("modelProfiles", [])
        if existing:
            profiles = [normalized if item.get("id") == existing.get("id") else item for item in profiles]
        else:
            profiles.append(normalized)
        config["modelProfiles"] = profiles
        if raw.get("makeDefault") is True:
            config["defaultModelProfileId"] = normalized["id"]
        elif "makeDefault" in raw and not raw.get("makeDefault") and config.get("defaultModelProfileId") == normalized["id"]:
            config["defaultModelProfileId"] = ""
        save_config(config)
        return public_profile(normalized)


def delete_profile(profile_id: str) -> None:
    with _LOCK:
        config = load_config()
        target = find_profile(profile_id, config)
        if target and target.get("provider") == "deepseek":
            raise ValueError("DeepSeek 官方预设不能删除。")
        config["modelProfiles"] = [item for item in config.get("modelProfiles", []) if item.get("id") != profile_id]
        if config.get("defaultModelProfileId") == profile_id:
            configured = [item for item in config["modelProfiles"] if _profile_is_configured(item)]
            config["defaultModelProfileId"] = configured[0]["id"] if configured else ""
        save_config(config)


def _normalize_template(raw: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
    existing = existing or {}
    incoming_content = raw.get("content") if "content" in raw else existing.get("content")
    content = "" if incoming_content is None else str(incoming_content)
    if not content.strip():
        raise ValueError("提示词正文不能为空。")
    return {
        "id": str(raw.get("id") or existing.get("id") or _id("template")),
        "name": str(raw.get("name") or existing.get("name") or "未命名提示词").strip()[:80],
        "description": str(raw.get("description") or "").strip()[:300],
        "content": content,
        "builtIn": False,
        "readOnly": False,
        "createdAt": str(existing.get("createdAt") or utc_now()),
        "updatedAt": utc_now(),
    }


def upsert_template(raw: dict[str, Any], template_id: str | None = None) -> dict[str, Any]:
    with _LOCK:
        config = load_config()
        existing = next((x for x in config["promptTemplates"] if x.get("id") == template_id), None)
        if existing and existing.get("readOnly"):
            raise ValueError("内置提示词不能直接修改，请先复制。")
        value = _normalize_template({**raw, "id": template_id or raw.get("id")}, existing)
        if existing:
            config["promptTemplates"] = [value if x.get("id") == template_id else x for x in config["promptTemplates"]]
        else:
            config["promptTemplates"].append(value)
        save_config(config)
        return value


def delete_template(template_id: str) -> None:
    with _LOCK:
        config = load_config()
        target = next((x for x in config["promptTemplates"] if x.get("id") == template_id), None)
        if not target:
            return
        if target.get("readOnly"):
            raise ValueError("内置提示词不能删除。")
        config["promptTemplates"] = [x for x in config["promptTemplates"] if x.get("id") != template_id]
        config.setdefault("preferences", {})["roundTemplateIds"] = [
            BUILTIN_TEMPLATE_ID if item == template_id else item
            for item in config.get("preferences", {}).get("roundTemplateIds", [])
        ]
        save_config(config)


def set_preferences(raw: dict[str, Any]) -> dict[str, Any]:
    with _LOCK:
        config = load_config()
        current = config.get("preferences", {})
        config["preferences"] = _normalize_preferences({**current, **raw})
        save_config(config)
        return config["preferences"]
