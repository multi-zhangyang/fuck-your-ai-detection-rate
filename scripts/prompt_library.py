from __future__ import annotations

import copy
import hashlib
import json
import os
import re
import stat
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
PROMPT_DIR = ROOT_DIR / "prompts"
PROMPT_DEFAULT_DIR = PROMPT_DIR / "defaults"
PROMPT_REGISTRY_PATH = PROMPT_DIR / "prompt-registry.json"
PROMPT_WORKFLOW_REGISTRY_PATH = PROMPT_DIR / "prompt-workflows.json"
PROMPT_FACTORY_STATE_FILENAME = ".factory-state.json"
PROMPT_FACTORY_STATE_VERSION = 1
PROMPT_BACKUP_DIR = ROOT_DIR / "finish" / "prompt_backups"
MAX_PROMPT_CONTENT_BYTES = 512 * 1024
DEFAULT_PROMPT_PROFILE = "cn_custom"
LEGACY_PROMPT_PROFILE = "cn"
DEFAULT_MAX_PROMPT_SEQUENCE_ROUNDS = 3
DEFAULT_MAX_CONTINUATION_ROUNDS = 12
MAX_PROMPT_SEQUENCE_ROUNDS = DEFAULT_MAX_PROMPT_SEQUENCE_ROUNDS
PROMPT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
DEFAULT_PROMPT_SEQUENCE = ["prewrite", "round1", "round2"]

# Each pass has a distinct editing responsibility so later rounds do not
# mechanically rewrite the same sentence again.  Metrics are advisory quality
# proxies, not authorship detectors and not targets to optimise at any cost.
ROUND_PERTURBATION_DIMENSIONS: dict[str, dict[str, str]] = {
    "prewrite": {
        "id": "structure_warmup",
        "label": "保守润色",
        "description": "只修复明显生硬、重复或模板化的局部表达。",
        "primaryMetric": "burstinessRatio",
    },
    "round1": {
        "id": "sentence_structure",
        "label": "句法与节奏",
        "description": "处理连续同构、重复表层框架与不合理句界；不设置短句、被动句或句长比例配额。",
        # Dual-check: burstiness remains the primary rhythm signal; structureConcentration
        # is the forced sub-signal under sentence_structure (see _assess_dimension_direction).
        "primaryMetric": "burstinessRatio",
        "secondaryMetric": "structureConcentration",
    },
    "round2": {
        "id": "connector_detail",
        "label": "衔接与终稿",
        "description": "修正机械衔接、指代和同义反复；只保留必要改动，不注入原文外细节。",
        "primaryMetric": "connectorDensity",
        "secondaryMetric": "burstConnectorDensity",
    },
    "template-repair": {
        "id": "template_expression",
        "label": "模板与空泛表达",
        "description": "只处理模板句、泛化总结、空泛填充和不承载信息的套语。",
        "primaryMetric": "templateDensity",
        "secondaryMetric": "abstractPaddingDensity",
    },
}


def _build_rate_audit_dimension_definition(
    *,
    dimension_id: str,
    label: str,
    description: str,
    action: str,
    risk_codes: tuple[str, ...],
    repair_prompt_id: str = "",
    target_scope: str = "chunk",
    manual_review_reason: str = "",
) -> dict[str, Any]:
    """Build one honest diagnostic -> repair -> evaluator contract.

    Executable metadata is derived from the prompt's real round dimension so
    the RateAudit layer cannot silently claim that (for example) ``round2`` is
    a rhythm repair while the round service actually evaluates connectors.
    Dimensions without a real same-dimension evaluator stay manual-only.
    """

    prompt_dimension = ROUND_PERTURBATION_DIMENSIONS.get(repair_prompt_id, {})
    can_execute = bool(repair_prompt_id and prompt_dimension)
    evaluator_dimension_id = str(prompt_dimension.get("id", "") or "")
    primary_metric = str(prompt_dimension.get("primaryMetric", "") or "")
    secondary_metric = str(prompt_dimension.get("secondaryMetric", "") or "")
    direction_evaluator = (
        f"{evaluator_dimension_id}:{primary_metric}"
        if can_execute and evaluator_dimension_id and primary_metric
        else "manual_review"
    )
    return {
        "id": dimension_id,
        "dimensionId": dimension_id,
        "label": label,
        "description": description,
        "action": action,
        "riskCodes": risk_codes,
        "repairPromptId": repair_prompt_id if can_execute else "",
        "evaluatorDimensionId": evaluator_dimension_id if can_execute else "",
        "primaryMetric": primary_metric if can_execute else "",
        "secondaryMetric": secondary_metric if can_execute else "",
        "directionEvaluator": direction_evaluator,
        "targetScope": target_scope,
        "maxAttempts": 2 if can_execute else 0,
        "plateauPolicy": "hard_stop_preserve_previous" if can_execute else "manual_review_only",
        "canExecute": can_execute,
        "manualReviewReason": "" if can_execute else manual_review_reason,
    }


