from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


NUMBER_RE = re.compile(r"(?<![A-Za-z0-9_.:/-])\d+(?:[.,]\d+)*(?:\.\d+)?\s*(?:%|\uff05)?(?![A-Za-z0-9_.:/-])")
TECH_ENTITY_RE = re.compile(
    r"(?<![A-Za-z0-9_])(?:"
    r"(?:[A-Z]{2,}[A-Za-z0-9]*|[A-Z][A-Za-z0-9]*)(?:[-_](?:[A-Z]{2,}[A-Za-z0-9]*|[A-Z][A-Za-z0-9]*|\d+[A-Za-z0-9]*))+"
    r"|(?:[A-Z]{2,}[- ]?\d+(?:\.\d+)*)"
    r"|(?:[A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)"
    r"|(?:[A-Z]{2,}[A-Za-z0-9]*)"
    r"|(?:[A-Za-z]+(?:[./:_-][A-Za-z0-9_]+)+)"
    r")(?![A-Za-z0-9_])"
)
TITLE_CASE_PHRASE_RE = re.compile(
    r"(?<![A-Za-z0-9])"
    r"(?:[A-Z][A-Za-z0-9]+(?:[-/][A-Z]?[A-Za-z0-9]+)?)(?:\s+(?:[A-Z][A-Za-z0-9]+(?:[-/][A-Z]?[A-Za-z0-9]+)?)){1,5}"
    r"(?![A-Za-z0-9])"
)
SEGMENT_SPLIT_RE = re.compile(r"[。！？!?；;]\s*|\n+")
ORDER_CUE_RE = re.compile(
    r"(?:→|->|=>|≥|≤|>|<|、|，|,|/|\band\b|\bor\b|\brespectively\b|分别|依次|对应|顺序|排序|排名|高于|低于|优于|劣于|先后|从.+到)",
    re.IGNORECASE,
)
STRONG_ORDER_CUE_RE = re.compile(r"(?:→|->|=>|\brespectively\b|分别|依次|对应|顺序|排序|排名|先后)", re.IGNORECASE)
LIST_DELIMITER_RE = re.compile(r"(?:、|，|,|/|\band\b|\bor\b)", re.IGNORECASE)
GENERIC_TITLE_LEADERS = {
    "a",
    "an",
    "and",
    "as",
    "at",
    "by",
    "for",
    "from",
    "in",
    "of",
    "on",
    "or",
    "the",
    "this",
    "these",
    "those",
    "to",
    "with",
}
GENERIC_TITLE_PHRASES = {
    "abstract",
    "key words",
    "keywords",
    "table",
    "figure",
}


@dataclass(frozen=True)
class EntityOccurrence:
    term: str
    start: int
    end: int
    kind: str


def extract_factual_entities(text: str) -> list[str]:
    return _unique_preserve_order(item.term for item in _extract_entity_occurrences(text))


def contains_entity(text: str, term: str) -> bool:
    return bool(_find_entity_positions(text, term))


def build_factual_relation_guard(text: str) -> str:
    entity_sequences = extract_order_sensitive_entity_sequences(text)
    number_sequences = extract_order_sensitive_number_sequences(text)
    parallel_pairs = extract_parallel_entity_number_pairs(text)
    if not entity_sequences and not number_sequences and not parallel_pairs:
        return ""

    lines = [
        "[FACT RELATION LOCK]",
        "- Preserve factual order and item-value bindings exactly.",
        "- Do not reorder algorithms, models, metrics, years, versions, citations, or numeric values.",
    ]
    for sequence in entity_sequences[:4]:
        lines.append(f"- Keep item order: {' -> '.join(sequence[:10])}")
    for sequence in number_sequences[:3]:
        lines.append(f"- Keep numeric order: {' -> '.join(sequence[:10])}")
    if parallel_pairs:
        preview = "; ".join(f"{term}={number}" for term, number in parallel_pairs[:8])
        lines.append(f"- Keep item-value bindings: {preview}")
    return "\n".join(lines)


