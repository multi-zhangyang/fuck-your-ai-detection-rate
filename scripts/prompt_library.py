from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
PROMPT_DIR = ROOT_DIR / "prompts"
PROMPT_DEFAULT_DIR = PROMPT_DIR / "defaults"
PROMPT_REGISTRY_PATH = PROMPT_DIR / "prompt-registry.json"
PROMPT_WORKFLOW_REGISTRY_PATH = PROMPT_DIR / "prompt-workflows.json"
PROMPT_BACKUP_DIR = ROOT_DIR / "finish" / "prompt_backups"
MAX_PROMPT_CONTENT_BYTES = 512 * 1024
DEFAULT_PROMPT_PROFILE = "cn_custom"
LEGACY_PROMPT_PROFILE = "cn"
DEFAULT_MAX_PROMPT_SEQUENCE_ROUNDS = 3
DEFAULT_MAX_CONTINUATION_ROUNDS = 12
MAX_PROMPT_SEQUENCE_ROUNDS = DEFAULT_MAX_PROMPT_SEQUENCE_ROUNDS
PROMPT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
DEFAULT_PROMPT_SEQUENCE = ["prewrite", "round1", "round2"]
DEFAULT_PROMPT_WORKFLOWS: list[dict[str, Any]] = [
    {
        "id": LEGACY_PROMPT_PROFILE,
        "label": "中文双轮",
        "description": "兼容旧双轮记录。",
        "defaultSequence": ["round1", "round2"],
        "customizable": False,
        "sequenceLimit": 2,
        "roundLimit": 2,
        "chunkMetric": "char",
        "legacy": True,
        "visible": False,
    },
    {
        "id": "cn_prewrite",
        "label": "中文三轮流程",
        "description": "兼容旧三轮记录。",
        "defaultSequence": ["prewrite", "round1", "round2"],
        "customizable": False,
        "sequenceLimit": 3,
        "roundLimit": 3,
        "chunkMetric": "char",
        "legacy": True,
        "visible": False,
    },
    {
        "id": DEFAULT_PROMPT_PROFILE,
        "label": "自定义组合",
        "description": "当前改写流程。",
        "defaultSequence": DEFAULT_PROMPT_SEQUENCE,
        "customizable": True,
        "sequenceLimit": DEFAULT_MAX_PROMPT_SEQUENCE_ROUNDS,
        "roundLimit": DEFAULT_MAX_CONTINUATION_ROUNDS,
        "chunkMetric": "char",
        "legacy": False,
        "visible": True,
    },
]
DEFAULT_PROMPT_SEQUENCES = {str(item["id"]): list(item["defaultSequence"]) for item in DEFAULT_PROMPT_WORKFLOWS}
SUPPORTED_PROMPT_PROFILES = set(DEFAULT_PROMPT_SEQUENCES)
PROMPT_PROFILE_CHUNK_METRICS = {str(item["id"]): str(item["chunkMetric"]) for item in DEFAULT_PROMPT_WORKFLOWS}
_PROMPT_REGISTRY_CACHE_KEY: tuple[int, int] | None = None
_PROMPT_REGISTRY_CACHE: list[dict[str, Any]] | None = None
_PROMPT_WORKFLOW_CACHE_KEY: tuple[tuple[int, int], tuple[int, int]] | None = None
_PROMPT_WORKFLOW_CACHE: list[dict[str, Any]] | None = None
DEFAULT_PROMPT_REGISTRY: list[dict[str, Any]] = [
    {
        "id": "prewrite",
        "label": "润色改写",
        "description": "先做保守自然化与结构预热。",
        "relativePath": "prompts/prewrite.md",
        "defaultPath": "prompts/defaults/prewrite.md",
        "builtIn": True,
        "editable": True,
    },
    {
        "id": "classical",
        "label": "经典改写",
        "description": "慢节奏解释型改写。",
        "relativePath": "prompts/classical-rewrite.md",
        "defaultPath": "prompts/defaults/classical-rewrite.md",
        "builtIn": True,
        "editable": True,
    },
    {
        "id": "round1",
        "label": "规范改写",
        "description": "正文主体降痕与语气调整。",
        "relativePath": "prompts/rewrite-pass-1.md",
        "defaultPath": "prompts/defaults/rewrite-pass-1.md",
        "builtIn": True,
        "editable": True,
    },
    {
        "id": "round2",
        "label": "专家改写",
        "description": "最终降痕与连贯性修整。",
        "relativePath": "prompts/rewrite-pass-2.md",
        "defaultPath": "prompts/defaults/rewrite-pass-2.md",
        "builtIn": True,
        "editable": True,
    },
]
DEFAULT_PROMPT_BY_ID = {str(item["id"]): item for item in DEFAULT_PROMPT_REGISTRY}