RATE_AUDIT_DIMENSION_REGISTRY_VERSION = 2
RATE_AUDIT_DIMENSION_REGISTRY: tuple[dict[str, Any], ...] = (
    _build_rate_audit_dimension_definition(
        dimension_id="rhythm",
        label="句法与节奏",
        description="关注连续等长句、表层句模集中和刻意制造的短碎句。",
        action="优先调整重复主语、开句方式和不合理句界；不要为了指标强拆短句或强塞复杂句。",
        risk_codes=(
            "low_burstiness_ratio",
            "sentence_fragment_gaming",
            "structure_template_concentration",
        ),
        repair_prompt_id="round1",
        target_scope="chunk",
    ),
    _build_rate_audit_dimension_definition(
        dimension_id="transitions",
        label="衔接脚手架",
        description="关注连接词密度和成组出现的机械推进结构。",
        action="删除不承担逻辑作用的连接词，用上下文、指代和具体动作自然承接；必要逻辑词必须保留。",
        risk_codes=(
            "connector_overuse",
            "mechanical_burst_pattern",
        ),
        repair_prompt_id="round2",
        target_scope="chunk",
    ),
    _build_rate_audit_dimension_definition(
        dimension_id="templates",
        label="模板与空泛表达",
        description="关注套话、泛化总结、空泛填充和不承载信息的四字公式。",
        action="把空泛判断替换为原文已有的对象、动作和关系；不得新增数据、案例、机制或结论。",
        risk_codes=(
            "template_phrase_density",
            "generic_closing_phrase",
            "abstract_padding_density",
            "chengyu_density_high",
        ),
        repair_prompt_id="template-repair",
        target_scope="chunk",
    ),
    _build_rate_audit_dimension_definition(
        dimension_id="structure",
        label="段落与枚举结构",
        description="关注过度整齐的段长、嵌套编号和冒号—分号并列模板。",
        action="只在段内检查信息密度与表述顺序；严禁合并、拆分、重排自然段或破坏原有编号。",
        risk_codes=(
            "nested_number_scaffold",
            "colon_parallel_scaffold",
            "paragraph_length_symmetry",
        ),
        target_scope="document",
        manual_review_reason="文档级段落与枚举结构尚无保持段落冻结契约的同维度收敛评估器。",
    ),
    _build_rate_audit_dimension_definition(
        dimension_id="register",
        label="语态与语域",
        description="关注连续同构的被动表达，同时保留语义真正需要的被动句。",
        action="检查连续被动句是否都必要；能明确动作主体时改为具体陈述，语义需要时保持原句。",
        risk_codes=(
            "passive_voice_overuse",
        ),
        target_scope="chunk",
        manual_review_reason="语态与语域目前只有可读性诊断，没有能区分必要被动句的可靠自动收敛评估器。",
    ),
)


