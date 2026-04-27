from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from llm_client import extract_response_text, strip_reasoning_blocks  # noqa: E402

DEFAULT_REPORT_PATH = ROOT_DIR / "finish" / "regression" / "llm_client_regression_report.json"


def _assert_equal(name: str, actual: str, expected: str, failures: list[str]) -> None:
    if actual != expected:
        failures.append(f"{name}: expected {expected!r}, got {actual!r}")


def run_regression(report_path: Path) -> dict[str, Any]:
    failures: list[str] = []
    checks: list[dict[str, Any]] = []

    cases = [
        (
            "chat_think_tag",
            {
                "choices": [
                    {
                        "message": {
                            "content": "<think>private chain {\"fake\": true}</think>\n{\"ok\": true}",
                        }
                    }
                ]
            },
            "chat_completions",
            "{\"ok\": true}",
        ),
        (
            "chat_unclosed_think_prefix",
            {
                "choices": [
                    {
                        "message": {
                            "content": "<think>private chain with braces { bad }\n{\"version\": 1}",
                        }
                    }
                ]
            },
            "chat_completions",
            "{\"version\": 1}",
        ),
        (
            "responses_reasoning_part",
            {
                "output": [
                    {"type": "reasoning", "content": [{"type": "text", "text": "private reasoning"}]},
                    {"type": "message", "content": [{"type": "output_text", "text": "{\"styles\": {}}"}]},
                ]
            },
            "responses",
            "{\"styles\": {}}",
        ),
        (
            "responses_output_text_think",
            {
                "output_text": "<think>private</think>\nfinal",
            },
            "responses",
            "final",
        ),
    ]

    for name, payload, api_type, expected in cases:
        actual = extract_response_text(payload, json.dumps(payload), api_type)
        checks.append({"name": name, "actual": actual, "expected": expected})
        _assert_equal(name, actual, expected, failures)

    stripped = strip_reasoning_blocks("<|begin_of_thought|>secret<|end_of_thought|>\nanswer")
    checks.append({"name": "thought_tokens", "actual": stripped, "expected": "answer"})
    _assert_equal("thought_tokens", stripped, "answer", failures)

    report = {
        "ok": not failures,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "reportPath": str(report_path.resolve()),
        "failures": failures,
        "checks": checks,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    report = run_regression(DEFAULT_REPORT_PATH)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
