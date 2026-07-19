from __future__ import annotations

from collections import Counter
import re
from dataclasses import dataclass
from typing import Any


NUMBER_RE = re.compile(r"(?<![A-Za-z0-9_.:/-])\d+(?:[.,]\d+)*(?:\.\d+)?\s*(?:%|\uff05)?(?![A-Za-z0-9_.:/-])")
URL_RE = re.compile(r"https?://[^\s`，,。；;）)\]】>\"']+", re.IGNORECASE)
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
METRIC_ENTITY_RE = re.compile(
    r"(?<![A-Za-z0-9_])(?:"
    r"准确率|正确率|精确率|召回率|特异度|灵敏度|命中率|通过率|成功率|错误率|误差率"
    r"|F1(?:[-_ ]?score|值)?|mAP(?:@\d+(?::\d+)?)?|AUC(?:值)?|AP|AR|RMSE|MAE|MSE|R\^?2"
    r"|损失值|平均损失|推理延迟|响应延迟|吞吐量|参数量|显存占用|内存占用"
    r")(?![A-Za-z0-9_])",
    re.IGNORECASE,
)
NEGATION_MARKER_RE = re.compile(
    r"(?:并非|并不|并未|尚未|不得|不能|不可|不会|没有|并无|毫无|无法|未(?!来|知)|不(?!仅|但|论|管|妨))"
    r"|\b(?:not|no|never|without|cannot|can't|isn't|aren't|wasn't|weren't|doesn't|don't|didn't)\b",
    re.IGNORECASE,
)
FACTUAL_SCOPE_QUALIFIER_CHANGED = "factual_scope_qualifier_changed"
SCOPE_QUALIFIER_PROMPT_EXAMPLES = (
    "仅、只、只有、唯有、唯一、全部、全都、所有、任何、任一、一律、均、"
    "必然、必定、势必 / only, solely, all, every, any, necessarily, always"
)

# Scope-bearing Chinese qualifiers are compared as a provider-independent
# delta.  Long constructions must precede their one-character members so a
# phrase such as “只要” is classified once, as a sufficient condition, rather
# than as a generic exclusivity marker.  “不仅/不只” is an additive paired
# construction and is deliberately ignored here; removing its leading “不”
# still creates a new exclusivity marker in the candidate and is blocked.
SCOPE_QUALIFIER_TOKEN_RE = re.compile(
    r"不仅仅|不仅|不只|只要|只需|只须|仅需|仅须|只有|唯有|唯一|仅仅"
    r"|全部|全都|所有|任何|任一|一律|必然|必定|势必|仅|只|均"
)
SCOPE_QUALIFIER_IGNORED_TOKENS = frozenset({"不仅仅", "不仅", "不只"})
SCOPE_CLASSIFIER_PRECEDERS = frozenset("0123456789一二两三四五六七八九十百千万几多每这那某")
SCOPE_LEXICAL_ONLY_PRECEDERS = frozenset({"船", "舰"})
SCOPE_LEXICAL_ONLY_FOLLOWERS = ("身", "字", "言片语", "手遮天")
SCOPE_JUN_FOLLOW_RE = re.compile(
    r"^(?:为|是|可|能|应|须|需|已|未|不|会|由|在|对|与|向|从|把|将|被|有|无|"
    r"采用|使用|包含|包括|属于|来自|达到|保持|维持|表现|呈现|出现|支持|满足|通过|"
    r"获得|得到|完成|经过|按照|依据|处于|位于|超过|低于|高于|优于|一致|相同|不同)"
)
SCOPE_CLAUSE_END_RE = re.compile(r"[。！？!?；;\n]")
SCOPE_NECESSARY_LOCATION_RE = re.compile(
    r"^在[^。！？!?；;\n]{1,48}?(?:时|前|后|条件下)(?:才)?"
)
EN_SCOPE_QUALIFIER_TOKEN_RE = re.compile(
    r"\b(?:only|solely|all|every|any|necessarily|always)\b",
    re.IGNORECASE,
)
EN_ADDITIVE_NOT_ONLY_RE = re.compile(r"\bnot\s+$", re.IGNORECASE)
SEGMENT_SPLIT_RE = re.compile(r"[。！？!?；;]\s*|\n+")
ORDER_CUE_RE = re.compile(
    r"(?:→|->|=>|≥|≤|>|<|、|，|,|/|\band\b|\bor\b|\brespectively\b|分别|依次|对应|顺序|排序|排名|高于|低于|优于|劣于|先后|从.+到)",
    re.IGNORECASE,
)
STRONG_ORDER_CUE_RE = re.compile(r"(?:→|->|=>|\brespectively\b|分别|依次|对应|顺序|排序|排名|先后)", re.IGNORECASE)
LIST_DELIMITER_RE = re.compile(r"(?:、|，|,|/|\band\b|\bor\b)", re.IGNORECASE)
INLINE_CODE_RE = re.compile(r"`[^`]+`")
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