def get_rate_audit_dimension_definition(dimension_id: object) -> dict[str, Any]:
    normalized_id = str(dimension_id or "").strip()
    for definition in RATE_AUDIT_DIMENSION_REGISTRY:
        if str(definition.get("dimensionId", "")) == normalized_id:
            payload = dict(definition)
            payload["riskCodes"] = list(definition.get("riskCodes", ()))
            return payload
    return {
        "id": normalized_id or "manual_review",
        "dimensionId": normalized_id or "manual_review",
        "label": "人工抽查",
        "description": "当前诊断项没有注册可验证的自动修复维度。",
        "action": "保留当前文本并人工核对，不要套用其他维度的提示词。",
        "riskCodes": [],
        "repairPromptId": "",
        "evaluatorDimensionId": "",
        "primaryMetric": "",
        "secondaryMetric": "",
        "directionEvaluator": "manual_review",
        "targetScope": "manual_review",
        "maxAttempts": 0,
        "plateauPolicy": "manual_review_only",
        "canExecute": False,
        "manualReviewReason": "该维度没有注册同维度评估器。",
    }
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
# Frozen ownership boundary for volumes created before factory-state tracking.
# Do not derive this from the current seed: future factory workflow IDs must
# not silently claim a same-named custom workflow during first adoption.
PRE_FACTORY_STATE_WORKFLOW_IDS = frozenset({"cn", "cn_prewrite", "cn_custom"})
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
        "description": "只修复明显生硬、重复和模板化表达。",
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
        "id": "template-repair",
        "label": "模板表达定点修复",
        "description": "只处理模板句、泛化总结和空泛填充，不扩写正文。",
        "relativePath": "prompts/template-repair.md",
        "defaultPath": "prompts/defaults/template-repair.md",
        "builtIn": True,
        "editable": True,
    },
    {
        "id": "round1",
        "label": "规范改写",
        "description": "调整连续同构句式与不合理句界，不强造短句。",
        "relativePath": "prompts/rewrite-pass-1.md",
        "defaultPath": "prompts/defaults/rewrite-pass-1.md",
        "builtIn": True,
        "editable": True,
    },
    {
        "id": "round2",
        "label": "专家改写",
        "description": "终稿校正衔接、指代和同义反复，不注入新细节。",
        "relativePath": "prompts/rewrite-pass-2.md",
        "defaultPath": "prompts/defaults/rewrite-pass-2.md",
        "builtIn": True,
        "editable": True,
    },
]
DEFAULT_PROMPT_BY_ID = {str(item["id"]): item for item in DEFAULT_PROMPT_REGISTRY}


def _read_json_list(path: Path, *, required: bool) -> list[Any]:
    if not path.exists():
        if required:
            raise ValueError(f"Required prompt seed file is missing: {path.name}")
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Prompt metadata is not valid JSON: {path.name}") from exc
    if not isinstance(payload, list):
        raise ValueError(f"Prompt metadata must contain a list: {path.name}")
    return payload


def _factory_item_id(raw: object, *, source: str) -> str:
    if not isinstance(raw, dict):
        raise ValueError(f"{source} entries must be objects.")
    prompt_id = str(raw.get("id", "") or "").strip().lower()
    if not PROMPT_ID_RE.fullmatch(prompt_id):
        raise ValueError(f"{source} contains an invalid id: {prompt_id or '<empty>'}")
    return prompt_id


def _index_factory_items(items: list[Any], *, source: str) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    for raw in items:
        item_id = _factory_item_id(raw, source=source)
        if item_id in indexed:
            raise ValueError(f"{source} contains a duplicate id: {item_id}")
        indexed[item_id] = raw
    return indexed


def _index_existing_items(items: list[Any]) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    for raw in items:
        if not isinstance(raw, dict):
            continue
        item_id = str(raw.get("id", "") or "").strip().lower()
        if PROMPT_ID_RE.fullmatch(item_id) and item_id not in indexed:
            indexed[item_id] = raw
    return indexed


def _assert_unique_existing_ids(items: list[Any], *, source: str) -> None:
    seen: set[str] = set()
    for raw in items:
        if not isinstance(raw, dict):
            continue
        item_id = str(raw.get("id", "") or "").strip().lower()
        if not PROMPT_ID_RE.fullmatch(item_id):
            continue
        if item_id in seen:
            raise ValueError(f"{source} contains a duplicate id: {item_id}")
        seen.add(item_id)


def _prompt_relative_path(value: object) -> Path:
    normalized = str(value or "").strip().replace("\\", "/")
    candidate = Path(normalized)
    if candidate.is_absolute() or ".." in candidate.parts or len(candidate.parts) < 2 or candidate.parts[0] != "prompts":
        raise ValueError("Factory prompt paths must be relative to prompts/.")
    relative = Path(*candidate.parts[1:])
    if relative.suffix.lower() != ".md":
        raise ValueError("Factory prompt paths must point to markdown files.")
    return relative


def _path_inside(base_dir: Path, relative_path: Path) -> Path:
    base = base_dir.resolve()
    target = (base / relative_path).resolve()
    try:
        target.relative_to(base)
    except ValueError as exc:
        raise ValueError("Factory prompt path escapes its prompt directory.") from exc
    return target


