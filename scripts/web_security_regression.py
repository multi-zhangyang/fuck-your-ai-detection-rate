from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from urllib.parse import quote, unquote

from app_config import SAVED_SECRET_PLACEHOLDER, get_app_config_path, load_app_config, save_app_config


ROOT_DIR = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT_DIR / "finish" / "regression" / "web_security_regression_report.json"


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def run_regression() -> dict[str, object]:
    checks: list[str] = []
    original_appdata = os.environ.get("APPDATA")
    original_config_dir = os.environ.get("FYADR_APP_CONFIG_DIR")
    original_max_request_bytes = os.environ.get("FYADR_MAX_REQUEST_BYTES")
    original_max_upload_bytes = os.environ.get("FYADR_MAX_UPLOAD_BYTES")
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            os.environ["APPDATA"] = temp_dir
            os.environ["FYADR_APP_CONFIG_DIR"] = str(Path(temp_dir) / "config")
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
            config_path = get_app_config_path()
            _assert(config_path.exists(), "model config should be persisted")
            if os.name != "nt":
                _assert(config_path.parent.stat().st_mode & 0o777 == 0o700, "config directory must use mode 0700")
                _assert(config_path.stat().st_mode & 0o777 == 0o600, "config file must use mode 0600")
            _assert(
                not list(config_path.parent.glob(f".{config_path.name}.*.tmp")),
                "atomic config saves must not leave temporary files behind",
            )
            checks.append("model config is atomically persisted with private permissions")

            client = app.test_client()

            allowed = client.get("/api/ping", headers={"Origin": "http://127.0.0.1:1420"})
            ping_payload = allowed.get_json()
            _assert(allowed.headers.get("Access-Control-Allow-Origin") == "http://127.0.0.1:1420", "local frontend origin should be allowed")
            _assert("X-Export-Path" in allowed.headers.get("Access-Control-Expose-Headers", ""), "export artifact path should be CORS-exposed")
            _assert("X-Export-Guard-Warning-Count" in allowed.headers.get("Access-Control-Expose-Headers", ""), "export warning counts should be CORS-exposed")
            _assert("X-Export-Format-Lock-Path" in allowed.headers.get("Access-Control-Expose-Headers", ""), "format-lock evidence should be CORS-exposed")
            _assert("X-Export-Content-Contract-Ready" in allowed.headers.get("Access-Control-Expose-Headers", ""), "content-contract evidence should be CORS-exposed")
            _assert("X-Export-Attempt-Id" in allowed.headers.get("Access-Control-Expose-Headers", ""), "immutable export attempt id should be CORS-exposed")
            _assert("X-Export-Artifact-Sha256" in allowed.headers.get("Access-Control-Expose-Headers", ""), "certified artifact hash should be CORS-exposed")
            _assert("X-Export-Evidence-Manifest-Path" in allowed.headers.get("Access-Control-Expose-Headers", ""), "evidence manifest path should be CORS-exposed")
            _assert(ping_payload["maxRewriteConcurrency"] == web_app.MAX_REWRITE_CONCURRENCY, "ping should expose the live backend concurrency ceiling")
            checks.append("local frontend origin is allowed")
            checks.append("export warning counts are CORS-exposed")
            checks.append("ping exposes live backend concurrency ceiling")

            denied = client.get("/api/ping", headers={"Origin": "http://evil.example"})
            _assert("Access-Control-Allow-Origin" not in denied.headers, "unknown origins should not receive CORS access")
            checks.append("unknown origins are not allowed")

            outside_manifest = Path(temp_dir) / "outside.evidence.json"
            outside_manifest.write_text('{"status":"passed"}', encoding="utf-8")
            original_path_read_text = Path.read_text
            outside_manifest_read = False

            def guarded_path_read_text(path_self: Path, *args, **kwargs):
                nonlocal outside_manifest_read
                if path_self.resolve() == outside_manifest.resolve():
                    outside_manifest_read = True
                    raise AssertionError("outside export manifest must not be read")
                return original_path_read_text(path_self, *args, **kwargs)

            try:
                Path.read_text = guarded_path_read_text
                web_app.scan_history_orphan_artifacts([str(outside_manifest)])
            finally:
                Path.read_text = original_path_read_text
            _assert(not outside_manifest_read, "orphan protection must ignore evidence manifests outside managed roots")
            checks.append("orphan bundle expansion cannot read arbitrary local JSON paths")

            config_response = client.get("/api/model-config")
            config_payload = config_response.get_json()
            _assert(config_payload["apiKey"] == SAVED_SECRET_PLACEHOLDER, "default API key should be redacted")
            _assert(config_payload["modelProviders"][0]["apiKey"] == SAVED_SECRET_PLACEHOLDER, "provider API key should be redacted")
            _assert("sk-secret" not in config_response.get_data(as_text=True), "raw default secret must not be present in model-config response")
            _assert("provider-secret" not in config_response.get_data(as_text=True), "raw provider secret must not be present in model-config response")
            checks.append("model config response redacts secrets")

            original_test_model_connection = web_app.test_model_connection
            observed_connections: list[dict[str, object]] = []
            try:
                def fake_test_model_connection(model_config: dict[str, object]) -> dict[str, object]:
                    observed_connections.append(dict(model_config))
                    return {"ok": True}

                web_app.test_model_connection = fake_test_model_connection
                same_destination = client.post(
                    "/api/test-connection",
                    json={
                        "baseUrl": "https://example.test/v1/",
                        "apiKey": SAVED_SECRET_PLACEHOLDER,
                        "model": "demo-model",
                    },
                )
                _assert(same_destination.status_code == 200, "saved secret should remain usable for the same normalized Base URL")
                _assert(observed_connections[-1]["apiKey"] == "sk-secret", "same-destination hydration should restore the saved key")

                saved_provider_destination = client.post(
                    "/api/test-connection",
                    json={
                        "baseUrl": "https://provider.test/v1",
                        "apiKey": SAVED_SECRET_PLACEHOLDER,
                        "model": "provider-model",
                    },
                )
                _assert(saved_provider_destination.status_code == 200, "a selected saved provider should hydrate at its own Base URL")
                _assert(observed_connections[-1]["apiKey"] == "provider-secret", "provider test must hydrate the key bound to that provider URL")

                observed_count = len(observed_connections)
                changed_destination = client.post(
                    "/api/test-connection",
                    json={
                        "baseUrl": "https://attacker.invalid/v1",
                        "apiKey": SAVED_SECRET_PLACEHOLDER,
                        "model": "demo-model",
                    },
                )
                _assert(changed_destination.status_code == 400, "saved secret reuse must be blocked when Base URL changes")
                _assert(len(observed_connections) == observed_count, "blocked secret reuse must not reach the outbound connection layer")

                omitted_secret = client.post(
                    "/api/test-connection",
                    json={"baseUrl": "https://attacker.invalid/v1", "model": "demo-model"},
                )
                _assert(omitted_secret.status_code == 400, "omitting apiKey must not bypass saved-secret destination binding")
                _assert(len(observed_connections) == observed_count, "omitted-key attack must not reach the outbound connection layer")

                explicit_new_secret = client.post(
                    "/api/test-connection",
                    json={
                        "baseUrl": "https://new-provider.example/v1",
                        "apiKey": "explicit-new-secret",
                        "model": "demo-model",
                    },
                )
                _assert(explicit_new_secret.status_code == 200, "an explicitly re-entered key should allow a new Base URL")
                _assert(observed_connections[-1]["apiKey"] == "explicit-new-secret", "new destination must receive only the explicitly supplied key")
            finally:
                web_app.test_model_connection = original_test_model_connection
            checks.append("saved API keys are bound to their configured Base URL")

            changed_saved_config = dict(config_payload)
            changed_saved_config["baseUrl"] = "https://attacker.invalid/v1"
            changed_saved_config["apiKey"] = SAVED_SECRET_PLACEHOLDER
            blocked_save = client.post("/api/model-config", json=changed_saved_config)
            _assert(blocked_save.status_code == 400, "saving a new Base URL with a placeholder key must be blocked")
            _assert(load_app_config()["baseUrl"] == "https://example.test/v1", "a blocked config save must leave the trusted endpoint unchanged")
            _assert(load_app_config()["apiKey"] == "sk-secret", "a blocked config save must leave the saved secret unchanged")
            checks.append("config saves cannot rebind a saved key to another Base URL")

            static_dir = Path(temp_dir) / "static"
            assets_dir = static_dir / "assets"
            assets_dir.mkdir(parents=True, exist_ok=True)
            (static_dir / "index.html").write_text("<!doctype html><title>FYADR production fixture</title>", encoding="utf-8")
            (static_dir / "brand-logo-32.png").write_bytes(b"\x89PNG\r\n\x1a\nfixture")
            (static_dir / "brand-logo-96.webp").write_bytes(b"RIFFfixtureWEBP")
            (assets_dir / "index-AbCd1234.js").write_text("export const ready = true;", encoding="utf-8")
            original_static_dir = web_app.WEB_STATIC_DIR
            try:
                web_app.WEB_STATIC_DIR = str(static_dir)
                root_logo = client.get("/brand-logo-32.png")
                sidebar_logo = client.get("/brand-logo-96.webp")
                hashed_asset = client.get("/assets/index-AbCd1234.js")
                missing_asset = client.get("/assets/missing.js")
                missing_root_file = client.get("/missing-logo.png")
                spa_route = client.get("/diagnostics")
            finally:
                web_app.WEB_STATIC_DIR = original_static_dir
            _assert(root_logo.status_code == 200 and root_logo.mimetype == "image/png", "root PNG asset must keep its image MIME")
            _assert(sidebar_logo.status_code == 200 and sidebar_logo.mimetype == "image/webp", "root WebP asset must keep its image MIME")
            _assert("max-age=86400" in root_logo.headers.get("Cache-Control", ""), "stable root assets should use the revalidating cache tier")
            _assert(hashed_asset.status_code == 200 and hashed_asset.mimetype in {"application/javascript", "text/javascript"}, "hashed JS must use a JavaScript MIME")
            _assert("immutable" in hashed_asset.headers.get("Cache-Control", ""), "hashed assets must retain immutable caching")
            _assert(missing_asset.status_code == 404, "missing hashed assets must return 404 instead of SPA HTML")
            _assert(missing_root_file.status_code == 404, "missing root files must return 404 instead of SPA HTML")
            _assert(spa_route.status_code == 200 and spa_route.mimetype == "text/html", "extensionless frontend routes should use the SPA fallback")
            _assert(spa_route.headers.get("Cache-Control") == "no-cache", "SPA entry HTML must revalidate")
            _assert(allowed.headers.get("Cache-Control") == "no-store", "API responses must not be cached")
            _assert(hashed_asset.headers.get("X-Content-Type-Options") == "nosniff", "static responses should disable MIME sniffing")
            checks.append("production static files keep correct MIME, 404, and cache semantics")

            original_export_round_output = web_app.export_round_output
            try:
                def fake_export_round_output(_output_path: str, export_path: str, target_format: str) -> dict[str, object]:
                    export_file = Path(export_path)
                    export_file.parent.mkdir(parents=True, exist_ok=True)
                    export_file.write_text("export body", encoding="utf-8")
                    return {
                        "path": str(export_file),
                        "format": target_format,
                        "evidenceVersion": 1,
                        "overallStatus": "passed",
                        "sourceKind": "plain_text",
                        "contentContractStatus": "not_applicable",
                        "formatLockStatus": "not_applicable",
                        "checksPerformed": ["text_export"],
                    }

                web_app.export_round_output = fake_export_round_output
                export_response = client.post(
                    "/api/export-round",
                    json={"outputPath": "finish/regression/export-source.txt", "targetFormat": "txt"},
                )
                same_stem_response = client.post(
                    "/api/export-round",
                    json={"outputPath": "finish/another/export-source.txt", "targetFormat": "txt"},
                )
                long_name = ("论文降检结果" * 40) + ".txt"
                long_name_response = client.post(
                    "/api/export-round",
                    json={"outputPath": f"finish/regression/{long_name}", "targetFormat": "txt"},
                )
                legacy_get_response = client.get("/api/export-round?outputPath=finish/regression/export-source.txt&targetFormat=txt")
            finally:
                web_app.export_round_output = original_export_round_output
            _assert(export_response.status_code == 200, "export-round should return the generated artifact")
            export_path_header = export_response.headers.get("X-Export-Path", "")
            _assert(export_path_header, "export-round should expose the generated artifact path")
            decoded_export_path = unquote(export_path_header)
            _assert(Path(decoded_export_path).name.startswith("export-source__") and decoded_export_path.endswith(".txt"), "server export storage must include an output identity digest")
            _assert("export-source.txt" in export_response.headers.get("Content-Disposition", ""), "download filename should remain friendly")
            _assert(
                same_stem_response.headers.get("X-Export-Path", "") != export_path_header,
                "same-stem outputs from different documents must not overwrite the same server artifact",
            )
            _assert(long_name_response.status_code == 200, "long Unicode output names must not exceed filesystem component limits")
            long_export_path = Path(unquote(long_name_response.headers.get("X-Export-Path", "")))
            _assert(len(long_export_path.name.encode("utf-8")) <= 255, "server export filename exceeded the filesystem byte limit")
            _assert(legacy_get_response.status_code == 200 and legacy_get_response.headers.get("Deprecation") == "true", "legacy GET export must be marked deprecated while compatibility remains")
            _assert(export_response.headers.get("X-Export-Evidence-Version") == "1", "export-round must version its evidence protocol")
            _assert(export_response.headers.get("X-Export-Overall-Status") == "passed", "successful exports must carry an explicit passed status")
            _assert(export_response.headers.get("X-Export-Source-Kind") == "plain_text", "TXT exports must identify their source kind")
            _assert(export_response.headers.get("X-Export-Content-Contract-Status") == "not_applicable", "TXT exports must not imply a DOCX content contract")
            _assert(export_response.headers.get("X-Export-Format-Lock-Status") == "not_applicable", "TXT exports must not imply a Word format lock")
            _assert(export_response.headers.get("X-Export-Checks-Performed") == "text_export", "export-round must list performed checks")
            exposed_headers = allowed.headers.get("Access-Control-Expose-Headers", "")
            _assert("X-Export-Evidence-Version" in exposed_headers, "export evidence version must be CORS-exposed")
            _assert("X-Export-Overall-Status" in exposed_headers, "export overall status must be CORS-exposed")
            _assert("X-Export-Checks-Performed" in exposed_headers, "export performed checks must be CORS-exposed")
            checks.append("export-round exposes an explicit versioned evidence protocol")

            try:
                def fake_blocked_export(_output_path: str, _export_path: str, _target_format: str) -> dict[str, object]:
                    raise web_app.ExportRoundError(
                        "DOCX export blocked",
                        {
                            "stage": "guard",
                            "label": "导出前保护",
                            "message": "DOCX export blocked",
                            "issueCount": 1,
                            "warningCount": 0,
                            "reportPath": "finish/regression/export.guard.json",
                            "samples": [{"code": "english_spacing_corruption", "message": "English spacing changed."}],
                        },
                    )

                web_app.export_round_output = fake_blocked_export
                blocked_export_response = client.get("/api/export-round?outputPath=finish/regression/export-source.txt&targetFormat=docx")
            finally:
                web_app.export_round_output = original_export_round_output
            blocked_export_payload = blocked_export_response.get_json()
            _assert(blocked_export_response.status_code == 400, "blocked DOCX exports should return a structured error")
            _assert(blocked_export_payload["code"] == "docx_export_blocked", "blocked DOCX exports should expose an error code")
            _assert(blocked_export_payload["exportFailure"]["samples"][0]["code"] == "english_spacing_corruption", "blocked DOCX exports should expose issue samples")
            checks.append("blocked DOCX exports expose structured issue samples")

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

            prompt_preview = client.get("/api/read-output?outputPath=prompts/rewrite-pass-1.md&maxChars=20")
            _assert(prompt_preview.status_code == 200, "read-output should still allow prompt previews")
            checks.append("read-output still allows prompt previews")

            # maxChars is bounded so a hostile value cannot force a giant response.
            huge_max_chars = client.get("/api/read-output?outputPath=prompts/rewrite-pass-1.md&maxChars=999999999999")
            _assert(huge_max_chars.status_code == 200, "read-output must clamp an oversized maxChars rather than error")
            huge_payload = huge_max_chars.get_json()
            _assert(huge_payload.get("truncated") is False, "clamped maxChars on a small file must not mark it truncated")
            negative_max_chars = client.get("/api/read-output?outputPath=prompts/rewrite-pass-1.md&maxChars=-5")
            _assert(negative_max_chars.status_code == 200, "read-output must tolerate a negative maxChars")
            _assert(negative_max_chars.get_json().get("truncated") is True, "negative maxChars must clamp to the minimum (1) and truncate")
            non_int_max_chars = client.get("/api/read-output?outputPath=prompts/rewrite-pass-1.md&maxChars=abc")
            _assert(non_int_max_chars.status_code == 200, "read-output must tolerate a non-integer maxChars")
            _assert(non_int_max_chars.get_json().get("truncated") is False, "non-integer maxChars must fall back to no truncation")
            checks.append("read-output clamps and tolerates hostile maxChars values")

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
        if original_config_dir is None:
            os.environ.pop("FYADR_APP_CONFIG_DIR", None)
        else:
            os.environ["FYADR_APP_CONFIG_DIR"] = original_config_dir
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