def collect_factual_relation_issues(input_text: str, output_text: str) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    for sequence in extract_order_sensitive_entity_sequences(input_text):
        violation = _find_entity_order_violation(sequence, output_text)
        if violation:
            issues.append(
                {
                    "code": "entity_order_changed",
                    "message": "Factual entity order changed.",
                    "evidence": violation,
                }
            )

    for sequence in extract_order_sensitive_number_sequences(input_text):
        violation = _find_number_order_violation(sequence, output_text)
        if violation:
            issues.append(
                {
                    "code": "number_order_changed",
                    "message": "Numeric order changed.",
                    "evidence": violation,
                }
            )

    for term, number in extract_parallel_entity_number_pairs(input_text):
        if not contains_entity(output_text, term):
            issues.append(
                {
                    "code": "entity_value_binding_missing_entity",
                    "message": "An item in an item-value binding is missing.",
                    "evidence": {"term": term, "number": number},
                }
            )
            continue
        if _normalize_number(number) not in _number_positions_by_norm(output_text):
            issues.append(
                {
                    "code": "entity_value_binding_missing_number",
                    "message": "A value in an item-value binding is missing.",
                    "evidence": {"term": term, "number": number},
                }
            )

    return _dedupe_issues(issues)


def validate_factual_relation_stability(input_text: str, output_text: str, context_label: str) -> None:
    issues = collect_factual_relation_issues(input_text, output_text)
    if not issues:
        return
    first = issues[0]
    raise ValueError(f"{context_label} changed factual order or item-value bindings: {first['code']} {first.get('evidence', {})}")


def extract_order_sensitive_entity_sequences(text: str) -> list[list[str]]:
    sequences: list[list[str]] = []
    for segment in _iter_segments(text):
        occurrences = _extract_entity_occurrences(segment)
        terms = _unique_preserve_order(item.term for item in occurrences)
        if len(terms) < 2:
            continue
        number_count = len(_extract_numbers(segment))
        if _is_order_sensitive_segment(segment, len(terms), number_count):
            sequences.append(terms)
    return _dedupe_sequences(sequences)


def extract_order_sensitive_number_sequences(text: str) -> list[list[str]]:
    sequences: list[list[str]] = []
    for segment in _iter_segments(text):
        numbers = _unique_preserve_order(_normalize_number(number) for number in _extract_numbers(segment))
        if len(numbers) < 2:
            continue
        entity_count = len(_unique_preserve_order(item.term for item in _extract_entity_occurrences(segment)))
        if STRONG_ORDER_CUE_RE.search(segment) or entity_count >= 2 or LIST_DELIMITER_RE.search(segment):
            sequences.append(numbers)
    return _dedupe_sequences(sequences)