def _prompt_data_path(base_dir: Path, value: object) -> Path:
    return _path_inside(base_dir, _prompt_relative_path(value))


def _sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _atomic_write_bytes(path: Path, content: bytes) -> bool:
    if path.exists() and path.read_bytes() == content:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = path.stat().st_mode & 0o777 if path.exists() else 0o644
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary_path, mode)
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)
    return True


def _atomic_write_json(path: Path, payload: object) -> bool:
    content = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    return _atomic_write_bytes(path, content)


def _atomic_create_bytes(path: Path, content: bytes) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary_path, 0o644)
        try:
            os.link(temporary_path, path)
        except FileExistsError:
            return False
    finally:
        temporary_path.unlink(missing_ok=True)
    return True


def _load_factory_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("Prompt factory state is not valid JSON.") from exc
    if not isinstance(payload, dict):
        raise ValueError("Prompt factory state must be an object.")
    try:
        version = int(payload.get("version", 0))
    except (TypeError, ValueError) as exc:
        raise ValueError("Prompt factory state has an invalid version.") from exc
    if version > PROMPT_FACTORY_STATE_VERSION:
        raise ValueError("The prompt volume was initialized by a newer factory-state format.")
    if version != PROMPT_FACTORY_STATE_VERSION:
        raise ValueError("Prompt factory state uses an unsupported version.")
    return payload


def _merge_factory_metadata(
    factory: dict[str, Any],
    current: dict[str, Any] | None,
    previous_factory: dict[str, Any] | None,
    *,
    user_editable_fields: tuple[str, ...],
) -> dict[str, Any]:
    merged = copy.deepcopy(factory)
    if current is None:
        return merged
    for field in user_editable_fields:
        if field not in current:
            continue
        # With no prior factory snapshot, preserving editable fields is the
        # only lossless choice. Once a snapshot exists, unchanged values can
        # safely follow the new image while actual user overrides remain.
        if previous_factory is None or field not in previous_factory or current.get(field) != previous_factory.get(field):
            merged[field] = copy.deepcopy(current[field])
    return merged


def _merge_factory_collection(
    factory_items: list[Any],
    current_items: list[Any],
    previous_items: list[Any],
    *,
    source: str,
    editable_fields: tuple[str, ...],
    authoritative_fields: tuple[str, ...],
    editable_only_when_customizable: bool = False,
) -> list[Any]:
    factory_by_id = _index_factory_items(factory_items, source=source)
    current_by_id = _index_existing_items(current_items)
    previous_by_id = _index_existing_items(previous_items)
    merged: list[Any] = []
    for item_id, factory in factory_by_id.items():
        current = current_by_id.get(item_id)
        fields = set(editable_fields)
        if current is not None:
            fields.update(
                field
                for field in current
                if field not in authoritative_fields and field != "order"
            )
        previous_factory = previous_by_id.get(item_id)
        was_customizable = any(
            bool(item.get("customizable", False))
            for item in (factory, current, previous_factory)
            if isinstance(item, dict)
        )
        if editable_only_when_customizable and not was_customizable:
            fields.clear()
        merged.append(
            _merge_factory_metadata(
                factory,
                current,
                previous_factory,
                user_editable_fields=tuple(sorted(fields)),
            )
        )
    factory_ids = set(factory_by_id)
    seen_extras: set[str] = set()
    for raw in current_items:
        if isinstance(raw, dict):
            item_id = str(raw.get("id", "") or "").strip().lower()
            if item_id in factory_ids or item_id in seen_extras:
                continue
            if PROMPT_ID_RE.fullmatch(item_id):
                seen_extras.add(item_id)
        merged.append(copy.deepcopy(raw))
    return merged


def _read_regular_file(path: Path) -> bytes | None:
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError:
        return None
    try:
        file_stat = os.fstat(descriptor)
        if not stat.S_ISREG(file_stat.st_mode) or file_stat.st_size <= 0 or file_stat.st_size > MAX_PROMPT_CONTENT_BYTES:
            return None
        with os.fdopen(descriptor, "rb", closefd=False) as handle:
            content = handle.read(MAX_PROMPT_CONTENT_BYTES + 1)
        if len(content) > MAX_PROMPT_CONTENT_BYTES:
            return None
        try:
            decoded = content.decode("utf-8")
        except UnicodeDecodeError:
            return None
        return content if decoded.strip() else None
    finally:
        os.close(descriptor)


