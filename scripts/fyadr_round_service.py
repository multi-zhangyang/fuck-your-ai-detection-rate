from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Callable, NamedTuple

from ai_json import extract_json_payload
from fyadr_records import ROOT_DIR, update_round
from chunking import ChunkManifest, DEFAULT_CHUNK_LIMIT, build_manifest, restore_text_from_chunks, save_manifest
from factual_guards import build_factual_relation_guard, validate_factual_relation_stability


PROMPT_LIBRARY = {
    "prewrite": "prompts/fyadr-cn-prewrite.md",
    "classical": "prompts/fyadr-cn-classical.md",
    "round1": "prompts/fyadr-cn-round1.md",
    "round2": "prompts/fyadr-cn-round2.md",
}

DEFAULT_PROMPT_SEQUENCES = {
    "cn": ["round1", "round2"],
    "cn_prewrite": ["prewrite", "round1", "round2"],
    "cn_custom": ["prewrite", "round1", "round2"],
}

PROMPT_PROFILES = {
    profile: {
        index + 1: PROMPT_LIBRARY[prompt_id]
        for index, prompt_id in enumerate(sequence)
    }
    for profile, sequence in DEFAULT_PROMPT_SEQUENCES.items()
}

PROMPT_PROFILE_CHUNK_METRICS = {
    "cn": "char",
    "cn_prewrite": "char",
    "cn_custom": "char",
}

MAX_ROUNDS = max(len(sequence) for sequence in DEFAULT_PROMPT_SEQUENCES.values())


Transform = Callable[[str, str, int, str], str]
ProgressCallback = Callable[[dict[str, object]], None]
CancelCheck = Callable[[], bool]
ROUND_CHECKPOINT_VERSION = 3
ROUND_COMPARE_VERSION = 2
MAX_VALIDATION_ATTEMPTS = 2
MAX_REJECTED_CANDIDATE_CHARS = 12000
STRUCTURED_REWRITE_TEXT_KEYS = (
    "rewrittenText",
    "rewritten_text",
    "outputText",
    "output_text",
    "text",
    "content",
    "answer",
    "final",
    "result",
    "rewrite",
)
LATIN_WORD_RE = re.compile(r"[A-Za-z]+(?:[-'][A-Za-z]+)*")
LATIN_CHAR_RE = re.compile(r"[A-Za-z]")
CJK_CHAR_RE = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF]")
ASCII_WORD_CHAR_RE = re.compile(r"[A-Za-z0-9]")
PARAGRAPH_BREAK_RE = re.compile(r"\n\s*\n")
LEADING_MARKUP_RE = re.compile(r"^[>\-\*\s#]+")
LEADING_STRUCTURE_RE = re.compile(
    r"^(?P<marker>"
    r"(?:\u7b2c[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u96f60-9]+[\u7ae0\u8282])"
    r"|(?:[0-9]+(?:\.[0-9]+){1,4})(?=\s)"
    r"|(?:[0-9]+[.．、])"
    r"|(?:[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+[.．、])"
    r"|(?:[0-9]+)(?=\s)"
    r"|(?:\([0-9\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+\))"
    r"|(?:[0-9]+[)\uff09])"
    r"|(?:[\uff08(][\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+[\uff09)])"
    r")\s*"
)
NUMERIC_CITATION_RE = re.compile(r"\[(?:\d+|\d+[-\u2013\u2014]\d+)(?:[,\uff0c;\uff1b]\s*(?:\d+|\d+[-\u2013\u2014]\d+))*\]")
_AUTHOR_TOKEN = r"(?:[\u4e00-\u9fff]{2,12}\s*(?:\u7b49)?(?:\u548c[\u4e00-\u9fff]{2,12})?|[A-Z][A-Za-z]+(?:\s+(?:&|and)\s+[A-Z][A-Za-z]+|\s+et\s+al\.)?)"
_AUTHOR_YEAR_SEGMENT = rf"(?:{_AUTHOR_TOKEN}\s*[,\uff0c]\s*\d{{4}}[a-z]?(?:\s*[,\uff0c]\s*\d{{4}}[a-z]?)*)"
AUTHOR_YEAR_CITATION_RE = re.compile(rf"[\uff08(]{_AUTHOR_YEAR_SEGMENT}(?:\s*[;\uff1b]\s*{_AUTHOR_YEAR_SEGMENT})*[\uff09)]")
UNIT_PATTERN = r"(?:%|\uff05|cm|mm|m|km|kg|g|mg|\u03bcg|ug|L|mL|ml|s|min|h|d|\u2103|\u00b0C|K|Pa|kPa|MPa|Hz|kHz|MHz|GHz|px|dpi)"
NUMERIC_WITH_UNIT_RE = re.compile(rf"(?<![\d.])\d+(?:\.\d+)?\s*{UNIT_PATTERN}(?![A-Za-z0-9.])")
NUMERIC_RANGE_WITH_UNIT_RE = re.compile(rf"(?<![\d.])\d+(?:\.\d+)?\s*(?:-|\u2013|\u2014|~|\uff5e|\u81f3)\s*\d+(?:\.\d+)?\s*{UNIT_PATTERN}(?![A-Za-z0-9.])")
NUMBER_TOKEN_RE = re.compile(r"(?<![A-Za-z0-9_.])\d+(?:[.,]\d+)*(?:\.\d+)?\s*(?:%|\uff05)?(?![A-Za-z0-9_.])")
TECH_VERSION_TOKEN_RE = re.compile(
    r"(?<![A-Za-z0-9])(?:"
    r"(?:GPT|BERT|RoBERTa|YOLO|ResNet|VGG|LLaMA|Qwen|DeepSeek|CUDA|PyTorch|TensorFlow|Python|Node\.js|React|Vue|Vite|Flask|Django)\s*v?\d+(?:\.\d+)*[A-Za-z0-9._-]*"
    r"|(?:[A-Z][A-Za-z]*[A-Z][A-Za-z0-9]*(?:[-_][A-Za-z0-9.]+)+)"
    r"|(?:[A-Za-z]{2,}[.-]?\d+(?:\.\d+)*(?:[-_][A-Za-z0-9.]+)?)"
    r"|(?:(?:v|V)\d+(?:\.\d+){1,3})"
    r")(?![A-Za-z0-9])"
)
INLINE_STRUCTURE_TOKEN_RE = re.compile(
    NUMERIC_CITATION_RE.pattern
    + "|" + AUTHOR_YEAR_CITATION_RE.pattern
    + r"|(?:[\u56fe\u8868]\s*\d+(?:[\.\-\u2013\u2014]\d+)*)"
    + r"|(?:\u5f0f\s*[\uff08(]?\s*\d+(?:[-\u2013\u2014]\d+)?\s*[\uff09)]?)"
    + r"|(?:\u516c\u5f0f\s*[\uff08(]?\s*\d+(?:[-\u2013\u2014]\d+)?\s*[\uff09)]?)"
    + "|" + NUMERIC_RANGE_WITH_UNIT_RE.pattern
    + "|" + NUMERIC_WITH_UNIT_RE.pattern
    + "|" + NUMBER_TOKEN_RE.pattern
    + "|" + TECH_VERSION_TOKEN_RE.pattern
    + r"|(?:\(\s*\d+(?:[-\u2013\u2014]\d+)?\s*\))"
)
PLACEHOLDER_RE = re.compile(r"@@FYADR_[A-Z]+_\d{3}@@")
PLACEHOLDER_TYPE_RE = re.compile(r"@@FYADR_([A-Z]+)_\d{3}@@")
CN_SENTENCE_RE = re.compile(r"[^。！？；!?;]+[。！？；!?;]?")
MECHANICAL_CONNECTOR_RE = re.compile(r"(首先|其次|再次|最后|此外|同时|因此|所以|综上|总之|由此可见|值得注意的是)")
TEMPLATE_PHRASE_RE = re.compile(r"(通过.+?实现|基于.+?构建|在.+?背景下|具有重要意义|提供了.+?支持|进一步提升|有效促进)")
EN_MECHANICAL_CONNECTOR_RE = re.compile(r"\b(firstly|secondly|finally|in addition|furthermore|therefore|thus|overall|in conclusion|it is worth noting that)\b", re.I)
EN_TEMPLATE_PHRASE_RE = re.compile(r"\b(has important significance|provides (?:strong|important)? support|further improves|effectively promotes|in the context of)\b", re.I)
STYLE_CARD_VERSION = 1
STYLE_CARD_TOP_LIMIT = 5
STYLE_VALIDATION_MIN_CHARS = 80
STYLE_VALIDATION_MAX_ISSUES = 4
CODE_LIKE_TERM_RE = re.compile(
    r"(?<![A-Za-z0-9_])(?:"
    r"[A-Za-z_][A-Za-z0-9_]*(?:[./:_-][A-Za-z0-9_]+)+"
    r"|[A-Z]{2,}[A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*"
    r"|Django|RESTful|API|JWT|ORM|S3|RGW|Ceph|MySQL|Vue|React|Flask|Python|Boto3|Vite|DOCX|PDF|AI|AIGC|GPT|GPTZero|Google|DeepSeek|Qwen|LLM|CSS|HTML|JSON|HTTP|REST|URL|OpenAI|LangChain"
    r")(?![A-Za-z0-9_])"
)
INTRODUCED_TEMPLATE_PHRASE_RE = re.compile(
    r"(综上所述|总而言之|由此可见|具有重要意义|具有较强的现实意义|奠定了(?:坚实)?基础|提供了(?:有力|重要)?支持|在.+?背景下.+?具有.+?意义)"
)
GENERIC_CLOSING_RE = re.compile(
    r"(综上所述|总而言之|总的来说|由此可见|整体来看|in conclusion|to sum up|overall|it can be seen that)",
    re.IGNORECASE,
)
class ProtectedText(NamedTuple):
    text: str
    tokens: dict[str, str]
    token_types: dict[str, str]


SHARED_OUTPUT_CONTRACT = """
[OUTPUT CONTRACT]
- Only return the rewritten body text for the current input chunk.
- Preserve the original meaning, facts, claims, conclusions, numbering, and paragraph role.
- Preserve any placeholder tokens like @@FYADR_REF_001@@ exactly; do not translate, delete, split, or rename them.
- Do not add, remove, or replace viewpoints or conclusions.
- Do not output explanations, suggestions, options, comments, invitations, or summaries.
- Do not output phrases like: 修改后：, 改写后：, 可以改成, 如果你愿意, 说明：, 原因很简单, 我也可以继续帮你.
- Do not turn the text into chat, Q&A, title suggestions, bullet recommendations, or markdown formatting unless the input already contains it.
""".strip()

DISALLOWED_OUTPUT_PATTERNS = (
    "如果你愿意",
    "可以改成",
    "改写后：",
    "修改后：",
    "说明：",
    "原因很简单",
    "我也可以继续帮你",
    "请把需要",
    "你可以直接贴",
)

LEADING_OUTPUT_WRAPPER_PATTERNS = (
    "改写后：",
    "修改后：",
    "润色后：",
    "优化后：",
    "重写后：",
    "说明：",
    "以下是改写后的内容：",
    "以下为改写后的内容：",
    "以下是改写后的文本：",
    "以下为改写后的文本：",
    "以下是润色后的内容：",
    "以下为润色后的内容：",
)


