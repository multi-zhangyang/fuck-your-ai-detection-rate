from __future__ import annotations

import json
from pathlib import Path

from web_app import app

ROOT_DIR = Path(__file__).resolve().parents[1]
APP_PATH = ROOT_DIR / "app" / "src" / "App.tsx"
WEB_SERVICE_PATH = ROOT_DIR / "app" / "src" / "lib" / "webService.ts"
REPORT_PATH = ROOT_DIR / "finish" / "regression" / "prompt_preview_regression_report.json"
EXPECTED_IDS = ["prewrite", "classical", "round1", "round2"]


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def run_regression() -> dict[str, object]:
    checks: list[str] = []

    with app.test_client() as client:
        response = client.get("/api/prompts")
        _assert(response.status_code == 200, f"/api/prompts should return 200, got {response.status_code}")
        payload = response.get_json()
        _assert(isinstance(payload, dict), "/api/prompts should return a JSON object")
        items = payload.get("items")
        _assert(isinstance(items, list), "/api/prompts should include an items list")
        ids = [item.get("id") for item in items if isinstance(item, dict)]
        _assert(ids == EXPECTED_IDS, f"Prompt preview ids changed unexpectedly: {ids}")
        for item in items:
            _assert(isinstance(item, dict), "Prompt preview item should be an object")
            relative_path = str(item.get("relativePath", ""))
            _assert(relative_path.startswith("prompts/"), f"Prompt path must be repo-relative: {relative_path}")
            _assert(".." not in Path(relative_path).parts, f"Prompt path must not escape prompts/: {relative_path}")
            _assert(Path(relative_path).suffix == ".md", f"Prompt path should point to a markdown file: {relative_path}")
            _assert(isinstance(item.get("content"), str) and len(item["content"]) > 100, f"Prompt content is missing for {relative_path}")
        checks.append("backend returns read-only prompt metadata and content")

        post_response = client.post("/api/prompts", json={"content": "should not be accepted"})
        _assert(post_response.status_code == 405, "Prompt preview endpoint must not accept writes")
        checks.append("backend prompt endpoint rejects write attempts")

    app_source = APP_PATH.read_text(encoding="utf-8")
    web_service_source = WEB_SERVICE_PATH.read_text(encoding="utf-8")
    _assert('"prompts"' in app_source, "WorkbenchView should include the prompt preview view")
    _assert("提示词预览" in app_source, "Sidebar should expose the prompt preview page")
    _assert("function PromptPreviewPage" in app_source, "PromptPreviewPage component is missing")
    _assert('activeView === "prompts" ? (\n              <div className="h-full min-h-0 overflow-hidden">' in app_source, "Prompt preview page must use fixed page bounds instead of page-level scrolling")
    component_source = app_source.split("function PromptPreviewPage", 1)[1].split("function HomeRunPanel", 1)[0]
    _assert("grid h-full min-h-0 gap-5 overflow-hidden" in component_source, "Prompt preview layout must keep scrolling inside panels")
    _assert('Card className="h-full min-h-0 overflow-hidden"' in component_source, "Prompt preview panels must not grow with long prompt content")
    _assert('ScrollArea className="min-h-0 flex-1' in component_source, "Prompt preview panels must use internal shadcn ScrollArea scrolling")
    _assert("<textarea" not in component_source.lower(), "Prompt preview page must not expose a textarea editor")
    _assert("<input" not in component_source.lower(), "Prompt preview page must not expose an input editor")
    _assert("页面只读展示" in component_source, "Prompt preview page should clearly communicate read-only behavior")
    _assert('timeoutMs: 8_000' in web_service_source, "Prompt preview request should have a timeout instead of spinning forever")
    _assert("loadPromptPreviewsViaReadOutput" in web_service_source, "Prompt preview should fall back to existing read-output route for old running backends")
    checks.append("frontend prompt page is read-only and discoverable")

    return {"ok": True, "checks": checks}


def main() -> int:
    report = run_regression()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
