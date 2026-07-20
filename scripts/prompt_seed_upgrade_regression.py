from __future__ import annotations

import copy
import json
import shutil
import tempfile
from pathlib import Path
from typing import Any

import prompt_library
from prompt_library import PROMPT_FACTORY_STATE_FILENAME, sync_prompt_seed


ROOT_DIR = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT_DIR / "finish" / "regression" / "prompt_seed_upgrade_regression_report.json"


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _registry_item(prompt_id: str, label: str, description: str, **extra: Any) -> dict[str, Any]:
    return {
        "id": prompt_id,
        "label": label,
        "description": description,
        "relativePath": f"prompts/{prompt_id}.md",
        "defaultPath": f"prompts/defaults/{prompt_id}.md",
        "builtIn": True,
        "editable": True,
        **extra,
    }


def _workflow(
    workflow_id: str,
    label: str,
    description: str,
    sequence: list[str],
    *,
    customizable: bool,
    round_limit: int,
    **extra: Any,
) -> dict[str, Any]:
    return {
        "id": workflow_id,
        "label": label,
        "description": description,
        "defaultSequence": sequence,
        "customizable": customizable,
        "sequenceLimit": len(sequence),
        "roundLimit": round_limit,
        "chunkMetric": "char",
        "legacy": not customizable,
        "visible": customizable,
        **extra,
    }


