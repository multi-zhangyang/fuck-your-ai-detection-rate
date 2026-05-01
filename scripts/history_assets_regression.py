from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR / "scripts"))

from app_service import (  # noqa: E402
    _iter_cleanable_history_artifacts,
    delete_history_orphan_artifacts,
    scan_history_orphan_artifacts,
)
from fyadr_records import (  # noqa: E402
    RECORDS_PATH,
    delete_document,
    load_records_normalized,
    preview_delete_document,
    save_records,
)


TEST_STEM = "__fyadr_history_assets_regression__"
EXPERIMENT_RECORDS_PATH = ROOT_DIR / "finish" / "experiments" / "records.json"


def _backup(path: Path) -> bytes | None:
    return path.read_bytes() if path.exists() else None


def _restore(path: Path, payload: bytes | None) -> None:
    if payload is None:
        if path.exists():
            path.unlink()
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def _write_text(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def _write_bytes(path: Path, payload: bytes) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return path


def _rel(path: Path) -> str:
    return str(path.relative_to(ROOT_DIR)).replace("\\", "/")


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _append_record(doc_id: str, source_path: Path, output_path: Path) -> None:
    records = load_records_normalized()
    records[doc_id] = {
        "origin_path": _rel(source_path),
        "rounds": [
            {
                "round": 1,
                "prompt": "prompts/fyadr-cn-round1.md",
                "prompt_profile": "cn_prewrite",
                "input_path": _rel(source_path),
                "output_path": _rel(output_path),
                "manifest_path": _rel(output_path.with_name(f"{output_path.stem}_manifest.json")),
                "compare_path": _rel(output_path.with_name(f"{output_path.stem}_compare.json")),
                "quality_path": _rel(output_path.with_name(f"{output_path.stem}_quality.json")),
                "timestamp": "2026-01-01T00:00:00Z",
            }
        ],
    }
    save_records(records)


def _create_round_files(source_name: str) -> tuple[str, Path, Path, list[Path]]:
    source_path = _write_text(ROOT_DIR / "origin" / source_name, "source")
    output_path = _write_text(ROOT_DIR / "finish" / "intermediate" / f"{Path(source_name).stem}_round1.txt", "output")
    paths = [
        source_path,
        output_path,
        _write_text(output_path.with_name(f"{output_path.stem}_manifest.json"), "{}"),
        _write_text(output_path.with_name(f"{output_path.stem}_compare.json"), "{}"),
        _write_text(output_path.with_name(f"{output_path.stem}_quality.json"), "{}"),
        _write_text(ROOT_DIR / "finish" / "web_exports" / f"{output_path.stem}.docx", "docx-copy"),
        _write_text(ROOT_DIR / "finish" / "web_exports" / f"{output_path.stem}.audit.json", "{}"),
    ]
    doc_id = _rel(source_path)
    _append_record(doc_id, source_path, output_path)
    return doc_id, source_path, output_path, paths


def _path_in_files(files: list[dict[str, Any]], path: Path) -> bool:
    normalized = str(path.resolve())
    return any(str(item.get("path", "")) == normalized for item in files)


def run_regression() -> dict[str, Any]:
    records_backup = _backup(RECORDS_PATH)
    experiments_backup = _backup(EXPERIMENT_RECORDS_PATH)
    created_paths: list[Path] = []
    checks: list[str] = []

    try:
        doc_id, source_path, output_path, paths = _create_round_files(f"{TEST_STEM}.txt")
        created_paths.extend(paths)
        impact = preview_delete_document(doc_id, mode="records_artifacts_and_source")
        _assert(impact["fileStats"]["sources"] == 1, "full cleanup preview must include project source copy")
        _assert(impact["fileStats"]["exports"] >= 1, "full cleanup preview must include project exports")
        _assert(impact["fileStats"]["intermediate"] >= 1, "full cleanup preview must include intermediate artifacts")
        result = delete_document(doc_id, mode="records_artifacts_and_source")
        _assert(result["deletedFileStats"]["sources"] == 1, "full cleanup result must report deleted source copy")
        _assert(result.get("failedFiles") == [], "successful full cleanup must return an empty failed file list")
        _assert(not source_path.exists(), "full cleanup must delete source copy under origin")
        _assert(not output_path.exists(), "full cleanup must delete intermediate output")
        checks.append("full cleanup deletes only project-owned source and generated files")

        records_only_doc_id, records_only_source, records_only_output, records_only_paths = _create_round_files(f"{TEST_STEM}_records_only.txt")
        created_paths.extend(records_only_paths)
        records_only_impact = preview_delete_document(records_only_doc_id, mode="records_only")
        _assert(records_only_impact["fileStats"]["existing"] == 0, "records-only preview must not schedule file deletion")
        records_only_result = delete_document(records_only_doc_id, mode="records_only")
        _assert(records_only_result["deletedFileStats"]["existing"] == 0, "records-only result must report zero deleted files")
        _assert(records_only_result.get("failedFiles") == [], "records-only result must return an empty failed file list")
        _assert(records_only_source.exists(), "records-only must retain source")
        _assert(records_only_output.exists(), "records-only must retain generated output")
        checks.append("records-only leaves files for later orphan governance")

        active_source = _write_text(ROOT_DIR / "origin" / f"{TEST_STEM}_active.txt", "active")
        created_paths.append(active_source)
        protected_scan = scan_history_orphan_artifacts([str(active_source)])
        _assert(not _path_in_files(protected_scan["orphanFiles"], active_source), "active source must be protected from orphan scan")
        unprotected_scan = scan_history_orphan_artifacts([])
        _assert(_path_in_files(unprotected_scan["orphanFiles"], active_source), "unreferenced source copy must be visible as orphan")
        protect_everything_else = [
            str(path)
            for path in _iter_cleanable_history_artifacts()
            if path.resolve() != active_source.resolve()
        ]
        delete_history_orphan_artifacts(protect_everything_else)
        _assert(not active_source.exists(), "orphan cleanup must delete only the unprotected source copy")
        checks.append("orphan cleanup respects active-path protection")

        report_path = _write_bytes(ROOT_DIR / "finish" / "detection_reports" / f"{TEST_STEM}_report.pdf", b"%PDF-test")
        created_paths.append(report_path)
        experiment_records = []
        if EXPERIMENT_RECORDS_PATH.exists():
            try:
                loaded = json.loads(EXPERIMENT_RECORDS_PATH.read_text(encoding="utf-8"))
                experiment_records = loaded if isinstance(loaded, list) else []
            except json.JSONDecodeError:
                experiment_records = []
        experiment_records.append({
            "id": TEST_STEM,
            "docId": "origin/example.txt",
            "sourcePath": "origin/example.txt",
            "outputPath": "",
            "reportPath": str(report_path),
        })
        EXPERIMENT_RECORDS_PATH.parent.mkdir(parents=True, exist_ok=True)
        EXPERIMENT_RECORDS_PATH.write_text(json.dumps(experiment_records, ensure_ascii=False, indent=2), encoding="utf-8")
        report_scan = scan_history_orphan_artifacts([])
        _assert(not _path_in_files(report_scan["orphanFiles"], report_path), "experiment report path must be protected")
        checks.append("experiment records protect attached detection reports")

    finally:
        _restore(RECORDS_PATH, records_backup)
        _restore(EXPERIMENT_RECORDS_PATH, experiments_backup)
        for path in sorted(set(created_paths), key=lambda item: len(str(item)), reverse=True):
            try:
                if path.exists() and path.is_file():
                    path.unlink()
            except OSError:
                pass

    return {"ok": True, "checks": checks}


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    report = run_regression()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
