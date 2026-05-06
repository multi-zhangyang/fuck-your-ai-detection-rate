from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from typing import Any


STOP_WORDS = {
    "also",
    "and",
    "analysis",
    "are",
    "certain",
    "for",
    "from",
    "had",
    "has",
    "have",
    "into",
    "method",
    "need",
    "needs",
    "that",
    "then",
    "than",
    "the",
    "this",
    "value",
    "with",
}

DETECTION_FULL_SCAN_CHUNK_LIMIT = 96
DETECTION_RECALL_TOP_K = 36
DETECTION_RECALL_ADJACENT_RADIUS = 1
DETECTION_NGRAM_SIZES = (12, 8, 5, 4)
DETECTION_WEIGHTED_ANCHOR_LIMIT = 48
LATIN_TECH_TOKEN_PATTERN = re.compile(
    r"[A-Za-z]*\d[A-Za-z0-9+.#/-]*|[A-Z]{2,}[A-Za-z0-9+.#/-]*|[A-Za-z][A-Za-z0-9+.#/-]{2,}"
)
COMMON_SHORT_TECH_PREFIXES = {"AI", "API", "CPU", "GPU", "UI", "UX", "IT", "OS", "ML", "DL", "PDF", "DOCX", "JSON", "SQL", "XML"}


@dataclass
class WeightedDetectionAnchor:
    value: str
    raw: str
    kind: str
    weight: float


@dataclass
class WeightedAnchorHitScore:
    score: float
    matched_anchors: list[str]
    hit_count: int
    matched_weight: float


@dataclass
class DetectionCorpusProfile:
    chunk_count: int
    anchor_doc_frequency: dict[str, int]


@dataclass
class DetectionMatchCandidate:
    chunk_id: str
    score: float
    base_score: float
    direct_score: float
    window_score: float
    direct_fragment_score: float
    window_fragment_score: float
    direct_weighted_anchor_score: float
    window_weighted_anchor_score: float
    weighted_anchor_score: float
    weighted_anchor_hit_count: int
    matched_anchors: list[str]
    matched_fragments: list[str]
    chunk_offset: int


@dataclass
class DetectionChunkProfile:
    chunk: dict[str, Any]
    chunk_id: str
    chunk_offset: int
    direct_text: str
    window_text: str
    direct_normalized: str
    window_normalized: str
    direct_ngrams: dict[int, set[str]]
    window_ngrams: dict[int, set[str]]
    direct_anchors: set[str]
    window_anchors: set[str]


@dataclass
class DetectionSegmentProfile:
    text: str
    normalized: str
    anchors: list[str]
    weighted_anchors: list[WeightedDetectionAnchor]
    quote_fragments: list[str]
    ngrams: dict[int, set[str]]


def normalize_for_detection_match(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).lower()
    replacements = (
        (r"@@fyadr_[a-z0-9_]+@@", ""),
    )
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text)
    return "".join(char for char in text if char.isascii() and char.isalnum() or _is_cjk(char))