@dataclass(frozen=True)
class ScopeQualifierOccurrence:
    token: str
    kind: str
    paragraph_index: int


def extract_factual_entities(text: str) -> list[str]:
    return _unique_preserve_order(item.term for item in _extract_entity_occurrences(text))


def contains_entity(text: str, term: str) -> bool:
    return bool(_find_entity_positions(text, term))


def build_factual_relation_guard(text: str) -> str:
    entity_sequences = extract_order_sensitive_entity_sequences(text)
    number_sequences = extract_order_sensitive_number_sequences(text)
    parallel_pairs = extract_parallel_entity_number_pairs(text)
    scope_occurrences = _scope_qualifier_occurrences(text)
    scope_kind_counts = Counter(occurrence.kind for occurrence in scope_occurrences)
    lines = [
        "[FACT RELATION LOCK]",
        "- Do not add, remove, move, or strengthen exclusivity, totality, universal-scope, or certainty qualifiers.",
        "- Preserve the logical scope of source qualifiers such as only, all, any, and necessarily.",
        "- Preserve factual order and item-value bindings exactly.",
        "- Do not reorder algorithms, models, metrics, years, versions, citations, or numeric values.",
    ]
    if scope_occurrences:
        kind_summary = ", ".join(
            f"{kind}={count}"
            for kind, count in sorted(scope_kind_counts.items())
        )
        lines.extend(
            [
                f"- Source protected scope-qualifier count: {len(scope_occurrences)} ({kind_summary}).",
                "- Keep those protected qualifier class/count totals in the same natural paragraph; do not create a stylistic substitute in another class.",
            ]
        )
    else:
        lines.extend(
            [
                "- Source protected scope-qualifier count: 0. Output protected scope-qualifier count must also be 0.",
                f"- Do not introduce these logical operators as stylistic intensifiers: {SCOPE_QUALIFIER_PROMPT_EXAMPLES}.",
            ]
        )
    for sequence in entity_sequences[:4]:
        lines.append(f"- Keep item order: {' -> '.join(sequence[:10])}")
    for sequence in number_sequences[:3]:
        lines.append(f"- Keep numeric order: {' -> '.join(sequence[:10])}")
    if parallel_pairs:
        preview = "; ".join(f"{term}={number}" for term, number in parallel_pairs[:8])
        lines.append(f"- Keep item-value bindings: {preview}")
    return "\n".join(lines)