def normalize_prompt_id(value: object) -> str:
    prompt_id = str(value or "").strip().lower()
    if not PROMPT_ID_RE.fullmatch(prompt_id):
        raise ValueError("Prompt id must use lowercase letters, numbers, hyphen, or underscore.")
    return prompt_id


def _prompt_path_from_relative(relative_path: str) -> Path:
    normalized = str(relative_path or "").strip().replace("\\", "/")
    candidate = Path(normalized)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise ValueError("Prompt path must be relative and stay inside prompts.")
    target = ROOT_DIR / candidate
    try:
        target.relative_to(PROMPT_DIR)
    except ValueError as exc:
        raise ValueError("Prompt path must stay inside prompts.") from exc
    if target.suffix.lower() != ".md":
        raise ValueError("Prompt path must point to a markdown file.")
    return target


def _default_path_from_relative(relative_path: str) -> Path:
    target = _prompt_path_from_relative(relative_path)
    try:
        target.relative_to(PROMPT_DEFAULT_DIR)
    except ValueError as exc:
        raise ValueError("Default prompt path must stay inside prompts/defaults.") from exc
    return target


def _relative_prompt_path(path: Path) -> str:
    target = path if path.is_absolute() else ROOT_DIR / path
    return str(target.relative_to(ROOT_DIR)).replace("\\", "/")


def _prompt_file_cache_key(path: Path) -> tuple[int, int]:
    try:
        stat = path.stat()
        return int(stat.st_mtime_ns), int(stat.st_size)
    except OSError:
        return 0, -1


def _clone_prompt_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cloned: list[dict[str, Any]] = []
    for item in items:
        next_item = dict(item)
        if isinstance(next_item.get("defaultSequence"), list):
            next_item["defaultSequence"] = list(next_item["defaultSequence"])
        cloned.append(next_item)
    return cloned


def _clear_prompt_library_cache() -> None:
    global _PROMPT_REGISTRY_CACHE_KEY, _PROMPT_REGISTRY_CACHE, _PROMPT_WORKFLOW_CACHE_KEY, _PROMPT_WORKFLOW_CACHE
    _PROMPT_REGISTRY_CACHE_KEY = None
    _PROMPT_REGISTRY_CACHE = None
    _PROMPT_WORKFLOW_CACHE_KEY = None
    _PROMPT_WORKFLOW_CACHE = None


def _sanitize_prompt_meta(raw: dict[str, Any], *, fallback_order: int) -> dict[str, Any] | None:
    try:
        prompt_id = normalize_prompt_id(raw.get("id"))
    except ValueError:
        return None
    label = str(raw.get("label", "") or "").strip() or prompt_id
    description = str(raw.get("description", "") or "").strip()
    relative_path = str(raw.get("relativePath", "") or "").strip()
    if not relative_path:
        relative_path = f"prompts/{prompt_id}.md"
    try:
        prompt_path = _prompt_path_from_relative(relative_path)
    except ValueError:
        return None
    default_meta = DEFAULT_PROMPT_BY_ID.get(prompt_id, {})
    default_path = str(raw.get("defaultPath", "") or default_meta.get("defaultPath", "") or "").strip()
    normalized_default_path = ""
    if default_path:
        try:
            normalized_default_path = _relative_prompt_path(_default_path_from_relative(default_path))
        except ValueError:
            normalized_default_path = ""
    return {
        "id": prompt_id,
        "label": label,
        "description": description,
        "relativePath": _relative_prompt_path(prompt_path),
        "defaultPath": normalized_default_path,
        "builtIn": bool(raw.get("builtIn", False)),
        "editable": bool(raw.get("editable", True)),
        "order": int(raw.get("order", fallback_order) or fallback_order),
    }


def load_prompt_registry() -> list[dict[str, Any]]:
    global _PROMPT_REGISTRY_CACHE_KEY, _PROMPT_REGISTRY_CACHE
    cache_key = _prompt_file_cache_key(PROMPT_REGISTRY_PATH)
    if _PROMPT_REGISTRY_CACHE is not None and _PROMPT_REGISTRY_CACHE_KEY == cache_key:
        return _clone_prompt_items(_PROMPT_REGISTRY_CACHE)

    raw_items: list[Any] = []
    if PROMPT_REGISTRY_PATH.exists():
        try:
            payload = json.loads(PROMPT_REGISTRY_PATH.read_text(encoding="utf-8"))
            raw_items = payload if isinstance(payload, list) else []
        except (OSError, json.JSONDecodeError):
            raw_items = []
    if not raw_items:
        raw_items = DEFAULT_PROMPT_REGISTRY

    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, raw_item in enumerate(raw_items):
        if not isinstance(raw_item, dict):
            continue
        item = _sanitize_prompt_meta(raw_item, fallback_order=index)
        if not item or item["id"] in seen:
            continue
        seen.add(item["id"])
        items.append(item)

    if not items:
        items = [dict(item, order=index) for index, item in enumerate(DEFAULT_PROMPT_REGISTRY)]
    items = sorted(items, key=lambda item: int(item.get("order", 0)))
    _PROMPT_REGISTRY_CACHE_KEY = cache_key
    _PROMPT_REGISTRY_CACHE = _clone_prompt_items(items)
    return _clone_prompt_items(items)