def _count_latin_words(text: str) -> int:
    return len(LATIN_WORD_RE.findall(text))


def _count_latin_chars(text: str) -> int:
    return len(LATIN_CHAR_RE.findall(text))


def _count_cjk_chars(text: str) -> int:
    return len(CJK_CHAR_RE.findall(text))


def detect_chunk_language(text: str) -> str:
    latin_words = _count_latin_words(text)
    latin_chars = _count_latin_chars(text)
    cjk_chars = _count_cjk_chars(text)

    if latin_words >= 5 and cjk_chars == 0 and latin_chars >= 25:
        return "en"
    if latin_words >= 8 and cjk_chars <= 4 and latin_chars >= max(30, cjk_chars * 8):
        return "en"
    if latin_words >= 12 and latin_chars >= max(40, cjk_chars * 6):
        return "en"
    return "default"


def build_language_guard(chunk_text: str) -> str:
    if detect_chunk_language(chunk_text) != "en":
        return ""
    return (
        "[LANGUAGE LOCK]\n"
        "- The input chunk is written in English.\n"
        "- Keep the rewritten output fully in English.\n"
        "- Do not translate any sentence, phrase, or keyword into Chinese.\n"
        "- Preserve English technical terms, abbreviations, citations, formulas, and numbering."
    )


def build_paragraph_guard(chunk_text: str) -> str:
    paragraphs = _split_contract_paragraphs(chunk_text)
    if len(paragraphs) <= 1:
        return ""
    return (
        "[PARAGRAPH LOCK]\n"
        f"- The input chunk contains exactly {len(paragraphs)} natural paragraphs separated by blank lines.\n"
        f"- The output must also contain exactly {len(paragraphs)} natural paragraphs.\n"
        "- Keep one blank line between adjacent paragraphs.\n"
        "- Do not merge, split, reorder, or drop paragraphs."
    )


def _build_retry_note(chunk_text: str, validation_error: str) -> str:
    repair_steps = _build_validation_repair_steps(validation_error)
    language_retry = (
        "- Your previous output violated the language lock.\n"
        "- Rewrite the chunk again in English only.\n"
        "- Return only the rewritten chunk body text."
    )
    generic_retry = (
        "- Your previous output violated the output contract.\n"
        "- Rewrite the same chunk again.\n"
        "- Return only the rewritten chunk body text."
    )
    details = f"- Fix this issue: {validation_error.strip()}"
    paragraph_retry = ""
    if len(_split_contract_paragraphs(chunk_text)) > 1:
        paragraph_retry = (
            "\n- Preserve the exact original paragraph count.\n"
            "- Keep one blank line between paragraphs and do not merge them."
        )
    note_body = language_retry if detect_chunk_language(chunk_text) == "en" else generic_retry
    note_body = f"{note_body}{paragraph_retry}"
    if repair_steps:
        note_body = f"{note_body}\n{repair_steps}"
    return f"[RETRY NOTE]\n{note_body}\n{details}"


def _build_validation_repair_steps(validation_error: str) -> str:
    error = validation_error.lower()
    steps: list[str] = []
    if "factual order" in error or "item-value bindings" in error or "entity_order_changed" in error:
        steps.extend(
            [
                "- Keep every entity, method name, label, and value in the same logical binding as the source.",
                "- Do not swap comparison order; if two items are contrasted, keep the source order unless grammar absolutely requires otherwise.",
            ]
        )
    if "number" in error or "numeric" in error:
        steps.append("- Preserve all numbers, ranges, percentages, metric names, and nearby labels exactly.")
    if "required term" in error or "term" in error:
        steps.append("- Preserve all required technical terms, file names, model names, and identifiers exactly.")
    if "paragraph count" in error or "paragraph breaks" in error:
        steps.append("- Keep the same paragraph count and do not merge or split natural paragraphs.")
    if "citation" in error:
        steps.append("- Keep citation markers in the same sentence-level position as the source.")
    if "language" in error or "english" in error:
        steps.append("- Keep the output language identical to the input language; English input must remain English.")
    if "markdown" in error or "answer-style" in error:
        steps.append("- Output body text only; do not add headings, bullets, explanations, markdown, or labels.")
    if "machine-like writing style" in error or "connector" in error or "template" in error or "sentence rhythm" in error:
        steps.extend(
            [
                "- Reduce newly introduced stock phrases and repeated transitions; keep concrete wording tied to the source paragraph.",
                "- Vary sentence rhythm naturally without adding facts, claims, citations, or background.",
                "- Do not end with a generic summary sentence unless the source already does so.",
            ]
        )
    if "expanded abnormally" in error:
        steps.append("- Shorten the rewrite and remove newly added background or commentary.")
    if "shrank abnormally" in error:
        steps.append("- Restore missing conditions, causes, examples, and conclusion details from the source.")
    return "\n".join(dict.fromkeys(steps))


def should_freeze_chunk(prompt_profile: str, chunk_text: str) -> bool:
    return False


def _estimate_api_calls(manifest: ChunkManifest) -> dict[str, int]:
    return {
        "estimatedApiCalls": manifest.chunk_count,
    }


