from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from detection_matching import build_detection_matches


ROOT_DIR = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT_DIR / "finish" / "regression" / "detection_matching_regression_report.json"


def make_report(segments: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "provider": "paperpass",
        "providerLabel": "PaperPass",
        "sourcePath": "fixture.pdf",
        "pageCount": 1,
        "summary": {
            "title": "",
            "author": "",
            "reportId": "",
            "checkedAt": "",
            "model": "",
            "totalWords": None,
            "overallRiskProbability": 35,
            "weightedOverallRiskProbability": None,
            "segmentCount": len(segments),
            "checkedScopeNotes": [],
            "riskBuckets": {"high": None, "medium": None, "low": None, "none": None},
        },
        "segments": segments,
    }


def make_segment(index: int, content: str, probability: float = 70) -> dict[str, Any]:
    return {
        "index": index,
        "content": content,
        "matchText": content,
        "probability": probability,
        "riskLevel": "high" if probability >= 70 else "medium",
        "charCount": len(content),
        "sourceProvider": "paperpass",
    }


def make_compare(chunks: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "version": 1,
        "docId": "fixture-doc",
        "round": 2,
        "promptProfile": "cn_prewrite",
        "inputPath": "",
        "outputPath": "",
        "manifestPath": "",
        "paragraphCount": len(chunks),
        "chunkCount": len(chunks),
        "chunks": chunks,
    }


def make_chunk(chunk_id: str, paragraph_index: int, output_text: str, input_text: str | None = None) -> dict[str, Any]:
    return {
        "chunkId": chunk_id,
        "paragraphIndex": paragraph_index,
        "chunkIndex": 0,
        "inputText": input_text if input_text is not None else output_text,
        "outputText": output_text,
    }


