from __future__ import annotations

from pathlib import Path

from open_source_audit import ROOT_DIR, run_audit


def main() -> int:
    probe_path = ROOT_DIR / ".open_source_audit_probe.env"
    report_path = ROOT_DIR / "finish" / "regression" / "open_source_audit_probe_report.json"
    key_name = "FYADR_" + "API_" + "KEY"
    url_name = "FYADR_" + "BASE_" + "URL"
    url_value = "https://" + "private-provider.invalid" + "/v1"
    local_doc = "C:" + r"\Users\Somebody\Desktop\paper.docx"
    probe_path.write_text(
        "\n".join(
            [
                f'{key_name}="abcdefghijklmnopqrstuvwxyz123456"',
                f"{url_name}={url_value}",
                f"LOCAL_DOC={local_doc}",
            ]
        ),
        encoding="utf-8",
    )
    try:
        report = run_audit(report_path)
    finally:
        probe_path.unlink(missing_ok=True)

    error_codes = {str(item.get("code", "")) for item in report.get("errors", []) if isinstance(item, dict)}
    expected_codes = {"secret.assignment", "secret.provider_url", "path.windows_absolute"}
    missing_codes = sorted(expected_codes - error_codes)
    if missing_codes:
        raise AssertionError(f"open-source audit did not catch expected private data leaks: {missing_codes}")
    print("open-source audit regression passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