def _count_matches(pattern: re.Pattern[str], text: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for match in pattern.findall(text):
        item = match[0] if isinstance(match, tuple) else match
        item = re.sub(r"\s+", " ", str(item or "").strip())
        if not item:
            continue
        item_key = item.lower() if item.isascii() else item
        counts[item_key] = counts.get(item_key, 0) + 1
    return counts


def _top_count_items(counts: dict[str, int], limit: int = STYLE_CARD_TOP_LIMIT, minimum: int = 2) -> list[dict[str, object]]:
    return [
        {"text": text, "count": count}
        for text, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        if count >= minimum
    ][:limit]


def _style_patterns_for_language(language: str) -> tuple[re.Pattern[str], re.Pattern[str]]:
    if language == "en":
        return EN_MECHANICAL_CONNECTOR_RE, EN_TEMPLATE_PHRASE_RE
    return MECHANICAL_CONNECTOR_RE, TEMPLATE_PHRASE_RE


def _style_risk_metrics(text: str) -> dict[str, object]:
    language = detect_chunk_language(text)
    connector_pattern, template_pattern = _style_patterns_for_language(language)
    connector_count = len(connector_pattern.findall(text))
    template_count = len(template_pattern.findall(text))
    closing_count = len(GENERIC_CLOSING_RE.findall(text))
    sentence_stats = _sentence_length_stats(text)
    sentence_count = int(sentence_stats.get("count", 0) or 0)
    return {
        "language": language,
        "sentenceCount": sentence_count,
        "sentenceStats": sentence_stats,
        "connectorCount": connector_count,
        "templateCount": template_count,
        "closingCount": closing_count,
        "connectorDensity": round(connector_count / max(sentence_count, 1), 4),
        "templateDensity": round(template_count / max(sentence_count, 1), 4),
    }


def _collect_machine_style_validation_issues(input_text: str, output_text: str) -> list[dict[str, object]]:
    if max(len(input_text.strip()), len(output_text.strip())) < STYLE_VALIDATION_MIN_CHARS:
        return []

    input_metrics = _style_risk_metrics(input_text)
    output_metrics = _style_risk_metrics(output_text)
    output_sentence_count = int(output_metrics.get("sentenceCount", 0) or 0)
    if output_sentence_count <= 0:
        return []

    issues: list[dict[str, object]] = []
    input_connector_count = int(input_metrics.get("connectorCount", 0) or 0)
    output_connector_count = int(output_metrics.get("connectorCount", 0) or 0)
    input_template_count = int(input_metrics.get("templateCount", 0) or 0)
    output_template_count = int(output_metrics.get("templateCount", 0) or 0)
    input_closing_count = int(input_metrics.get("closingCount", 0) or 0)
    output_closing_count = int(output_metrics.get("closingCount", 0) or 0)
    output_connector_density = float(output_metrics.get("connectorDensity", 0) or 0)
    output_template_density = float(output_metrics.get("templateDensity", 0) or 0)

    if output_sentence_count >= 3 and output_connector_count >= input_connector_count + 3 and output_connector_density >= 0.55:
        issues.append(
            {
                "code": "connector_density_increased",
                "level": "medium",
                "message": "Output introduced a high density of mechanical transitions.",
                "evidence": {
                    "inputConnectorCount": input_connector_count,
                    "outputConnectorCount": output_connector_count,
                    "outputConnectorDensity": output_connector_density,
                },
            }
        )

    introduced_templates = _find_introduced_template_phrases(input_text, output_text)
    if output_template_count >= input_template_count + 2 and output_template_density >= 0.18:
        issues.append(
            {
                "code": "template_density_increased",
                "level": "high",
                "message": "Output introduced too many stock academic template phrases.",
                "evidence": {
                    "inputTemplateCount": input_template_count,
                    "outputTemplateCount": output_template_count,
                    "outputTemplateDensity": output_template_density,
                    "introducedTemplates": introduced_templates[:5],
                },
            }
        )
    elif len(introduced_templates) >= 2 and output_template_density >= 0.12:
        issues.append(
            {
                "code": "template_phrase_drift",
                "level": "medium",
                "message": "Output added multiple detector-friendly template phrases.",
                "evidence": introduced_templates[:5],
            }
        )

    input_variance = float((input_metrics.get("sentenceStats") or {}).get("variance", 0) or 0)
    output_variance = float((output_metrics.get("sentenceStats") or {}).get("variance", 0) or 0)
    if (
        output_sentence_count >= 5
        and output_variance < 24
        and (input_variance == 0 or output_variance < max(18, input_variance * 0.55))
    ):
        issues.append(
            {
                "code": "sentence_rhythm_over_regularized",
                "level": "medium",
                "message": "Output sentence lengths became too uniform.",
                "evidence": {
                    "inputVariance": round(input_variance, 2),
                    "outputVariance": round(output_variance, 2),
                    "sentenceCount": output_sentence_count,
                },
            }
        )

    if output_sentence_count >= 2 and output_closing_count > input_closing_count and output_closing_count >= 1:
        issues.append(
            {
                "code": "generic_closing_added",
                "level": "medium",
                "message": "Output added a generic summary closing phrase.",
                "evidence": {
                    "inputClosingCount": input_closing_count,
                    "outputClosingCount": output_closing_count,
                },
            }
        )

    return issues[:STYLE_VALIDATION_MAX_ISSUES]


def _chunk_opening_signature(text: str) -> str:
    compact = re.sub(r"\s+", "", text.strip())
    compact = re.sub(r"^@@FYADR_[A-Z]+_\d{3}@@", "", compact)
    compact = re.sub(r"^[（(]?[一二三四五六七八九十\d]+[）).、\s]*", "", compact)
    if not compact:
        return ""
    first_sentence = _split_sentences_for_quality(compact[:80])
    source = first_sentence[0] if first_sentence else compact[:40]
    return source[:18]


def build_global_style_profile_from_texts(chunk_texts: list[str]) -> dict[str, object]:
    chunks = [str(chunk_text or "").strip() for chunk_text in chunk_texts if str(chunk_text or "").strip()]
    full_text = "\n".join(chunks)
    sentence_stats = _sentence_length_stats(full_text)
    connector_counts = _count_matches(MECHANICAL_CONNECTOR_RE, full_text)
    template_counts = _count_matches(TEMPLATE_PHRASE_RE, full_text)
    en_connector_counts = _count_matches(EN_MECHANICAL_CONNECTOR_RE, full_text)
    en_template_counts = _count_matches(EN_TEMPLATE_PHRASE_RE, full_text)
    opening_counts: dict[str, int] = {}
    for chunk_text in chunks:
        if detect_chunk_language(chunk_text) == "en":
            continue
        opening = _chunk_opening_signature(chunk_text)
        if len(opening) >= 6:
            opening_counts[opening] = opening_counts.get(opening, 0) + 1

    sentence_count = int(sentence_stats.get("count", 0) or 0)
    risk_codes: list[str] = []
    if sentence_count >= 12 and float(sentence_stats.get("variance", 0) or 0) < 45:
        risk_codes.append("global_uniform_sentence_rhythm")
    if sum(connector_counts.values()) / max(sentence_count, 1) >= 0.32:
        risk_codes.append("global_connector_density")
    if sum(template_counts.values()) >= 3:
        risk_codes.append("global_template_phrase_reuse")
    if any(item["count"] >= 3 for item in _top_count_items(opening_counts, minimum=3)):
        risk_codes.append("global_repeated_openings")

    return {
        "version": STYLE_CARD_VERSION,
        "label": "global-style-risk-profile",
        "chunkCount": len(chunks),
        "sentenceStats": sentence_stats,
        "riskCodes": risk_codes,
        "topConnectors": _top_count_items(connector_counts),
        "topTemplatePhrases": _top_count_items(template_counts),
        "topEnglishConnectors": _top_count_items(en_connector_counts),
        "topEnglishTemplatePhrases": _top_count_items(en_template_counts),
        "repeatedOpenings": _top_count_items(opening_counts, minimum=3),
    }


def _build_global_style_profile(manifest: ChunkManifest) -> dict[str, object]:
    return build_global_style_profile_from_texts([chunk.text for chunk in manifest.chunks])


def _style_item_texts(items: object) -> list[str]:
    if not isinstance(items, list):
        return []
    texts: list[str] = []
    for item in items:
        if isinstance(item, dict):
            text = str(item.get("text", "")).strip()
            if text:
                texts.append(text)
    return texts


def _build_local_style_card(chunk_text: str, global_style_profile: dict[str, object] | None) -> str | None:
    if not global_style_profile:
        return None
    language = detect_chunk_language(chunk_text)
    local_connectors = _count_matches(EN_MECHANICAL_CONNECTOR_RE if language == "en" else MECHANICAL_CONNECTOR_RE, chunk_text)
    local_templates = _count_matches(EN_TEMPLATE_PHRASE_RE if language == "en" else TEMPLATE_PHRASE_RE, chunk_text)
    global_connectors = _style_item_texts(
        global_style_profile.get("topEnglishConnectors") if language == "en" else global_style_profile.get("topConnectors")
    )
    global_templates = _style_item_texts(
        global_style_profile.get("topEnglishTemplatePhrases") if language == "en" else global_style_profile.get("topTemplatePhrases")
    )
    repeated_openings = _style_item_texts(global_style_profile.get("repeatedOpenings"))
    chunk_opening = _chunk_opening_signature(chunk_text)
    active_opening = chunk_opening if language != "en" and any(chunk_opening.startswith(opening[:8]) for opening in repeated_openings) else ""
    local_metrics = _style_risk_metrics(chunk_text)
    needs_baseline_style_guard = (
        len(chunk_text.strip()) >= STYLE_VALIDATION_MIN_CHARS
        and int(local_metrics.get("sentenceCount", 0) or 0) >= 2
    )

    local_items = [
        *[item for item, count in local_connectors.items() if count > 0],
        *[item for item, count in local_templates.items() if count > 0],
    ]
    has_global_risk = bool(global_style_profile.get("riskCodes"))
    if not has_global_risk and not local_items and not active_opening and not needs_baseline_style_guard:
        return None

    if language == "en":
        lines = [
            "[LOCAL STYLE CARD]",
            "- Reduce detector-friendly uniformity in this chunk without changing facts, terms, numbers, citations, or paragraph role.",
            "- Vary sentence rhythm naturally; avoid making the paragraph read like a neat template.",
            "- Keep wording concrete to the source; do not add generic closing summaries or stock academic formulas.",
        ]
        if global_connectors:
            lines.append(f"- Avoid overusing globally repeated transitions when possible: {', '.join(global_connectors[:4])}.")
        if global_templates:
            lines.append(f"- Replace globally repeated stock phrasing with concrete wording grounded in this chunk: {', '.join(global_templates[:3])}.")
        if local_items:
            lines.append(f"- This chunk already contains style-risk phrases; do not intensify them: {', '.join(list(dict.fromkeys(local_items))[:5])}.")
        lines.append("- Return only the rewritten English chunk.")
        return "\n".join(lines)

    lines = [
        "[LOCAL STYLE CARD]",
        "- 这一块需要降低全文层面的模板感，但不能改变事实、术语、数值、引用、编号和段落角色。",
        "- 句式节奏要有自然起伏，避免写成整齐的总分模板或百科式说明。",
        "- 表达必须贴着原段落的具体内容走，不要新增泛化总结句、空泛意义句或套路化学术公式。",
    ]
    if global_connectors:
        lines.append(f"- 全文高频连接词尽量少重复：{'、'.join(global_connectors[:4])}。")
    if global_templates:
        lines.append(f"- 全文高频模板表达要改成贴合本段语境的具体说法：{'、'.join(global_templates[:3])}。")
    if local_items:
        lines.append(f"- 本块已有风险表达，改写时不要继续强化：{'、'.join(list(dict.fromkeys(local_items))[:5])}。")
    if active_opening:
        lines.append(f"- 本块开头与全文部分段落相似，改写时可调整开句方式，但不要新增观点：{active_opening}。")
    lines.append("- 直接输出改写后的正文，不要解释。")
    return "\n".join(lines)


def build_local_style_card(chunk_text: str, global_style_profile: dict[str, object] | None) -> str | None:
    return _build_local_style_card(chunk_text, global_style_profile)


def _merge_generation_notes(*notes: str | None) -> str | None:
    merged = [note.strip() for note in notes if note and note.strip()]
    return "\n\n".join(merged) if merged else None


def _score_rewrite_candidate(input_text: str, output_text: str) -> float:
    input_len = max(len(input_text.strip()), 1)
    output_len = max(len(output_text.strip()), 1)
    expansion_ratio = output_len / input_len
    expansion_penalty = abs(expansion_ratio - 1.0) * 3.0
    risks = _assess_machine_like_risks(output_text)
    risk_penalty = sum(2.0 if risk.get("level") == "high" else 1.0 for risk in risks)
    sentence_stats = _sentence_length_stats(output_text)
    rhythm_penalty = 0.6 if int(sentence_stats.get("count", 0) or 0) >= 4 and float(sentence_stats.get("variance", 0) or 0) < 35 else 0
    output_style_metrics = _style_risk_metrics(output_text)
    connector_penalty = int(output_style_metrics.get("connectorCount", 0) or 0) * 0.18
    template_penalty = int(output_style_metrics.get("templateCount", 0) or 0) * 0.35
    style_validation_penalty = sum(
        2.2 if str(issue.get("level", "")).lower() == "high" else 1.1
        for issue in _collect_machine_style_validation_issues(input_text, output_text)
    )
    return expansion_penalty + risk_penalty + rhythm_penalty + connector_penalty + template_penalty + style_validation_penalty


def _extract_structured_rewrite_text(output_text: str) -> str | None:
    stripped = str(output_text or "").strip()
    if not stripped or not (stripped.startswith("{") or stripped.startswith("[") or stripped.startswith("```")):
        return None
    try:
        payload = extract_json_payload(stripped)
    except ValueError:
        return None
    if isinstance(payload, list):
        text_items = [str(item).strip() for item in payload if isinstance(item, str) and str(item).strip()]
        return "\n\n".join(text_items) if text_items else None
    if not isinstance(payload, dict):
        return None
    for key in STRUCTURED_REWRITE_TEXT_KEYS:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, list):
            text_items = [str(item).strip() for item in value if isinstance(item, str) and str(item).strip()]
            if text_items:
                return "\n\n".join(text_items)
    paragraphs = payload.get("paragraphs")
    if isinstance(paragraphs, list):
        text_items = [str(item).strip() for item in paragraphs if isinstance(item, str) and str(item).strip()]
        if text_items:
            return "\n\n".join(text_items)
    return None


def normalize_chunk_output(input_text: str, output_text: str) -> str:
    normalized = (
        output_text
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\u00a0", " ")
        .replace("\u2028", "\n")
        .replace("\u2029", "\n")
        .replace("\u0085", "\n")
        .strip()
    )
    if not normalized:
        return ""
    structured_text = _extract_structured_rewrite_text(normalized)
    if structured_text is not None:
        normalized = structured_text.strip()
        if not normalized:
            return ""

    if len(_split_contract_paragraphs(input_text)) > 1:
        normalized = strip_leading_output_wrapper(input_text, normalized)
        paragraphs = _split_contract_paragraphs(normalized)
        normalized_paragraphs = [_normalize_single_output_paragraph(paragraph) for paragraph in paragraphs]
        return "\n\n".join(paragraph for paragraph in normalized_paragraphs if paragraph)

    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    if not lines:
        return ""
    if len(lines) == 1:
        return re.sub(r"[ \t\f\v]+", " ", lines[0]).strip()

    merged = lines[0]
    for next_line in lines[1:]:
        if not merged:
            merged = next_line
            continue
        previous_char = merged[-1]
        next_char = next_line[0]
        joiner = _line_joiner(previous_char, next_char)
        merged = f"{merged}{joiner}{next_line}"

    compact = re.sub(r"[ \t\f\v]+", " ", merged).strip()
    compact = strip_leading_output_wrapper(input_text, compact)
    if detect_chunk_language(input_text) == "en":
        return compact
    return compact


def _split_contract_paragraphs(text: str) -> list[str]:
    return [paragraph.strip() for paragraph in PARAGRAPH_BREAK_RE.split(text.strip()) if paragraph.strip()]


def _normalize_single_output_paragraph(paragraph: str) -> str:
    lines = [line.strip() for line in paragraph.splitlines() if line.strip()]
    if not lines:
        return ""
    merged = lines[0]
    for next_line in lines[1:]:
        if not merged:
            merged = next_line
            continue
        previous_char = merged[-1]
        next_char = next_line[0]
        joiner = _line_joiner(previous_char, next_char)
        merged = f"{merged}{joiner}{next_line}"
    return re.sub(r"[ \t\f\v]+", " ", merged).strip()


def _line_joiner(previous_char: str, next_char: str) -> str:
    if ASCII_WORD_CHAR_RE.match(previous_char) and ASCII_WORD_CHAR_RE.match(next_char):
        return " "
    if previous_char in ".!?;:" and ASCII_WORD_CHAR_RE.match(next_char):
        return " "
    return ""