def save_prompt_registry(items: list[dict[str, Any]]) -> None:
    PROMPT_DIR.mkdir(parents=True, exist_ok=True)
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(items):
        sanitized = _sanitize_prompt_meta(item, fallback_order=index)
        if not sanitized:
            continue
        normalized.append(sanitized)
    payload = [
        {
            "id": item["id"],
            "label": item["label"],
            "description": item["description"],
            "relativePath": item["relativePath"],
            "defaultPath": item.get("defaultPath", ""),
            "builtIn": bool(item.get("builtIn", False)),
            "editable": bool(item.get("editable", True)),
        }
        for item in normalized
    ]
    PROMPT_REGISTRY_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _clear_prompt_library_cache()


def get_prompt_ids() -> set[str]:
    return {item["id"] for item in load_prompt_registry()}


def get_prompt_meta(prompt_id: object) -> dict[str, Any]:
    normalized_id = normalize_prompt_id(prompt_id)
    for item in load_prompt_registry():
        if item["id"] == normalized_id:
            return item
    raise ValueError(f"Unsupported prompt id: {normalized_id}")


def resolve_prompt_path(prompt_id: object) -> Path:
    item = get_prompt_meta(prompt_id)
    return _prompt_path_from_relative(str(item["relativePath"]))


def build_prompt_preview_item(item: dict[str, Any], *, include_content: bool = True) -> dict[str, Any]:
    prompt_path = _prompt_path_from_relative(str(item["relativePath"]))
    stat = prompt_path.stat()
    content = prompt_path.read_text(encoding="utf-8") if include_content else ""
    return {
        "id": item["id"],
        "label": item["label"],
        "description": item.get("description", ""),
        "fileName": prompt_path.name,
        "relativePath": _relative_prompt_path(prompt_path),
        "sizeBytes": stat.st_size,
        "updatedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat().replace("+00:00", "Z"),
        "content": content,
        "builtIn": bool(item.get("builtIn", False)),
        "editable": bool(item.get("editable", True)),
        "defaultAvailable": bool(item.get("defaultPath") and _default_path_from_relative(str(item["defaultPath"])).exists()),
    }


def list_prompt_preview_items(*, include_content: bool = True) -> list[dict[str, Any]]:
    return [build_prompt_preview_item(item, include_content=include_content) for item in load_prompt_registry()]


def _validate_prompt_content(content: object) -> str:
    if not isinstance(content, str):
        raise ValueError("Prompt content must be a string.")
    normalized = content.replace("\r\n", "\n").replace("\r", "\n")
    if not normalized.strip():
        raise ValueError("Prompt content cannot be empty.")
    if len(normalized.encode("utf-8")) > MAX_PROMPT_CONTENT_BYTES:
        raise ValueError("Prompt content is too large.")
    return normalized


def backup_prompt_file(prompt_id: str, prompt_path: Path) -> str | None:
    if not prompt_path.exists():
        return None
    PROMPT_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup_path = PROMPT_BACKUP_DIR / f"{prompt_id}-{stamp}.md"
    backup_path.write_text(prompt_path.read_text(encoding="utf-8"), encoding="utf-8")
    return _relative_prompt_path(backup_path)


def update_prompt_metadata(prompt_id: object, label: object, description: object = "") -> dict[str, Any]:
    normalized_id = normalize_prompt_id(prompt_id)
    normalized_label = str(label or "").strip() or normalized_id
    normalized_description = str(description or "").strip()
    if len(normalized_label) > 80:
        raise ValueError("Prompt label is too long.")
    if len(normalized_description) > 240:
        raise ValueError("Prompt description is too long.")
    items = load_prompt_registry()
    for item in items:
        if item["id"] == normalized_id:
            item["label"] = normalized_label
            item["description"] = normalized_description
            save_prompt_registry(items)
            return build_prompt_preview_item(item)
    raise ValueError(f"Unsupported prompt id: {normalized_id}")