def _make_seed(
    root: Path,
    *,
    version: int,
    include_gamma: bool,
    main_sequence: list[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    root.mkdir(parents=True)
    (root / "defaults").mkdir()
    prompt_ids = ["alpha", "beta"] + (["gamma"] if include_gamma else [])
    registry = [
        _registry_item(
            prompt_id,
            f"Factory {prompt_id} v{version}",
            f"Factory description {prompt_id} v{version}",
            **({"category": "rewrite"} if version >= 2 else {}),
        )
        for prompt_id in prompt_ids
    ]
    workflows = [
        _workflow(
            "cn_custom",
            f"Factory workflow v{version}",
            f"Factory workflow description v{version}",
            main_sequence,
            customizable=True,
            round_limit=4 if version >= 2 else 2,
            **({"revision": version} if version >= 2 else {}),
        ),
        _workflow(
            "cn",
            f"Locked workflow v{version}",
            f"Locked description v{version}",
            ["beta"],
            customizable=False,
            round_limit=1,
        ),
    ]
    for prompt_id in prompt_ids:
        content = f"factory {prompt_id} content v{version}\n".encode()
        (root / f"{prompt_id}.md").write_bytes(content)
        (root / "defaults" / f"{prompt_id}.md").write_bytes(content)
    _write_json(root / "prompt-registry.json", registry)
    _write_json(root / "prompt-workflows.json", workflows)
    return registry, workflows


def _by_id(items: list[object]) -> dict[str, dict[str, Any]]:
    return {
        str(item["id"]): item
        for item in items
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }


def _read_json(path: Path) -> list[Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    _assert(isinstance(payload, list), f"Expected a JSON list in {path.name}")
    return payload


def _snapshot_files(root: Path) -> dict[Path, bytes]:
    return {
        path.relative_to(root): path.read_bytes()
        for path in root.rglob("*")
        if path.is_file() and not path.is_symlink()
    }


def _load_previews_from_fixture(workspace: Path, prompt_dir: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    original_paths = (
        prompt_library.ROOT_DIR,
        prompt_library.PROMPT_DIR,
        prompt_library.PROMPT_DEFAULT_DIR,
        prompt_library.PROMPT_REGISTRY_PATH,
        prompt_library.PROMPT_WORKFLOW_REGISTRY_PATH,
        prompt_library.PROMPT_BACKUP_DIR,
    )
    try:
        prompt_library.ROOT_DIR = workspace
        prompt_library.PROMPT_DIR = prompt_dir
        prompt_library.PROMPT_DEFAULT_DIR = prompt_dir / "defaults"
        prompt_library.PROMPT_REGISTRY_PATH = prompt_dir / "prompt-registry.json"
        prompt_library.PROMPT_WORKFLOW_REGISTRY_PATH = prompt_dir / "prompt-workflows.json"
        prompt_library.PROMPT_BACKUP_DIR = workspace / "finish" / "prompt_backups"
        prompt_library._clear_prompt_library_cache()
        loaded_registry = prompt_library.load_prompt_registry()
        previews = prompt_library.list_prompt_preview_items()
        loaded_workflows = prompt_library.load_prompt_workflows()
        prompt_library.save_prompt_registry(loaded_registry)
        prompt_library.save_prompt_workflows(loaded_workflows)
        return loaded_registry, previews
    finally:
        (
            prompt_library.ROOT_DIR,
            prompt_library.PROMPT_DIR,
            prompt_library.PROMPT_DEFAULT_DIR,
            prompt_library.PROMPT_REGISTRY_PATH,
            prompt_library.PROMPT_WORKFLOW_REGISTRY_PATH,
            prompt_library.PROMPT_BACKUP_DIR,
        ) = original_paths
        prompt_library._clear_prompt_library_cache()


def run_regression() -> dict[str, object]:
    checks: list[str] = []
    with tempfile.TemporaryDirectory(prefix="fyadr-prompt-seed-") as temporary_dir:
        workspace = Path(temporary_dir)
        seed_v1 = workspace / "seed-v1"
        seed_v2 = workspace / "seed-v2"
        seed_v3 = workspace / "seed-v3"
        _make_seed(seed_v1, version=1, include_gamma=False, main_sequence=["alpha", "beta"])
        _make_seed(seed_v2, version=2, include_gamma=True, main_sequence=["alpha", "gamma"])
        _make_seed(seed_v3, version=3, include_gamma=True, main_sequence=["beta", "gamma"])

        # Reproduce the volume shape created by the old `cp -n` entrypoint: it
        # contains a factory copy but no separate record of that factory state.
        prompt_dir = workspace / "prompts"
        shutil.copytree(seed_v1, prompt_dir)
        (prompt_dir / "alpha.md").write_text("user edited alpha\n", encoding="utf-8")
        registry = _read_json(prompt_dir / "prompt-registry.json")
        registry_by_id = _by_id(registry)
        registry_by_id["alpha"]["label"] = "User alpha label"
        custom_meta = {
            "id": "custom",
            "label": "User custom prompt",
            "description": "must survive image upgrades",
            "relativePath": "prompts/custom/custom.md",
            "defaultPath": "",
            "builtIn": False,
            "editable": True,
            "userField": {"keep": True},
        }
        registry.append(custom_meta)
        (prompt_dir / "custom").mkdir()
        (prompt_dir / "custom" / "custom.md").write_text("user custom content\n", encoding="utf-8")
        _write_json(prompt_dir / "prompt-registry.json", registry)

        legacy_custom_dir = workspace / "legacy-custom"
        legacy_custom_dir.mkdir()
        (legacy_custom_dir / "legacy-only.md").write_text("legacy custom content\n", encoding="utf-8")
        (legacy_custom_dir / "custom.md").write_text("must not replace current custom content\n", encoding="utf-8")
        (legacy_custom_dir / "Invalid Name.md").write_text("invalid custom content\n", encoding="utf-8")
        (legacy_custom_dir / ".hidden.md").write_text("hidden custom content\n", encoding="utf-8")
        (legacy_custom_dir / "notes.txt").write_text("non-markdown content\n", encoding="utf-8")
        (legacy_custom_dir / "empty.md").write_bytes(b"")
        (legacy_custom_dir / "blank.md").write_text(" \n\t", encoding="utf-8")
        (legacy_custom_dir / "binary.md").write_bytes(b"\xff\xfe")
        (legacy_custom_dir / "oversize.md").write_bytes(b"x" * (prompt_library.MAX_PROMPT_CONTENT_BYTES + 1))
        (legacy_custom_dir / "directory.md").mkdir()
        (legacy_custom_dir / "nested").mkdir()
        (legacy_custom_dir / "nested" / "nested-valid.md").write_text("nested custom content\n", encoding="utf-8")
        try:
            (legacy_custom_dir / "linked.md").symlink_to(legacy_custom_dir / "legacy-only.md")
        except OSError:
            # Some Windows runners do not grant symlink creation privileges.
            pass

        workflows = _read_json(prompt_dir / "prompt-workflows.json")
        workflows_by_id = _by_id(workflows)
        workflows_by_id["cn_custom"]["label"] = "User workflow label"
        workflows_by_id["cn"]["label"] = "Illicit locked override"
        custom_workflow = {
            "id": "custom_flow",
            "label": "User custom workflow",
            "description": "must survive",
            "defaultSequence": ["custom"],
            "customizable": True,
            "sequenceLimit": 1,
            "roundLimit": 1,
            "chunkMetric": "char",
            "legacy": False,
            "visible": True,
            "userField": ["keep"],
        }
        workflows.append(custom_workflow)
        _write_json(prompt_dir / "prompt-workflows.json", workflows)

        first_report = sync_prompt_seed(seed_v2, prompt_dir=prompt_dir, legacy_custom_dir=legacy_custom_dir)
        _assert(first_report["contentPreserved"] == 1, "The edited built-in prompt must be preserved")
        _assert(first_report["legacyCustomPromptsImported"] == 1, "Only the valid orphan legacy prompt should be imported")
        _assert(first_report["legacyCustomPromptsConsidered"] == 2, "Valid legacy sources must be tombstoned even when the target already exists")
        _assert(first_report["customPromptsDiscovered"] == 0, "Legacy prompt metadata should be registered by the migration plan")
        _assert((prompt_dir / "alpha.md").read_text(encoding="utf-8") == "user edited alpha\n", "User prompt content was replaced")
        _assert((prompt_dir / "defaults" / "alpha.md").read_text(encoding="utf-8") == "factory alpha content v2\n", "Factory restore content was not refreshed")
        _assert((prompt_dir / "beta.md").read_text(encoding="utf-8") == "factory beta content v2\n", "Untouched built-in content did not upgrade")
        _assert((prompt_dir / "gamma.md").read_text(encoding="utf-8") == "factory gamma content v2\n", "New built-in prompt was not installed")
        _assert((prompt_dir / PROMPT_FACTORY_STATE_FILENAME).is_file(), "Factory state was not recorded")

        merged_registry = _by_id(_read_json(prompt_dir / "prompt-registry.json"))
        _assert(merged_registry["alpha"]["label"] == "User alpha label", "User prompt metadata was replaced")
        _assert(merged_registry["alpha"]["description"] == "Factory description alpha v1", "First adoption must conservatively preserve editable metadata")
        _assert(merged_registry["alpha"]["category"] == "rewrite", "New factory prompt metadata was not merged")
        _assert(merged_registry["custom"] == custom_meta, "Custom prompt metadata was not preserved exactly")
        _assert(merged_registry["legacy-only"] == {
            "id": "legacy-only",
            "label": "legacy-only（旧版导入）",
            "description": "",
            "relativePath": "prompts/custom/legacy-only.md",
            "builtIn": False,
            "editable": True,
        }, "Orphan legacy custom prompt metadata was not reconstructed")
        _assert("Invalid Name" not in merged_registry and "nested-valid" not in merged_registry, "Invalid or nested custom files must not be registered")
        _assert((prompt_dir / "custom" / "custom.md").read_text(encoding="utf-8") == "user custom content\n", "Custom prompt content was changed")
        _assert(not (prompt_dir / "custom" / "Invalid Name.md").exists(), "Invalid legacy prompt names must not be copied")
        _assert(not (prompt_dir / "custom" / ".hidden.md").exists(), "Hidden legacy prompt names must not be copied")
        _assert(not (prompt_dir / "custom" / "notes.txt").exists(), "Non-markdown legacy files must not be copied")
        _assert(not (prompt_dir / "custom" / "empty.md").exists(), "Empty legacy prompts must not be copied")
        _assert(not (prompt_dir / "custom" / "blank.md").exists(), "Blank legacy prompts must not be copied")
        _assert(not (prompt_dir / "custom" / "binary.md").exists(), "Non-UTF-8 legacy prompts must not be copied")
        _assert(not (prompt_dir / "custom" / "oversize.md").exists(), "Oversized legacy prompts must not be copied")
        _assert(not (prompt_dir / "custom" / "directory.md").exists(), "Legacy directories must not be copied")
        _assert(not (prompt_dir / "custom" / "nested").exists(), "Legacy custom migration must not recurse")
        _assert(not (prompt_dir / "custom" / "linked.md").exists(), "Legacy symlinks must not be copied")
        loaded_registry, previews = _load_previews_from_fixture(workspace, prompt_dir)
        _assert("legacy-only" in _by_id(loaded_registry), "load_prompt_registry did not recognize the migrated custom prompt")
        preview_by_id = _by_id(previews)
        _assert(preview_by_id["legacy-only"]["content"] == "legacy custom content\n", "Prompt preview listing did not load migrated custom content")
        roundtripped_registry = _by_id(_read_json(prompt_dir / "prompt-registry.json"))
        roundtripped_workflows = _by_id(_read_json(prompt_dir / "prompt-workflows.json"))
        _assert(b"\r\n" not in (prompt_dir / "prompt-registry.json").read_bytes(), "Registry saves must use canonical LF on every platform")
        _assert(b"\r\n" not in (prompt_dir / "prompt-workflows.json").read_bytes(), "Workflow saves must use canonical LF on every platform")
        _assert(roundtripped_registry["alpha"]["category"] == "rewrite", "Prompt metadata extensions were lost during an application save")
        _assert(roundtripped_workflows["cn_custom"]["revision"] == 2, "Workflow metadata extensions were lost during an application save")

        merged_workflows = _by_id(_read_json(prompt_dir / "prompt-workflows.json"))
        _assert(merged_workflows["cn_custom"]["label"] == "User workflow label", "User workflow metadata was replaced")
        _assert(merged_workflows["cn_custom"]["description"] == "Factory workflow description v1", "First adoption must preserve editable workflow fields")
        _assert(merged_workflows["cn_custom"]["revision"] == 2, "New workflow schema metadata was not merged")
        _assert(merged_workflows["cn"]["label"] == "Locked workflow v2", "Read-only workflow metadata must follow the image")
        _assert(merged_workflows["custom_flow"] == custom_workflow, "Custom workflow was not preserved exactly")
        checks.append("legacy custom-only volumes upgrade without losing prompt or workflow customizations")

        # The v2 factory snapshot now allows a true three-way merge: fields
        # still at v2 follow v3, while the user's label and content stay put.
        second_report = sync_prompt_seed(seed_v3, prompt_dir=prompt_dir)
        _assert(second_report["contentPreserved"] == 1, "User prompt content must remain preserved on later upgrades")
        _assert((prompt_dir / "alpha.md").read_text(encoding="utf-8") == "user edited alpha\n", "Later upgrade replaced user content")
        _assert((prompt_dir / "beta.md").read_text(encoding="utf-8") == "factory beta content v3\n", "Factory-tracked content did not follow the later image")
        upgraded_registry = _by_id(_read_json(prompt_dir / "prompt-registry.json"))
        _assert(upgraded_registry["alpha"]["label"] == "User alpha label", "Three-way merge lost the user label")
        _assert(upgraded_registry["alpha"]["description"] == "Factory description alpha v1", "Legacy metadata without a trustworthy baseline must stay conservative")
        upgraded_workflows = _by_id(_read_json(prompt_dir / "prompt-workflows.json"))
        _assert(upgraded_workflows["cn_custom"]["label"] == "User workflow label", "Three-way workflow merge lost a user override")
        _assert(upgraded_workflows["cn_custom"]["description"] == "Factory workflow description v1", "Legacy workflow metadata without a baseline must stay conservative")
        _assert(upgraded_workflows["cn_custom"]["defaultSequence"] == ["alpha", "beta"], "Legacy workflow sequence must not be guessed as unmodified")
        checks.append("later content upgrades retain conservative overrides adopted from legacy volumes")

        before_idempotent = {
            path.relative_to(prompt_dir): path.read_bytes()
            for path in prompt_dir.rglob("*")
            if path.is_file()
        }
        third_report = sync_prompt_seed(seed_v3, prompt_dir=prompt_dir)
        after_idempotent = {
            path.relative_to(prompt_dir): path.read_bytes()
            for path in prompt_dir.rglob("*")
            if path.is_file()
        }
        _assert(before_idempotent == after_idempotent, "Repeating the same factory sync must be byte-for-byte idempotent")
        _assert(third_report["registryUpdated"] is False and third_report["workflowsUpdated"] is False, "Idempotent sync rewrote metadata")
        checks.append("repeating a factory sync is byte-for-byte idempotent")

        tracked_dir = workspace / "tracked-prompts"
        sync_prompt_seed(seed_v1, prompt_dir=tracked_dir)
        tracked_registry = _read_json(tracked_dir / "prompt-registry.json")
        _by_id(tracked_registry)["alpha"]["label"] = "Tracked user label"
        _by_id(tracked_registry)["alpha"]["category"] = "user-category"
        _write_json(tracked_dir / "prompt-registry.json", tracked_registry)
        tracked_workflows = _read_json(tracked_dir / "prompt-workflows.json")
        _by_id(tracked_workflows)["cn_custom"]["label"] = "Tracked workflow label"
        _by_id(tracked_workflows)["cn_custom"]["revision"] = 99
        _write_json(tracked_dir / "prompt-workflows.json", tracked_workflows)
        sync_prompt_seed(seed_v2, prompt_dir=tracked_dir)
        tracked_registry_by_id = _by_id(_read_json(tracked_dir / "prompt-registry.json"))
        _assert(tracked_registry_by_id["alpha"]["label"] == "Tracked user label", "Tracked prompt override was not preserved")
        _assert(tracked_registry_by_id["alpha"]["description"] == "Factory description alpha v2", "Tracked factory prompt metadata did not upgrade")
        _assert(tracked_registry_by_id["alpha"]["category"] == "user-category", "A future prompt metadata field replaced a pre-existing user value")
        tracked_workflows_by_id = _by_id(_read_json(tracked_dir / "prompt-workflows.json"))
        _assert(tracked_workflows_by_id["cn_custom"]["label"] == "Tracked workflow label", "Tracked workflow override was not preserved")
        _assert(tracked_workflows_by_id["cn_custom"]["description"] == "Factory workflow description v2", "Tracked factory workflow metadata did not upgrade")
        _assert(tracked_workflows_by_id["cn_custom"]["defaultSequence"] == ["alpha", "gamma"], "Tracked factory workflow sequence did not upgrade")
        _assert(tracked_workflows_by_id["cn_custom"]["revision"] == 99, "A future editable metadata field replaced a pre-existing user value")
        checks.append("recorded baselines distinguish user overrides from factory metadata updates")

        fresh_dir = workspace / "fresh-prompts"
        fresh_report = sync_prompt_seed(seed_v3, prompt_dir=fresh_dir)
        _assert(fresh_report["contentCreated"] == 3, "A fresh volume must receive every factory prompt")
        _assert((fresh_dir / "gamma.md").is_file(), "Fresh-volume initialization omitted a built-in prompt")
        checks.append("fresh prompt volumes initialize directly from the current image seed")

        old_compose_root = workspace / "old-compose-shape"
        old_compose_prompt_dir = old_compose_root / "prompts"
        old_compose_legacy_dir = workspace / "old-compose-legacy"
        old_compose_legacy_dir.mkdir()
        (old_compose_legacy_dir / "old-only.md").write_text("old compose custom content\n", encoding="utf-8")
        old_compose_report = sync_prompt_seed(
            seed_v2,
            prompt_dir=old_compose_prompt_dir,
            legacy_custom_dir=old_compose_legacy_dir,
        )
        _assert(old_compose_report["legacyCustomPromptsImported"] == 1, "Old Compose custom-only data was not imported")
        old_compose_registry, old_compose_previews = _load_previews_from_fixture(old_compose_root, old_compose_prompt_dir)
        _assert("old-only" in _by_id(old_compose_registry), "Old Compose custom-only metadata was not reconstructed")
        _assert(_by_id(old_compose_previews)["old-only"]["content"] == "old compose custom content\n", "Old Compose custom-only content is not UI-readable")

        deleted_registry = [item for item in _read_json(old_compose_prompt_dir / "prompt-registry.json") if not isinstance(item, dict) or item.get("id") != "old-only"]
        _write_json(old_compose_prompt_dir / "prompt-registry.json", deleted_registry)
        (old_compose_prompt_dir / "custom" / "old-only.md").unlink()
        restart_report = sync_prompt_seed(
            seed_v2,
            prompt_dir=old_compose_prompt_dir,
            legacy_custom_dir=old_compose_legacy_dir,
        )
        _assert(restart_report["legacyCustomPromptsImported"] == 0, "A deleted migrated prompt was imported again")
        _assert("old-only" not in _by_id(_read_json(old_compose_prompt_dir / "prompt-registry.json")), "A deleted migrated prompt was registered again")
        _assert(not (old_compose_prompt_dir / "custom" / "old-only.md").exists(), "A deleted migrated prompt file was recreated")
        checks.append("exact old Compose custom-only data migrates once and respects later deletion")

        factory_collision_root = workspace / "legacy-factory-collision"
        factory_collision_prompt_dir = factory_collision_root / "prompts"
        (factory_collision_prompt_dir / "custom").mkdir(parents=True)
        (factory_collision_prompt_dir / "custom" / "gamma-legacy.md").write_text("reserved alias content\n", encoding="utf-8")
        factory_collision_legacy_dir = workspace / "legacy-factory-collision-source"
        factory_collision_legacy_dir.mkdir()
        (factory_collision_legacy_dir / "gamma.md").write_text("legacy gamma custom content\n", encoding="utf-8")
        alias_report = sync_prompt_seed(
            seed_v2,
            prompt_dir=factory_collision_prompt_dir,
            legacy_custom_dir=factory_collision_legacy_dir,
        )
        _assert(alias_report["legacyCustomPromptsImported"] == 1, "Factory-colliding legacy content was not imported under an alias")
        alias_registry, alias_previews = _load_previews_from_fixture(factory_collision_root, factory_collision_prompt_dir)
        alias_registry_by_id = _by_id(alias_registry)
        alias_preview_by_id = _by_id(alias_previews)
        _assert("gamma" in alias_registry_by_id and "gamma-legacy-2" in alias_registry_by_id, "Factory and aliased legacy prompts must both be registered")
        _assert(alias_preview_by_id["gamma"]["content"] == "factory gamma content v2\n", "Factory prompt content was replaced by legacy content")
        _assert(alias_preview_by_id["gamma-legacy-2"]["content"] == "legacy gamma custom content\n", "Aliased legacy prompt content is not UI-readable")
        _assert(alias_registry_by_id["gamma-legacy-2"]["label"] == "gamma（旧版导入）", "Aliased legacy prompt label lost its source identity")
        alias_state = json.loads((factory_collision_prompt_dir / PROMPT_FACTORY_STATE_FILENAME).read_text(encoding="utf-8"))
        _assert(alias_state["legacyCustomPromptMappings"]["gamma"] == "gamma-legacy-2", "Factory collision mapping was not persisted")

        alias_snapshot = _snapshot_files(factory_collision_prompt_dir)
        alias_repeat_report = sync_prompt_seed(
            seed_v2,
            prompt_dir=factory_collision_prompt_dir,
            legacy_custom_dir=factory_collision_legacy_dir,
        )
        _assert(alias_repeat_report["legacyCustomPromptsImported"] == 0, "Factory-collision alias was imported twice")
        _assert(_snapshot_files(factory_collision_prompt_dir) == alias_snapshot, "Factory-collision alias migration was not idempotent")
        alias_registry_without_import = [
            item
            for item in _read_json(factory_collision_prompt_dir / "prompt-registry.json")
            if not isinstance(item, dict) or item.get("id") != "gamma-legacy-2"
        ]
        _write_json(factory_collision_prompt_dir / "prompt-registry.json", alias_registry_without_import)
        (factory_collision_prompt_dir / "custom" / "gamma-legacy-2.md").unlink()
        sync_prompt_seed(
            seed_v2,
            prompt_dir=factory_collision_prompt_dir,
            legacy_custom_dir=factory_collision_legacy_dir,
        )
        _assert("gamma-legacy-2" not in _by_id(_read_json(factory_collision_prompt_dir / "prompt-registry.json")), "Deleted collision alias was registered again")
        _assert(not (factory_collision_prompt_dir / "custom" / "gamma-legacy-2.md").exists(), "Deleted collision alias file was recreated")
        (factory_collision_legacy_dir / "gamma-legacy-2.md").write_text("distinct later legacy content\n", encoding="utf-8")
        later_alias_report = sync_prompt_seed(
            seed_v2,
            prompt_dir=factory_collision_prompt_dir,
            legacy_custom_dir=factory_collision_legacy_dir,
        )
        _assert(later_alias_report["legacyCustomPromptsImported"] == 1, "A later distinct legacy source was not imported")
        later_alias_registry = _by_id(_read_json(factory_collision_prompt_dir / "prompt-registry.json"))
        _assert("gamma-legacy-2" not in later_alias_registry, "A tombstoned target id was reused by a later source")
        _assert("gamma-legacy-2-legacy" in later_alias_registry, "A later source did not receive a collision-safe alias")
        _assert(
            (factory_collision_prompt_dir / "custom" / "gamma-legacy-2-legacy.md").read_text(encoding="utf-8") == "distinct later legacy content\n",
            "Later collision-safe alias content was not preserved",
        )
        checks.append("factory-colliding legacy prompts receive stable aliases and deletion tombstones")

        workflow_collision_seed = workspace / "workflow-collision-seed"
        shutil.copytree(seed_v2, workflow_collision_seed)
        collision_seed_workflows = _read_json(workflow_collision_seed / "prompt-workflows.json")
        collision_seed_workflows.append(
            _workflow(
                "future_flow",
                "Future factory workflow",
                "factory metadata",
                ["gamma"],
                customizable=True,
                round_limit=1,
            )
        )
        _write_json(workflow_collision_seed / "prompt-workflows.json", collision_seed_workflows)
        custom_collision_workflow = {
            "id": "future_flow",
            "label": "User workflow",
            "description": "must not become factory-owned",
            "defaultSequence": ["alpha"],
            "customizable": True,
            "sequenceLimit": 1,
            "roundLimit": 1,
            "chunkMetric": "char",
            "legacy": False,
            "visible": True,
            "userField": {"keep": True},
        }
        no_state_collision_dir = workspace / "no-state-workflow-collision"
        no_state_collision_dir.mkdir()
        _write_json(no_state_collision_dir / "prompt-workflows.json", [custom_collision_workflow])
        no_state_collision_snapshot = _snapshot_files(no_state_collision_dir)
        try:
            sync_prompt_seed(workflow_collision_seed, prompt_dir=no_state_collision_dir)
            raise AssertionError("A no-state custom/factory workflow id collision must stop the upgrade")
        except ValueError as exc:
            _assert("conflicts with a custom workflow" in str(exc), "No-state workflow collision should identify the conflict")
        _assert(_snapshot_files(no_state_collision_dir) == no_state_collision_snapshot, "No-state workflow collision mutated the prompt volume")

        workflow_collision_dir = workspace / "workflow-collision-prompts"
        sync_prompt_seed(seed_v1, prompt_dir=workflow_collision_dir)
        current_collision_workflows = _read_json(workflow_collision_dir / "prompt-workflows.json")
        current_collision_workflows.append(custom_collision_workflow)
        _write_json(workflow_collision_dir / "prompt-workflows.json", current_collision_workflows)
        collision_snapshot = _snapshot_files(workflow_collision_dir)
        try:
            sync_prompt_seed(workflow_collision_seed, prompt_dir=workflow_collision_dir)
            raise AssertionError("A custom/factory workflow id collision must stop the upgrade")
        except ValueError as exc:
            _assert("conflicts with a custom workflow" in str(exc), "Workflow collision failure should identify the conflict")
        _assert(_snapshot_files(workflow_collision_dir) == collision_snapshot, "Workflow collision failure mutated the prompt volume")
        checks.append("new factory workflows cannot replace custom workflow ids with or without prior state")

        collision_dir = workspace / "collision-prompts"
        collision_dir.mkdir()
        collision_registry = copy.deepcopy(_read_json(seed_v1 / "prompt-registry.json"))
        collision_registry[0]["builtIn"] = False
        _write_json(collision_dir / "prompt-registry.json", collision_registry)
        _write_json(collision_dir / "prompt-workflows.json", [])
        try:
            sync_prompt_seed(seed_v2, prompt_dir=collision_dir)
            raise AssertionError("A custom/factory id collision must stop the upgrade")
        except ValueError as exc:
            _assert("conflicts with a custom prompt" in str(exc), "Collision failure should identify the data conflict")
        checks.append("factory ids cannot silently replace colliding custom prompts")

        duplicate_registry_dir = workspace / "duplicate-registry-prompts"
        sync_prompt_seed(seed_v1, prompt_dir=duplicate_registry_dir)
        duplicate_registry = _read_json(duplicate_registry_dir / "prompt-registry.json")
        duplicate_registry.append(copy.deepcopy(duplicate_registry[0]))
        _write_json(duplicate_registry_dir / "prompt-registry.json", duplicate_registry)
        duplicate_registry_snapshot = _snapshot_files(duplicate_registry_dir)
        try:
            sync_prompt_seed(seed_v2, prompt_dir=duplicate_registry_dir, legacy_custom_dir=legacy_custom_dir)
            raise AssertionError("Duplicate prompt ids must stop the upgrade")
        except ValueError as exc:
            _assert("Current prompt registry contains a duplicate id" in str(exc), "Duplicate prompt failure should identify the registry")
        _assert(_snapshot_files(duplicate_registry_dir) == duplicate_registry_snapshot, "Duplicate prompt failure mutated the prompt volume")

        duplicate_workflow_dir = workspace / "duplicate-workflow-prompts"
        sync_prompt_seed(seed_v1, prompt_dir=duplicate_workflow_dir)
        duplicate_workflows = _read_json(duplicate_workflow_dir / "prompt-workflows.json")
        duplicate_workflows.append(copy.deepcopy(duplicate_workflows[0]))
        _write_json(duplicate_workflow_dir / "prompt-workflows.json", duplicate_workflows)
        duplicate_workflow_snapshot = _snapshot_files(duplicate_workflow_dir)
        try:
            sync_prompt_seed(seed_v2, prompt_dir=duplicate_workflow_dir, legacy_custom_dir=legacy_custom_dir)
            raise AssertionError("Duplicate workflow ids must stop the upgrade")
        except ValueError as exc:
            _assert("Current prompt workflow registry contains a duplicate id" in str(exc), "Duplicate workflow failure should identify the registry")
        _assert(_snapshot_files(duplicate_workflow_dir) == duplicate_workflow_snapshot, "Duplicate workflow failure mutated the prompt volume")
        checks.append("duplicate prompt and workflow ids fail before any target mutation")

    return {"ok": True, "checks": checks}


def main() -> int:
    report = run_regression()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