def strip_leading_output_wrapper(input_text: str, output_text: str) -> str:
    normalized_input = input_text.strip()
    stripped = output_text.strip()
    if not stripped:
        return ""

    for _ in range(3):
        candidate = LEADING_MARKUP_RE.sub("", stripped).strip()
        if not candidate:
            break

        removed = False
        for pattern in LEADING_OUTPUT_WRAPPER_PATTERNS:
            if not candidate.startswith(pattern):
                continue
            if normalized_input.startswith(pattern):
                return output_text.strip()

            remainder = candidate[len(pattern):].strip()
            if not remainder:
                return output_text.strip()

            stripped = remainder
            removed = True
            break

        if not removed:
            break

    return stripped.strip()


def is_disallowed_answer_style_output(input_text: str, output_text: str) -> str | None:
    normalized_input = input_text.strip()
    normalized_output = output_text.strip()
    if not normalized_output:
        return None

    leading_output = LEADING_MARKUP_RE.sub("", normalized_output).strip()
    for pattern in DISALLOWED_OUTPUT_PATTERNS:
        if not leading_output.startswith(pattern):
            continue
        if normalized_input.startswith(pattern):
            continue
        return pattern
    return None



def _extract_leading_structure_marker(text: str) -> str | None:
    match = LEADING_STRUCTURE_RE.match(text.strip())
    if not match:
        return None
    return match.group("marker").strip()


def _normalize_citation_marker(marker: str) -> str:
    return re.sub(r"\s+", "", marker).replace(chr(0xFF0C), ",").replace(chr(0xFF1B), ";")


def _extract_numeric_citations(text: str) -> set[str]:
    return {_normalize_citation_marker(match.group(0)) for match in NUMERIC_CITATION_RE.finditer(text)}


def _extract_author_year_citations(text: str) -> set[str]:
    return {_normalize_citation_marker(match.group(0)) for match in AUTHOR_YEAR_CITATION_RE.finditer(text)}


def _extract_citations(text: str) -> set[str]:
    return _extract_numeric_citations(text) | _extract_author_year_citations(text)


def protect_structure_tokens(text: str) -> ProtectedText:
    tokens: dict[str, str] = {}
    token_types: dict[str, str] = {}

    def replace_match(match: re.Match[str]) -> str:
        original = match.group(0)
        token_type = _classify_protected_token(original)
        placeholder = f"@@FYADR_{token_type}_{len(tokens) + 1:03d}@@"
        tokens[placeholder] = original
        token_types[placeholder] = token_type
        return placeholder

    protected_text = INLINE_STRUCTURE_TOKEN_RE.sub(replace_match, text)
    return ProtectedText(protected_text, tokens, token_types)


def _classify_protected_token(token: str) -> str:
    compact = token.strip()
    if NUMERIC_CITATION_RE.fullmatch(compact) or AUTHOR_YEAR_CITATION_RE.fullmatch(compact):
        return "REF"
    if compact.startswith(("图", "表")):
        return "CAP"
    if compact.startswith(("公式", "式")) or re.match(r"^\(\s*\d+", compact):
        return "EQN"
    if NUMERIC_RANGE_WITH_UNIT_RE.fullmatch(compact) or NUMERIC_WITH_UNIT_RE.fullmatch(compact) or NUMBER_TOKEN_RE.fullmatch(compact):
        return "NUM"
    return "TOK"


def summarize_protected_token_types(protected: ProtectedText) -> dict[str, int]:
    summary: dict[str, int] = {}
    for token_type in protected.token_types.values():
        summary[token_type] = summary.get(token_type, 0) + 1
    return summary


def restore_structure_tokens(text: str, tokens: dict[str, str]) -> str:
    restored = text
    for placeholder, original in tokens.items():
        restored = restored.replace(placeholder, original)
    return restored


def _normalize_required_token(token: str) -> str:
    translation = str.maketrans("０１２３４５６７８９％，．", "0123456789%,.")
    return re.sub(r"\s+", "", token.translate(translation))


def _extract_required_numbers(text: str) -> set[str]:
    return {
        _normalize_required_token(match.group(0))
        for match in NUMBER_TOKEN_RE.finditer(text)
        if _normalize_required_token(match.group(0))
    }


def _extract_required_terms(text: str) -> set[str]:
    terms = {match.group(0).strip() for match in TECH_VERSION_TOKEN_RE.finditer(text)}
    terms.update(match.group(0).strip() for match in CODE_LIKE_TERM_RE.finditer(text))
    return {term for term in terms if len(term) >= 2}


def _validate_required_numbers(input_text: str, output_text: str, chunk_id: str) -> None:
    input_numbers = _extract_required_numbers(input_text)
    if not input_numbers:
        return
    output_numbers = _extract_required_numbers(output_text)
    missing = sorted(input_numbers - output_numbers)
    if missing:
        raise ValueError(f"Chunk {chunk_id} changed or removed numbers: {', '.join(missing[:8])}")


def _validate_required_terms(input_text: str, output_text: str, chunk_id: str) -> None:
    required_terms = _extract_required_terms(input_text)
    if not required_terms:
        return
    missing = sorted(term for term in required_terms if term not in output_text)
    if missing:
        raise ValueError(f"Chunk {chunk_id} changed or removed protected terms: {', '.join(missing[:8])}")


def _validate_language_stability(input_text: str, output_text: str, chunk_id: str) -> None:
    if detect_chunk_language(input_text) == "en":
        return
    input_cjk_chars = _count_cjk_chars(input_text)
    if input_cjk_chars < 20:
        return
    output_cjk_chars = _count_cjk_chars(output_text)
    minimum_cjk_chars = max(12, int(input_cjk_chars * 0.45))
    if output_cjk_chars < minimum_cjk_chars:
        raise ValueError(f"Chunk {chunk_id} drifted away from Chinese; output must remain mostly Chinese")


def _validate_length_stability(input_text: str, output_text: str, chunk_id: str) -> None:
    input_length = len(input_text.strip())
    output_length = len(output_text.strip())
    if input_length < 80:
        return
    if output_length < int(input_length * 0.55):
        raise ValueError(f"Chunk {chunk_id} shrank abnormally; possible content loss")
    if output_length > max(int(input_length * 1.65), input_length + 220):
        raise ValueError(f"Chunk {chunk_id} expanded abnormally; possible answer-style drift")


def _find_introduced_template_phrases(input_text: str, output_text: str) -> list[str]:
    return sorted(
        set(INTRODUCED_TEMPLATE_PHRASE_RE.findall(output_text))
        - set(INTRODUCED_TEMPLATE_PHRASE_RE.findall(input_text))
    )


def validate_structure_placeholders(output_text: str, tokens: dict[str, str], chunk_id: str) -> None:
    if not tokens:
        return
    missing = [placeholder for placeholder in tokens if placeholder not in output_text]
    if missing:
        raise ValueError(f"Chunk {chunk_id} removed protected structure placeholders: {', '.join(missing[:5])}")

    unexpected = sorted(set(PLACEHOLDER_RE.findall(output_text)) - set(tokens))
    if unexpected:
        raise ValueError(f"Chunk {chunk_id} introduced unknown structure placeholders: {', '.join(unexpected[:5])}")


def _validate_machine_style_stability(input_text: str, output_text: str, chunk_id: str) -> None:
    issues = _collect_machine_style_validation_issues(input_text, output_text)
    if not issues:
        return
    summary = "; ".join(str(issue.get("code", "")) for issue in issues if issue.get("code"))
    raise ValueError(f"Chunk {chunk_id} introduced machine-like writing style: {summary}")


def _validate_structure_and_citations(input_text: str, output_text: str, chunk_id: str) -> None:
    input_marker = _extract_leading_structure_marker(input_text)
    if input_marker:
        output_marker = _extract_leading_structure_marker(output_text)
        if output_marker != input_marker:
            raise ValueError(f"Chunk {chunk_id} changed or removed leading numbering marker {input_marker!r}")

    input_citations = _extract_citations(input_text)
    if input_citations:
        output_citations = _extract_citations(output_text)
        missing = sorted(input_citations - output_citations)
        if missing:
            raise ValueError(f"Chunk {chunk_id} removed citation markers: {', '.join(missing[:5])}")