def _import_legacy_custom_prompts(
    legacy_custom_dir: str | Path | None,
    prompt_dir: Path,
    *,
    factory_ids: set[str],
    current_registry: list[Any],
    previous_mappings: dict[str, str],
) -> tuple[list[str], dict[str, str]]:
    if legacy_custom_dir is None:
        return [], {}
    source_dir = Path(legacy_custom_dir)
    if not source_dir.is_dir():
        return [], {}
    target_dir = _path_inside(prompt_dir, Path("custom"))
    target_dir.mkdir(parents=True, exist_ok=True)
    current_by_id = _index_existing_items(current_registry)
    reserved_ids = factory_ids | set(current_by_id) | set(previous_mappings.values())
    targets_claimed_by_other_sources = {
        target_id
        for source_id, target_id in previous_mappings.items()
        if source_id != target_id
    }
    plans: list[tuple[str, str, Path, bytes, bool]] = []
    new_mappings: dict[str, str] = {}
    for source_path in sorted(source_dir.iterdir(), key=lambda item: item.name):
        source_id = source_path.stem
        if source_path.is_symlink() or source_path.suffix != ".md":
            continue
        if not PROMPT_ID_RE.fullmatch(source_id) or source_id in previous_mappings:
            continue
        content = _read_regular_file(source_path)
        if content is None:
            continue
        same_id_path = target_dir / f"{source_id}.md"
        same_id_exists = os.path.lexists(same_id_path)
        current_meta = current_by_id.get(source_id)
        same_id_is_custom = (
            (current_meta is None or current_meta.get("builtIn", False) is False)
            and source_id not in targets_claimed_by_other_sources
        )
        same_path_is_safe = not same_id_exists or (same_id_path.is_file() and not same_id_path.is_symlink())
        if source_id not in factory_ids and same_id_is_custom and same_path_is_safe:
            target_id = source_id
            target_path = same_id_path
            should_create = not same_id_exists
        else:
            suffix_number = 1
            while True:
                suffix = "-legacy" if suffix_number == 1 else f"-legacy-{suffix_number}"
                prefix = source_id[: 64 - len(suffix)].rstrip("-_") or "prompt"
                target_id = f"{prefix}{suffix}"
                target_path = target_dir / f"{target_id}.md"
                if target_id not in reserved_ids and not os.path.lexists(target_path):
                    break
                suffix_number += 1
            should_create = True
        reserved_ids.add(target_id)
        new_mappings[source_id] = target_id
        plans.append((source_id, target_id, target_path, content, should_create))

    imported_ids: list[str] = []
    for _source_id, target_id, target_path, content, should_create in plans:
        if not should_create:
            continue
        if not _atomic_create_bytes(target_path, content):
            raise ValueError(f"Legacy prompt target appeared during migration: {target_id}")
        imported_ids.append(target_id)
    return imported_ids, new_mappings


def _register_legacy_custom_prompts(
    prompt_dir: Path,
    current_registry: list[Any],
    mappings: dict[str, str],
) -> list[Any]:
    merged_registry = copy.deepcopy(current_registry)
    known_ids = set(_index_existing_items(current_registry))
    custom_dir = _path_inside(prompt_dir, Path("custom"))
    for source_id, target_id in sorted(mappings.items()):
        if target_id in known_ids:
            continue
        target_path = custom_dir / f"{target_id}.md"
        if target_path.is_symlink() or not target_path.is_file():
            continue
        merged_registry.append({
            "id": target_id,
            "label": f"{source_id}（旧版导入）",
            "description": "",
            "relativePath": f"prompts/custom/{target_id}.md",
            "builtIn": False,
            "editable": True,
        })
        known_ids.add(target_id)
    return merged_registry


