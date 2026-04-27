from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from pypdf import PdfReader


SPEEDAI_PROVIDER = "speedai"
PAPERPASS_PROVIDER = "paperpass"
UNKNOWN_PROVIDER = "unknown"

SPEEDAI_SUMMARY_START = "片段汇总列表"
SPEEDAI_ORIGINAL_START = "原文内容"
SPEEDAI_SEGMENT_HEADERS = {"片段汇总列表", "序号", "段落内容", "AI生成概率", "风险等级"}
SPEEDAI_RISK_LEVELS = {"高风险", "中风险", "低风险", "无风险"}

PAPERPASS_SCOPE_NOTE = "PaperPass 免费版通常仅检测中文正文；摘要、标题、英文、过短片段等可能不计入，未命中不代表安全。"


def parse_detection_report_pdf(path: str | Path, provider_hint: str | None = None) -> dict[str, Any]:
    pdf_path = Path(path).resolve()
    reader = PdfReader(str(pdf_path))
    page_texts = [page.extract_text() or "" for page in reader.pages]
    full_text = "\n".join(page_texts)
    detected_provider = _detect_provider(full_text, pdf_path)
    provider = _normalize_provider_hint(provider_hint) or detected_provider

    if provider == PAPERPASS_PROVIDER:
        summary = _parse_paperpass_summary(full_text)
        segments = _parse_paperpass_segments(reader)
    else:
        summary = _parse_speedai_summary(full_text)
        segments = _parse_speedai_segments(full_text)
        provider = SPEEDAI_PROVIDER if segments or "SpeedAI" in full_text else provider

    if not segments and detected_provider != provider and detected_provider in {PAPERPASS_PROVIDER, SPEEDAI_PROVIDER}:
        provider = detected_provider
        if provider == PAPERPASS_PROVIDER:
            summary = _parse_paperpass_summary(full_text)
            segments = _parse_paperpass_segments(reader)
        else:
            summary = _parse_speedai_summary(full_text)
            segments = _parse_speedai_segments(full_text)

    return {
        "provider": provider,
        "providerLabel": _provider_label(provider),
        "sourcePath": str(pdf_path),
        "pageCount": len(reader.pages),
        "summary": summary,
        "segments": segments,
    }


def _normalize_provider_hint(value: str | None) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {PAPERPASS_PROVIDER, SPEEDAI_PROVIDER}:
        return normalized
    return ""


def _detect_provider(text: str, path: Path) -> str:
    name = path.name.lower()
    if "paperpass" in text.lower() or "paperpass" in name:
        return PAPERPASS_PROVIDER
    if "speedai" in text.lower() or "片段汇总列表" in text:
        return SPEEDAI_PROVIDER
    return UNKNOWN_PROVIDER


def _provider_label(provider: str) -> str:
    if provider == PAPERPASS_PROVIDER:
        return "PaperPass"
    if provider == SPEEDAI_PROVIDER:
        return "SpeedAI"
    return "未知报告"


def _empty_buckets() -> dict[str, dict[str, float | int] | None]:
    return {"high": None, "medium": None, "low": None, "none": None}


def _parse_speedai_summary(text: str) -> dict[str, Any]:
    return {
        "title": _extract_string(text, r"标题：(.+)"),
        "author": _extract_string(text, r"作者：(.+)"),
        "reportId": _extract_string(text, r"检测编号：(.+)"),
        "checkedAt": _extract_string(text, r"检测时间：(.+)"),
        "model": _extract_string(text, r"检测模型：(.+)"),
        "totalWords": _extract_int(text, r"总字数：(\d+)"),
        "overallRiskProbability": _extract_float(text, r"疑似AIGC风险概率：([\d.]+)%"),
        "weightedOverallRiskProbability": None,
        "segmentCount": None,
        "checkedScopeNotes": [],
        "riskBuckets": {
            "high": _extract_bucket(text, r"高风险文本（≥90%）：(\d+)字，占比([\d.]+)%"),
            "medium": _extract_bucket(text, r"中风险文本（70-90%）：(\d+)字，占比([\d.]+)%"),
            "low": _extract_bucket(text, r"低风险文本（50-70%）：(\d+)字，占比([\d.]+)%"),
            "none": _extract_bucket(text, r"无风险文本（<50%）：(\d+)字，占比([\d.]+)%"),
        },
    }