def assert_condition(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def run_regression() -> dict[str, Any]:
    failures: list[str] = []

    tobacco_segment = (
        "The tobacco leaf disease detector combines image segmentation masks with YOLOv8 predictions, "
        "and the final evaluation reports mAP50, recall, and inference latency for field images."
    )
    tobacco_compare = make_compare(
        [
            make_chunk("p1_c0", 1, "This paragraph discusses e-commerce purchase intent and user behavior sequences."),
            make_chunk(
                "p2_c0",
                2,
                "The tobacco leaf disease detector combines image segmentation masks with YOLOv8 predictions. "
                "The evaluation reports mAP50, recall, and inference latency for field images.",
            ),
        ]
    )
    direct_matches = build_detection_matches(make_report([make_segment(1, tobacco_segment, 86)]), tobacco_compare)
    assert_condition(
        any(match["chunkId"] == "p2_c0" and match["confidence"] == "strong" for match in direct_matches),
        "cross-domain technical segment should strongly match the tobacco chunk",
        failures,
    )

    rice_chunk_one = "Rice blast monitoring uses drone orthophotos, canopy color indexes, and field plot identifiers to locate suspicious disease regions."
    rice_chunk_two = "The pipeline then compares segmentation masks against manual labels and reports Dice, IoU, and false alarm counts for each plot."
    rice_segment = f"{rice_chunk_one} {rice_chunk_two}"
    multi_chunk_matches = build_detection_matches(
        make_report([make_segment(2, rice_segment, 72)]),
        make_compare(
            [
                make_chunk("p3_c0", 3, rice_chunk_one),
                make_chunk("p4_c0", 4, rice_chunk_two),
                make_chunk("p5_c0", 5, "This unrelated section explains Word export margins, table borders, and heading styles."),
            ]
        ),
    )
    strong_ids = {match["chunkId"] for match in multi_chunk_matches if match["confidence"] == "strong"}
    assert_condition({"p3_c0", "p4_c0"}.issubset(strong_ids), "one long report segment should identify adjacent covered chunks", failures)
    assert_condition("p5_c0" not in strong_ids, "adjacent coverage must not pull an unrelated chunk into strong matches", failures)

    legal_segment = "行政复议案件筛查模块会抽取处罚依据、送达日期、听证程序瑕疵和行政机关编码，并统计撤销率、平均审理天数与逾期风险。"
    legal_matches = build_detection_matches(
        make_report([make_segment(20, legal_segment, 82)]),
        make_compare(
            [
                make_chunk("legal_noise", 20, "行政管理系统会记录送达日期和机关编码，并统计处理数量，主要用于日常办公。"),
                make_chunk(
                    "legal_target",
                    21,
                    "行政复议案件筛查模块从处罚依据、送达日期、听证程序瑕疵以及行政机关编码中生成结构化特征，"
                    "最终统计撤销率、平均审理天数和逾期风险。",
                ),
            ]
        ),
    )
    assert_condition(
        any(match["chunkId"] == "legal_target" and match["confidence"] == "strong" for match in legal_matches),
        "Chinese legal-domain paraphrase should strongly match by dynamic rare anchors",
        failures,
    )
    assert_condition(
        not any(match["chunkId"] == "legal_noise" and match["confidence"] == "strong" for match in legal_matches),
        "generic Chinese administrative overlap must not become a strong match",
        failures,
    )

    medical_segment = (
        "The neonatal sepsis warning workflow fuses C-reactive protein trends, blood culture timestamps, "
        "and SOFA-derived organ scores; evaluation lists AUROC, calibration slope, and alert lead time."
    )
    medical_matches = build_detection_matches(
        make_report([make_segment(21, medical_segment, 84)]),
        make_compare(
            [
                make_chunk(
                    "medical_noise",
                    22,
                    "The warning workflow reports AUROC and response latency for routine dashboard alerts without sepsis indicators.",
                ),
                make_chunk(
                    "medical_target",
                    23,
                    "The neonatal sepsis warning workflow integrates blood-culture timestamps, C reactive protein trend curves, "
                    "and SOFA organ score features before reporting AUROC, calibration slope, and alert lead-time across ICU stays.",
                ),
            ]
        ),
    )
    assert_condition(
        any(match["chunkId"] == "medical_target" and match["confidence"] == "strong" for match in medical_matches),
        "medical paraphrase should strongly match without fixed sample-domain anchors",
        failures,
    )
    assert_condition(
        not any(match["chunkId"] == "medical_noise" and match["confidence"] == "strong" for match in medical_matches),
        "shared generic metrics must not promote the medical distractor to strong",
        failures,
    )

    ocr_split_segment = (
        "The report highlights XG Boost scoring, SH AP explanations, and F1 - Score drift "
        "in the v8 adapter calibration notes."
    )
    ocr_split_matches = build_detection_matches(
        make_report([make_segment(22, ocr_split_segment, 81)]),
        make_compare(
            [
                make_chunk(
                    "ocr_noise",
                    24,
                    "The AI system section mentions scoring explanations and adapter calibration in general terms.",
                ),
                make_chunk(
                    "ocr_target",
                    25,
                    "The report highlights XGBoost scoring, SHAP explanations, and F1-Score drift "
                    "in the v8 adapter calibration notes.",
                ),
            ]
        ),
    )
    ocr_target = next((match for match in ocr_split_matches if match["chunkId"] == "ocr_target"), None)
    ocr_anchors = set((ocr_target or {}).get("evidence", {}).get("matchedAnchors", []))
    assert_condition(
        bool(ocr_target) and ocr_target["confidence"] == "strong",
        "OCR-spaced technical tokens should still strongly match compact chunk text",
        failures,
    )
    assert_condition(
        {"xgboost", "shap", "f1score"}.issubset(ocr_anchors),
        "OCR-spaced technical tokens should be promoted into dynamic anchors",
        failures,
    )
    assert_condition(
        not any(match["chunkId"] == "ocr_noise" and match["confidence"] == "strong" for match in ocr_split_matches),
        "generic short acronym overlap must not promote the OCR distractor to strong",
        failures,
    )

    generic_matches = build_detection_matches(
        make_report([make_segment(3, "The method has certain value and needs further analysis.", 75)]),
        make_compare([make_chunk("p6_c0", 6, "The method has value.")]),
    )
    assert_condition(
        not any(match["confidence"] == "strong" for match in generic_matches),
        "short generic contained text must not become a strong match",
        failures,
    )

    low_risk_matches = build_detection_matches(
        make_report([make_segment(4, tobacco_segment, 45)]),
        tobacco_compare,
    )
    assert_condition(low_risk_matches == [], "low-risk report segments should not trigger rerun matches", failures)

    distractor_chunks = [
        make_chunk(
            f"noise_{index}",
            index,
            f"Unrelated appendix paragraph {index} covers table formatting, export paths, and manual proofreading notes.",
        )
        for index in range(210)
    ]
    late_match_chunk = make_chunk(
        "late_match",
        211,
        (
            "The campus energy prediction module fuses weather station records, holiday calendars, and smart meter "
            "readings before reporting MAPE, RMSE, and peak-load error for each building."
        ),
    )
    large_matches = build_detection_matches(
        make_report([make_segment(5, late_match_chunk["outputText"], 88)]),
        make_compare([*distractor_chunks, late_match_chunk]),
    )
    assert_condition(
        any(match["chunkId"] == "late_match" and match["confidence"] == "strong" for match in large_matches),
        "indexed recall should find a late matching chunk among many distractors",
        failures,
    )
    assert_condition(
        not any(str(match["chunkId"]).startswith("noise_") and match["confidence"] == "strong" for match in large_matches),
        "indexed recall must not promote large-set distractors to strong matches",
        failures,
    )

    report = {
        "ok": not failures,
        "reportPath": str(REPORT_PATH),
        "failures": failures,
        "cases": {
            "directMatchCount": len(direct_matches),
            "multiChunkStrongCount": len(strong_ids),
            "legalMatchCount": len(legal_matches),
            "medicalMatchCount": len(medical_matches),
            "ocrSplitMatchCount": len(ocr_split_matches),
            "genericStrongCount": sum(1 for match in generic_matches if match["confidence"] == "strong"),
            "lowRiskMatchCount": len(low_risk_matches),
            "largeDistractorMatchCount": len(large_matches),
        },
    }
    return report


def main() -> int:
    report = run_regression()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