def _register_orphan_custom_prompts(
    prompt_dir: Path,
    current_registry: list[Any],
    *,
    factory_ids: set[str],
    ignored_ids: set[str] | None = None,
) -> tuple[list[Any], list[str]]:
    merged_registry = copy.deepcopy(current_registry)
    known_ids = set(_index_existing_items(current_registry)) | factory_ids | (ignored_ids or set())
    discovered_ids: list[str] = []
    custom_dir = _path_inside(prompt_dir, Path("custom"))
    if not custom_dir.is_dir():
        return merged_registry, discovered_ids
    for path in sorted(custom_dir.iterdir(), key=lambda item: item.name):
        prompt_id = path.stem
        if path.is_symlink() or not path.is_file() or path.suffix != ".md":
            continue
        if not PROMPT_ID_RE.fullmatch(prompt_id) or prompt_id in known_ids:
            continue
        merged_registry.append({
            "id": prompt_id,
            "label": prompt_id,
            "description": "",
            "relativePath": f"prompts/custom/{path.name}",
            "builtIn": False,
            "editable": True,
        })
        known_ids.add(prompt_id)
        discovered_ids.append(prompt_id)
    return merged_registry, discovered_ids


def sync_prompt_seed(
    seed_dir: str | Path,
    *,
    prompt_dir: str | Path = PROMPT_DIR,
    legacy_custom_dir: str | Path | None = None,
) -> dict[str, Any]:
    """Merge an immutable image seed into a writable prompt volume.

    Active built-in content follows a new factory version only when it still
    matches the previous factory baseline. User edits, custom registry items,
    and custom workflows are preserved. Factory default files are always
    refreshed so "restore default" targets the currently running image.
    """

    seed_root = Path(seed_dir).resolve()
    target_root = Path(prompt_dir).resolve()
    seed_registry = _read_json_list(seed_root / "prompt-registry.json", required=True)
    seed_workflows = _read_json_list(seed_root / "prompt-workflows.json", required=True)
    seed_registry_by_id = _index_factory_items(seed_registry, source="prompt-registry.json")
    _index_factory_items(seed_workflows, source="prompt-workflows.json")

    target_root.mkdir(parents=True, exist_ok=True)
    registry_path = target_root / "prompt-registry.json"
    workflows_path = target_root / "prompt-workflows.json"
    state_path = target_root / PROMPT_FACTORY_STATE_FILENAME
    current_registry = _read_json_list(registry_path, required=False)
    current_workflows = _read_json_list(workflows_path, required=False)
    _assert_unique_existing_ids(current_registry, source="Current prompt registry")
    _assert_unique_existing_ids(current_workflows, source="Current prompt workflow registry")
    current_registry_by_id = _index_existing_items(current_registry)
    current_workflows_by_id = _index_existing_items(current_workflows)
    previous_state = _load_factory_state(state_path)
    previous_registry = previous_state.get("registry", [])
    previous_workflows = previous_state.get("workflows", [])
    previous_prompts = previous_state.get("prompts", {})
    previous_legacy_mappings = previous_state.get("legacyCustomPromptMappings", {})
    if not isinstance(previous_registry, list):
        raise ValueError("Prompt factory state registry must be a list.")
    if not isinstance(previous_workflows, list):
        raise ValueError("Prompt factory state workflows must be a list.")
    if not isinstance(previous_prompts, dict):
        raise ValueError("Prompt factory state prompt hashes must be an object.")
    if not isinstance(previous_legacy_mappings, dict) or not all(
        isinstance(source_id, str)
        and PROMPT_ID_RE.fullmatch(source_id)
        and isinstance(target_id, str)
        and PROMPT_ID_RE.fullmatch(target_id)
        for source_id, target_id in previous_legacy_mappings.items()
    ):
        raise ValueError("Prompt factory state legacy custom mappings must be a valid object.")
    if len(set(previous_legacy_mappings.values())) != len(previous_legacy_mappings):
        raise ValueError("Prompt factory state legacy custom targets must be unique.")

    previous_workflow_ids = set(_index_existing_items(previous_workflows))
    for workflow_id in _index_factory_items(seed_workflows, source="prompt-workflows.json"):
        if workflow_id in current_workflows_by_id and workflow_id not in previous_workflow_ids:
            if previous_state or workflow_id not in PRE_FACTORY_STATE_WORKFLOW_IDS:
                raise ValueError(f"Factory workflow id conflicts with a custom workflow: {workflow_id}")

    seed_payloads: dict[str, dict[str, Any]] = {}
    for prompt_id, factory_meta in seed_registry_by_id.items():
        current_meta = current_registry_by_id.get(prompt_id)
        if current_meta is not None and current_meta.get("builtIn", True) is False:
            raise ValueError(f"Factory prompt id conflicts with a custom prompt: {prompt_id}")
        active_path = _prompt_data_path(seed_root, factory_meta.get("relativePath"))
        if not active_path.is_file():
            raise ValueError(f"Factory prompt content is missing: {prompt_id}")
        default_value = str(factory_meta.get("defaultPath", "") or "").strip()
        default_path = _prompt_data_path(seed_root, default_value) if default_value else None
        if default_path is not None and not default_path.is_file():
            raise ValueError(f"Factory default prompt content is missing: {prompt_id}")
        seed_payloads[prompt_id] = {
            "active": active_path.read_bytes(),
            "default": default_path.read_bytes() if default_path is not None else None,
        }

    imported_custom_ids, new_legacy_mappings = _import_legacy_custom_prompts(
        legacy_custom_dir,
        target_root,
        factory_ids=set(seed_registry_by_id),
        current_registry=current_registry,
        previous_mappings=previous_legacy_mappings,
    )
    current_registry = _register_legacy_custom_prompts(
        target_root,
        current_registry,
        new_legacy_mappings,
    )
    current_registry, discovered_custom_ids = _register_orphan_custom_prompts(
        target_root,
        current_registry,
        factory_ids=set(seed_registry_by_id),
        ignored_ids=set(previous_legacy_mappings.values()),
    )

    merged_registry = _merge_factory_collection(
        seed_registry,
        current_registry,
        previous_registry,
        source="prompt-registry.json",
        editable_fields=("label", "description"),
        authoritative_fields=("id", "relativePath", "defaultPath", "builtIn", "editable"),
    )
    merged_workflows = _merge_factory_collection(
        seed_workflows,
        current_workflows,
        previous_workflows,
        source="prompt-workflows.json",
        editable_fields=("label", "description", "defaultSequence", "sequenceLimit", "roundLimit", "visible"),
        authoritative_fields=("id", "customizable", "chunkMetric", "legacy"),
        editable_only_when_customizable=True,
    )

    report: dict[str, Any] = {
        "ok": True,
        "stateVersion": PROMPT_FACTORY_STATE_VERSION,
        "factoryPromptCount": len(seed_registry),
        "legacyCustomPromptsImported": len(imported_custom_ids),
        "legacyCustomPromptsConsidered": len(new_legacy_mappings),
        "customPromptsDiscovered": len(discovered_custom_ids),
        "contentCreated": 0,
        "contentUpdated": 0,
        "contentPreserved": 0,
        "defaultsUpdated": 0,
    }
    next_prompt_state: dict[str, dict[str, Any]] = {}
    for prompt_id, factory_meta in seed_registry_by_id.items():
        payload = seed_payloads[prompt_id]
        factory_content = payload["active"]
        factory_default = payload["default"]
        target_active_path = _prompt_data_path(target_root, factory_meta.get("relativePath"))
        current_meta = current_registry_by_id.get(prompt_id)
        current_active_path = target_active_path
        if current_meta is not None:
            try:
                current_active_path = _prompt_data_path(target_root, current_meta.get("relativePath"))
            except ValueError:
                current_active_path = target_active_path
        current_content = current_active_path.read_bytes() if current_active_path.is_file() else None

        old_default_content: bytes | None = None
        if current_meta is not None and current_meta.get("defaultPath"):
            try:
                old_default_path = _prompt_data_path(target_root, current_meta.get("defaultPath"))
                if old_default_path.is_file():
                    old_default_content = old_default_path.read_bytes()
            except ValueError:
                old_default_content = None
        previous_prompt = previous_prompts.get(prompt_id, {})
        previous_hash = str(previous_prompt.get("contentSha256", "") or "") if isinstance(previous_prompt, dict) else ""
        follows_factory = current_content is None
        if current_content is not None and previous_hash:
            follows_factory = _sha256_bytes(current_content) == previous_hash
        elif current_content is not None and old_default_content is not None:
            follows_factory = current_content == old_default_content

        if current_content is None:
            chosen_content = factory_content
            report["contentCreated"] += 1
        elif follows_factory:
            chosen_content = factory_content
            if current_content != factory_content or current_active_path != target_active_path:
                report["contentUpdated"] += 1
        else:
            chosen_content = current_content
            report["contentPreserved"] += 1
        _atomic_write_bytes(target_active_path, chosen_content)

        default_value = str(factory_meta.get("defaultPath", "") or "").strip()
        if default_value and factory_default is not None:
            target_default_path = _prompt_data_path(target_root, default_value)
            if _atomic_write_bytes(target_default_path, factory_default):
                report["defaultsUpdated"] += 1
        next_prompt_state[prompt_id] = {
            "relativePath": str(factory_meta.get("relativePath", "")),
            "defaultPath": default_value,
            "contentSha256": _sha256_bytes(factory_content),
            "defaultSha256": _sha256_bytes(factory_default) if factory_default is not None else "",
        }

    report["registryUpdated"] = _atomic_write_json(registry_path, merged_registry)
    report["workflowsUpdated"] = _atomic_write_json(workflows_path, merged_workflows)
    next_state = {
        "version": PROMPT_FACTORY_STATE_VERSION,
        "registry": seed_registry,
        "workflows": seed_workflows,
        "prompts": next_prompt_state,
        "legacyCustomPromptMappings": {
            **previous_legacy_mappings,
            **new_legacy_mappings,
        },
    }
    report["stateUpdated"] = _atomic_write_json(state_path, next_state)
    _clear_prompt_library_cache()
    return report


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
    return copy.deepcopy(items)


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
    sanitized = copy.deepcopy(raw)
    sanitized.update({
        "id": prompt_id,
        "label": label,
        "description": description,
        "relativePath": _relative_prompt_path(prompt_path),
        "defaultPath": normalized_default_path,
        "builtIn": bool(raw.get("builtIn", False)),
        "editable": bool(raw.get("editable", True)),
        "order": int(raw.get("order", fallback_order) or fallback_order),
    })
    return sanitized


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
    payload: list[dict[str, Any]] = []
    for item in normalized:
        serialized = {key: copy.deepcopy(value) for key, value in item.items() if key != "order"}
        serialized.update({
            "id": item["id"],
            "label": item["label"],
            "description": item["description"],
            "relativePath": item["relativePath"],
            "defaultPath": item.get("defaultPath", ""),
            "builtIn": bool(item.get("builtIn", False)),
            "editable": bool(item.get("editable", True)),
        })
        payload.append(serialized)
    _atomic_write_json(PROMPT_REGISTRY_PATH, payload)
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
    sanitized = copy.deepcopy(raw)
    sanitized.update({
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
    })
    return sanitized