def _parse_speedai_segments(text: str) -> list[dict[str, Any]]:
    start = text.find(SPEEDAI_SUMMARY_START)
    if start < 0:
        return []
    end = text.find(SPEEDAI_ORIGINAL_START, start)
    table_text = text[start : end if end >= 0 else len(text)]
    lines = [line.strip() for line in table_text.splitlines() if line.strip()]
    lines = [line for line in lines if line not in SPEEDAI_SEGMENT_HEADERS]

    segments: list[dict[str, Any]] = []
    index = 0
    while index < len(lines):
        if not re.fullmatch(r"\d+", lines[index]):
            index += 1
            continue

        segment_index = int(lines[index])
        index += 1
        content_lines: list[str] = []
        while index < len(lines) and not re.fullmatch(r"\d+(?:\.\d+)?%", lines[index]):
            content_lines.append(lines[index])
            index += 1
        if index >= len(lines):
            break

        probability = float(lines[index].rstrip("%"))
        index += 1
        risk_level = lines[index] if index < len(lines) and lines[index] in SPEEDAI_RISK_LEVELS else ""
        if risk_level:
            index += 1

        content = _normalize_segment_content(" ".join(content_lines))
        if content:
            segments.append(
                {
                    "index": segment_index,
                    "content": content,
                    "matchText": _build_match_text(content),
                    "probability": probability,
                    "riskLevel": risk_level,
                    "charCount": len(content),
                    "sourceProvider": SPEEDAI_PROVIDER,
                }
            )

    return segments


def _parse_paperpass_summary(text: str) -> dict[str, Any]:
    overall_values = [float(value) for value in re.findall(r"AIGC总体疑似度\(高\+中\+轻\):\s*([\d.]+)%", text)]
    high_percentage = _extract_float(text, r"高度疑似AIGC占全文比：\s*([\d.]+)%")
    medium_percentage = _extract_float(text, r"中度疑似AIGC占全文比：\s*([\d.]+)%")
    low_percentage = _extract_float(text, r"轻度疑似AIGC占全文比：\s*([\d.]+)%")
    unchecked_percentage = _extract_float(text, r"不予检测文字占比：\s*([\d.]+)%")
    return {
        "title": _extract_string(text, r"论文题目：(.+)"),
        "author": _extract_string(text, r"论文作者：(.+)"),
        "reportId": _extract_string(text, r"报告编号：(.+)"),
        "checkedAt": _extract_string(text, r"提交时间：(.+)"),
        "model": _extract_string(text, r"检测版本：(.+)"),
        "totalWords": _extract_int(text, r"论文字数：(\d+)"),
        "overallRiskProbability": overall_values[0] if overall_values else None,
        "weightedOverallRiskProbability": overall_values[1] if len(overall_values) > 1 else None,
        "segmentCount": _extract_int(text, r"片段个数：(\d+)"),
        "checkedScopeNotes": [PAPERPASS_SCOPE_NOTE],
        "riskBuckets": {
            "high": _percentage_bucket(high_percentage),
            "medium": _percentage_bucket(medium_percentage),
            "low": _percentage_bucket(low_percentage),
            "none": _percentage_bucket(None if unchecked_percentage is None else max(0.0, 100 - high_percentage_or_zero(high_percentage) - high_percentage_or_zero(medium_percentage) - high_percentage_or_zero(low_percentage) - unchecked_percentage)),
            "unchecked": _percentage_bucket(unchecked_percentage),
        },
    }


def high_percentage_or_zero(value: float | None) -> float:
    return float(value) if value is not None else 0.0


