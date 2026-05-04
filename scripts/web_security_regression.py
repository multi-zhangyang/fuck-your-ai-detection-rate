from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from urllib.parse import quote, unquote

from app_config import SAVED_SECRET_PLACEHOLDER, save_app_config


ROOT_DIR = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT_DIR / "finish" / "regression" / "web_security_regression_report.json"


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def run_regression() -> dict[str, object]:
    checks: list[str] = []
    original_appdata = os.environ.get("APPDATA")
    original_max_request_bytes = os.environ.get("FYADR_MAX_REQUEST_BYTES")
    original_max_upload_bytes = os.environ.get("FYADR_MAX_UPLOAD_BYTES")
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            os.environ["APPDATA"] = temp_dir
            os.environ["FYADR_MAX_REQUEST_BYTES"] = "not-a-number"
            os.environ["FYADR_MAX_UPLOAD_BYTES"] = "not-a-number"
            import web_app
            from web_app import DEFAULT_MAX_REQUEST_BYTES, DEFAULT_MAX_UPLOAD_BYTES, ORIGIN_DIR, _max_upload_bytes, app

            _assert(app.config["MAX_CONTENT_LENGTH"] == DEFAULT_MAX_REQUEST_BYTES, "invalid request limit env should fall back to the default")
            _assert(_max_upload_bytes() == DEFAULT_MAX_UPLOAD_BYTES, "invalid upload limit env should fall back to the default")
            checks.append("invalid byte limit env values fall back safely")

            save_app_config(
                {
                    "baseUrl": "https://example.test/v1",
                    "apiKey": "sk-secret",
                    "model": "demo-model",
                    "apiType": "chat_completions",
                    "temperature": 0.7,
                    "promptProfile": "cn_prewrite",
                    "promptSequence": ["prewrite", "round1", "round2"],
                    "requestTimeoutSeconds": 600,
                    "maxRetries": 3,
                    "modelProviders": [
                        {
                            "id": "provider-a",
                            "name": "Provider A",
                            "enabled": True,
                            "baseUrl": "https://provider.test/v1",
                            "apiKey": "provider-secret",
                            "apiType": "chat_completions",
                        }
                    ],
                    "roundModels": {},
                }
            )

            client = app.test_client()

            allowed = client.get("/api/ping", headers={"Origin": "http://127.0.0.1:1420"})
            _assert(allowed.headers.get("Access-Control-Allow-Origin") == "http://127.0.0.1:1420", "local frontend origin should be allowed")
            _assert("X-Export-Path" in allowed.headers.get("Access-Control-Expose-Headers", ""), "export artifact path should be CORS-exposed")
            checks.append("local frontend origin is allowed")

            denied = client.get("/api/ping", headers={"Origin": "http://evil.example"})
            _assert("Access-Control-Allow-Origin" not in denied.headers, "unknown origins should not receive CORS access")
            checks.append("unknown origins are not allowed")

            config_response = client.get("/api/model-config")
            config_payload = config_response.get_json()
            _assert(config_payload["apiKey"] == SAVED_SECRET_PLACEHOLDER, "default API key should be redacted")
            _assert(config_payload["modelProviders"][0]["apiKey"] == SAVED_SECRET_PLACEHOLDER, "provider API key should be redacted")
            _assert("sk-secret" not in config_response.get_data(as_text=True), "raw default secret must not be present in model-config response")
            _assert("provider-secret" not in config_response.get_data(as_text=True), "raw provider secret must not be present in model-config response")
            checks.append("model config response redacts secrets")

            original_export_round_output = web_app.export_round_output
            try:
                def fake_export_round_output(_output_path: str, export_path: str, target_format: str) -> dict[str, object]:
                    export_file = Path(export_path)
                    export_file.parent.mkdir(parents=True, exist_ok=True)
                    export_file.write_text("export body", encoding="utf-8")
                    return {"path": str(export_file), "format": target_format}

                web_app.export_round_output = fake_export_round_output
                export_response = client.get("/api/export-round?outputPath=finish/regression/export-source.txt&targetFormat=txt")
            finally:
                web_app.export_round_output = original_export_round_output
            _assert(export_response.status_code == 200, "export-round should return the generated artifact")
            export_path_header = export_response.headers.get("X-Export-Path", "")
            _assert(export_path_header, "export-round should expose the generated artifact path")
            _assert(unquote(export_path_header).endswith("export-source.txt"), "export path header should carry the generated artifact path")
            checks.append("export-round exposes the generated artifact path")

            missing_output = ROOT_DIR / "finish" / "regression" / "missing-export-source.txt"
            missing_output.unlink(missing_ok=True)
            missing_export_response = client.get(f"/api/export-round?outputPath={quote(str(missing_output))}&targetFormat=txt")
            _assert(missing_export_response.status_code == 400, "export-round should reject missing output files")
            _assert("Output file does not exist" in missing_export_response.get_data(as_text=True), "missing output exports should return a clear error")
            checks.append("export-round rejects missing output paths clearly")

            with tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8") as handle:
                handle.write("outside workspace")
                outside_path = handle.name
            blocked = client.get(f"/api/read-output?outputPath={quote(outside_path)}")
            _assert(blocked.status_code == 400, "read-output should reject paths outside the workspace allowlist")
            checks.append("read-output rejects outside paths")

            prompt_preview = client.get("/api/read-output?outputPath=prompts/fyadr-cn-round1.md&maxChars=20")
            _assert(prompt_preview.status_code == 200, "read-output should still allow prompt previews")
            checks.append("read-output still allows prompt previews")

            ORIGIN_DIR.mkdir(parents=True, exist_ok=True)
            text_source = ORIGIN_DIR / "scope_diagnostics_security.txt"
            text_source.write_text("plain text source", encoding="utf-8")
            diagnostics_response = client.get(f"/api/document-scope-diagnostics?sourcePath={quote(str(text_source))}")
            diagnostics_payload = diagnostics_response.get_json()
            _assert(diagnostics_response.status_code == 200, "document-scope-diagnostics should allow origin sources")
            _assert(diagnostics_payload["available"] is False, "plain text sources should return unavailable diagnostics")
            _assert(diagnostics_payload["totalTextUnitCount"] == 0, "unavailable diagnostics should keep stable count fields")
            checks.append("document-scope-diagnostics returns a stable unavailable payload for non-DOCX sources")

            history_artifacts_get = client.get("/api/history-artifacts?exists=missing&limit=1")
            history_artifacts_post = client.post("/api/history-artifacts", json={"exists": "missing", "limit": 1})
            _assert(history_artifacts_get.status_code == 200, "history-artifacts should accept GET queries")
            _assert(history_artifacts_post.status_code == 200, "history-artifacts should accept POST queries for compatibility")
            checks.append("history-artifacts accepts GET and POST compatibility queries")

            with tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8", suffix=".docx") as handle:
                handle.write("outside workspace docx")
                outside_docx_path = handle.name
            blocked_diagnostics = client.get(f"/api/document-scope-diagnostics?sourcePath={quote(outside_docx_path)}")
            _assert(blocked_diagnostics.status_code == 400, "document-scope-diagnostics should reject paths outside origin")
            checks.append("document-scope-diagnostics rejects outside paths")
    finally:
        if original_appdata is None:
            os.environ.pop("APPDATA", None)
        else:
            os.environ["APPDATA"] = original_appdata
        if original_max_request_bytes is None:
            os.environ.pop("FYADR_MAX_REQUEST_BYTES", None)
        else:
            os.environ["FYADR_MAX_REQUEST_BYTES"] = original_max_request_bytes
        if original_max_upload_bytes is None:
            os.environ.pop("FYADR_MAX_UPLOAD_BYTES", None)
        else:
            os.environ["FYADR_MAX_UPLOAD_BYTES"] = original_max_upload_bytes

    return {"ok": True, "checks": checks}


def main() -> int:
    report = run_regression()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
