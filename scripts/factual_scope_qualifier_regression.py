from __future__ import annotations

import copy
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT_DIR / "scripts"))

import app_service  # noqa: E402
from chunking import Chunk  # noqa: E402
from factual_guards import (  # noqa: E402
    FACTUAL_SCOPE_QUALIFIER_CHANGED,
    build_factual_relation_guard,
    build_factual_scope_repair_guard,
)
import fyadr_round_service as service  # noqa: E402


REPORT_PATH = ROOT_DIR / "finish" / "regression" / "factual_scope_qualifier_regression_report.json"
SOURCE = "系统采用模块化设计，对外留出接口函数，供后续组件调用。"
V12_CANDIDATE = "系统采用模块化设计，对外仅留接口函数，供后续组件调用。"
SAFE_SOURCE = "系统仅向审核通过的模块开放接口函数，并记录每次调用的状态。"
SAFE_REWRITE = "系统仅向审核通过的模块开放接口函数，同时记录每次调用状态。"
ORDINARY_SOURCE = "系统对外留出接口函数，便于后续模块调用。"
ORDINARY_REWRITE = "系统向外部保留接口函数，方便后续组件调用。"


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _evaluate(source: str, output: str, *, origin: str = "model") -> dict[str, object]:
    profile = service.build_global_style_profile_from_texts([source])
    return service._evaluate_rewrite_candidate(
        input_text=source,
        output_text=output,
        candidate_id="baseline" if origin == "baseline" else "model-attempt-1",
        origin=origin,
        attempt=0 if origin == "baseline" else 1,
        hard_valid=True,
        round_dimension={"id": "neutral", "primaryMetric": ""},
        global_style_profile=profile,
    )


def _assert_candidate_selector_chain(checks: list[str]) -> dict[str, object]:
    candidate = _evaluate(SOURCE, V12_CANDIDATE)
    codes = list(candidate.get("factualIssueCodes") or [])
    reasons = list(candidate.get("rejectionReasonCodes") or [])
    _assert(candidate.get("factualGuardPassed") is False, "v12 candidate passed the factual guard")
    _assert(candidate.get("safetyEligible") is False, "v12 candidate remained safety eligible")
    _assert(FACTUAL_SCOPE_QUALIFIER_CHANGED in codes, "v12 candidate lost its stable factual issue code")
    _assert("factual_relation_guard_failed" in reasons, "v12 candidate lost its selector rejection reason")

    public_candidate = service._public_candidate_evidence(candidate)
    _assert(
        FACTUAL_SCOPE_QUALIFIER_CHANGED in list(public_candidate.get("factualIssueCodes") or []),
        "public candidate evidence dropped the scope issue code",
    )
    _assert("_text" not in public_candidate and "outputText" not in public_candidate, "public evidence leaked body text")

    safe_candidate = _evaluate(SAFE_SOURCE, SAFE_REWRITE)
    _assert(safe_candidate.get("factualGuardPassed") is True, "same qualifier preservation was rejected")
    _assert(safe_candidate.get("safetyEligible") is True, "safe same-qualifier rewrite was not eligible")
    ordinary_candidate = _evaluate(ORDINARY_SOURCE, ORDINARY_REWRITE)
    _assert(ordinary_candidate.get("factualGuardPassed") is True, "ordinary lexical rewrite was rejected")
    _assert(ordinary_candidate.get("safetyEligible") is True, "ordinary lexical rewrite was not eligible")
    checks.append("candidate selector rejects v12 scope insertion and admits safe controls")
    return candidate


def _assert_text_free_failed_attempt_chain(checks: list[str]) -> None:
    prompts: list[str] = []

    def transform(_text: str, prompt: str, _round: int, _chunk_id: str) -> str:
        prompts.append(prompt)
        return V12_CANDIDATE

    result = service._rewrite_round_chunk(
        index=0,
        chunk=Chunk("p0_c0", 0, 0, SOURCE, len(SOURCE), 0),
        round_number=1,
        normalized_prompt_profile="cn_custom",
        prompt_text="保持事实范围并做轻量自然化。",
        transform=transform,
        global_style_profile=service.build_global_style_profile_from_texts([SOURCE]),
        round_dimension={"id": "neutral", "primaryMetric": ""},
    )
    events = list(result.validation_events)
    _assert(result.output_text == SOURCE, "unsafe v12 candidates did not preserve the exact source fallback")
    fallback_events = [event for event in events if event.get("event") == "source-fallback"]
    _assert(
        len(fallback_events) == 1
        and fallback_events[0].get("reasonCode") == service.HARD_VALIDATION_EXHAUSTED_SOURCE_PRESERVED,
        "unsafe v12 candidates lost the explicit source-fallback event",
    )

    retries = [event for event in events if event.get("event") == "validation-retry"]
    _assert(len(retries) == service.MAX_TOTAL_MODEL_ATTEMPTS, "scope failure did not consume the bounded attempts")
    for event in retries:
        _assert(event.get("guardCategory") == "factual", "scope failure used the wrong guard category")
        _assert(
            FACTUAL_SCOPE_QUALIFIER_CHANGED in list(event.get("issueCodes") or []),
            "text-free failed attempt dropped the stable scope code",
        )
        serialized = json.dumps(event, ensure_ascii=False, sort_keys=True)
        _assert(SOURCE not in serialized and V12_CANDIDATE not in serialized, "failed attempt retained body text")
        _assert("error" not in event and "preview" not in event, "failed attempt retained raw diagnostic prose")
    _assert(len(prompts) == service.MAX_TOTAL_MODEL_ATTEMPTS, "bounded retry prompt count drifted")
    _assert("scope qualifier" in prompts[-1], "retry prompt did not carry the scope-specific repair constraint")
    _assert(
        "Source protected scope-qualifier count: 0" in prompts[0],
        "first-attempt relation lock omitted the zero-qualifier inventory",
    )
    _assert(
        "Output protected scope-qualifier count must also be 0" in prompts[-1]
        and "仅、只、只有" in prompts[-1]
        and "only, solely, all" in prompts[-1],
        "scope retry did not turn the zero inventory into an executable bilingual constraint",
    )
    _assert(
        "Newly introduced operator token(s) to remove: 仅" in prompts[-1],
        "scope retry did not identify the concrete operator introduced by the rejected candidate",
    )
    _assert(
        "[FINAL SAFE RECOVERY]" in prompts[-1]
        and "reproduce [INPUT TEXT] verbatim" in prompts[-1],
        "hard-validation exhaustion did not receive an explicit source-copy recovery instruction",
    )
    checks.append("bounded retry emits factual, text-free scope evidence without failed prose")