def build_detection_matches(report: dict[str, Any] | None, compare_data: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(report, dict) or not isinstance(compare_data, dict):
        return []
    raw_segments = report.get("segments")
    raw_chunks = compare_data.get("chunks")
    if not isinstance(raw_segments, list) or not isinstance(raw_chunks, list) or not raw_chunks:
        return []

    segments = [segment for segment in raw_segments if isinstance(segment, dict)]
    chunks = [chunk for chunk in raw_chunks if isinstance(chunk, dict)]
    sorted_chunks = sorted(
        chunks,
        key=lambda chunk: (
            _to_int(chunk.get("paragraphIndex"), 0),
            _to_int(chunk.get("chunkIndex"), 0),
            str(chunk.get("chunkId", "")),
        ),
    )
    chunk_profiles = _build_detection_chunk_profiles(sorted_chunks)
    corpus_profile = _build_detection_corpus_profile(chunk_profiles)
    matches: list[dict[str, Any]] = []
    for segment_offset, segment in enumerate(segments):
        segment_text = str(segment.get("matchText") or segment.get("content") or "")
        segment_profile = _build_detection_segment_profile(segment_text, corpus_profile)
        if not segment_profile.normalized:
            continue
        candidate_offsets = _recall_detection_candidate_offsets(
            segment_profile,
            chunk_profiles,
            segment_offset,
            len(segments),
        )
        candidates = sorted(
            (
                _score_detection_candidate(
                    segment_profile,
                    chunk_profiles[chunk_offset],
                    sorted_chunks,
                    segment_offset,
                    len(segments),
                    chunk_offset,
                )
                for chunk_offset in candidate_offsets
            ),
            key=lambda item: item.score,
            reverse=True,
        )
        best_score = candidates[0].score if candidates else 0.0
        runner_up_score = candidates[1].score if len(candidates) > 1 else 0.0
        selected: list[dict[str, Any]] = []
        for candidate_index, candidate in enumerate(candidates):
            confidence = _classify_detection_candidate(
                candidate,
                best_score,
                runner_up_score,
                segment,
                candidate_index == 0,
            )
            if confidence is None:
                continue
            if candidate_index > 0 and confidence == "weak":
                continue
            selected.append(
                {
                    "segment": segment,
                    "chunkId": candidate.chunk_id,
                    "score": round(candidate.score, 3),
                    "confidence": confidence,
                    "label": _confidence_label(confidence),
                    "reason": _build_detection_match_reason(confidence, candidate, runner_up_score),
                    "evidence": {
                        "directScore": round(candidate.direct_score, 3),
                        "windowScore": round(candidate.window_score, 3),
                        "directFragmentScore": round(candidate.direct_fragment_score, 3),
                        "windowFragmentScore": round(candidate.window_fragment_score, 3),
                        "directWeightedAnchorScore": round(candidate.direct_weighted_anchor_score, 3),
                        "windowWeightedAnchorScore": round(candidate.window_weighted_anchor_score, 3),
                        "weightedAnchorScore": round(candidate.weighted_anchor_score, 3),
                        "weightedAnchorHitCount": candidate.weighted_anchor_hit_count,
                        "runnerUpScore": round(runner_up_score, 3),
                        "scoreGap": round(max(0.0, candidate.score - runner_up_score), 3),
                        "matchedAnchors": candidate.matched_anchors,
                        "matchedFragments": candidate.matched_fragments,
                    },
                }
            )
            if len(selected) >= 3:
                break
        matches.extend(selected)
    return matches


def _build_detection_chunk_profiles(sorted_chunks: list[dict[str, Any]]) -> list[DetectionChunkProfile]:
    profiles: list[DetectionChunkProfile] = []
    for chunk_offset, chunk in enumerate(sorted_chunks):
        output_text = str(chunk.get("outputText", "") or "")
        input_text = str(chunk.get("inputText", "") or "")
        previous_chunk = sorted_chunks[chunk_offset - 1] if chunk_offset > 0 else {}
        next_chunk = sorted_chunks[chunk_offset + 1] if chunk_offset + 1 < len(sorted_chunks) else {}
        output_window = "\n".join(
            str(item or "")
            for item in (
                previous_chunk.get("outputText") if isinstance(previous_chunk, dict) else "",
                output_text,
                next_chunk.get("outputText") if isinstance(next_chunk, dict) else "",
            )
            if item
        )
        input_window = "\n".join(
            str(item or "")
            for item in (
                previous_chunk.get("inputText") if isinstance(previous_chunk, dict) else "",
                input_text,
                next_chunk.get("inputText") if isinstance(next_chunk, dict) else "",
            )
            if item
        )
        direct_text = "\n".join(item for item in (output_text, input_text) if item)
        window_text = "\n".join(item for item in (output_window, input_window) if item)
        direct_normalized = normalize_for_detection_match(direct_text)
        window_normalized = normalize_for_detection_match(window_text)
        profiles.append(
            DetectionChunkProfile(
                chunk=chunk,
                chunk_id=str(chunk.get("chunkId", "")),
                chunk_offset=chunk_offset,
                direct_text=direct_text,
                window_text=window_text,
                direct_normalized=direct_normalized,
                window_normalized=window_normalized,
                direct_ngrams={
                    size: _build_ngrams_from_normalized(direct_normalized, size)
                    for size in DETECTION_NGRAM_SIZES
                },
                window_ngrams={
                    size: _build_ngrams_from_normalized(window_normalized, size)
                    for size in DETECTION_NGRAM_SIZES
                },
                direct_anchors={anchor.value for anchor in _extract_detection_anchor_candidates(direct_text)},
                window_anchors={anchor.value for anchor in _extract_detection_anchor_candidates(window_text)},
            )
        )
    return profiles


def _build_detection_corpus_profile(chunk_profiles: list[DetectionChunkProfile]) -> DetectionCorpusProfile:
    anchor_doc_frequency: Counter[str] = Counter()
    for profile in chunk_profiles:
        anchors = set(profile.direct_anchors)
        if not anchors:
            anchors.update(_sample_normalized_windows(profile.direct_normalized, (10, 8), limit=24))
        anchor_doc_frequency.update(anchors)
    return DetectionCorpusProfile(
        chunk_count=len(chunk_profiles),
        anchor_doc_frequency=dict(anchor_doc_frequency),
    )


def _build_detection_segment_profile(segment_text: str, corpus_profile: DetectionCorpusProfile) -> DetectionSegmentProfile:
    normalized = normalize_for_detection_match(segment_text)
    weighted_anchors = _extract_weighted_detection_anchors(segment_text, corpus_profile)
    return DetectionSegmentProfile(
        text=segment_text,
        normalized=normalized,
        anchors=[anchor.value for anchor in weighted_anchors],
        weighted_anchors=weighted_anchors,
        quote_fragments=_build_detection_quote_fragments(segment_text),
        ngrams={
            size: _build_ngrams_from_normalized(normalized, size)
            for size in DETECTION_NGRAM_SIZES
        },
    )


def _recall_detection_candidate_offsets(
    segment: DetectionSegmentProfile,
    chunk_profiles: list[DetectionChunkProfile],
    segment_offset: int,
    segment_count: int,
) -> list[int]:
    if len(chunk_profiles) <= DETECTION_FULL_SCAN_CHUNK_LIMIT or len(segment.normalized) < 48:
        return [profile.chunk_offset for profile in chunk_profiles]

    ranked = sorted(
        (
            (
                _score_detection_recall(segment, profile, segment_offset, segment_count, len(chunk_profiles)),
                profile.chunk_offset,
            )
            for profile in chunk_profiles
        ),
        key=lambda item: (item[0], -item[1]),
        reverse=True,
    )
    recalled: set[int] = set()
    for _score, chunk_offset in ranked[:DETECTION_RECALL_TOP_K]:
        for offset in range(
            max(0, chunk_offset - DETECTION_RECALL_ADJACENT_RADIUS),
            min(len(chunk_profiles), chunk_offset + DETECTION_RECALL_ADJACENT_RADIUS + 1),
        ):
            recalled.add(offset)
    return sorted(recalled)


def _score_detection_recall(
    segment: DetectionSegmentProfile,
    chunk: DetectionChunkProfile,
    segment_offset: int,
    segment_count: int,
    chunk_count: int,
) -> float:
    direct_contains = 1.0 if segment.normalized in chunk.direct_normalized else 0.0
    window_contains = 0.86 if segment.normalized in chunk.window_normalized else 0.0
    direct_quote_score = _score_fragment_hits(segment.quote_fragments, chunk.direct_normalized)
    window_quote_score = _score_fragment_hits(segment.quote_fragments, chunk.window_normalized) * 0.78
    direct_anchor_score = _score_fragment_hits(segment.anchors, chunk.direct_normalized) * 0.56
    window_anchor_score = _score_fragment_hits(segment.anchors, chunk.window_normalized) * 0.42
    direct_weighted_anchor_score = _score_weighted_anchor_hits(segment.weighted_anchors, chunk.direct_normalized).score * 0.74
    window_weighted_anchor_score = _score_weighted_anchor_hits(segment.weighted_anchors, chunk.window_normalized).score * 0.56
    direct_ngram_score = max(
        (
            _score_ngram_sets(segment.ngrams.get(size, set()), chunk.direct_ngrams.get(size, set())) * weight
            for size, weight in ((12, 0.92), (8, 0.86), (5, 0.64), (4, 0.48))
        ),
        default=0.0,
    )
    window_ngram_score = max(
        (
            _score_ngram_sets(segment.ngrams.get(size, set()), chunk.window_ngrams.get(size, set())) * weight * 0.74
            for size, weight in ((12, 0.92), (8, 0.86), (5, 0.64), (4, 0.48))
        ),
        default=0.0,
    )
    position_score = _score_detection_position(segment_offset, segment_count, chunk.chunk_offset, chunk_count) * 0.025
    return max(
        direct_contains,
        window_contains,
        direct_quote_score,
        window_quote_score,
        direct_anchor_score,
        window_anchor_score,
        direct_weighted_anchor_score,
        window_weighted_anchor_score,
        direct_ngram_score,
        window_ngram_score,
    ) + position_score


def _score_fragment_hits(fragments: list[str], normalized_text: str) -> float:
    if not fragments or not normalized_text:
        return 0.0
    hits = sum(1 for fragment in fragments if fragment and fragment in normalized_text)
    return hits / len(fragments)


def _score_detection_candidate(
    segment: DetectionSegmentProfile,
    chunk_profile: DetectionChunkProfile,
    sorted_chunks: list[dict[str, Any]],
    segment_offset: int,
    segment_count: int,
    chunk_offset: int,
) -> DetectionMatchCandidate:
    segment_text = segment.text
    chunk = chunk_profile.chunk
    output_text = str(chunk.get("outputText", "") or "")
    input_text = str(chunk.get("inputText", "") or "")
    direct_output_score = score_detection_match(segment_text, output_text)
    direct_input_score = score_detection_match(segment_text, input_text) * 0.9
    direct_output_fragments = _score_quote_fragment_coverage(segment_text, output_text)
    direct_input_fragments = _score_quote_fragment_coverage(segment_text, input_text)
    direct_score = max(direct_output_score, direct_input_score)

    previous_chunk = sorted_chunks[chunk_offset - 1] if chunk_offset > 0 else {}
    next_chunk = sorted_chunks[chunk_offset + 1] if chunk_offset + 1 < len(sorted_chunks) else {}
    output_window = "\n".join(
        str(item or "")
        for item in (
            previous_chunk.get("outputText") if isinstance(previous_chunk, dict) else "",
            output_text,
            next_chunk.get("outputText") if isinstance(next_chunk, dict) else "",
        )
        if item
    )
    input_window = "\n".join(
        str(item or "")
        for item in (
            previous_chunk.get("inputText") if isinstance(previous_chunk, dict) else "",
            input_text,
            next_chunk.get("inputText") if isinstance(next_chunk, dict) else "",
        )
        if item
    )
    direct_text = "\n".join(item for item in (output_text, input_text) if item)
    window_text = "\n".join(item for item in (output_window, input_window) if item)
    direct_weighted_anchors = _score_weighted_anchor_hits(segment.weighted_anchors, chunk_profile.direct_normalized)
    window_weighted_anchors = _score_weighted_anchor_hits(segment.weighted_anchors, chunk_profile.window_normalized)
    direct_weighted_anchor_score = direct_weighted_anchors.score
    window_weighted_anchor_score = window_weighted_anchors.score
    weighted_anchor_score = max(direct_weighted_anchor_score, window_weighted_anchor_score * 0.86)
    output_window_fragments = _score_quote_fragment_coverage(segment_text, output_window)
    input_window_fragments = _score_quote_fragment_coverage(segment_text, input_window)
    direct_fragment_score = max(direct_output_fragments["score"], direct_input_fragments["score"] * 0.72)
    window_fragment_score = max(output_window_fragments["score"], input_window_fragments["score"] * 0.68)
    window_score = max(
        score_detection_match(segment_text, output_window) * (0.94 if direct_score >= 0.12 else 0.68),
        score_detection_match(segment_text, input_window) * (0.84 if direct_score >= 0.12 else 0.58),
    )
    direct_evidence_score = direct_score if direct_fragment_score >= 0.18 else direct_score * 0.82
    window_evidence_score = window_score if window_fragment_score >= 0.24 else window_score * 0.76
    base_score = max(
        direct_evidence_score,
        window_evidence_score,
        direct_fragment_score * 1.02,
        window_fragment_score * 0.88,
        direct_weighted_anchor_score * 0.94,
        window_weighted_anchor_score * 0.78,
    )
    position_score = _score_detection_position(segment_offset, segment_count, chunk_offset, len(sorted_chunks))
    position_boost = position_score * (0.018 if base_score >= 0.18 else 0.035)
    matched_fragments = (
        direct_output_fragments["matchedFragments"]
        or direct_input_fragments["matchedFragments"]
        or output_window_fragments["matchedFragments"]
        or input_window_fragments["matchedFragments"]
    )
    weighted_anchors = direct_weighted_anchors.matched_anchors or window_weighted_anchors.matched_anchors
    direct_anchors = weighted_anchors or _collect_matched_detection_anchors(segment_text, direct_text)
    return DetectionMatchCandidate(
        chunk_id=str(chunk.get("chunkId", "")),
        chunk_offset=chunk_offset,
        base_score=base_score,
        direct_score=direct_score,
        window_score=window_score,
        direct_fragment_score=direct_fragment_score,
        window_fragment_score=window_fragment_score,
        direct_weighted_anchor_score=direct_weighted_anchor_score,
        window_weighted_anchor_score=window_weighted_anchor_score,
        weighted_anchor_score=weighted_anchor_score,
        weighted_anchor_hit_count=max(direct_weighted_anchors.hit_count, window_weighted_anchors.hit_count),
        matched_anchors=direct_anchors or _collect_matched_detection_anchors(segment_text, window_text),
        matched_fragments=matched_fragments,
        score=min(0.99, base_score + position_boost),
    )


def score_detection_match(segment_text: str, chunk_text: str) -> float:
    segment = normalize_for_detection_match(segment_text)
    chunk = normalize_for_detection_match(chunk_text)
    if not segment or not chunk:
        return 0.0
    if segment in chunk:
        return 1.0
    if chunk in segment:
        coverage = len(chunk) / max(len(segment), 1)
        if len(chunk) >= 80:
            return min(0.94, 0.72 + coverage * 0.26)
        if len(chunk) >= 42:
            return min(0.88, 0.62 + coverage * 0.24)
        return min(0.75, coverage)
    return max(
        _score_fragment_coverage(segment, chunk) * 0.98,
        _score_anchor_overlap(segment_text, chunk_text) * 0.86,
        _score_ngram_overlap(segment, chunk, 12) * 0.98,
        _score_ngram_overlap(segment, chunk, 8),
        _score_ngram_overlap(segment, chunk, 5) * 0.95,
        _score_ngram_overlap(segment, chunk, 4) * 0.9,
        _score_ngram_overlap(segment, chunk, 3) * 0.8,
        _score_ngram_overlap(segment, chunk, 2) * 0.42,
    )


def _classify_detection_candidate(
    candidate: DetectionMatchCandidate,
    best_score: float,
    runner_up_score: float,
    segment: dict[str, Any],
    is_best: bool,
) -> str | None:
    if not _is_detection_rerun_risk(segment):
        return None
    anchor_count = len(candidate.matched_anchors)
    anchor_evidence_count = max(anchor_count, candidate.weighted_anchor_hit_count)
    fragment_count = len(candidate.matched_fragments)
    score_gap = max(0.0, best_score - runner_up_score)
    if (
        candidate.score < 0.35
        and candidate.direct_score < 0.22
        and candidate.direct_fragment_score < 0.16
        and candidate.window_fragment_score < 0.22
        and candidate.weighted_anchor_score < 0.25
        and anchor_evidence_count < 2
    ):
        return None

    has_decisive_lead = score_gap >= 0.12 or runner_up_score < 0.5
    has_direct_quote_evidence = candidate.direct_fragment_score >= 0.42 or fragment_count >= 2
    has_weighted_anchor_evidence = candidate.weighted_anchor_score >= 0.52 and anchor_evidence_count >= 3
    has_concrete_evidence = (
        has_direct_quote_evidence
        or candidate.direct_score >= 0.86
        or anchor_evidence_count >= 4
        or has_weighted_anchor_evidence
    )
    has_covered_chunk_evidence = (
        candidate.direct_score >= 0.78
        and candidate.score >= 0.7
        and (candidate.direct_fragment_score >= 0.14 or anchor_evidence_count >= 2)
    )
    if (
        is_best
        and candidate.direct_score >= 0.96
        and candidate.score >= 0.92
        and (candidate.direct_fragment_score >= 0.68 or candidate.window_fragment_score >= 0.82 or fragment_count >= 2)
    ):
        return "strong"
    if (
        is_best
        and candidate.direct_score >= 0.9
        and candidate.window_score >= 0.82
        and candidate.direct_fragment_score >= 0.58
        and candidate.window_fragment_score >= 0.58
    ):
        return "strong"
    if is_best and candidate.score >= 0.74 and candidate.direct_score >= 0.45 and has_decisive_lead and has_concrete_evidence:
        return "strong"
    if is_best and candidate.score >= 0.68 and has_decisive_lead and has_weighted_anchor_evidence:
        return "strong"
    if is_best and candidate.direct_score >= 0.84 and candidate.direct_fragment_score >= 0.28 and score_gap >= 0.06:
        return "strong"
    if (
        is_best
        and candidate.direct_score >= 0.82
        and candidate.score >= 0.74
        and candidate.direct_fragment_score >= 0.24
        and candidate.window_fragment_score >= 0.55
    ):
        return "strong"
    if (
        not is_best
        and candidate.direct_score >= 0.78
        and candidate.score >= 0.74
        and (candidate.direct_fragment_score >= 0.14 or candidate.window_fragment_score >= 0.55 or anchor_evidence_count >= 1)
    ):
        return "strong"
    if is_best and candidate.score >= 0.55 and candidate.direct_score >= 0.28 and (
        candidate.direct_fragment_score >= 0.16 or anchor_evidence_count >= 1
    ):
        return "review"
    if is_best and candidate.score >= 0.5 and candidate.weighted_anchor_score >= 0.38 and anchor_evidence_count >= 2:
        return "review"
    if not is_best and has_covered_chunk_evidence:
        return "review"
    if is_best and candidate.window_fragment_score >= 0.34 and candidate.score >= 0.48:
        return "review"
    if is_best and candidate.score >= 0.62 and anchor_evidence_count >= 3 and score_gap >= 0.08:
        return "review"
    if is_best or candidate.direct_score >= 0.3 or (candidate.score >= 0.5 and anchor_evidence_count >= 2):
        return "weak"
    return None


def _build_detection_match_reason(confidence: str, candidate: DetectionMatchCandidate, runner_up_score: float) -> str:
    direct = round(candidate.direct_score * 100)
    window = round(candidate.window_score * 100)
    direct_fragment = round(candidate.direct_fragment_score * 100)
    window_fragment = round(candidate.window_fragment_score * 100)
    weighted_anchor = round(candidate.weighted_anchor_score * 100)
    gap = round(max(0.0, candidate.score - runner_up_score) * 100)
    anchors = f", anchors: {' / '.join(candidate.matched_anchors)}" if candidate.matched_anchors else ""
    fragment_note = f", quote evidence: {direct_fragment}%/{window_fragment}%, anchor evidence: {weighted_anchor}%"
    if confidence == "strong":
        return f"Strong match: direct {direct}%, window {window}%{fragment_note}, lead {gap}%{anchors}"
    if confidence == "review":
        return f"Review match: direct {direct}%, window {window}%{fragment_note}, lead {gap}%{anchors}"
    return f"Reference only: direct {direct}%, window {window}%{fragment_note}{anchors}"


def _confidence_label(confidence: str) -> str:
    if confidence == "strong":
        return "Strong match"
    if confidence == "review":
        return "Review match"
    return "Reference"


def _is_detection_rerun_risk(segment: dict[str, Any]) -> bool:
    probability = _to_float(segment.get("probability"), 0.0)
    if str(segment.get("sourceProvider", "")).lower() == "paperpass":
        return probability >= 60
    return probability >= 70


def _extract_detection_anchors(value: str) -> list[str]:
    return [anchor.value for anchor in _extract_detection_anchor_candidates(value)[:36]]


def _extract_weighted_detection_anchors(
    value: str,
    corpus_profile: DetectionCorpusProfile,
) -> list[WeightedDetectionAnchor]:
    candidates = _extract_detection_anchor_candidates(value)
    if not candidates:
        return []

    known_count = sum(1 for candidate in candidates if corpus_profile.anchor_doc_frequency.get(candidate.value, 0) > 0)
    prefer_known = known_count >= 3
    weighted: list[WeightedDetectionAnchor] = []
    chunk_count = max(1, corpus_profile.chunk_count)
    for candidate in candidates:
        doc_frequency = corpus_profile.anchor_doc_frequency.get(candidate.value, 0)
        if prefer_known and doc_frequency <= 0:
            continue
        corpus_ratio = doc_frequency / chunk_count
        if (
            corpus_profile.chunk_count >= 8
            and corpus_ratio >= 0.62
            and candidate.kind not in {"citation", "metric", "number"}
        ):
            continue
        if doc_frequency > 0:
            rarity = math.log((corpus_profile.chunk_count + 1) / (doc_frequency + 1)) + 1
        else:
            rarity = 0.82
        length_boost = min(1.45, 0.78 + len(candidate.value) / 18)
        weight = candidate.weight * max(0.72, min(1.85, rarity)) * length_boost
        weighted.append(
            WeightedDetectionAnchor(
                value=candidate.value,
                raw=candidate.raw,
                kind=candidate.kind,
                weight=round(weight, 4),
            )
        )

    if not weighted:
        weighted = candidates
    weighted.sort(key=lambda anchor: (anchor.weight, len(anchor.value)), reverse=True)
    return weighted[:DETECTION_WEIGHTED_ANCHOR_LIMIT]


def _extract_detection_anchor_candidates(value: str) -> list[WeightedDetectionAnchor]:
    raw = unicodedata.normalize("NFKC", str(value or ""))
    anchors: dict[str, WeightedDetectionAnchor] = {}

    def add(anchor: str, kind: str, base_weight: float) -> None:
        normalized = normalize_for_detection_match(anchor)
        if _is_low_signal_detection_anchor(normalized, kind):
            return
        existing = anchors.get(normalized)
        if existing and existing.weight >= base_weight:
            return
        anchors[normalized] = WeightedDetectionAnchor(
            value=normalized,
            raw=str(anchor),
            kind=kind,
            weight=base_weight,
        )

    number_pattern = (
        r"\[[0-9,\s-]+\]"
        r"|\d+(?:\.\d+)?\s*(?:%|ms|s|kg|g|m|cm|mm|kb|mb|gb|tb|"
        r"万元|元|次|个|篇|章|节|页|天|小时|分钟|分|秒|倍|字符|行|例|项|条|个月|年)?"
    )
    for match in re.finditer(number_pattern, raw, flags=re.IGNORECASE):
        token = match.group(0)
        normalized = normalize_for_detection_match(token)
        if normalized.isdigit() and len(normalized) < 3:
            continue
        kind = "citation" if token.strip().startswith("[") else "metric" if re.search(r"[%\u4e00-\u9fffA-Za-z]", token) else "number"
        add(token, kind, 1.18 if kind != "number" else 0.78)

    latin_matches = [
        match
        for match in LATIN_TECH_TOKEN_PATTERN.finditer(raw)
        if normalize_for_detection_match(match.group(0)) not in STOP_WORDS
    ]
    for match in latin_matches:
        token = normalize_for_detection_match(match.group(0))
        if len(token) >= 3 or re.search(r"\d|[+.#/-]", match.group(0)):
            add(match.group(0), "latin", 1.06 if len(token) < 8 else 1.18)
    for start_index in range(len(latin_matches)):
        for window_size in (2, 3):
            end_index = start_index + window_size
            if end_index > len(latin_matches):
                continue
            start = latin_matches[start_index].start()
            end = latin_matches[end_index - 1].end()
            span = raw[start:end]
            normalized = normalize_for_detection_match(span)
            if 4 <= len(normalized) <= 56 and _is_signal_latin_anchor_span(span, normalized):
                phrase_weight = 2.18 if len(normalized) < 8 else 1.24 + window_size * 0.06
                add(span, "latin_phrase", phrase_weight)

    for match in re.finditer(r"[\u3400-\u9fff]{4,}", raw):
        run = normalize_for_detection_match(match.group(0))
        if len(run) <= 14:
            add(run, "cjk_phrase", 1.14 + min(0.28, len(run) / 48))
            continue
        for fragment in _build_cjk_anchor_windows(run):
            add(fragment, "cjk_phrase", 1.16 + min(0.34, len(fragment) / 40))

    return sorted(anchors.values(), key=lambda anchor: (anchor.weight, len(anchor.value)), reverse=True)[:80]


def _is_signal_latin_anchor_span(span: str, normalized: str) -> bool:
    if len(normalized) >= 8:
        return True
    if re.search(r"\d|[+.#/-]", span):
        return True
    tokens = [match.group(0) for match in LATIN_TECH_TOKEN_PATTERN.finditer(span)]
    upper_tokens = [token for token in tokens if token.isupper() and len(token) >= 2]
    if len(upper_tokens) >= 2:
        if all(token in COMMON_SHORT_TECH_PREFIXES for token in upper_tokens):
            return len(normalized) >= 8
        return len(normalized) >= 4
    if upper_tokens and upper_tokens[0] not in COMMON_SHORT_TECH_PREFIXES:
        return len(normalized) >= 6
    return False


def _build_cjk_anchor_windows(run: str) -> list[str]:
    if len(run) <= 14:
        return [run]
    window_sizes = (12, 10, 8) if len(run) >= 36 else (10, 8, 6) if len(run) >= 22 else (8, 6)
    fragments: list[str] = []
    seen: set[str] = set()
    for window_size in window_sizes:
        if len(run) <= window_size:
            positions = [0]
        else:
            positions = [
                0,
                math.floor(len(run) * 0.18),
                math.floor(len(run) * 0.36),
                math.floor(len(run) * 0.54),
                math.floor(len(run) * 0.72),
                max(0, len(run) - window_size),
            ]
        for position in positions:
            fragment = run[position : position + window_size]
            if len(fragment) >= 4 and fragment not in seen:
                seen.add(fragment)
                fragments.append(fragment)
    return fragments


def _sample_normalized_windows(normalized: str, sizes: tuple[int, ...], limit: int) -> list[str]:
    if not normalized:
        return []
    windows: list[str] = []
    seen: set[str] = set()
    for size in sizes:
        if len(normalized) <= size:
            candidates = [normalized]
        else:
            stride = max(1, math.floor((len(normalized) - size) / max(1, limit // max(1, len(sizes)))))
            candidates = [normalized[index : index + size] for index in range(0, len(normalized) - size + 1, stride)]
        for candidate in candidates:
            if len(candidate) >= 4 and candidate not in seen:
                seen.add(candidate)
                windows.append(candidate)
            if len(windows) >= limit:
                return windows
    return windows


def _is_low_signal_detection_anchor(value: str, kind: str) -> bool:
    if len(value) < 2 or value in STOP_WORDS:
        return True
    if kind == "cjk_phrase" and len(value) < 4:
        return True
    if value.isdigit() and len(value) < 3:
        return True
    if len(set(value)) == 1:
        return True
    return False


def _score_weighted_anchor_hits(anchors: list[WeightedDetectionAnchor], normalized_text: str) -> WeightedAnchorHitScore:
    if not anchors or not normalized_text:
        return WeightedAnchorHitScore(score=0.0, matched_anchors=[], hit_count=0, matched_weight=0.0)
    total_weight = sum(max(0.01, anchor.weight) for anchor in anchors)
    matched = [anchor for anchor in anchors if anchor.value and anchor.value in normalized_text]
    if not matched or total_weight <= 0:
        return WeightedAnchorHitScore(score=0.0, matched_anchors=[], hit_count=0, matched_weight=0.0)
    matched_weight = sum(max(0.01, anchor.weight) for anchor in matched)
    score = matched_weight / total_weight
    if len(matched) == 1 and len(anchors) >= 4:
        score *= 0.74
    elif len(matched) == 2 and len(anchors) >= 8:
        score *= 0.88
    diversity_boost = min(1.08, 0.9 + len(matched) * 0.035)
    matched.sort(key=lambda anchor: (anchor.weight, len(anchor.value)), reverse=True)
    return WeightedAnchorHitScore(
        score=min(1.0, score * diversity_boost),
        matched_anchors=[anchor.value for anchor in matched[:8]],
        hit_count=len(matched),
        matched_weight=round(matched_weight, 4),
    )


def _score_anchor_overlap(segment_text: str, chunk_text: str) -> float:
    anchors = _extract_detection_anchors(segment_text)
    if not anchors:
        return 0.0
    chunk = normalize_for_detection_match(chunk_text)
    hits = sum(1 for anchor in anchors if anchor in chunk)
    return hits / len(anchors)


def _collect_matched_detection_anchors(segment_text: str, chunk_text: str) -> list[str]:
    anchors = _extract_detection_anchors(segment_text)
    if not anchors:
        return []
    chunk = normalize_for_detection_match(chunk_text)
    return [anchor for anchor in anchors if anchor in chunk][:8]


def _build_ngrams(value: str, size: int = 8) -> set[str]:
    normalized = normalize_for_detection_match(value)
    return _build_ngrams_from_normalized(normalized, size)


def _build_ngrams_from_normalized(normalized: str, size: int = 8) -> set[str]:
    if len(normalized) <= size:
        return {normalized} if normalized else set()
    return {normalized[index : index + size] for index in range(0, len(normalized) - size + 1)}


def _score_ngram_sets(segment_grams: set[str], chunk_grams: set[str]) -> float:
    if not segment_grams or not chunk_grams:
        return 0.0
    overlap = sum(1 for gram in segment_grams if gram in chunk_grams)
    return overlap / min(len(segment_grams), len(chunk_grams))


def _score_ngram_overlap(segment_text: str, chunk_text: str, size: int) -> float:
    segment_grams = _build_ngrams(segment_text, size)
    chunk_grams = _build_ngrams(chunk_text, size)
    return _score_ngram_sets(segment_grams, chunk_grams)


def _build_detection_fragments(value: str) -> list[str]:
    normalized = normalize_for_detection_match(value)
    if len(normalized) < 16:
        return [normalized] if normalized else []
    size = 18 if len(normalized) >= 220 else 14 if len(normalized) >= 120 else 10
    positions = {
        0,
        math.floor(len(normalized) * 0.18),
        math.floor(len(normalized) * 0.38),
        math.floor(len(normalized) * 0.58),
        math.floor(len(normalized) * 0.78),
        max(0, len(normalized) - size),
    }
    return [
        normalized[position : position + size]
        for position in sorted(positions)
        if len(normalized[position : position + size]) >= min(8, size)
    ]


def _score_fragment_coverage(segment_text: str, chunk_text: str) -> float:
    fragments = _build_detection_fragments(segment_text)
    if not fragments:
        return 0.0
    chunk = normalize_for_detection_match(chunk_text)
    hits = sum(1 for fragment in fragments if fragment in chunk)
    return hits / len(fragments)


def _add_detection_quote_fragment(fragments: set[str], fragment: str) -> None:
    normalized = normalize_for_detection_match(fragment)
    if len(normalized) < 18:
        return
    if any(item in normalized or normalized in item for item in fragments):
        return
    fragments.add(normalized)


def _build_detection_quote_fragments(value: str) -> list[str]:
    normalized_full_text = normalize_for_detection_match(value)
    if not normalized_full_text:
        return []
    fragments: set[str] = set()
    sentence_pieces = [
        piece.strip()
        for piece in re.split(r"[。！？；;!?]+", unicodedata.normalize("NFKC", str(value or "")).replace("\r", " ").replace("\n", " "))
        if piece.strip()
    ]
    for piece in sentence_pieces:
        normalized_piece = normalize_for_detection_match(piece)
        if len(normalized_piece) < 18:
            continue
        if len(normalized_piece) <= 46:
            _add_detection_quote_fragment(fragments, normalized_piece)
            continue
        size = 32 if len(normalized_piece) >= 90 else 26
        positions = [
            0,
            math.floor(len(normalized_piece) * 0.28),
            math.floor(len(normalized_piece) * 0.56),
            max(0, len(normalized_piece) - size),
        ]
        for position in positions:
            _add_detection_quote_fragment(fragments, normalized_piece[position : position + size])
    if not fragments and len(normalized_full_text) >= 18:
        size = 32 if len(normalized_full_text) >= 90 else min(46, len(normalized_full_text))
        positions = [
            0,
            math.floor(len(normalized_full_text) * 0.3),
            math.floor(len(normalized_full_text) * 0.6),
            max(0, len(normalized_full_text) - size),
        ]
        for position in positions:
            _add_detection_quote_fragment(fragments, normalized_full_text[position : position + size])
    return list(fragments)[:28]


def _score_quote_fragment_coverage(segment_text: str, chunk_text: str) -> dict[str, Any]:
    fragments = _build_detection_quote_fragments(segment_text)
    if not fragments:
        return {"score": 0.0, "matchedFragments": []}
    chunk = normalize_for_detection_match(chunk_text)
    matched_fragments = [fragment for fragment in fragments if fragment in chunk]
    if not matched_fragments:
        return {"score": 0.0, "matchedFragments": []}
    raw_score = len(matched_fragments) / len(fragments)
    single_hit_penalty = 0.72 if len(fragments) >= 4 and len(matched_fragments) == 1 else 1.0
    return {"score": min(1.0, raw_score * single_hit_penalty), "matchedFragments": matched_fragments[:5]}


def _score_detection_position(segment_index: int, segment_count: int, chunk_index: int, chunk_count: int) -> float:
    if segment_count <= 1 or chunk_count <= 1:
        return 0.0
    segment_position = segment_index / (segment_count - 1)
    chunk_position = chunk_index / (chunk_count - 1)
    return max(0.0, 1 - abs(segment_position - chunk_position))


def _is_cjk(char: str) -> bool:
    return "\u3400" <= char <= "\u9fff"


def _to_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _to_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