def extract_parallel_entity_number_pairs(text: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for segment in _iter_segments(text):
        terms = _unique_preserve_order(item.term for item in _extract_entity_occurrences(segment))
        numbers = _unique_preserve_order(_normalize_number(number) for number in _extract_numbers(segment))
        if len(terms) < 2 or len(terms) != len(numbers):
            continue
        if STRONG_ORDER_CUE_RE.search(segment) or "respectively" in segment.lower() or "分别" in segment:
            pairs.extend(zip(terms, numbers))
    return list(dict.fromkeys(pairs))


def _is_order_sensitive_segment(segment: str, entity_count: int, number_count: int) -> bool:
    if STRONG_ORDER_CUE_RE.search(segment):
        return True
    if entity_count >= 3 and LIST_DELIMITER_RE.search(segment):
        return True
    return False


def _extract_entity_occurrences(text: str) -> list[EntityOccurrence]:
    raw: list[EntityOccurrence] = []
    for match in TECH_ENTITY_RE.finditer(text):
        term = match.group(0).strip()
        if _is_noise_entity(term):
            continue
        raw.append(EntityOccurrence(term, match.start(), match.end(), "tech"))
    for match in TITLE_CASE_PHRASE_RE.finditer(text):
        term = re.sub(r"\s+", " ", match.group(0).strip())
        if _is_noise_entity(term):
            continue
        raw.append(EntityOccurrence(term, match.start(), match.end(), "title"))
    return _remove_overlapping_entities(raw)


def _remove_overlapping_entities(items: list[EntityOccurrence]) -> list[EntityOccurrence]:
    sorted_items = sorted(items, key=lambda item: (item.start, -(item.end - item.start)))
    kept: list[EntityOccurrence] = []
    occupied: list[tuple[int, int]] = []
    for item in sorted_items:
        if any(item.start < end and item.end > start for start, end in occupied):
            continue
        kept.append(item)
        occupied.append((item.start, item.end))
    return sorted(kept, key=lambda item: item.start)


def _is_noise_entity(term: str) -> bool:
    compact = re.sub(r"\s+", " ", term.strip())
    if len(compact) < 2:
        return True
    lower = compact.lower()
    if lower in GENERIC_TITLE_PHRASES:
        return True
    words = lower.split()
    if words and words[0] in GENERIC_TITLE_LEADERS:
        return True
    if len(words) >= 2 and all(word in GENERIC_TITLE_LEADERS for word in words):
        return True
    return False


def _extract_numbers(text: str) -> list[str]:
    return [match.group(0).strip() for match in NUMBER_RE.finditer(text)]


def _iter_segments(text: str) -> list[str]:
    segments = [segment.strip() for segment in SEGMENT_SPLIT_RE.split(text.replace("\r\n", "\n").replace("\r", "\n"))]
    return [segment for segment in segments if segment]


def _find_entity_order_violation(sequence: list[str], output_text: str) -> dict[str, Any] | None:
    checked = _unique_preserve_order(sequence)
    if len(checked) < 2:
        return None
    positions: list[tuple[str, int]] = []
    missing: list[str] = []
    for term in checked:
        term_positions = _find_entity_positions(output_text, term)
        if not term_positions:
            missing.append(term)
            continue
        positions.append((term, term_positions[0]))
    if missing:
        return {"expected": checked, "missing": missing}
    if any(positions[index][1] >= positions[index + 1][1] for index in range(len(positions) - 1)):
        actual = [term for term, _ in sorted(positions, key=lambda item: item[1])]
        return {"expected": checked, "actual": actual}
    return None


def _find_number_order_violation(sequence: list[str], output_text: str) -> dict[str, Any] | None:
    checked = _unique_preserve_order(sequence)
    if len(checked) < 2:
        return None
    positions_by_number = _number_positions_by_norm(output_text)
    positions: list[tuple[str, int]] = []
    missing: list[str] = []
    for number in checked:
        number_positions = positions_by_number.get(_normalize_number(number), [])
        if not number_positions:
            missing.append(number)
            continue
        positions.append((number, number_positions[0]))
    if missing:
        return {"expected": checked, "missing": missing}
    if any(positions[index][1] >= positions[index + 1][1] for index in range(len(positions) - 1)):
        actual = [number for number, _ in sorted(positions, key=lambda item: item[1])]
        return {"expected": checked, "actual": actual}
    return None


def _find_entity_positions(text: str, term: str) -> list[int]:
    escaped = re.escape(term.strip())
    escaped = re.sub(r"\\\s+", r"\\s+", escaped)
    pattern = re.compile(rf"(?<![A-Za-z0-9_/-]){escaped}(?![A-Za-z0-9_/-])")
    return [match.start() for match in pattern.finditer(text)]


def _number_positions_by_norm(text: str) -> dict[str, list[int]]:
    positions: dict[str, list[int]] = {}
    for match in NUMBER_RE.finditer(text):
        normalized = _normalize_number(match.group(0))
        positions.setdefault(normalized, []).append(match.start())
    return positions


def _normalize_number(number: str) -> str:
    return re.sub(r"\s+", "", number.strip()).replace("\uff05", "%")


def _unique_preserve_order(items: Any) -> list[Any]:
    seen: set[Any] = set()
    result: list[Any] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def _dedupe_sequences(sequences: list[list[str]]) -> list[list[str]]:
    deduped: list[list[str]] = []
    seen: set[tuple[str, ...]] = set()
    for sequence in sequences:
        key = tuple(sequence)
        if len(key) < 2 or key in seen:
            continue
        seen.add(key)
        deduped.append(sequence)
    return deduped


def _dedupe_issues(issues: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for issue in issues:
        key = repr((issue.get("code"), issue.get("evidence")))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(issue)
    return deduped