def _assert_scope_inventory_contract(checks: list[str]) -> None:
    zero_inventory = build_factual_relation_guard(SOURCE)
    _assert(
        "Source protected scope-qualifier count: 0" in zero_inventory,
        "zero-qualifier source lost its explicit relation-lock inventory",
    )
    protected_inventory = build_factual_relation_guard(SAFE_SOURCE)
    _assert(
        "Source protected scope-qualifier count: 1" in protected_inventory
        and "exclusive_restriction=1" in protected_inventory,
        "protected qualifier inventory lost its class/count binding",
    )
    repair = build_factual_scope_repair_guard(SOURCE, V12_CANDIDATE)
    _assert(
        "Newly introduced operator token(s) to remove: 仅" in repair
        and "Source protected qualifier count: 0" in repair,
        "prompt-only retry diff lost the concrete scope operator delta",
    )
    checks.append("relation lock binds zero and nonzero scope-qualifier inventories")


def _assert_stale_compare_release_fails_closed(checks: list[str]) -> list[str]:
    global_profile = service.build_global_style_profile_from_texts([SOURCE])
    baseline = service._evaluate_rewrite_candidate(
        input_text=SOURCE,
        output_text=SOURCE,
        candidate_id="baseline",
        origin="baseline",
        attempt=0,
        hard_valid=True,
        round_dimension={"id": "neutral", "primaryMetric": ""},
        global_style_profile=global_profile,
    )
    stale_candidate = service._evaluate_rewrite_candidate(
        input_text=SOURCE,
        output_text=V12_CANDIDATE,
        candidate_id="model-attempt-1",
        origin="model",
        attempt=1,
        hard_valid=True,
        round_dimension={"id": "neutral", "primaryMetric": ""},
        global_style_profile=global_profile,
    )
    forged_stale_candidate = copy.deepcopy(stale_candidate)
    forged_stale_candidate["factualGuardPassed"] = True
    forged_stale_candidate["factualIssueCodes"] = []
    forged_stale_candidate["safetyEligible"] = True
    forged_stale_candidate["rejectionReasonCodes"] = []
    selection = service._build_candidate_selection_event(
        chunk_id="p0_c0",
        round_number=1,
        candidates=[baseline, forged_stale_candidate],
        selected=forged_stale_candidate,
        reason_codes=["hard_and_factual_guards_passed", "combined_style_penalty_improved"],
        conditional_retry_count=0,
    )
    document_profile = global_profile["documentPatternBaseline"]
    compare_payload = {
        "version": 3,
        "round": 1,
        "chunks": [
            {
                "chunkId": "p0_c0",
                "paragraphIndex": 0,
                "chunkIndex": 0,
                "inputText": SOURCE,
                "outputText": V12_CANDIDATE,
                "candidateBaselineText": SOURCE,
                "candidateSelection": selection,
            }
        ],
        "sourcePatternProfiles": {
            str(document_profile["profileSha256"]): document_profile,
        },
        "sourceRelativeDocumentDelta": service.assess_source_relative_document_delta(
            [SOURCE],
            [V12_CANDIDATE],
        ),
    }
    try:
        app_service._assert_document_release_payload(compare_payload, {"p0_c0": "rewrite_confirmed"})
    except app_service.DocumentReleaseGateError as exc:
        issue_codes = list(exc.issue_codes)
        _assert("hard_validation_failed" in issue_codes, f"stale compare failed for the wrong reason: {issue_codes}")
        serialized = json.dumps(exc.details, ensure_ascii=False, sort_keys=True)
        _assert(SOURCE not in serialized and V12_CANDIDATE not in serialized, "release error leaked body text")
    else:
        raise AssertionError("stale v12 positive evidence bypassed the current release gate")
    checks.append("synthetic stale v12 compare is freshly revalidated and blocked at release")
    return issue_codes


def main() -> int:
    checks: list[str] = []
    candidate = _assert_candidate_selector_chain(checks)
    _assert_scope_inventory_contract(checks)
    _assert_text_free_failed_attempt_chain(checks)
    release_issue_codes = _assert_stale_compare_release_fails_closed(checks)
    report = {
        "ok": True,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "reportPath": str(REPORT_PATH),
        "checks": checks,
        "candidate": {
            "factualGuardPassed": candidate.get("factualGuardPassed"),
            "safetyEligible": candidate.get("safetyEligible"),
            "factualIssueCodes": list(candidate.get("factualIssueCodes") or []),
            "rejectionReasonCodes": list(candidate.get("rejectionReasonCodes") or []),
        },
        "releaseIssueCodes": release_issue_codes,
        "storesInputText": False,
        "storesOutputText": False,
        "storesFailedCandidateText": False,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