def validate_chunk_output(input_text: str, output_text: str, chunk_id: str) -> None:
    normalized_output = output_text.strip()
    if not normalized_output:
        raise ValueError(f"Chunk {chunk_id} returned empty output")

    input_paragraph_breaks = len(PARAGRAPH_BREAK_RE.findall(input_text))
    output_paragraph_breaks = len(PARAGRAPH_BREAK_RE.findall(normalized_output))
    input_paragraph_count = len(_split_contract_paragraphs(input_text))
    output_paragraph_count = len(_split_contract_paragraphs(normalized_output))
    if input_paragraph_count > 1 and output_paragraph_count != input_paragraph_count:
        raise ValueError(
            f"Chunk {chunk_id} changed paragraph count: expected {input_paragraph_count}, got {output_paragraph_count}"
        )
    if input_paragraph_count <= 1 and output_paragraph_breaks > input_paragraph_breaks:
        raise ValueError(f"Chunk {chunk_id} introduced extra paragraph breaks")

    matched_pattern = is_disallowed_answer_style_output(input_text, normalized_output)
    if matched_pattern:
        raise ValueError(f"Chunk {chunk_id} contains disallowed answer-style pattern: {matched_pattern}")

    markdown_markers = ("**", "### ", "## ", "- **", "> ")
    if any(marker in normalized_output for marker in markdown_markers) and not any(marker in input_text for marker in markdown_markers):
        raise ValueError(f"Chunk {chunk_id} introduced markdown-style formatting")

    _validate_structure_and_citations(input_text, normalized_output, chunk_id)
    _validate_required_numbers(input_text, normalized_output, chunk_id)
    _validate_required_terms(input_text, normalized_output, chunk_id)
    validate_factual_relation_stability(input_text, normalized_output, f"Chunk {chunk_id}")
    _validate_language_stability(input_text, normalized_output, chunk_id)
    _validate_length_stability(input_text, normalized_output, chunk_id)
    _validate_machine_style_stability(input_text, normalized_output, chunk_id)

    if len(normalized_output) > max(len(input_text) * 2, len(input_text) + 200):
        raise ValueError(f"Chunk {chunk_id} expanded abnormally; possible answer-style drift")

    if detect_chunk_language(input_text) == "en":
        input_english_words = _count_latin_words(input_text)
        output_english_words = _count_latin_words(normalized_output)
        input_cjk_chars = _count_cjk_chars(input_text)
        output_cjk_chars = _count_cjk_chars(normalized_output)
        minimum_english_words = max(8, int(input_english_words * 0.35))
        allowed_cjk_chars = max(input_cjk_chars + 4, output_english_words // 2)

        if output_english_words < minimum_english_words:
            raise ValueError(f"Chunk {chunk_id} drifted away from English; output must stay in English")
        if output_cjk_chars > allowed_cjk_chars:
            raise ValueError(f"Chunk {chunk_id} introduced too much Chinese text for an English input chunk")


def normalize_path(path: Path) -> Path:
    if path.is_absolute():
        return path
    return (ROOT_DIR / path).resolve()


def relative_to_root(path: Path) -> str:
    normalized = normalize_path(path)
    try:
        relative = normalized.relative_to(ROOT_DIR)
        return str(relative).replace("\\", "/")
    except ValueError:
        return str(normalized)


def normalize_prompt_profile(prompt_profile: str | None) -> str:
    normalized = str(prompt_profile or "cn").strip().lower()
    if normalized not in PROMPT_PROFILES:
        raise ValueError(f"Unsupported prompt profile: {normalized}")
    return normalized


def normalize_prompt_sequence(prompt_profile: str | None, prompt_sequence: object | None = None) -> list[str]:
    normalized_profile = normalize_prompt_profile(prompt_profile)
    default_sequence = list(DEFAULT_PROMPT_SEQUENCES[normalized_profile])
    if normalized_profile != "cn_custom":
        return default_sequence

    raw_items: list[object]
    if isinstance(prompt_sequence, str):
        raw_items = [item.strip() for item in prompt_sequence.split(",")]
    elif isinstance(prompt_sequence, (list, tuple)):
        raw_items = list(prompt_sequence)
    else:
        raw_items = []

    normalized_sequence: list[str] = []
    for raw_item in raw_items:
        prompt_id = str(raw_item or "").strip().lower()
        if not prompt_id:
            continue
        if prompt_id not in PROMPT_LIBRARY:
            raise ValueError(f"Unsupported prompt id in custom sequence: {prompt_id}")
        normalized_sequence.append(prompt_id)

    if not normalized_sequence:
        return default_sequence
    if len(normalized_sequence) > MAX_ROUNDS:
        raise ValueError(f"Custom prompt sequence supports at most {MAX_ROUNDS} rounds.")
    return normalized_sequence


def get_prompt_sequence_key(prompt_profile: str | None, prompt_sequence: object | None = None) -> str:
    normalized_profile = normalize_prompt_profile(prompt_profile)
    sequence = normalize_prompt_sequence(normalized_profile, prompt_sequence)
    if normalized_profile != "cn_custom":
        return normalized_profile
    return "custom_" + "_".join(sequence)


def get_prompt_mapping(prompt_profile: str | None, prompt_sequence: object | None = None) -> dict[int, str]:
    normalized_profile = normalize_prompt_profile(prompt_profile)
    sequence = normalize_prompt_sequence(normalized_profile, prompt_sequence)
    return {
        index + 1: PROMPT_LIBRARY[prompt_id]
        for index, prompt_id in enumerate(sequence)
    }


def get_max_rounds(prompt_profile: str | None, prompt_sequence: object | None = None) -> int:
    return len(get_prompt_mapping(prompt_profile, prompt_sequence))


def get_chunk_metric(prompt_profile: str | None, prompt_sequence: object | None = None) -> str:
    normalized_profile = normalize_prompt_profile(prompt_profile)
    return PROMPT_PROFILE_CHUNK_METRICS[normalized_profile]


def load_prompt(prompt_profile: str | None, round_number: int, prompt_sequence: object | None = None) -> str:
    prompts = get_prompt_mapping(prompt_profile, prompt_sequence)
    if round_number not in prompts:
        raise ValueError(
            f"Round {round_number} is not available for prompt profile {normalize_prompt_profile(prompt_profile)}. "
            f"Supported rounds: {sorted(prompts)}"
        )
    prompt_path = ROOT_DIR / prompts[round_number]
    return prompt_path.read_text(encoding="utf-8")


def build_prompt_input(
    prompt_text: str,
    chunk_text: str,
    round_number: int,
    chunk_id: str,
    retry_note: str | None = None,
    relation_guard: str | None = None,
    style_card: str | None = None,
) -> str:
    sections = [
        f"[ROUND {round_number}]",
        f"[CHUNK {chunk_id}]",
        prompt_text.strip(),
        SHARED_OUTPUT_CONTRACT,
    ]
    language_guard = build_language_guard(chunk_text)
    if language_guard:
        sections.append(language_guard)
    paragraph_guard = build_paragraph_guard(chunk_text)
    if paragraph_guard:
        sections.append(paragraph_guard)
    effective_relation_guard = relation_guard if relation_guard is not None else build_factual_relation_guard(chunk_text)
    if effective_relation_guard:
        sections.append(effective_relation_guard)
    if style_card:
        sections.append(style_card.strip())
    if retry_note:
        sections.append(retry_note.strip())
    sections.extend(
        [
            "[INPUT TEXT]",
            chunk_text,
        ]
    )
    return "\n\n".join(section for section in sections if section)


def get_round_checkpoint_path(output_path: Path) -> Path:
    return output_path.with_name(f"{output_path.stem}_checkpoint.json")


def get_round_compare_path(output_path: Path) -> Path:
    return output_path.with_name(f"{output_path.stem}_compare.json")


def get_round_quality_path(output_path: Path) -> Path:
    return output_path.with_name(f"{output_path.stem}_quality.json")


def _sha256_text(text: str) -> str:
    return sha256(text.encode("utf-8")).hexdigest()


def _sha256_json(value: object) -> str:
    return _sha256_text(json.dumps(value, ensure_ascii=False, sort_keys=True))


def _write_text_atomically(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    last_error: OSError | None = None
    for attempt in range(5):
        temp_path = path.with_name(f"{path.name}.{os.getpid()}.{time.monotonic_ns()}.tmp")
        try:
            temp_path.write_text(text, encoding="utf-8")
            temp_path.replace(path)
            return
        except OSError as exc:
            last_error = exc
            try:
                temp_path.unlink(missing_ok=True)
            except OSError:
                pass
            time.sleep(0.05 * (attempt + 1))
    if last_error is not None:
        try:
            path.write_text(text, encoding="utf-8")
            return
        except OSError:
            raise last_error


def _write_json_atomically(path: Path, payload: dict[str, object]) -> None:
    _write_text_atomically(path, json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))


def _build_checkpoint_signature(
    *,
    doc_id: str,
    round_number: int,
    prompt_profile: str,
    prompt_sequence: list[str],
    input_path: Path,
    output_path: Path,
    manifest_path: Path,
    manifest_chunk_ids: list[str],
    input_sha256: str,
    prompt_sha256: str,
    chunk_limit: int,
    chunk_metric: str,
    checkpoint_metadata: dict[str, object] | None,
) -> dict[str, object]:
    return {
        "version": ROUND_CHECKPOINT_VERSION,
        "doc_id": doc_id,
        "round": round_number,
        "prompt_profile": prompt_profile,
        "prompt_sequence": prompt_sequence,
        "input_path": relative_to_root(input_path),
        "output_path": relative_to_root(output_path),
        "manifest_path": relative_to_root(manifest_path),
        "input_sha256": input_sha256,
        "prompt_sha256": prompt_sha256,
        "chunk_limit": chunk_limit,
        "chunk_metric": chunk_metric,
        "chunk_ids": manifest_chunk_ids,
    }


def _load_checkpoint_payload(path: Path) -> dict[str, object] | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    return payload


def _is_checkpoint_compatible(payload: dict[str, object], signature: dict[str, object]) -> bool:
    for key, expected_value in signature.items():
        if payload.get(key) != expected_value:
            return False
    return True


def _normalize_checkpoint_outputs(
    raw_outputs: object,
    *,
    manifest_chunks_by_id: dict[str, object],
) -> dict[str, str]:
    if not isinstance(raw_outputs, dict):
        return {}

    cleaned_outputs: dict[str, str] = {}
    for chunk_id, output_text in raw_outputs.items():
        if not isinstance(chunk_id, str) or not isinstance(output_text, str):
            continue
        chunk = manifest_chunks_by_id.get(chunk_id)
        if chunk is None:
            continue
        try:
            validate_chunk_output(chunk.text, output_text, chunk_id)
        except ValueError:
            continue
        cleaned_outputs[chunk_id] = output_text
    return cleaned_outputs


def _normalize_checkpoint_validation_events(
    raw_events: object,
    *,
    valid_chunk_ids: set[str],
) -> list[dict[str, object]]:
    if not isinstance(raw_events, list):
        return []

    cleaned_events: list[dict[str, object]] = []
    for raw_event in raw_events:
        if not isinstance(raw_event, dict):
            continue
        event = {str(key): value for key, value in raw_event.items() if isinstance(key, str)}
        chunk_id = event.get("chunkId")
        if chunk_id is not None and str(chunk_id) not in valid_chunk_ids:
            continue
        cleaned_events.append(event)
    return cleaned_events


def _load_resumable_checkpoint_state(
    checkpoint_path: Path,
    *,
    signature: dict[str, object],
    manifest_chunks_by_id: dict[str, object],
) -> tuple[dict[str, str], list[dict[str, object]]]:
    payload = _load_checkpoint_payload(checkpoint_path)
    if payload is None:
        return {}, []
    if payload.get("completed") is True:
        return {}, []
    if not _is_checkpoint_compatible(payload, signature):
        try:
            checkpoint_path.unlink(missing_ok=True)
        except OSError:
            pass
        return {}, []

    cleaned_outputs = _normalize_checkpoint_outputs(
        payload.get("chunk_outputs"),
        manifest_chunks_by_id=manifest_chunks_by_id,
    )
    cleaned_events = _normalize_checkpoint_validation_events(
        payload.get("validation_events"),
        valid_chunk_ids=set(cleaned_outputs),
    )
    if cleaned_outputs == payload.get("chunk_outputs") and cleaned_events == payload.get("validation_events", []):
        return cleaned_outputs, cleaned_events

    _save_round_checkpoint(
        checkpoint_path,
        signature=signature,
        chunk_outputs=cleaned_outputs,
        validation_events=cleaned_events,
        last_error=str(payload.get("last_error", "")).strip() or None,
    )
    return cleaned_outputs, cleaned_events


def _load_resumable_chunk_outputs(
    checkpoint_path: Path,
    *,
    signature: dict[str, object],
    manifest_chunks_by_id: dict[str, object],
) -> dict[str, str]:
    cleaned_outputs, _ = _load_resumable_checkpoint_state(
        checkpoint_path,
        signature=signature,
        manifest_chunks_by_id=manifest_chunks_by_id,
    )
    return cleaned_outputs


def _save_round_checkpoint(
    checkpoint_path: Path,
    *,
    signature: dict[str, object],
    chunk_outputs: dict[str, str],
    validation_events: list[dict[str, object]] | None = None,
    last_error: str | None = None,
) -> None:
    payload: dict[str, object] = {
        **signature,
        "completed_chunk_count": len(chunk_outputs),
        "chunk_outputs": chunk_outputs,
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    if validation_events is not None:
        payload["validation_events"] = validation_events
    if last_error:
        payload["last_error"] = last_error
    _write_json_atomically(checkpoint_path, payload)


def _delete_round_checkpoint(checkpoint_path: Path) -> None:
    try:
        checkpoint_path.unlink(missing_ok=True)
    except OSError:
        _write_json_atomically(
            checkpoint_path,
            {
                "version": ROUND_CHECKPOINT_VERSION,
                "completed": True,
                "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            },
        )


def _serialize_rejected_candidate_output(text: str) -> dict[str, object]:
    normalized_text = str(text or "").strip()
    is_truncated = len(normalized_text) > MAX_REJECTED_CANDIDATE_CHARS
    output_text = normalized_text[:MAX_REJECTED_CANDIDATE_CHARS] if is_truncated else normalized_text
    return {
        "outputText": output_text,
        "outputCharCount": len(normalized_text),
        "truncated": is_truncated,
        "preview": output_text[:240],
    }


def _build_round_compare_payload(
    *,
    doc_id: str,
    round_number: int,
    prompt_profile: str,
    prompt_sequence: list[str],
    input_path: Path,
    output_path: Path,
    manifest_path: Path,
    manifest: ChunkManifest,
    chunk_outputs: dict[str, str],
    validation_events: list[dict[str, object]],
    quality_summary: dict[str, object],
) -> dict[str, object]:
    compare_chunks: list[dict[str, object]] = []
    source_fallback_events = {
        str(event.get("chunkId")): event
        for event in validation_events
        if event.get("event") == "source-fallback" and event.get("chunkId")
    }
    rejected_candidate_events: dict[str, list[dict[str, object]]] = {}
    for event in validation_events:
        if event.get("event") != "validation-retry" or not event.get("chunkId"):
            continue
        output_text = event.get("outputText")
        if not isinstance(output_text, str) or not output_text.strip():
            continue
        rejected_candidate_events.setdefault(str(event.get("chunkId")), []).append(
            {
                "attempt": event.get("attempt"),
                "candidate": event.get("candidate"),
                "outputText": output_text,
                "outputCharCount": event.get("outputCharCount"),
                "truncated": bool(event.get("truncated")),
                "error": event.get("error", ""),
            }
        )
    for chunk in manifest.chunks:
        output_text = chunk_outputs.get(chunk.chunk_id, "")
        quality = _build_chunk_quality(chunk.text, output_text)
        fallback_event = source_fallback_events.get(chunk.chunk_id)
        chunk_payload: dict[str, object] = {
            "chunkId": chunk.chunk_id,
            "paragraphIndex": chunk.paragraph_index,
            "chunkIndex": chunk.chunk_index,
            "inputText": chunk.text,
            "outputText": output_text,
            "inputCharCount": chunk.char_count,
            "inputWordCount": chunk.word_count,
            "outputCharCount": len(output_text),
            "outputWordCount": _count_latin_words(output_text),
            "quality": _apply_source_fallback_quality(quality, fallback_event) if fallback_event else quality,
        }
        if fallback_event:
            chunk_payload.update(
                {
                    "fallbackMode": "source",
                    "fallbackReason": fallback_event.get("reason", "validation-exhausted"),
                    "fallbackError": fallback_event.get("error", ""),
                    "fallbackAttempts": fallback_event.get("attempts", MAX_VALIDATION_ATTEMPTS),
                    "fallbackAt": fallback_event.get("createdAt", ""),
                }
            )
        rejected_candidates = rejected_candidate_events.get(chunk.chunk_id)
        if rejected_candidates:
            chunk_payload["rejectedCandidates"] = rejected_candidates[-4:]
        compare_chunks.append(chunk_payload)

    return {
        "version": ROUND_COMPARE_VERSION,
        "docId": doc_id,
        "round": round_number,
        "promptProfile": prompt_profile,
        "promptSequence": prompt_sequence,
        "inputPath": relative_to_root(input_path),
        "outputPath": relative_to_root(output_path),
        "manifestPath": relative_to_root(manifest_path),
        "paragraphCount": manifest.paragraph_count,
        "chunkCount": manifest.chunk_count,
        "paragraphSplitSummary": _build_paragraph_split_summary(manifest),
        "validationEvents": validation_events,
        "qualitySummary": quality_summary,
        "chunks": compare_chunks,
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def _save_round_compare(
    compare_path: Path,
    *,
    doc_id: str,
    round_number: int,
    prompt_profile: str,
    prompt_sequence: list[str],
    input_path: Path,
    output_path: Path,
    manifest_path: Path,
    manifest: ChunkManifest,
    chunk_outputs: dict[str, str],
    validation_events: list[dict[str, object]],
    quality_summary: dict[str, object],
) -> dict[str, object]:
    payload = _build_round_compare_payload(
        doc_id=doc_id,
        round_number=round_number,
        prompt_profile=prompt_profile,
        prompt_sequence=prompt_sequence,
        input_path=input_path,
        output_path=output_path,
        manifest_path=manifest_path,
        manifest=manifest,
        chunk_outputs=chunk_outputs,
        validation_events=validation_events,
        quality_summary=quality_summary,
    )
    _write_json_atomically(compare_path, payload)
    return payload


def _build_paragraph_split_summary(manifest: ChunkManifest) -> dict[str, object]:
    split_paragraphs = [paragraph for paragraph in manifest.paragraphs if len(paragraph.chunk_ids) > 1]
    reasons: dict[str, int] = {}
    for paragraph in manifest.paragraphs:
        reason = str(getattr(paragraph, "split_reason", "unknown"))
        reasons[reason] = reasons.get(reason, 0) + 1
    return {
        "paragraphCount": manifest.paragraph_count,
        "chunkCount": manifest.chunk_count,
        "splitParagraphCount": len(split_paragraphs),
        "keptParagraphCount": manifest.paragraph_count - len(split_paragraphs),
        "reasons": reasons,
    }


def _split_sentences_for_quality(text: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", str(text or "").replace("\r\n", "\n").replace("\r", "\n")).strip()
    if not normalized:
        return []
    parts = re.split(r"(?<=[\u3002\uff01\uff1f\uff1b!?;])\s*|(?<=[.!?;])\s+", normalized)
    sentences = [part.strip() for part in parts if part and part.strip()]
    if len(sentences) <= 1 and "\n" in str(text or ""):
        sentences = [part.strip() for part in re.split(r"\n+", str(text or "")) if part.strip()]
    return sentences


def _sentence_length_stats(text: str) -> dict[str, object]:
    sentences = _split_sentences_for_quality(text)
    lengths = [len(sentence) for sentence in sentences if sentence]
    if not lengths:
        return {"count": 0, "avg": 0, "min": 0, "max": 0, "variance": 0}
    avg = sum(lengths) / len(lengths)
    variance = sum((length - avg) ** 2 for length in lengths) / len(lengths)
    return {
        "count": len(lengths),
        "avg": round(avg, 2),
        "min": min(lengths),
        "max": max(lengths),
        "variance": round(variance, 2),
    }


def _assess_machine_like_risks(text: str) -> list[dict[str, object]]:
    compact = re.sub(r"\s+", "", text)
    risks: list[dict[str, object]] = []
    if not compact:
        return risks

    metrics = _style_risk_metrics(text)
    connector_count = int(metrics.get("connectorCount", 0) or 0)
    template_count = int(metrics.get("templateCount", 0) or 0)
    closing_count = int(metrics.get("closingCount", 0) or 0)
    sentence_stats = metrics.get("sentenceStats") if isinstance(metrics.get("sentenceStats"), dict) else _sentence_length_stats(text)
    sentence_count = int(metrics.get("sentenceCount", 0) or 0)
    connector_density = float(metrics.get("connectorDensity", 0) or 0)
    template_density = float(metrics.get("templateDensity", 0) or 0)

    if sentence_count >= 5 and float(sentence_stats["variance"]) < 35:
        risks.append({
            "code": "uniform_sentence_rhythm",
            "level": "medium",
            "message": "句长波动偏低，整体节奏可能过于整齐。",
        })
    if connector_density >= 0.45:
        risks.append({
            "code": "connector_overuse",
            "level": "medium",
            "message": "连接词密度偏高，容易形成模板化论文腔。",
        })
    if template_density >= 0.25:
        risks.append({
            "code": "template_phrase_density",
            "level": "high",
            "message": "高频模板句式偏多，建议局部重写。",
        })
    if closing_count >= 2 or (closing_count >= 1 and sentence_count <= 3):
        risks.append({
            "code": "generic_closing_phrase",
            "level": "medium",
            "message": "泛化总结句偏明显，建议改成贴合段落内容的表达。",
        })
    return risks


def _build_chunk_quality(input_text: str, output_text: str) -> dict[str, object]:
    input_len = max(len(input_text), 1)
    output_len = len(output_text)
    expansion_ratio = round(output_len / input_len, 3)
    input_citations = _extract_citations(input_text)
    output_citations = _extract_citations(output_text)
    protected = protect_structure_tokens(input_text)
    missing_citations = sorted(input_citations - output_citations)
    risks = _assess_machine_like_risks(output_text)
    introduced_templates = _find_introduced_template_phrases(input_text, output_text)
    style_validation_issues = _collect_machine_style_validation_issues(input_text, output_text)
    flags: list[str] = []
    advisory_flags: list[str] = []
    review_reasons: list[dict[str, object]] = []
    rewrite_advice: list[str] = []
    if missing_citations:
        flags.append("citation_missing")
        review_reasons.append({
            "code": "citation_missing",
            "level": "high",
            "message": "改写后缺少原文中的引用标记，可能影响参考文献对应关系。",
            "evidence": missing_citations[:8],
        })
        rewrite_advice.append("重跑时必须补回缺失引用，并尽量保持引用在原句相同逻辑位置。")
    if expansion_ratio > 1.75 and output_len > input_len + 120:
        flags.append("over_expanded")
        review_reasons.append({
            "code": "over_expanded",
            "level": "medium",
            "message": f"扩写比例为 {expansion_ratio}，可能加入了原文没有的解释或背景。",
            "evidence": {"inputLength": input_len, "outputLength": output_len, "ratio": expansion_ratio},
        })
        rewrite_advice.append("重跑时控制长度，删除新增背景、泛化解释和没有依据的强调。")
    if expansion_ratio < 0.45 and len(input_text) > 120:
        flags.append("over_compressed")
        review_reasons.append({
            "code": "over_compressed",
            "level": "medium",
            "message": f"压缩比例为 {expansion_ratio}，可能丢失限定条件、细节或因果关系。",
            "evidence": {"inputLength": input_len, "outputLength": output_len, "ratio": expansion_ratio},
        })
        rewrite_advice.append("重跑时补回原文关键限定、因果、对比和实验细节，不要摘要化。")
    high_risks = [risk for risk in risks if str(risk.get("level", "")).lower() == "high"]
    medium_risks = [risk for risk in risks if risk not in high_risks]
    if high_risks:
        flags.append("machine_like_expression")
        review_reasons.extend(high_risks)
        rewrite_advice.append("重跑时降低模板句式密度，打散固定连接词，改成更贴合上下文的自然表达。")
    elif medium_risks:
        advisory_flags.append("machine_like_expression")
        review_reasons.extend(medium_risks)
        rewrite_advice.append("如需继续优化，可微调连接词和句式节奏；该提示不强制重跑。")
    if introduced_templates:
        advisory_flags.append("template_phrase_drift")
        review_reasons.append({
            "code": "template_phrase_drift",
            "level": "low",
            "message": "改写后新增了偏模板化的表达；这只是提示，不作为强制审阅依据。",
            "evidence": introduced_templates[:5],
        })
        rewrite_advice.append("可选优化：避开新增模板化总结句，改成更贴合原段落语境的具体表达。")
    if style_validation_issues:
        advisory_flags.append("machine_style_drift")
        review_reasons.extend(style_validation_issues)
        rewrite_advice.append("建议定向重跑：减少新引入的套路句、机械连接词和过整齐句长，保留原文事实边界。")
    return {
        "expansionRatio": expansion_ratio,
        "missingCitationCount": len(missing_citations),
        "missingCitations": missing_citations[:8],
        "introducedTemplatePhraseCount": len(introduced_templates),
        "introducedTemplatePhrases": introduced_templates[:5],
        "styleValidationIssueCount": len(style_validation_issues),
        "styleValidationIssues": style_validation_issues,
        "machineLikeRiskCount": len(risks),
        "machineLikeRisks": risks,
        "protectedTokenCount": len(protected.tokens),
        "protectedTokenTypes": summarize_protected_token_types(protected),
        "flags": flags,
        "advisoryFlags": advisory_flags,
        "reviewReasons": review_reasons,
        "rewriteAdvice": list(dict.fromkeys(rewrite_advice)),
        "needsReview": bool(flags),
    }


def _apply_source_fallback_quality(
    quality: dict[str, object],
    fallback_event: dict[str, object] | None,
) -> dict[str, object]:
    if not fallback_event:
        return quality

    next_quality = dict(quality)
    flags = list(next_quality.get("flags") or [])
    review_reasons = list(next_quality.get("reviewReasons") or [])
    rewrite_advice = list(next_quality.get("rewriteAdvice") or [])
    if "source_fallback" not in flags:
        flags.insert(0, "source_fallback")
    review_reasons.insert(
        0,
        {
            "code": "source_fallback",
            "level": "high",
            "message": "模型连续输出未通过硬校验，系统已保留原文，避免不合格改写进入导出结果。",
            "evidence": {
                "reason": fallback_event.get("reason", "validation-exhausted"),
                "attempts": fallback_event.get("attempts", MAX_VALIDATION_ATTEMPTS),
                "error": fallback_event.get("error", ""),
            },
        },
    )
    rewrite_advice.insert(0, "建议更换模型或补充人工反馈后定向重跑此块；在重新通过硬校验前，导出会优先使用安全原文。")
    next_quality["flags"] = list(dict.fromkeys(flags))
    next_quality["reviewReasons"] = review_reasons
    next_quality["rewriteAdvice"] = list(dict.fromkeys(rewrite_advice))
    next_quality["needsReview"] = True
    return next_quality


def _build_quality_summary(
    manifest: ChunkManifest,
    chunk_outputs: dict[str, str],
    validation_events: list[dict[str, object]],
    global_style_profile: dict[str, object] | None = None,
    prompt_profile: str = "cn_custom",
) -> dict[str, object]:
    restored_preview = restore_text_from_chunks(manifest, chunk_outputs) if len(chunk_outputs) == manifest.chunk_count else ""
    split_summary = _build_paragraph_split_summary(manifest)
    retry_chunk_ids = sorted({str(event.get("chunkId", "")) for event in validation_events if event.get("event") == "validation-retry"})
    source_fallback_chunk_ids = sorted(
        {str(event.get("chunkId", "")) for event in validation_events if event.get("event") == "source-fallback"}
    )
    output_text = restored_preview or "\n".join(chunk_outputs.values())
    risks = _assess_machine_like_risks(output_text)
    introduced_template_phrases: list[str] = []
    style_validation_issues: list[dict[str, object]] = []
    frozen_chunk_ids = sorted({str(event.get("chunkId", "")) for event in validation_events if event.get("event") == "chunk-frozen"})
    api_call_estimate = _estimate_api_calls(manifest)
    effective_style_profile = global_style_profile or _build_global_style_profile(manifest)
    style_card_chunk_ids = [
        chunk.chunk_id
        for chunk in manifest.chunks
        if _build_local_style_card(chunk.text, effective_style_profile)
    ]
    citation_input_count = sum(len(_extract_citations(chunk.text)) for chunk in manifest.chunks)
    citation_output_count = sum(len(_extract_citations(chunk_outputs.get(chunk.chunk_id, ""))) for chunk in manifest.chunks)
    protected_token_count = 0
    protected_token_types: dict[str, int] = {}
    for chunk in manifest.chunks:
        protected = protect_structure_tokens(chunk.text)
        introduced_template_phrases.extend(
            _find_introduced_template_phrases(chunk.text, chunk_outputs.get(chunk.chunk_id, ""))
        )
        style_validation_issues.extend(_collect_machine_style_validation_issues(chunk.text, chunk_outputs.get(chunk.chunk_id, "")))
        protected_token_count += len(protected.tokens)
        for token_type, count in summarize_protected_token_types(protected).items():
            protected_token_types[token_type] = protected_token_types.get(token_type, 0) + count
    introduced_template_phrases = sorted(set(introduced_template_phrases))
    return {
        "label": "heuristic-writing-and-structure-report",
        "isAiDetector": False,
        "paragraphSplitSummary": split_summary,
        "hardValidationRules": [
            "paragraph-count",
            "language-stability",
            "citation-preservation",
            "number-preservation",
            "term-preservation",
            "factual-order-and-binding-preservation",
            "length-stability",
            "machine-style-drift",
        ],
        "reviewRules": [
            "machine-like-expression",
            "template-phrase-drift",
        ],
        "frozenChunkCount": len(frozen_chunk_ids),
        **api_call_estimate,
        "styleCardVersion": STYLE_CARD_VERSION,
        "styleCardChunkCount": len(style_card_chunk_ids),
        "styleCardChunkIds": style_card_chunk_ids[:24],
        "globalStyleProfile": effective_style_profile,
        "validationRetryCount": len(retry_chunk_ids),
        "sourceFallbackCount": len(source_fallback_chunk_ids),
        "sourceFallbackChunkIds": source_fallback_chunk_ids[:24],
        "validationEventCount": len(validation_events),
        "citationInputCount": citation_input_count,
        "citationOutputCount": citation_output_count,
        "protectedTokenCount": protected_token_count,
        "protectedTokenTypes": protected_token_types,
        "introducedTemplatePhraseCount": len(introduced_template_phrases),
        "introducedTemplatePhrases": introduced_template_phrases[:12],
        "styleValidationIssueCount": len(style_validation_issues),
        "styleValidationIssues": style_validation_issues[:12],
        "machineLikeRiskCount": len(risks),
        "machineLikeRisks": risks,
        "sentenceStats": _sentence_length_stats(output_text),
    }


def _build_run_audit(
    *,
    checkpoint_metadata: dict[str, object],
    prompt_profile: str,
    prompt_sequence: list[str],
    manifest: ChunkManifest,
    quality_summary: dict[str, object],
) -> dict[str, object]:
    split_summary = quality_summary.get("paragraphSplitSummary")
    split_count = 0
    if isinstance(split_summary, dict):
        try:
            split_count = int(split_summary.get("splitParagraphCount", 0) or 0)
        except (TypeError, ValueError):
            split_count = 0
    return {
        "version": 1,
        "providerName": str(checkpoint_metadata.get("round_model_provider", "") or ""),
        "model": str(checkpoint_metadata.get("model", "") or ""),
        "apiType": str(checkpoint_metadata.get("api_type", "") or ""),
        "temperature": checkpoint_metadata.get("temperature"),
        "requestTimeoutSeconds": checkpoint_metadata.get("request_timeout_seconds"),
        "maxRetries": checkpoint_metadata.get("max_retries"),
        "rateLimitWindowMinutes": checkpoint_metadata.get("rate_limit_window_minutes"),
        "rateLimitMaxRequests": checkpoint_metadata.get("rate_limit_max_requests"),
        "promptProfile": prompt_profile,
        "promptSequence": prompt_sequence,
        "estimatedApiCalls": quality_summary.get("estimatedApiCalls"),
        "chunkCount": manifest.chunk_count,
        "paragraphCount": manifest.paragraph_count,
        "splitParagraphCount": split_count,
        "validationRetryCount": quality_summary.get("validationRetryCount"),
        "sourceFallbackCount": quality_summary.get("sourceFallbackCount"),
        "validationEventCount": quality_summary.get("validationEventCount"),
        "machineLikeRiskCount": quality_summary.get("machineLikeRiskCount"),
        "protectedTokenCount": quality_summary.get("protectedTokenCount"),
    }


def run_round(
    doc_id: str,
    round_number: int,
    input_path: Path,
    output_path: Path,
    manifest_path: Path,
    transform: Transform,
    prompt_profile: str = "cn",
    prompt_sequence: object | None = None,
    chunk_limit: int = DEFAULT_CHUNK_LIMIT,
    score_total: int | None = None,
    progress_callback: ProgressCallback | None = None,
    checkpoint_metadata: dict[str, object] | None = None,
    cancel_check: CancelCheck | None = None,
) -> dict:
    normalized_input_path = normalize_path(input_path)
    normalized_output_path = normalize_path(output_path)
    normalized_manifest_path = normalize_path(manifest_path)
    normalized_prompt_profile = normalize_prompt_profile(prompt_profile)
    normalized_prompt_sequence = normalize_prompt_sequence(normalized_prompt_profile, prompt_sequence)
    chunk_metric = get_chunk_metric(normalized_prompt_profile, normalized_prompt_sequence)

    text = normalized_input_path.read_text(encoding="utf-8")
    manifest = build_manifest(text, chunk_limit=chunk_limit, chunk_metric=chunk_metric)
    save_manifest(manifest, normalized_manifest_path)
    api_call_estimate = _estimate_api_calls(manifest)
    global_style_profile = _build_global_style_profile(manifest)
    effective_checkpoint_metadata = {
        **(checkpoint_metadata or {}),
        "style_card_version": STYLE_CARD_VERSION,
        "global_style_profile_sha256": _sha256_json(global_style_profile),
    }
    prompt_text = load_prompt(normalized_prompt_profile, round_number, normalized_prompt_sequence)
    checkpoint_path = get_round_checkpoint_path(normalized_output_path)
    compare_path = get_round_compare_path(normalized_output_path)
    quality_path = get_round_quality_path(normalized_output_path)
    manifest_chunk_ids = [chunk.chunk_id for chunk in manifest.chunks]
    manifest_chunks_by_id = {chunk.chunk_id: chunk for chunk in manifest.chunks}
    checkpoint_signature = _build_checkpoint_signature(
        doc_id=doc_id,
        round_number=round_number,
        prompt_profile=normalized_prompt_profile,
        prompt_sequence=normalized_prompt_sequence,
        input_path=normalized_input_path,
        output_path=normalized_output_path,
        manifest_path=normalized_manifest_path,
        manifest_chunk_ids=manifest_chunk_ids,
        input_sha256=_sha256_text(text),
        prompt_sha256=_sha256_text(prompt_text),
        chunk_limit=chunk_limit,
        chunk_metric=chunk_metric,
        checkpoint_metadata=effective_checkpoint_metadata,
    )
    chunk_outputs, validation_events = _load_resumable_checkpoint_state(
        checkpoint_path,
        signature=checkpoint_signature,
        manifest_chunks_by_id=manifest_chunks_by_id,
    )

    if progress_callback is not None:
        progress_callback(
            {
                "phase": "chunking-ready",
                "round": round_number,
                "totalChunks": manifest.chunk_count,
                "paragraphCount": manifest.paragraph_count,
                "inputPath": str(normalized_input_path),
                "outputPath": str(normalized_output_path),
                **api_call_estimate,
            }
        )
        if chunk_outputs:
            progress_callback(
                {
                    "phase": "resuming-from-checkpoint",
                    "round": round_number,
                    "completedChunks": len(chunk_outputs),
                    "totalChunks": manifest.chunk_count,
                    "checkpointPath": str(checkpoint_path),
                    "outputPath": str(normalized_output_path),
                }
            )
            for resumed_index, resumed_chunk in enumerate(manifest.chunks, start=1):
                resumed_output = chunk_outputs.get(resumed_chunk.chunk_id)
                if resumed_output is None:
                    continue
                progress_callback(
                    {
                        "phase": "chunk-complete",
                        "round": round_number,
                        "currentChunk": resumed_index,
                        "totalChunks": manifest.chunk_count,
                        "chunkId": resumed_chunk.chunk_id,
                        "paragraphIndex": resumed_chunk.paragraph_index,
                        "chunkIndex": resumed_chunk.chunk_index,
                        "outputPath": str(normalized_output_path),
                        "compareInputText": resumed_chunk.text,
                        "compareOutputText": resumed_output,
                        **api_call_estimate,
                    }
                )

    prompts = get_prompt_mapping(normalized_prompt_profile, normalized_prompt_sequence)
    for index, chunk in enumerate(manifest.chunks, start=1):
        if cancel_check is not None and cancel_check():
            _save_round_checkpoint(
                checkpoint_path,
                signature=checkpoint_signature,
                chunk_outputs=chunk_outputs,
                validation_events=validation_events,
                last_error="Round interrupted by user before processing next chunk.",
            )
            raise RuntimeError("Run was interrupted by user. Completed chunks are kept; click continue to resume this round.")
        if chunk.chunk_id in chunk_outputs:
            continue
        if progress_callback is not None:
            progress_callback(
                {
                    "phase": "processing-chunk",
                    "round": round_number,
                    "currentChunk": index,
                    "totalChunks": manifest.chunk_count,
                    "chunkId": chunk.chunk_id,
                    "paragraphIndex": chunk.paragraph_index,
                    "chunkIndex": chunk.chunk_index,
                    "outputPath": str(normalized_output_path),
                    **api_call_estimate,
                }
            )
        try:
            chunk_output = ""
            validation_error: ValueError | None = None
            protected_chunk = protect_structure_tokens(chunk.text)
            if should_freeze_chunk(normalized_prompt_profile, chunk.text):
                chunk_output = chunk.text
                validation_events.append(
                    {
                        "event": "chunk-frozen",
                        "round": round_number,
                        "chunkId": chunk.chunk_id,
                        "paragraphIndex": chunk.paragraph_index,
                        "chunkIndex": chunk.chunk_index,
                        "reason": "english_preserved_in_cn_profile",
                    }
                )
                validate_chunk_output(chunk.text, chunk_output, chunk.chunk_id)
                chunk_outputs[chunk.chunk_id] = chunk_output
                _save_round_checkpoint(
                    checkpoint_path,
                    signature=checkpoint_signature,
                    chunk_outputs=chunk_outputs,
                    validation_events=validation_events,
                )
                if progress_callback is not None:
                    progress_callback(
                        {
                            "phase": "chunk-frozen",
                            "round": round_number,
                            "currentChunk": index,
                            "totalChunks": manifest.chunk_count,
                            "chunkId": chunk.chunk_id,
                            "paragraphIndex": chunk.paragraph_index,
                            "chunkIndex": chunk.chunk_index,
                            "outputPath": str(normalized_output_path),
                            **api_call_estimate,
                        }
                    )
                continue
            for validation_attempt in range(1, MAX_VALIDATION_ATTEMPTS + 1):
                if chunk.chunk_id in chunk_outputs:
                    break
                retry_note = None
                if validation_error is not None:
                    retry_note = _build_retry_note(chunk.text, str(validation_error))
                effective_prompt_text = prompt_text
                valid_candidates: list[tuple[float, str, int]] = []
                raw_chunk_output = transform(
                    protected_chunk.text,
                    build_prompt_input(
                        effective_prompt_text,
                        protected_chunk.text,
                        round_number,
                        chunk.chunk_id,
                        retry_note=retry_note,
                        relation_guard=build_factual_relation_guard(chunk.text),
                        style_card=_build_local_style_card(chunk.text, global_style_profile),
                    ),
                    round_number,
                    chunk.chunk_id,
                )
                candidate_output_for_review = raw_chunk_output
                protected_output = normalize_chunk_output(protected_chunk.text, raw_chunk_output)
                try:
                    validate_structure_placeholders(protected_output, protected_chunk.tokens, chunk.chunk_id)
                    candidate_output = restore_structure_tokens(protected_output, protected_chunk.tokens)
                    candidate_output_for_review = candidate_output
                    validate_chunk_output(chunk.text, candidate_output, chunk.chunk_id)
                    valid_candidates.append((_score_rewrite_candidate(chunk.text, candidate_output), candidate_output, 1))
                except ValueError as exc:
                    validation_error = exc
                    rejected_candidate_payload = _serialize_rejected_candidate_output(candidate_output_for_review)
                    validation_events.append(
                        {
                            "event": "validation-retry",
                            "round": round_number,
                            "chunkId": chunk.chunk_id,
                            "paragraphIndex": chunk.paragraph_index,
                            "chunkIndex": chunk.chunk_index,
                            "attempt": validation_attempt,
                            "candidate": 1,
                            "error": str(exc),
                            **rejected_candidate_payload,
                        }
                    )

                if valid_candidates:
                    _selected_score, chunk_output, _selected_candidate = min(valid_candidates, key=lambda item: item[0])
                    validation_error = None
                    break
                if validation_error is not None and validation_attempt >= MAX_VALIDATION_ATTEMPTS:
                    chunk_output = chunk.text
                    validation_events.append(
                        {
                            "event": "source-fallback",
                            "round": round_number,
                            "chunkId": chunk.chunk_id,
                            "paragraphIndex": chunk.paragraph_index,
                            "chunkIndex": chunk.chunk_index,
                            "attempts": validation_attempt,
                            "reason": "validation-exhausted",
                            "error": str(validation_error),
                            "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                        }
                    )
                    if progress_callback is not None:
                        progress_callback(
                            {
                                "phase": "chunk-source-fallback",
                                "round": round_number,
                                "currentChunk": index,
                                "totalChunks": manifest.chunk_count,
                                "chunkId": chunk.chunk_id,
                                "paragraphIndex": chunk.paragraph_index,
                                "chunkIndex": chunk.chunk_index,
                                "error": str(validation_error),
                                **api_call_estimate,
                            }
                        )
                    validation_error = None
                    break
            if chunk.chunk_id not in chunk_outputs:
                chunk_outputs[chunk.chunk_id] = chunk_output
                _save_round_checkpoint(
                    checkpoint_path,
                    signature=checkpoint_signature,
                    chunk_outputs=chunk_outputs,
                    validation_events=validation_events,
                )
        except Exception as exc:
            _save_round_checkpoint(
                checkpoint_path,
                signature=checkpoint_signature,
                chunk_outputs=chunk_outputs,
                validation_events=validation_events,
                last_error=f"Chunk {chunk.chunk_id} failed: {exc}",
            )
            if progress_callback is not None:
                progress_callback(
                    {
                        "phase": "chunk-failed",
                        "round": round_number,
                        "currentChunk": index,
                        "totalChunks": manifest.chunk_count,
                        "chunkId": chunk.chunk_id,
                        "error": str(exc),
                        **api_call_estimate,
                    }
                )
            raise

        if progress_callback is not None:
            progress_callback(
                {
                    "phase": "chunk-complete",
                    "round": round_number,
                    "currentChunk": index,
                    "totalChunks": manifest.chunk_count,
                    "chunkId": chunk.chunk_id,
                    "paragraphIndex": chunk.paragraph_index,
                    "chunkIndex": chunk.chunk_index,
                    "outputPath": str(normalized_output_path),
                    "compareInputText": chunk.text,
                    "compareOutputText": chunk_output,
                    **api_call_estimate,
                }
            )

    restored = restore_text_from_chunks(manifest, chunk_outputs)

    if progress_callback is not None:
        progress_callback(
            {
                "phase": "restoring-output",
                "round": round_number,
                "totalChunks": manifest.chunk_count,
                **api_call_estimate,
            }
        )

    normalized_output_path.parent.mkdir(parents=True, exist_ok=True)
    normalized_output_path.write_text(restored, encoding="utf-8")
    quality_summary = _build_quality_summary(
        manifest,
        chunk_outputs,
        validation_events,
        global_style_profile,
        normalized_prompt_profile,
    )
    run_audit = _build_run_audit(
        checkpoint_metadata=effective_checkpoint_metadata,
        prompt_profile=normalized_prompt_profile,
        prompt_sequence=normalized_prompt_sequence,
        manifest=manifest,
        quality_summary=quality_summary,
    )
    _write_json_atomically(quality_path, quality_summary)
    _save_round_compare(
        compare_path,
        doc_id=doc_id,
        round_number=round_number,
        prompt_profile=normalized_prompt_profile,
        prompt_sequence=normalized_prompt_sequence,
        input_path=normalized_input_path,
        output_path=normalized_output_path,
        manifest_path=normalized_manifest_path,
        manifest=manifest,
        chunk_outputs=chunk_outputs,
        validation_events=validation_events,
        quality_summary=quality_summary,
    )

    doc_entry = update_round(
        doc_id=doc_id,
        round_number=round_number,
        prompt=prompts[round_number],
        prompt_profile=normalized_prompt_profile,
        prompt_sequence=normalized_prompt_sequence,
        input_path=relative_to_root(normalized_input_path),
        output_path=relative_to_root(normalized_output_path),
        score_total=score_total,
        chunk_limit=chunk_limit,
        input_segment_count=manifest.chunk_count,
        output_segment_count=len(chunk_outputs),
        manifest_path=relative_to_root(normalized_manifest_path),
        compare_path=relative_to_root(compare_path),
        quality_path=relative_to_root(quality_path),
        run_audit=run_audit,
    )
    _delete_round_checkpoint(checkpoint_path)

    return {
        "doc_entry": doc_entry,
        "round": round_number,
        "output_path": str(normalized_output_path),
        "manifest_path": str(normalized_manifest_path),
        "compare_path": str(compare_path),
        "quality_path": str(quality_path),
        "chunk_limit": chunk_limit,
        "input_segment_count": manifest.chunk_count,
        "output_segment_count": len(chunk_outputs),
        "paragraph_count": manifest.paragraph_count,
        "quality_summary": quality_summary,
        "run_audit": run_audit,
    }