def build_factual_scope_repair_guard(input_text: str, output_text: str) -> str:
    """Describe only the bounded scope-token delta for an in-memory retry.

    The rejected candidate is never persisted.  This prompt-only diagnostic
    gives a model the concrete operator it introduced (or dropped) instead of
    repeating a generic warning that may be ignored on the next attempt.
    """

    input_occurrences = _scope_qualifier_occurrences(input_text)
    output_occurrences = _scope_qualifier_occurrences(output_text)

    def occurrence_key(occurrence: ScopeQualifierOccurrence) -> str:
        return f"p{occurrence.paragraph_index}:{occurrence.kind}"

    input_profile = Counter(occurrence_key(item) for item in input_occurrences)
    output_profile = Counter(occurrence_key(item) for item in output_occurrences)
    added_profile = output_profile - input_profile
    removed_profile = input_profile - output_profile
    if not added_profile and not removed_profile:
        return ""

    def delta_tokens(
        occurrences: list[ScopeQualifierOccurrence],
        delta: Counter[str],
    ) -> list[str]:
        remaining = Counter(delta)
        tokens: list[str] = []
        for occurrence in occurrences:
            key = occurrence_key(occurrence)
            if remaining.get(key, 0) <= 0:
                continue
            remaining[key] -= 1
            if occurrence.token not in tokens:
                tokens.append(occurrence.token)
        return tokens[:12]

    added_tokens = delta_tokens(output_occurrences, added_profile)
    removed_tokens = delta_tokens(input_occurrences, removed_profile)
    lines = [
        "[SCOPE QUALIFIER RETRY DIFF]",
        "- The previous candidate changed a protected logical operator inventory; repair this exact delta before pursuing style changes.",
        f"- Source protected qualifier count: {len(input_occurrences)}; previous candidate count: {len(output_occurrences)}.",
    ]
    if added_tokens:
        lines.append(
            "- Newly introduced operator token(s) to remove: "
            + ", ".join(added_tokens)
            + ". Do not replace them with another exclusivity, totality, universal, or certainty word."
        )
    if removed_tokens:
        lines.append(
            "- Source operator token(s) that must be restored: "
            + ", ".join(removed_tokens)
            + ". Preserve their logical class and paragraph."
        )
    lines.append(
        "- If a safe rewrite is uncertain, return the [INPUT TEXT] verbatim; an exact source copy is preferred to any changed scope."
    )
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

    input_negations = NEGATION_MARKER_RE.findall(input_text)
    output_negations = NEGATION_MARKER_RE.findall(output_text)
    if input_negations and not output_negations:
        issues.append(
            {
                "code": "negation_scope_removed",
                "message": "An explicit source negation disappeared from the output.",
                "evidence": {"sourceNegationCount": len(input_negations)},
            }
        )

    input_scope_profile = _scope_qualifier_profile(input_text)
    output_scope_profile = _scope_qualifier_profile(output_text)
    added_scope = output_scope_profile - input_scope_profile
    removed_scope = input_scope_profile - output_scope_profile
    if added_scope or removed_scope:
        changed_kinds = sorted(
            {
                key.split(":", 1)[1]
                for key in set(added_scope) | set(removed_scope)
                if ":" in key
            }
        )
        issues.append(
            {
                "code": FACTUAL_SCOPE_QUALIFIER_CHANGED,
                "message": "A factual scope qualifier was added, removed, or changed class.",
                "evidence": {
                    "sourceQualifierCount": sum(input_scope_profile.values()),
                    "outputQualifierCount": sum(output_scope_profile.values()),
                    "addedCount": sum(added_scope.values()),
                    "removedCount": sum(removed_scope.values()),
                    "changedKinds": changed_kinds,
                },
            }
        )

    return _dedupe_issues(issues)


def validate_factual_relation_stability(input_text: str, output_text: str, context_label: str) -> None:
    issues = collect_factual_relation_issues(input_text, output_text)
    if not issues:
        return
    first = issues[0]
    raise ValueError(f"{context_label} changed protected factual relations or scope qualifiers: {first['code']} {first.get('evidence', {})}")


def _scope_paragraphs(text: str) -> list[str]:
    normalized = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    return re.split(r"\n\s*\n+", normalized)


def _scope_clause_tail(paragraph: str, end: int) -> str:
    tail = paragraph[end:end + 96]
    boundary = SCOPE_CLAUSE_END_RE.search(tail)
    return tail[:boundary.start()] if boundary else tail


def _is_classifier_or_lexical_only(paragraph: str, start: int, end: int) -> bool:
    previous = paragraph[start - 1] if start > 0 else ""
    following = paragraph[end:end + 4]
    if previous in SCOPE_CLASSIFIER_PRECEDERS or previous in SCOPE_LEXICAL_ONLY_PRECEDERS:
        return True
    return any(following.startswith(item) for item in SCOPE_LEXICAL_ONLY_FOLLOWERS)


