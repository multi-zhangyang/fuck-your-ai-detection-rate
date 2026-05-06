from __future__ import annotations

import json
from pathlib import Path

from web_app import app
from prompt_library import PROMPT_REGISTRY_PATH, PROMPT_WORKFLOW_REGISTRY_PATH, get_max_rounds, get_prompt_id_for_round, get_prompt_mapping

ROOT_DIR = Path(__file__).resolve().parents[1]
APP_PATH = ROOT_DIR / "app" / "src" / "App.tsx"
WEB_SERVICE_PATH = ROOT_DIR / "app" / "src" / "lib" / "webService.ts"
HISTORY_CARD_PATH = ROOT_DIR / "app" / "src" / "components" / "HistoryCard.tsx"
REPORT_PATH = ROOT_DIR / "finish" / "regression" / "prompt_preview_regression_report.json"
EXPECTED_IDS = ["prewrite", "classical", "round1", "round2"]
EXPECTED_LABELS = ["润色改写", "经典改写", "规范改写", "专家改写"]


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def run_regression() -> dict[str, object]:
    checks: list[str] = []
    registry_backup = PROMPT_REGISTRY_PATH.read_bytes() if PROMPT_REGISTRY_PATH.exists() else None
    workflow_backup = PROMPT_WORKFLOW_REGISTRY_PATH.read_bytes() if PROMPT_WORKFLOW_REGISTRY_PATH.exists() else None
    cleanup_paths: list[Path] = []

    try:
      with app.test_client() as client:
        response = client.get("/api/prompts")
        _assert(response.status_code == 200, f"/api/prompts should return 200, got {response.status_code}")
        payload = response.get_json()
        _assert(isinstance(payload, dict), "/api/prompts should return a JSON object")
        items = payload.get("items")
        workflows = payload.get("workflows")
        _assert(isinstance(items, list), "/api/prompts should include an items list")
        _assert(isinstance(workflows, list), "/api/prompts should include a workflow list")
        workflow_ids = [item.get("id") for item in workflows if isinstance(item, dict)]
        _assert(workflow_ids == ["cn", "cn_prewrite", "cn_custom"], f"Prompt workflow ids changed unexpectedly: {workflow_ids}")
        custom_workflow = next((item for item in workflows if isinstance(item, dict) and item.get("id") == "cn_custom"), None)
        _assert(isinstance(custom_workflow, dict) and custom_workflow.get("customizable") is True, "Custom workflow must stay editable")
        _assert(custom_workflow.get("defaultSequence") == ["prewrite", "round1", "round2"], "Custom workflow default sequence changed unexpectedly")
        _assert(custom_workflow.get("sequenceLimit") == 3, "Custom workflow selected sequence limit changed unexpectedly")
        _assert(custom_workflow.get("roundLimit") == 12, "Custom workflow must allow manual continuation after the selected sequence")
        custom_mapping = get_prompt_mapping("cn_custom", ["prewrite", "round1", "round2"])
        _assert(get_max_rounds("cn_custom", ["prewrite", "round1", "round2"]) == 12, "Custom workflow should expose continuation rounds")
        _assert(custom_mapping[3] == custom_mapping[4] == custom_mapping[12], "Continuation rounds should reuse the last selected prompt")
        _assert(get_prompt_id_for_round("cn_custom", 4, ["prewrite", "round1", "round2"]) == "round2", "Round 4 should continue with the expert rewrite prompt")
        ids = [item.get("id") for item in items if isinstance(item, dict)]
        _assert(ids[: len(EXPECTED_IDS)] == EXPECTED_IDS, f"Built-in prompt preview ids changed unexpectedly: {ids}")
        labels = [item.get("label") for item in items if isinstance(item, dict)]
        _assert(labels[: len(EXPECTED_LABELS)] == EXPECTED_LABELS, f"Built-in prompt labels changed unexpectedly: {labels}")
        for item in items:
            _assert(isinstance(item, dict), "Prompt preview item should be an object")
            relative_path = str(item.get("relativePath", ""))
            _assert(relative_path.startswith("prompts/"), f"Prompt path must be repo-relative: {relative_path}")
            _assert("fyadr-cn" not in relative_path, f"Prompt path should use user-facing file names: {relative_path}")
            _assert(".." not in Path(relative_path).parts, f"Prompt path must not escape prompts/: {relative_path}")
            _assert(Path(relative_path).suffix == ".md", f"Prompt path should point to a markdown file: {relative_path}")
            _assert(isinstance(item.get("content"), str) and len(item["content"]) > 100, f"Prompt content is missing for {relative_path}")
            _assert(item.get("editable") is True, f"Prompt should be editable: {relative_path}")
            if item.get("builtIn"):
                _assert(item.get("defaultAvailable") is True, f"Built-in prompt should expose default restore: {relative_path}")
        checks.append("backend returns editable prompt metadata and content")

        post_response = client.post("/api/prompts", json={"content": ""})
        _assert(post_response.status_code == 400, "Prompt create endpoint must validate empty content")
        put_response = client.put("/api/prompts/prewrite", json={"content": ""})
        _assert(put_response.status_code == 400, "Prompt update endpoint must validate empty content")
        meta_response = client.patch("/api/prompts/prewrite/meta", json={"label": "x" * 81})
        _assert(meta_response.status_code == 400, "Prompt metadata endpoint must validate labels")
        backups_response = client.get("/api/prompts/prewrite/backups")
        _assert(backups_response.status_code == 200, "Prompt backups endpoint should return 200")
        backups_payload = backups_response.get_json()
        _assert(isinstance(backups_payload, dict) and isinstance(backups_payload.get("items"), list), "Prompt backups should return an items list")
        restore_backup_response = client.post("/api/prompts/prewrite/restore-backup", json={"relativePath": "finish/prompt_backups/missing.md"})
        _assert(restore_backup_response.status_code == 400, "Prompt backup restore must reject invalid paths")
        restore_default_response = client.post("/api/prompts/not-found/restore-default")
        _assert(restore_default_response.status_code == 400, "Prompt default restore must reject unknown prompts")
        checks.append("backend prompt write, metadata, default, and backup endpoints validate input")

        delete_builtin_response = client.delete("/api/prompts/prewrite")
        _assert(delete_builtin_response.status_code == 400, "Prompt delete endpoint must reject built-in prompts")
        create_response = client.post(
            "/api/prompts",
            json={"label": "crud-regression", "description": "delete test", "content": "CRUD regression prompt\n\n[输入文本]\n{text}"},
        )
        _assert(create_response.status_code == 201, "Prompt create endpoint should create custom prompts")
        created_item = create_response.get_json().get("item", {})
        created_id = created_item.get("id")
        created_path = ROOT_DIR / str(created_item.get("relativePath", ""))
        cleanup_paths.append(created_path)
        delete_response = client.delete(f"/api/prompts/{created_id}")
        _assert(delete_response.status_code == 200, "Prompt delete endpoint should delete custom prompts")
        delete_payload = delete_response.get_json()
        backup_path = delete_payload.get("backupPath")
        if backup_path:
            cleanup_paths.append(ROOT_DIR / str(backup_path))
        _assert(delete_payload.get("deletedId") == created_id, "Prompt delete endpoint should return the deleted id")
        _assert(all(item.get("id") != created_id for item in delete_payload.get("items", [])), "Deleted prompt must be removed from prompt previews")
        _assert(not created_path.exists(), "Deleted custom prompt file must be removed")
        checks.append("backend custom prompt CRUD includes safe delete")

        legacy_workflow_response = client.patch("/api/prompt-workflows/cn", json={"label": "x"})
        _assert(legacy_workflow_response.status_code == 400, "Legacy workflows must stay read-only")
        invalid_workflow_response = client.patch("/api/prompt-workflows/cn_custom", json={"defaultSequence": ["missing"]})
        _assert(invalid_workflow_response.status_code == 400, "Workflow update must reject unsupported prompt ids")
        workflow_response = client.patch(
            "/api/prompt-workflows/cn_custom",
            json={
                "label": "回归流程",
                "description": "workflow regression",
                "defaultSequence": ["round1", "round2"],
                "sequenceLimit": 2,
            },
        )
        _assert(workflow_response.status_code == 200, "Workflow update endpoint should save editable workflows")
        workflow_payload = workflow_response.get_json()
        updated_workflow = next((item for item in workflow_payload.get("workflows", []) if isinstance(item, dict) and item.get("id") == "cn_custom"), None)
        _assert(isinstance(updated_workflow, dict), "Workflow update should return the saved workflow list")
        _assert(updated_workflow.get("label") == "回归流程", "Workflow update should persist labels")
        _assert(updated_workflow.get("defaultSequence") == ["round1", "round2"], "Workflow update should persist default sequence")
        _assert(updated_workflow.get("roundLimit") == 12, "Workflow update should preserve manual continuation limit")
        checks.append("backend prompt workflow update validates and persists editable flows")
    finally:
        if registry_backup is None:
            PROMPT_REGISTRY_PATH.unlink(missing_ok=True)
        else:
            PROMPT_REGISTRY_PATH.write_bytes(registry_backup)
        if workflow_backup is None:
            PROMPT_WORKFLOW_REGISTRY_PATH.unlink(missing_ok=True)
        else:
            PROMPT_WORKFLOW_REGISTRY_PATH.write_bytes(workflow_backup)
        for path in cleanup_paths:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass

    app_source = APP_PATH.read_text(encoding="utf-8")
    web_service_source = WEB_SERVICE_PATH.read_text(encoding="utf-8")
    history_card_source = HISTORY_CARD_PATH.read_text(encoding="utf-8")
    _assert('"prompts"' in app_source, "WorkbenchView should include the prompt preview view")
    _assert("{ view: \"prompts\", label: \"提示词\"" in app_source, "Sidebar should expose the prompt workspace")
    _assert("function PromptPreviewPage" in app_source, "PromptPreviewPage component is missing")
    _assert('activeView === "prompts" ? (\n              <div className="h-full min-h-0 overflow-hidden">' in app_source, "Prompt preview page must use fixed page bounds instead of page-level scrolling")
    component_source = app_source.split("function PromptPreviewPage", 1)[1].split("function HomeRunPanel", 1)[0]
    _assert("grid h-full min-h-0 gap-5 overflow-hidden" in component_source, "Prompt preview layout must keep scrolling inside panels")
    _assert('Card className="h-full min-h-0 overflow-hidden"' in component_source, "Prompt preview panels must not grow with long prompt content")
    _assert("Textarea" in component_source, "Prompt workspace must expose a shadcn Textarea editor")
    _assert("onSavePrompt" in component_source, "Prompt workspace must expose save flow")
    _assert("onRestoreDefaultPrompt" in component_source, "Prompt workspace must expose default restore flow")
    _assert("onCreatePrompt" in component_source, "Prompt workspace must expose create flow")
    _assert("onDeletePrompt" in component_source, "Prompt workspace must expose custom prompt delete flow")
    _assert("保存内容" not in component_source, "Prompt workspace must not split content save into a duplicate button")
    _assert("保存信息" not in component_source, "Prompt workspace must not split metadata save into a duplicate button")
    _assert("选择备份" not in component_source and "restoreSelectedBackup" not in component_source, "Prompt workspace must not expose backup clutter in the main UI")
    _assert("页面只读展示" not in component_source, "Prompt preview page should not reintroduce verbose read-only helper copy")
    _assert('timeoutMs: 8_000' in web_service_source, "Prompt preview request should have a timeout instead of spinning forever")
    _assert("loadPromptPreviewsViaReadOutput" in web_service_source, "Prompt preview should fall back to existing read-output route for old running backends")
    _assert("DEFAULT_PROMPT_OPTIONS" in web_service_source, "Prompt preview fallback should reuse the centralized frontend prompt registry")
    _assert("DEFAULT_PROMPT_WORKFLOWS" in web_service_source, "Prompt preview fallback should reuse the centralized workflow registry")
    _assert("deletePrompt(promptId: string)" in web_service_source, "Prompt CRUD should wire custom prompt deletion through the web service")
    _assert("/api/prompt-workflows/" in web_service_source, "Prompt workflow editing should use the backend workflow endpoint")
    _assert('promptProfile !== "cn_custom"' not in app_source, "Frontend should not hard-code custom workflow matching")
    _assert('promptProfile === "cn_custom"' not in app_source, "Frontend should not hard-code custom workflow matching")
    _assert("normalizeActiveModelConfig(loadedConfig, loadedPromptOptions, loadedPromptWorkflows)" in app_source, "Model config bootstrap should normalize against backend prompt workflows")
    _assert("setPromptPreviews(loadedPrompts)" in app_source, "Prompt registry should load during bootstrap instead of only inside the prompt page")
    _assert("getDefaultPromptProfile(promptWorkflows)" in app_source, "Frontend should derive editable prompt profile from backend workflows")
    _assert("onPromptProfileChange(editablePromptProfile)" in app_source, "Workflow editor should switch to the backend-selected editable profile")
    _assert("getLatestHistoryRound(\n        matchedItem,\n        config.promptProfile" in app_source and "promptOptions,\n        promptWorkflows" in app_source, "History snapshot lookup should use backend prompt options and workflows")
    _assert("sequenceLengthOptions.map" in app_source, "Workflow length controls should be generated from workflow metadata")
    _assert("isPromptSequenceCustomizable(promptProfile)" not in history_card_source, "History cleanup should not decide workflow customizability from static defaults")
    _assert("getRoundsForProfile(item.rounds, promptProfile, promptSequence, promptOptions, promptWorkflows)" in history_card_source, "History list should match rounds with backend prompt metadata")
    checks.append("frontend prompt workspace is editable and workflow-aware")

    return {"ok": True, "checks": checks}


def main() -> int:
    report = run_regression()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