def save_prompt_workflows(items: list[dict[str, Any]]) -> None:
    PROMPT_DIR.mkdir(parents=True, exist_ok=True)
    payload: list[dict[str, Any]] = []
    for item in items:
        serialized = {key: copy.deepcopy(value) for key, value in item.items() if key != "order"}
        serialized.update({
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
        })
        payload.append(serialized)
    _atomic_write_json(PROMPT_WORKFLOW_REGISTRY_PATH, payload)
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
    if not bool(target.get("customizable", False)):
        raise ValueError("Workflow is read-only.")

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
        raise ValueError("Workflow sequence exceeds its default sequence limit.")
    if "roundLimit" in payload:
        try:
            requested_round_limit = int(payload.get("roundLimit"))
        except (TypeError, ValueError):
            raise ValueError("Workflow round limit must be an integer.") from None
        if requested_round_limit < sequence_limit:
            raise ValueError("Workflow round limit cannot be lower than its default sequence limit.")
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


def get_round_dimension(prompt_profile: str | None, round_number: int, prompt_sequence: object | None = None) -> dict[str, str]:
    """Return the distinct editing responsibility assigned to one round.

    ``round_number`` first resolves to a prompt id, then to advisory dimension
    metadata.  Unknown/custom prompts receive a neutral dimension so a quality
    heuristic can never block the rewrite workflow.
    """
    prompt_id = get_prompt_id_for_round(prompt_profile, round_number, prompt_sequence)
    dimension = ROUND_PERTURBATION_DIMENSIONS.get(prompt_id)
    if dimension:
        payload = {
            "promptId": prompt_id,
            "id": str(dimension.get("id", "neutral")),
            "label": str(dimension.get("label", "")),
            "description": str(dimension.get("description", "")),
            "primaryMetric": str(dimension.get("primaryMetric", "")),
        }
        secondary = str(dimension.get("secondaryMetric", "") or "").strip()
        if secondary:
            payload["secondaryMetric"] = secondary
        return payload
    return {
        "promptId": prompt_id,
        "id": "neutral",
        "label": "",
        "description": "",
        "primaryMetric": "",
    }