def _is_universal_jun(paragraph: str, end: int) -> bool:
    following = paragraph[end:end + 16].lstrip()
    return bool(SCOPE_JUN_FOLLOW_RE.match(following))


def _scope_qualifier_kind(paragraph: str, match: re.Match[str]) -> str | None:
    token = match.group(0)
    if token in SCOPE_QUALIFIER_IGNORED_TOKENS:
        return None
    if token == "只" and _is_classifier_or_lexical_only(paragraph, match.start(), match.end()):
        return None
    if token == "均" and not _is_universal_jun(paragraph, match.end()):
        return None
    if token in {"只要"}:
        return "condition_sufficient"
    if token in {"只需", "只须", "仅需", "仅须"}:
        return "exclusive_requirement"
    if token in {"只有", "唯有"}:
        return "condition_necessary" if "才" in _scope_clause_tail(paragraph, match.end()) else "exclusive_restriction"
    if token in {"仅", "仅仅", "只"}:
        tail = _scope_clause_tail(paragraph, match.end()).lstrip()
        if SCOPE_NECESSARY_LOCATION_RE.match(tail) or (tail.startswith("在") and "才" in tail):
            return "condition_necessary"
        return "exclusive_restriction"
    if token == "唯一":
        return "exclusive_restriction"
    if token in {"全部", "全都", "所有", "一律", "均"}:
        if token == "所有" and paragraph[match.end():match.end() + 1] in {"权", "制"}:
            return None
        return "universal_totality"
    if token in {"任何", "任一"}:
        return "universal_any"
    if token in {"必然", "必定", "势必"}:
        return "certainty_absolute"
    return None


def _scope_qualifier_occurrences(text: str) -> list[ScopeQualifierOccurrence]:
    occurrences: list[ScopeQualifierOccurrence] = []
    for paragraph_index, paragraph in enumerate(_scope_paragraphs(text)):
        for match in SCOPE_QUALIFIER_TOKEN_RE.finditer(paragraph):
            kind = _scope_qualifier_kind(paragraph, match)
            if kind:
                occurrences.append(
                    ScopeQualifierOccurrence(
                        token=match.group(0),
                        kind=kind,
                        paragraph_index=paragraph_index,
                    )
                )
        for match in EN_SCOPE_QUALIFIER_TOKEN_RE.finditer(paragraph):
            token = match.group(0).casefold()
            if token in {"only", "solely"}:
                if EN_ADDITIVE_NOT_ONLY_RE.search(paragraph[max(0, match.start() - 8):match.start()]):
                    continue
                kind = "exclusive_restriction"
            elif token in {"all", "every"}:
                kind = "universal_totality"
            elif token == "any":
                kind = "universal_any"
            else:
                kind = "certainty_absolute"
            occurrences.append(
                ScopeQualifierOccurrence(
                    token=token,
                    kind=kind,
                    paragraph_index=paragraph_index,
                )
            )
    return occurrences


def _scope_qualifier_profile(text: str) -> Counter[str]:
    # Paragraph-local counting prevents a qualifier removed from one body
    # paragraph and inserted into another from cancelling out globally.  The
    # public issue evidence exposes only bounded category/count metadata.
    return Counter(
        f"p{occurrence.paragraph_index}:{occurrence.kind}"
        for occurrence in _scope_qualifier_occurrences(text)
    )


def extract_order_sensitive_entity_sequences(text: str) -> list[list[str]]:
    sequences: list[list[str]] = []
    for segment in _iter_segments(text):
        occurrences = _extract_entity_occurrences(segment)
        terms = _unique_preserve_order(item.term for item in occurrences)
        if len(terms) < 2:
            continue
        number_count = len(_extract_numbers(segment))
        metric_count = len(_unique_preserve_order(item.term for item in occurrences if item.kind == "metric"))
        if _is_order_sensitive_segment(segment, len(terms), number_count, metric_count=metric_count):
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


