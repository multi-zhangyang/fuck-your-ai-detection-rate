from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT_DIR / "scripts"))

from app_service import _normalize_review_decision_value, _select_review_text  # noqa: E402

REPORT_PATH = ROOT_DIR / "finish" / "regression" / "review_decisions_regression_report.json"
APP_SOURCE_PATH = ROOT_DIR / "app" / "src" / "App.tsx"


def _assert(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def run_regression() -> dict[str, Any]:
    failures: list[str] = []
    _assert(_normalize_review_decision_value("rewrite") == "rewrite", "Plain rewrite must remain an unresolved default.", failures)
    _assert(_normalize_review_decision_value("rewrite_confirmed") == "rewrite_confirmed", "Confirmed rewrite must survive backend normalization.", failures)
    _assert(_normalize_review_decision_value("source") == "source", "Legacy source must remain source for export selection.", failures)
    _assert(_normalize_review_decision_value("source_confirmed") == "source_confirmed", "Confirmed source must survive backend normalization.", failures)
    _assert(_select_review_text("original", "rewrite", "source_confirmed") == "original", "Confirmed source must export the original text.", failures)
    _assert(_select_review_text("original", "rewrite", "rewrite_confirmed") == "rewrite", "Confirmed rewrite must export the rewrite text.", failures)
    _assert(_select_review_text("original", "rewrite", "rewrite") == "rewrite", "Default rewrite must export the rewrite text.", failures)

    app_source = APP_SOURCE_PATH.read_text(encoding="utf-8") if APP_SOURCE_PATH.exists() else ""
    _assert("function normalizeReviewDecisionsForSave" in app_source, "Frontend must save review decisions with explicit-state semantics.", failures)
    _assert("return [chunkId, \"rewrite\" as ReviewDecision];" in app_source, "Saved plain rewrite must reload as unresolved.", failures)
    _assert(
        "if (decision === \"rewrite\") return [chunkId, \"rewrite_confirmed\" as ReviewDecision];" not in app_source,
        "Frontend must not promote default rewrite to confirmed on reload.",
        failures,
    )
    _assert(
        "return [[chunkId, \"rewrite_confirmed\" as ReviewDecision] as const];" in app_source,
        "Frontend must persist explicit rewrite confirmations.",
        failures,
    )

    report = {
        "ok": not failures,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "failures": failures,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> int:
    report = run_regression()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