def save_prompt_content(prompt_id: object, content: object) -> dict[str, Any]:
    item = get_prompt_meta(prompt_id)
    if not bool(item.get("editable", True)):
        raise ValueError("This prompt is not editable.")
    normalized = _validate_prompt_content(content)
    prompt_path = _prompt_path_from_relative(str(item["relativePath"]))
    prompt_path.parent.mkdir(parents=True, exist_ok=True)
    backup_path = backup_prompt_file(str(item["id"]), prompt_path)
    prompt_path.write_text(normalized, encoding="utf-8")
    preview = build_prompt_preview_item(item)
    preview["backupPath"] = backup_path
    return preview


def restore_default_prompt(prompt_id: object) -> dict[str, Any]:
    normalized_id = normalize_prompt_id(prompt_id)
    items = load_prompt_registry()
    for item in items:
        if item["id"] != normalized_id:
            continue
        if not bool(item.get("builtIn", False)):
            raise ValueError("Only built-in prompts can restore defaults.")
        default_path = str(item.get("defaultPath", "") or "")
        if not default_path:
            raise ValueError("Default prompt content is unavailable.")
        source_path = _default_path_from_relative(default_path)
        if not source_path.exists():
            raise ValueError("Default prompt content is unavailable.")
        prompt_path = _prompt_path_from_relative(str(item["relativePath"]))
        backup_path = backup_prompt_file(normalized_id, prompt_path)
        prompt_path.write_text(source_path.read_text(encoding="utf-8"), encoding="utf-8")
        default_meta = DEFAULT_PROMPT_BY_ID.get(normalized_id, {})
        item["label"] = str(default_meta.get("label", item["label"]))
        item["description"] = str(default_meta.get("description", item.get("description", "")))
        save_prompt_registry(items)
        preview = build_prompt_preview_item(item)
        preview["backupPath"] = backup_path
        return preview
    raise ValueError(f"Unsupported prompt id: {normalized_id}")