def _is_order_sensitive_segment(
    segment: str,
    entity_count: int,
    number_count: int,
    *,
    metric_count: int = 0,
) -> bool:
    if STRONG_ORDER_CUE_RE.search(segment):
        return True
    # Two named metrics with two values already form an implicit binding even
    # without “分别”.  Reordering either side can silently swap results.
    if metric_count >= 2 and number_count >= 2:
        return True
    delimiter_count = _count_list_delimiters_outside_inline_technical_spans(segment)
    if entity_count >= 3 and delimiter_count >= max(2, entity_count - 2):
        return True
    return False


def _extract_entity_occurrences(text: str) -> list[EntityOccurrence]:
    raw: list[EntityOccurrence] = []
    for match in URL_RE.finditer(text):
        term = match.group(0).strip()
        if term:
            raw.append(EntityOccurrence(term, match.start(), match.end(), "url"))
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
    for match in METRIC_ENTITY_RE.finditer(text):
        term = match.group(0).strip()
        if term:
            raw.append(EntityOccurrence(term, match.start(), match.end(), "metric"))
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
    positions_by_term: list[tuple[str, list[int]]] = []
    missing: list[str] = []
    for term in checked:
        term_positions = _find_entity_positions(output_text, term)
        if not term_positions:
            missing.append(term)
            continue
        positions_by_term.append((term, term_positions))
    if missing:
        return {"expected": checked, "missing": missing}
    selected_positions: list[tuple[str, int]] = []
    last_position = -1
    for term, term_positions in positions_by_term:
        next_position = next((position for position in term_positions if position > last_position), None)
        if next_position is None:
            actual = [
                item
                for item, _ in sorted(
                    ((term, positions[0]) for term, positions in positions_by_term),
                    key=lambda pair: pair[1],
                )
            ]
            return {"expected": checked, "actual": actual}
        selected_positions.append((term, next_position))
        last_position = next_position
    if any(selected_positions[index][1] >= selected_positions[index + 1][1] for index in range(len(selected_positions) - 1)):
        actual = [term for term, _ in sorted(selected_positions, key=lambda item: item[1])]
        return {"expected": checked, "actual": actual}
    return None


def _find_number_order_violation(sequence: list[str], output_text: str) -> dict[str, Any] | None:
    checked = _unique_preserve_order(sequence)
    if len(checked) < 2:
        return None
    positions_by_number = _number_positions_by_norm(output_text)
    positions_by_value: list[tuple[str, list[int]]] = []
    missing: list[str] = []
    for number in checked:
        number_positions = positions_by_number.get(_normalize_number(number), [])
        if not number_positions:
            missing.append(number)
            continue
        positions_by_value.append((number, number_positions))
    if missing:
        return {"expected": checked, "missing": missing}
    selected_positions: list[tuple[str, int]] = []
    last_position = -1
    for number, number_positions in positions_by_value:
        next_position = next((position for position in number_positions if position > last_position), None)
        if next_position is None:
            actual = [
                item
                for item, _ in sorted(
                    ((number, positions[0]) for number, positions in positions_by_value),
                    key=lambda pair: pair[1],
                )
            ]
            return {"expected": checked, "actual": actual}
        selected_positions.append((number, next_position))
        last_position = next_position
    if any(selected_positions[index][1] >= selected_positions[index + 1][1] for index in range(len(selected_positions) - 1)):
        actual = [number for number, _ in sorted(selected_positions, key=lambda item: item[1])]
        return {"expected": checked, "actual": actual}
    return None


def _find_entity_positions(text: str, term: str) -> list[int]:
    escaped = re.escape(term.strip())
    escaped = re.sub(r"\\\s+", r"\\s+", escaped)
    if "://" in term or "/" in term or "." in term:
        return [match.start() for match in re.finditer(escaped, text)]
    pattern = re.compile(rf"(?<![A-Za-z0-9_/-]){escaped}(?![A-Za-z0-9_/-])")
    return [match.start() for match in pattern.finditer(text)]


def _count_list_delimiters_outside_inline_technical_spans(segment: str) -> int:
    masked = URL_RE.sub(" ", segment)
    masked = INLINE_CODE_RE.sub(" ", masked)
    return len(LIST_DELIMITER_RE.findall(masked))


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