def _parse_paperpass_segments(reader: PdfReader) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    segment_index = 1
    for page_number, page in enumerate(reader.pages, start=1):
        items = _extract_pdf_text_items(page)
        markers = _extract_paperpass_markers(items)
        if not markers:
            continue
        lines = _group_pdf_lines(items)
        markers.sort(key=lambda item: item["y"], reverse=True)
        for marker_offset, marker in enumerate(markers):
            next_y = markers[marker_offset + 1]["y"] if marker_offset + 1 < len(markers) else 35.0
            top_y = float(marker["y"]) - 1.0
            bottom_y = float(next_y) + 6.0
            content_lines = [
                line["text"]
                for line in lines
                if bottom_y < float(line["y"]) < top_y and not _is_pdf_noise_line(str(line["text"]))
            ]
            content = _normalize_segment_content(" ".join(content_lines))
            if len(content) < 30:
                content = _fallback_paperpass_segment_content(lines, float(marker["y"]))
            if not content:
                continue
            probability = float(marker["probability"])
            segments.append(
                {
                    "index": segment_index,
                    "content": content,
                    "matchText": _build_match_text(content),
                    "probability": probability,
                    "riskLevel": _paperpass_risk_level(probability),
                    "charCount": len(content),
                    "page": page_number,
                    "markerY": round(float(marker["y"]), 2),
                    "sourceProvider": PAPERPASS_PROVIDER,
                }
            )
            segment_index += 1
    return segments


def _extract_pdf_text_items(page: Any) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    def visitor(text: str, _cm: Any, tm: Any, _font_dict: Any, font_size: float) -> None:
        clean = " ".join(str(text or "").split())
        if not clean:
            return
        try:
            x = float(tm[4])
            y = float(tm[5])
        except Exception:
            return
        items.append({"text": clean, "x": x, "y": y, "fontSize": float(font_size or 0)})

    page.extract_text(visitor_text=visitor)
    return items


def _extract_paperpass_markers(items: list[dict[str, Any]]) -> list[dict[str, float]]:
    markers: list[dict[str, float]] = []
    ai_items = [item for item in items if str(item["text"]).strip().upper() == "AI"]
    for item in items:
        text = str(item["text"]).strip()
        if not re.fullmatch(r"\d{1,3}%", text):
            continue
        y = float(item["y"])
        x = float(item["x"])
        has_ai_label = any(abs(float(ai["y"]) - y) <= 1.5 and 3 <= x - float(ai["x"]) <= 30 for ai in ai_items)
        if not has_ai_label:
            continue
        markers.append({"probability": float(text.rstrip("%")), "x": x, "y": y})
    return _dedupe_markers(markers)


def _dedupe_markers(markers: list[dict[str, float]]) -> list[dict[str, float]]:
    deduped: list[dict[str, float]] = []
    for marker in sorted(markers, key=lambda item: (-item["y"], item["x"], item["probability"])):
        if any(abs(marker["y"] - existing["y"]) <= 1.0 and abs(marker["x"] - existing["x"]) <= 1.0 for existing in deduped):
            continue
        deduped.append(marker)
    return deduped