def list_prompt_backups(prompt_id: object, *, limit: int = 20) -> list[dict[str, Any]]:
    normalized_id = normalize_prompt_id(prompt_id)
    if not PROMPT_BACKUP_DIR.exists():
        return []
    backup_paths = sorted(
        PROMPT_BACKUP_DIR.glob(f"{normalized_id}-*.md"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    items: list[dict[str, Any]] = []
    for path in backup_paths[: max(1, min(50, int(limit or 20)))]:
        stat = path.stat()
        items.append(
            {
                "fileName": path.name,
                "relativePath": _relative_prompt_path(path),
                "sizeBytes": stat.st_size,
                "createdAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat().replace("+00:00", "Z"),
                "content": path.read_text(encoding="utf-8"),
            }
        )
    return items


def _backup_path_from_relative(prompt_id: str, relative_path: object) -> Path:
    raw_path = str(relative_path or "").strip().replace("\\", "/")
    candidate = Path(raw_path)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise ValueError("Invalid backup path.")
    target = ROOT_DIR / candidate
    try:
        target.relative_to(PROMPT_BACKUP_DIR)
    except ValueError as exc:
        raise ValueError("Backup path must stay inside prompt backups.") from exc
    if target.suffix.lower() != ".md" or not target.name.startswith(f"{prompt_id}-"):
        raise ValueError("Backup path does not match this prompt.")
    return target


def restore_prompt_backup(prompt_id: object, backup_relative_path: object) -> dict[str, Any]:
    normalized_id = normalize_prompt_id(prompt_id)
    item = get_prompt_meta(normalized_id)
    if not bool(item.get("editable", True)):
        raise ValueError("This prompt is not editable.")
    backup_path = _backup_path_from_relative(normalized_id, backup_relative_path)
    if not backup_path.exists():
        raise ValueError("Prompt backup is unavailable.")
    prompt_path = _prompt_path_from_relative(str(item["relativePath"]))
    current_backup_path = backup_prompt_file(normalized_id, prompt_path)
    prompt_path.write_text(backup_path.read_text(encoding="utf-8"), encoding="utf-8")
    preview = build_prompt_preview_item(item)
    preview["backupPath"] = current_backup_path
    return preview


def _slugify_prompt_label(label: str) -> str:
    ascii_slug = re.sub(r"[^a-z0-9_-]+", "-", label.strip().lower())
    ascii_slug = re.sub(r"-{2,}", "-", ascii_slug).strip("-_")
    return ascii_slug or "custom-prompt"


def create_prompt(label: object, content: object, description: object = "") -> dict[str, Any]:
    normalized_content = _validate_prompt_content(content)
    normalized_label = str(label or "").strip() or "自定义提示词"
    normalized_description = str(description or "").strip()
    items = load_prompt_registry()
    existing_ids = {item["id"] for item in items}
    base_id = _slugify_prompt_label(normalized_label)
    prompt_id = base_id
    suffix = 2
    while prompt_id in existing_ids:
        prompt_id = f"{base_id}-{suffix}"
        suffix += 1
    relative_path = f"prompts/custom/{prompt_id}.md"
    prompt_path = _prompt_path_from_relative(relative_path)
    prompt_path.parent.mkdir(parents=True, exist_ok=True)
    prompt_path.write_text(normalized_content, encoding="utf-8")
    item = {
        "id": prompt_id,
        "label": normalized_label,
        "description": normalized_description,
        "relativePath": relative_path,
        "builtIn": False,
        "editable": True,
        "order": len(items),
    }
    items.append(item)
    save_prompt_registry(items)
    return build_prompt_preview_item(item)


def delete_prompt(prompt_id: object) -> dict[str, Any]:
    normalized_id = normalize_prompt_id(prompt_id)
    items = load_prompt_registry()
    target = next((item for item in items if item["id"] == normalized_id), None)
    if not target:
        raise ValueError(f"Unsupported prompt id: {normalized_id}")
    if bool(target.get("builtIn", False)):
        raise ValueError("Built-in prompts cannot be deleted.")

    prompt_path = _prompt_path_from_relative(str(target["relativePath"]))
    backup_path = backup_prompt_file(normalized_id, prompt_path)
    if prompt_path.exists():
        prompt_path.unlink()

    next_items = [item for item in items if item["id"] != normalized_id]
    save_prompt_registry(next_items)

    workflows = load_prompt_workflows()
    available_ids = {item["id"] for item in next_items}
    for workflow in workflows:
        sequence = [item for item in workflow.get("defaultSequence", []) if item in available_ids]
        if not sequence:
            fallback = DEFAULT_PROMPT_SEQUENCES.get(str(workflow.get("id")), DEFAULT_PROMPT_SEQUENCE)
            sequence = [item for item in fallback if item in available_ids]
        if not sequence and next_items:
            sequence = [next_items[0]["id"]]
        workflow["defaultSequence"] = sequence
        workflow["sequenceLimit"] = max(len(sequence), min(int(workflow.get("sequenceLimit", len(sequence)) or len(sequence)), max(1, len(available_ids))))
        workflow["roundLimit"] = max(int(workflow.get("roundLimit", workflow["sequenceLimit"]) or workflow["sequenceLimit"]), workflow["sequenceLimit"])
    save_prompt_workflows(workflows)

    return {
        "deletedId": normalized_id,
        "backupPath": backup_path,
        "items": list_prompt_preview_items(),
        "workflows": list_prompt_workflows(),
    }


def _clamp_int(value: object, *, default: int, minimum: int, maximum: int) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        normalized = default
    return max(minimum, min(maximum, normalized))


def _normalize_workflow_sequence(value: object, *, fallback: list[str]) -> list[str]:
    raw_items = value if isinstance(value, list) else []
    supported_ids = get_prompt_ids()
    sequence: list[str] = []
    for raw_item in raw_items:
        prompt_id = str(raw_item or "").strip().lower()
        if prompt_id in supported_ids and prompt_id not in sequence:
            sequence.append(prompt_id)
    return sequence or list(fallback)


def _sanitize_prompt_workflow(raw: dict[str, Any], *, fallback_order: int) -> dict[str, Any] | None:
    try:
        workflow_id = normalize_prompt_id(raw.get("id"))
    except ValueError:
        return None
    default_meta = next((item for item in DEFAULT_PROMPT_WORKFLOWS if item["id"] == workflow_id), {})
    default_sequence = _normalize_workflow_sequence(
        raw.get("defaultSequence", default_meta.get("defaultSequence", DEFAULT_PROMPT_SEQUENCE)),
        fallback=list(default_meta.get("defaultSequence", DEFAULT_PROMPT_SEQUENCE)),
    )
    sequence_limit = _clamp_int(
        raw.get("sequenceLimit", default_meta.get("sequenceLimit", len(default_sequence))),
        default=int(default_meta.get("sequenceLimit", len(default_sequence)) or len(default_sequence)),
        minimum=1,
        maximum=12,
    )
    sequence_limit = max(sequence_limit, len(default_sequence))
    round_limit = _clamp_int(
        raw.get("roundLimit", default_meta.get("roundLimit", sequence_limit)),
        default=int(default_meta.get("roundLimit", sequence_limit) or sequence_limit),
        minimum=sequence_limit,
        maximum=12,
    )
    chunk_metric = str(raw.get("chunkMetric", default_meta.get("chunkMetric", "char")) or "char").strip().lower()
    if chunk_metric not in {"char", "word"}:
        chunk_metric = "char"
    return {
        "id": workflow_id,
        "label": str(raw.get("label", default_meta.get("label", workflow_id)) or workflow_id).strip() or workflow_id,
        "description": str(raw.get("description", default_meta.get("description", "")) or "").strip(),
        "defaultSequence": default_sequence,
        "customizable": bool(raw.get("customizable", default_meta.get("customizable", False))),
        "sequenceLimit": sequence_limit,
        "roundLimit": round_limit,
        "chunkMetric": chunk_metric,
        "legacy": bool(raw.get("legacy", default_meta.get("legacy", False))),
        "visible": bool(raw.get("visible", default_meta.get("visible", True))),
        "order": int(raw.get("order", fallback_order) or fallback_order),
    }


def save_prompt_workflows(items: list[dict[str, Any]]) -> None:
    PROMPT_DIR.mkdir(parents=True, exist_ok=True)
    payload = [
        {
            "id": item["id"],
            "label": item["label"],
            "description": item.get("description", ""),
            "defaultSequence": list(item.get("defaultSequence", [])),
            "customizable": bool(item.get("customizable", False)),
            "sequenceLimit": int(item.get("sequenceLimit", len(item.get("defaultSequence", []))) or len(item.get("defaultSequence", []))),
            "roundLimit": int(item.get("roundLimit", item.get("sequenceLimit", len(item.get("defaultSequence", [])))) or item.get("sequenceLimit", len(item.get("defaultSequence", [])))),
            "chunkMetric": item.get("chunkMetric", "char"),
            "legacy": bool(item.get("legacy", False)),
            "visible": bool(item.get("visible", True)),
        }
        for item in items
    ]
    PROMPT_WORKFLOW_REGISTRY_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _clear_prompt_library_cache()


def update_prompt_workflow(workflow_id: object, payload: dict[str, Any]) -> list[dict[str, Any]]:
    normalized_id = normalize_prompt_id(workflow_id)
    if not isinstance(payload, dict):
        raise ValueError("Workflow payload must be an object.")
    items = load_prompt_workflows()
    target_index = next((index for index, item in enumerate(items) if item["id"] == normalized_id), -1)
    if target_index < 0:
        raise ValueError(f"Unsupported prompt workflow: {normalized_id}")
    target = dict(items[target_index])
    if bool(target.get("legacy", False)):
        raise ValueError("Legacy workflows are read-only.")

    label = str(payload.get("label", target.get("label", normalized_id)) or normalized_id).strip() or normalized_id
    description = str(payload.get("description", target.get("description", "")) or "").strip()
    if len(label) > 80:
        raise ValueError("Workflow label is too long.")
    if len(description) > 240:
        raise ValueError("Workflow description is too long.")

    if "defaultSequence" in payload:
        raw_sequence = payload.get("defaultSequence")
        if not isinstance(raw_sequence, list) or not raw_sequence:
            raise ValueError("Workflow sequence cannot be empty.")
        supported_ids = get_prompt_ids()
        default_sequence = []
        for raw_item in raw_sequence:
            prompt_id = normalize_prompt_id(raw_item)
            if prompt_id not in supported_ids:
                raise ValueError(f"Unsupported prompt id in workflow sequence: {prompt_id}")
            if prompt_id not in default_sequence:
                default_sequence.append(prompt_id)
    else:
        default_sequence = _normalize_workflow_sequence(
            target.get("defaultSequence", DEFAULT_PROMPT_SEQUENCE),
            fallback=list(target.get("defaultSequence", DEFAULT_PROMPT_SEQUENCE)),
        )
    sequence_limit = _clamp_int(
        payload.get("sequenceLimit", target.get("sequenceLimit", len(default_sequence))),
        default=int(target.get("sequenceLimit", len(default_sequence)) or len(default_sequence)),
        minimum=1,
        maximum=12,
    )
    if len(default_sequence) > sequence_limit:
        raise ValueError("Workflow sequence exceeds its round limit.")
    round_limit = _clamp_int(
        payload.get("roundLimit", target.get("roundLimit", sequence_limit)),
        default=int(target.get("roundLimit", sequence_limit) or sequence_limit),
        minimum=sequence_limit,
        maximum=12,
    )

    target.update({
        "label": label,
        "description": description,
        "defaultSequence": default_sequence,
        "sequenceLimit": sequence_limit,
        "roundLimit": round_limit,
        "customizable": True,
        "legacy": False,
        "visible": payload.get("visible", target.get("visible", True)) is not False,
    })
    items[target_index] = target
    save_prompt_workflows(items)
    return list_prompt_workflows()


def load_prompt_workflows() -> list[dict[str, Any]]:
    global _PROMPT_WORKFLOW_CACHE_KEY, _PROMPT_WORKFLOW_CACHE
    cache_key = (_prompt_file_cache_key(PROMPT_WORKFLOW_REGISTRY_PATH), _prompt_file_cache_key(PROMPT_REGISTRY_PATH))
    if _PROMPT_WORKFLOW_CACHE is not None and _PROMPT_WORKFLOW_CACHE_KEY == cache_key:
        return _clone_prompt_items(_PROMPT_WORKFLOW_CACHE)

    raw_items: list[Any] = []
    if PROMPT_WORKFLOW_REGISTRY_PATH.exists():
        try:
            payload = json.loads(PROMPT_WORKFLOW_REGISTRY_PATH.read_text(encoding="utf-8"))
            raw_items = payload if isinstance(payload, list) else []
        except (OSError, json.JSONDecodeError):
            raw_items = []
    if not raw_items:
        raw_items = DEFAULT_PROMPT_WORKFLOWS

    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, raw_item in enumerate(raw_items):
        if not isinstance(raw_item, dict):
            continue
        item = _sanitize_prompt_workflow(raw_item, fallback_order=index)
        if not item or item["id"] in seen:
            continue
        seen.add(item["id"])
        items.append(item)

    if DEFAULT_PROMPT_PROFILE not in seen:
        default_item = next(item for item in DEFAULT_PROMPT_WORKFLOWS if item["id"] == DEFAULT_PROMPT_PROFILE)
        items.append(dict(default_item, order=len(items)))
    items = sorted(items, key=lambda item: int(item.get("order", 0)))
    _PROMPT_WORKFLOW_CACHE_KEY = cache_key
    _PROMPT_WORKFLOW_CACHE = _clone_prompt_items(items)
    return _clone_prompt_items(items)


def list_prompt_workflows(*, include_legacy: bool = True) -> list[dict[str, Any]]:
    workflows = load_prompt_workflows()
    if not include_legacy:
        workflows = [item for item in workflows if not bool(item.get("legacy", False))]
    return [
        {
            "id": item["id"],
            "label": item["label"],
            "description": item.get("description", ""),
            "defaultSequence": list(item.get("defaultSequence", [])),
            "customizable": bool(item.get("customizable", False)),
            "sequenceLimit": int(item.get("sequenceLimit", len(item.get("defaultSequence", []))) or len(item.get("defaultSequence", []))),
            "roundLimit": int(item.get("roundLimit", item.get("sequenceLimit", len(item.get("defaultSequence", [])))) or item.get("sequenceLimit", len(item.get("defaultSequence", [])))),
            "chunkMetric": item.get("chunkMetric", "char"),
            "legacy": bool(item.get("legacy", False)),
            "visible": bool(item.get("visible", True)),
        }
        for item in workflows
    ]


def get_editable_prompt_workflows() -> list[dict[str, Any]]:
    workflows = load_prompt_workflows()
    editable = [
        item for item in workflows
        if bool(item.get("visible", True)) and not bool(item.get("legacy", False)) and bool(item.get("customizable", False))
    ]
    if editable:
        return editable
    return [item for item in workflows if bool(item.get("visible", True)) and not bool(item.get("legacy", False))]


def get_default_prompt_profile() -> str:
    editable = get_editable_prompt_workflows()
    if editable:
        return str(editable[0]["id"])
    workflows = load_prompt_workflows()
    if any(str(item.get("id")) == DEFAULT_PROMPT_PROFILE for item in workflows):
        return DEFAULT_PROMPT_PROFILE
    return str(workflows[0]["id"]) if workflows else DEFAULT_PROMPT_PROFILE


def get_prompt_workflow_ids() -> set[str]:
    return {item["id"] for item in load_prompt_workflows()}


def get_prompt_workflow(prompt_profile: object) -> dict[str, Any]:
    normalized = str(prompt_profile or get_default_prompt_profile()).strip().lower() or get_default_prompt_profile()
    for item in load_prompt_workflows():
        if item["id"] == normalized:
            return item
    raise ValueError(f"Unsupported prompt profile: {normalized}")


def is_prompt_sequence_customizable(prompt_profile: str | None) -> bool:
    return bool(get_prompt_workflow(prompt_profile).get("customizable", False))


def get_prompt_sequence_limit(prompt_profile: str | None = None) -> int:
    workflow = get_prompt_workflow(prompt_profile or get_default_prompt_profile())
    return int(workflow.get("sequenceLimit", len(workflow.get("defaultSequence", []))) or DEFAULT_MAX_PROMPT_SEQUENCE_ROUNDS)


def get_prompt_round_limit(prompt_profile: str | None = None) -> int:
    workflow = get_prompt_workflow(prompt_profile or get_default_prompt_profile())
    sequence_limit = int(workflow.get("sequenceLimit", len(workflow.get("defaultSequence", []))) or DEFAULT_MAX_PROMPT_SEQUENCE_ROUNDS)
    return max(sequence_limit, int(workflow.get("roundLimit", sequence_limit) or sequence_limit))


def get_round_model_keys() -> set[str]:
    keys: set[str] = set()
    for workflow in load_prompt_workflows():
        sequence_limit = int(workflow.get("sequenceLimit", len(workflow.get("defaultSequence", []))) or 0)
        limit = max(sequence_limit, int(workflow.get("roundLimit", sequence_limit) or sequence_limit))
        for round_number in range(1, limit + 1):
            keys.add(f"{workflow['id']}:{round_number}")
    return keys


def normalize_prompt_profile(prompt_profile: str | None) -> str:
    return str(get_prompt_workflow(prompt_profile)["id"])


def normalize_prompt_sequence(prompt_profile: str | None, prompt_sequence: object | None = None) -> list[str]:
    normalized_profile = normalize_prompt_profile(prompt_profile)
    workflow = get_prompt_workflow(normalized_profile)
    default_sequence = list(workflow.get("defaultSequence", DEFAULT_PROMPT_SEQUENCE))
    if not bool(workflow.get("customizable", False)):
        return default_sequence

    if isinstance(prompt_sequence, str):
        raw_items = [item.strip() for item in prompt_sequence.split(",")]
    elif isinstance(prompt_sequence, (list, tuple)):
        raw_items = list(prompt_sequence)
    else:
        raw_items = []

    supported_ids = get_prompt_ids()
    normalized_sequence: list[str] = []
    for raw_item in raw_items:
        prompt_id = str(raw_item or "").strip().lower()
        if not prompt_id:
            continue
        if prompt_id not in supported_ids:
            raise ValueError(f"Unsupported prompt id in custom sequence: {prompt_id}")
        normalized_sequence.append(prompt_id)

    if not normalized_sequence:
        return default_sequence
    sequence_limit = get_prompt_round_limit(normalized_profile)
    if len(normalized_sequence) > sequence_limit:
        raise ValueError(f"Custom prompt sequence supports at most {sequence_limit} rounds.")
    return normalized_sequence


def get_prompt_sequence_key(prompt_profile: str | None, prompt_sequence: object | None = None) -> str:
    normalized_profile = normalize_prompt_profile(prompt_profile)
    sequence = normalize_prompt_sequence(normalized_profile, prompt_sequence)
    if not is_prompt_sequence_customizable(normalized_profile):
        return normalized_profile
    return "custom_" + "_".join(sequence)


def coerce_prompt_sequence(value: object | None) -> list[str]:
    if isinstance(value, str):
        raw_items = [item.strip() for item in value.split(",")]
    elif isinstance(value, (list, tuple)):
        raw_items = list(value)
    else:
        raw_items = []
    return [str(item or "").strip().lower() for item in raw_items if str(item or "").strip()]


def prompt_sequence_match_rank(record_sequence: object | None, selected_sequence: object | None, round_number: int | None = None) -> int:
    record = coerce_prompt_sequence(record_sequence)
    selected = coerce_prompt_sequence(selected_sequence)
    if not record or not selected:
        return -1
    if round_number is not None and int(round_number) > len(record):
        return -1
    if record == selected:
        return 1000 + len(record)
    if len(record) <= len(selected) and selected[:len(record)] == record:
        return len(record)
    return -1


def get_prompt_mapping(prompt_profile: str | None, prompt_sequence: object | None = None) -> dict[int, str]:
    normalized_profile = normalize_prompt_profile(prompt_profile)
    sequence = normalize_prompt_sequence(normalized_profile, prompt_sequence)
    return {
        round_number: _relative_prompt_path(resolve_prompt_path(prompt_id))
        for round_number, prompt_id in enumerate(sequence, start=1)
    }


def get_max_rounds(prompt_profile: str | None, prompt_sequence: object | None = None) -> int:
    return len(normalize_prompt_sequence(prompt_profile, prompt_sequence))


def get_prompt_id_for_round(prompt_profile: str | None, round_number: int, prompt_sequence: object | None = None) -> str:
    sequence = normalize_prompt_sequence(prompt_profile, prompt_sequence)
    if not sequence:
        raise ValueError("Prompt sequence cannot be empty.")
    if round_number < 1:
        raise ValueError("Round number must be greater than zero.")
    if round_number <= len(sequence):
        return sequence[round_number - 1]
    raise ValueError(f"Round {round_number} is outside the selected {len(sequence)} round prompt workflow.")


def get_chunk_metric(prompt_profile: str | None, prompt_sequence: object | None = None) -> str:
    normalized_profile = normalize_prompt_profile(prompt_profile)
    return str(get_prompt_workflow(normalized_profile).get("chunkMetric", "char") or "char")
