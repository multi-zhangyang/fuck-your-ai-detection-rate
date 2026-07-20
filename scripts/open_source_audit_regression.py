from __future__ import annotations


from open_source_audit import (
    ROOT_DIR,
    _gitignore_patterns,
    _is_allowed_local_artifact,
    _is_under_skipped_dir,
    run_audit,
)


def main() -> int:
    private_runtime_config = ROOT_DIR / "data" / "config" / "config.json"
    if not _is_under_skipped_dir(private_runtime_config):
        raise AssertionError("Docker runtime data/config is being scanned as repository source")
    if "data/" not in _gitignore_patterns():
        raise AssertionError("Docker runtime data directory is not protected by .gitignore")
    for asset_path in (
        "app/public/brand-logo-32.png",
        "app/public/brand-logo-96.webp",
        "assets-source/brand/brand-logo-original-1024.png",
    ):
        if not _is_allowed_local_artifact(asset_path):
            raise AssertionError(f"project brand asset was misclassified as a local artifact: {asset_path}")
    probe_path = ROOT_DIR / ".open_source_audit_probe.env"
    report_path = ROOT_DIR / "finish" / "regression" / "open_source_audit_probe_report.json"
    key_name = "FYADR_" + "API_" + "KEY"
    url_name = "FYADR_" + "BASE_" + "URL"
    url_value = "https://" + "private-provider.invalid" + "/v1"
    local_doc = "C:" + r"\Users\Somebody\Desktop\paper.docx"
    root_home_doc = "/" + "root/fyadr/private-paper.docx"
    probe_path.write_text(
        "\n".join(
            [
                f'{key_name}="abcdefghijklmnopqrstuvwxyz123456"',
                f"{url_name}={url_value}",
                f"LOCAL_DOC={local_doc}",
                f"ROOT_HOME_DOC={root_home_doc}",
            ]
        ),
        encoding="utf-8",
    )
    try:
        report = run_audit(report_path)
    finally:
        probe_path.unlink(missing_ok=True)

    error_codes = {str(item.get("code", "")) for item in report.get("errors", []) if isinstance(item, dict)}
    expected_codes = {"secret.assignment", "secret.provider_url", "path.windows_absolute", "path.user_home"}
    missing_codes = sorted(expected_codes - error_codes)
    if missing_codes:
        raise AssertionError(f"open-source audit did not catch expected private data leaks: {missing_codes}")
    leaked_runtime_paths = sorted(
        str(item.get("path", ""))
        for item in report.get("errors", [])
        if isinstance(item, dict) and str(item.get("path", "")).startswith("data/")
    )
    if leaked_runtime_paths:
        raise AssertionError(f"private Docker runtime data was classified as repository source: {leaked_runtime_paths}")
    for item in report.get("errors", []):
        if isinstance(item, dict) and item.get("code") in expected_codes and not str(item.get("action", "")).strip():
            raise AssertionError(f"open-source audit issue lacks action guidance: {item.get('code')}")
    next_action_codes = {str(item.get("code", "")) for item in report.get("nextActions", []) if isinstance(item, dict)}
    missing_action_codes = sorted(expected_codes - next_action_codes)
    if missing_action_codes:
        raise AssertionError(f"open-source audit did not summarize next actions: {missing_action_codes}")
    summary = report.get("summary", {})
    if not isinstance(summary, dict) or summary.get("readyForPublicRelease") is not False:
        raise AssertionError("open-source audit summary must block public release when errors exist")
    print("open-source audit regression passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