def _group_pdf_lines(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    body_items = [
        item
        for item in items
        if not _is_marker_item(item)
        and not _is_pdf_noise_line(str(item["text"]))
        and 30 <= float(item["y"]) <= 790
    ]
    rows: list[dict[str, Any]] = []
    for item in sorted(body_items, key=lambda value: (-float(value["y"]), float(value["x"]))):
        row = next((candidate for candidate in rows if abs(float(candidate["y"]) - float(item["y"])) <= 2.2), None)
        if row is None:
            rows.append({"y": float(item["y"]), "items": [item]})
        else:
            row["items"].append(item)
            row["y"] = (float(row["y"]) + float(item["y"])) / 2
    lines: list[dict[str, Any]] = []
    for row in rows:
        fragments = [str(item["text"]) for item in sorted(row["items"], key=lambda value: float(value["x"]))]
        line = _join_pdf_fragments(fragments)
        if line and not _is_pdf_noise_line(line):
            lines.append({"y": row["y"], "text": line})
    return lines


def _join_pdf_fragments(fragments: list[str]) -> str:
    output = ""
    for fragment in fragments:
        fragment = fragment.strip()
        if not fragment:
            continue
        if not output:
            output = fragment
            continue
        if _needs_ascii_space(output[-1], fragment[0]):
            output += " " + fragment
        else:
            output += fragment
    return re.sub(r"\s+", " ", output).strip()


def _needs_ascii_space(left: str, right: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9]", left) and re.fullmatch(r"[A-Za-z0-9]", right))


def _is_marker_item(item: dict[str, Any]) -> bool:
    text = str(item["text"]).strip()
    return text.upper() == "AI" or bool(re.fullmatch(r"\d{1,3}%", text))


def _is_pdf_noise_line(text: str) -> bool:
    clean = " ".join(str(text or "").split())
    if not clean:
        return True
    if re.fullmatch(r"AIGC检测\(\d+/\d+\)", clean):
        return True
    if re.fullmatch(r"ID:[A-Z0-9]+\s+www\.paperpass\.com", clean):
        return True
    if re.fullmatch(r"\d{1,3}", clean):
        return True
    return False


def _fallback_paperpass_segment_content(lines: list[dict[str, Any]], marker_y: float) -> str:
    nearby = [
        line["text"]
        for line in lines
        if marker_y - 140 <= float(line["y"]) < marker_y - 1 and not _is_pdf_noise_line(str(line["text"]))
    ]
    return _normalize_segment_content(" ".join(nearby))


def _paperpass_risk_level(probability: float) -> str:
    if probability >= 70:
        return "高风险"
    if probability >= 60:
        return "中风险"
    if probability >= 50:
        return "低风险"
    return "无风险"


def _extract_string(text: str, pattern: str) -> str:
    match = re.search(pattern, text)
    return match.group(1).strip() if match and match.lastindex else ""


def _extract_int(text: str, pattern: str) -> int | None:
    match = re.search(pattern, text)
    return int(match.group(1)) if match and match.lastindex else None


def _extract_float(text: str, pattern: str) -> float | None:
    match = re.search(pattern, text)
    if not match:
        return None
    for group in match.groups():
        if group:
            return float(group)
    return None


def _extract_bucket(text: str, pattern: str) -> dict[str, float | int] | None:
    match = re.search(pattern, text)
    if not match:
        return None
    return {"words": int(match.group(1)), "percentage": float(match.group(2))}


def _percentage_bucket(value: float | None) -> dict[str, float | int] | None:
    if value is None:
        return None
    return {"words": 0, "percentage": float(value)}


def _normalize_segment_content(text: str) -> str:
    normalized = re.sub(r"\s+", " ", str(text or "")).strip()
    normalized = normalized.replace("\u00ad", "")
    normalized = re.sub(r"(?<=[A-Za-z])- (?=[A-Za-z])", "-", normalized)
    normalized = re.sub(r"(?<=[A-Za-z])\s*-\s*(?=[A-Za-z])", "-", normalized)
    normalized = re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])", "", normalized)
    normalized = normalized.replace("Bi-LS TM", "Bi-LSTM")
    normalized = normalized.replace("Bi - LSTM", "Bi-LSTM").replace("Bi- LSTM", "Bi-LSTM").replace("Bi -LSTM", "Bi-LSTM")
    normalized = normalized.replace("Str eamlit", "Streamlit")
    normalized = normalized.replace("Stream lit", "Streamlit")
    normalized = normalized.replace("BERT4 Rec", "BERT4Rec")
    normalized = normalized.replace("XG Boost", "XGBoost")
    normalized = normalized.replace("F1 - Score", "F1-Score")
    normalized = normalized.replace("Random Forest", "Random Forest")
    normalized = re.sub(r"(?<=[A-Za-z])\s+(?=[，。；：、！？）】])", "", normalized)
    normalized = re.sub(r"\s+([，。；：、！？）】])", r"\1", normalized)
    normalized = re.sub(r"([（【])\s+", r"\1", normalized)
    return normalized


def _build_match_text(text: str) -> str:
    normalized = _normalize_segment_content(text).lower()
    normalized = normalized.replace("bi-ls tm", "bi-lstm")
    normalized = normalized.replace("bi - lstm", "bi-lstm")
    normalized = normalized.replace("str eamlit", "streamlit")
    normalized = normalized.replace("stream lit", "streamlit")
    normalized = re.sub(r"\s+", "", normalized)
    normalized = re.sub(r"[，。！？；：、,.!?;:'\"“”‘’()\[\]{}<>《》\-—_\\/|`~@#$%^&*+=]", "", normalized)
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", normalized)


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse AI detection PDF report into structured JSON.")
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    payload = parse_detection_report_pdf(args.pdf)
    output_text = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output_text, encoding="utf-8")
    else:
        print(output_text)


if __name__ == "__main__":
    main()
