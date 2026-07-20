"""Provider-independent, text-free source-relative style-delta evidence.

This module does not infer authorship and is not an AI detector.  It compares a
candidate with the exact text it would replace and, when available, with a
frozen document pattern baseline.  Only enumerated pattern families, hashes,
counts, and binding digests leave this module; source/candidate text and matched
spans never do.

The deliberately conservative hard signals cover failure modes that a scalar
"style score" can hide:

* one repeated opening family replacing a different repeated family;
* repeated de-contented sentence skeletons;
* high-confidence sentence-boundary collapse or fragment inflation.

All pattern deltas are computed independently.  Removing an old pattern can
therefore never cancel a newly introduced pattern with a different id.
"""

from __future__ import annotations

from collections import Counter
from hashlib import sha256
import json
import math
import re
from typing import Iterable


SOURCE_RELATIVE_STYLE_DELTA_SCHEMA = "fyadr.source-relative-style-delta"
SOURCE_RELATIVE_STYLE_DELTA_VERSION = 1
SOURCE_RELATIVE_DOCUMENT_DELTA_SCHEMA = "fyadr.source-relative-document-style-delta"
SOURCE_RELATIVE_DOCUMENT_DELTA_VERSION = 1
SOURCE_PATTERN_PROFILE_SCHEMA = "fyadr.source-pattern-profile"
SOURCE_PATTERN_PROFILE_VERSION = 1

# Persisted document profiles are deliberately bounded.  These limits are far
# above a normal thesis while preventing a forged compare sidecar from turning
# profile validation into an unbounded CPU/memory operation.
MAX_SOURCE_PATTERN_PROFILE_CHUNKS = 100_000
MAX_SOURCE_PATTERN_PROFILE_SENTENCES = 200_000
MAX_SOURCE_PATTERN_PROFILE_PATTERN_ENTRIES = 200_000
MAX_SOURCE_PATTERN_PROFILE_TEXT_CHARS = 20_000_000

REPEATED_OPENING_FAMILY_INTRODUCED = "repeated_opening_family_introduced"
REPEATED_SENTENCE_SKELETON_INTRODUCED = "repeated_sentence_skeleton_introduced"
SENTENCE_BOUNDARY_COLLAPSE_INTRODUCED = "sentence_boundary_collapse_introduced"
SENTENCE_FRAGMENTATION_INTRODUCED = "sentence_fragmentation_introduced"
SOURCE_PATTERN_PROFILE_INVALID = "source_pattern_profile_invalid"

OPENING_LOCAL_AFTER_MIN = 3
OPENING_LOCAL_DELTA_MIN = 2
OPENING_DOCUMENT_AFTER_MIN = 4
OPENING_DOCUMENT_DELTA_MIN = 2
OPENING_CUMULATIVE_DELTA_MIN = 1
SKELETON_LOCAL_AFTER_MIN = 3
SKELETON_LOCAL_DELTA_MIN = 2
SKELETON_DOCUMENT_AFTER_MIN = 4
SKELETON_DOCUMENT_DELTA_MIN = 2
SKELETON_CUMULATIVE_DELTA_MIN = 1

_WHITESPACE_RE = re.compile(r"\s+")
_HARD_SENTENCE_TERMINALS = frozenset("。！？!?；;")
_CJK_RE = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF]")
_LATIN_WORD_RE = re.compile(r"[A-Za-z]+(?:[-'][A-Za-z]+)*")
_LEADING_MARKER_RE = re.compile(
    r"^(?:第[一二三四五六七八九十百零0-9]+[章节]|"
    r"[（(]?[一二三四五六七八九十0-9]+[）).、．]|"
    r"\d+(?:\.\d+){0,4})\s*"
)
_PLACEHOLDER_RE = re.compile(r"@@FYADR_[A-Z]+_\d{3}@@")
_NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)*(?:\.\d+)?")
_URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
_INLINE_CODE_RE = re.compile(r"`[^`\n]+`")
_EN_PERIOD_ABBREVIATIONS = frozenset(
    {
        "al",
        "approx",
        "dept",
        "dr",
        "eq",
        "etc",
        "fig",
        "inc",
        "jr",
        "mr",
        "mrs",
        "ms",
        "no",
        "prof",
        "sr",
        "st",
        "vs",
    }
)


# Ordered, intentionally broad grammatical families.  Values are stable enums,
# not matched text.  A family is only blocking after a sizeable positive delta.
_CN_OPENING_FAMILIES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("cn.based_on", re.compile(r"^(?:基于|依据|根据)")),
    ("cn.through", re.compile(r"^(?:通过|借助|利用)")),
    ("cn.targeting", re.compile(r"^(?:针对|围绕|关于|对于)")),
    ("cn.in_context", re.compile(r"^在[^，,。！？!?；;]{1,24}(?:中|内|下|上|方面|过程|阶段|条件下)[，,]?")),
    ("cn.condition", re.compile(r"^(?:若|如果|假如|倘若|只要|只有|一旦|除非|当)")),
    ("cn.concession", re.compile(r"^(?:虽然|尽管|即使|不过|然而|但是|但)")),
    ("cn.causal", re.compile(r"^(?:由于|因为|鉴于|因此|因而|所以)")),
    ("cn.sequence", re.compile(r"^(?:首先|其次|再次|最后|第一|第二|第三|其一|其二|其三)")),
    ("cn.additive", re.compile(r"^(?:此外|另外|同时|再者|并且|而且)")),
    ("cn.article_stance", re.compile(r"^(?:本文|本研究|本章|笔者|我们)")),
    ("cn.demonstrative_subject", re.compile(r"^(?:该|这(?:一|些)?)(?:方法|模型|系统|算法|研究|结果|过程|方案|模块|指标)")),
    ("cn.passive", re.compile(r"^(?:[^，,。！？!?；;]{0,10})?(?:被|受到|得以|予以|加以)")),
)
_EN_OPENING_FAMILIES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("en.based_on", re.compile(r"^(?:based on|according to)\b", re.IGNORECASE)),
    ("en.through", re.compile(r"^(?:through|using|by means of)\b", re.IGNORECASE)),
    ("en.condition", re.compile(r"^(?:if|when|unless|once|provided that)\b", re.IGNORECASE)),
    ("en.concession", re.compile(r"^(?:although|though|however|nevertheless)\b", re.IGNORECASE)),
    ("en.causal", re.compile(r"^(?:because|therefore|thus|consequently)\b", re.IGNORECASE)),
    ("en.sequence", re.compile(r"^(?:first|second|third|finally|lastly)\b", re.IGNORECASE)),
    ("en.article_stance", re.compile(r"^(?:this (?:study|paper|chapter)|we)\b", re.IGNORECASE)),
)
_OPENING_FAMILY_IDS = frozenset(
    {
        *(family_id for family_id, _pattern in _CN_OPENING_FAMILIES),
        *(family_id for family_id, _pattern in _EN_OPENING_FAMILIES),
        "cn.domain_subject",
        "cn.plain",
        "en.plain",
    }
)
_SOURCE_PROFILE_CLAIMS = {
    "providerIndependent": True,
    "storesInputText": False,
    "storesMatchedText": False,
    "isAiDetector": False,
    "claimsAuthorshipDetection": False,
    "claimsDetectionRate": False,
}


def _sha256_text(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


def _sha256_json(value: object) -> str:
    return _sha256_text(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")))


def _period_is_sentence_boundary(text: str, index: int) -> bool:
    """Conservatively recognize an English full-stop sentence boundary."""

    if index < 0 or index >= len(text) or text[index] != ".":
        return False
    next_index = index + 1
    while next_index < len(text) and text[next_index] in "\"'”’)]）】》":
        next_index += 1
    if next_index >= len(text):
        return True
    if not text[next_index].isspace():
        return False
    previous_char = text[index - 1] if index > 0 else ""
    while next_index < len(text) and text[next_index].isspace():
        next_index += 1
    if next_index >= len(text):
        return True
    next_char = text[next_index]
    if previous_char.isdigit() and next_char.isdigit():
        return False

    prefix = text[:index]
    token_match = re.search(r"([A-Za-z]+)$", prefix)
    token = token_match.group(1) if token_match else ""
    if token.lower() in _EN_PERIOD_ABBREVIATIONS:
        return False
    if len(token) == 1 and token.isalpha():
        # Initials and e.g./i.e. components are not reliable boundaries.
        return False
    numeric_token_match = re.search(r"([A-Za-z0-9_.-]+)$", prefix)
    numeric_token = numeric_token_match.group(1) if numeric_token_match else ""
    if "." in numeric_token and any(char.isdigit() for char in numeric_token):
        return False

    while next_char in "\"'“‘([（":
        next_index += 1
        if next_index >= len(text):
            return True
        next_char = text[next_index]
    return bool(
        next_char.isupper()
        or next_char.isdigit()
        or _CJK_RE.match(next_char)
    )


def _sentences(text: str) -> list[str]:
    normalized = _WHITESPACE_RE.sub(" ", str(text or "").replace("\r\n", "\n").replace("\r", "\n")).strip()
    if not normalized:
        return []
    parts: list[str] = []
    start = 0
    for index, char in enumerate(normalized):
        if index < start:
            continue
        if char not in _HARD_SENTENCE_TERMINALS and not (
            char == "." and _period_is_sentence_boundary(normalized, index)
        ):
            continue
        end = index + 1
        while end < len(normalized) and normalized[end] in "\"'”’)]）】》":
            end += 1
        sentence = normalized[start:end].strip()
        if sentence:
            parts.append(sentence)
        start = end
    tail = normalized[start:].strip()
    if tail:
        parts.append(tail)
    return parts or [normalized]


def _sentence_core(sentence: str) -> str:
    core = sentence.strip().strip("“”‘’\"' ")
    core = _LEADING_MARKER_RE.sub("", core)
    return core.lstrip("，,、：:；;。.!！？?")


def _language(sentence: str) -> str:
    cjk_count = len(_CJK_RE.findall(sentence))
    latin_count = len(_LATIN_WORD_RE.findall(sentence))
    return "en" if latin_count >= 4 and cjk_count <= 2 else "zh"


def _opening_family(sentence: str) -> str:
    core = _sentence_core(sentence)
    families = _EN_OPENING_FAMILIES if _language(core) == "en" else _CN_OPENING_FAMILIES
    for family_id, pattern in families:
        if pattern.search(core):
            return family_id
    if _language(core) == "en":
        return "en.plain"
    if re.match(r"^(?:系统|模型|算法|方法|研究|实验|结果|数据|模块)", core):
        return "cn.domain_subject"
    return "cn.plain"


def _length_bucket(sentence: str) -> str:
    length = len(_WHITESPACE_RE.sub("", sentence))
    if length <= 12:
        return "short"
    if length <= 32:
        return "medium"
    if length <= 64:
        return "long"
    return "very_long"


def _sentence_skeleton(sentence: str) -> tuple[str, str]:
    """Return ``(hash, opening-family)`` without retaining lexical content."""

    core = _sentence_core(sentence)
    family = _opening_family(core)
    masked = _PLACEHOLDER_RE.sub(" TOKEN ", core)
    masked = _URL_RE.sub(" URL ", masked)
    masked = _INLINE_CODE_RE.sub(" CODE ", masked)
    masked = _NUMBER_RE.sub(" NUMBER ", masked)
    comma_count = len(re.findall(r"[，,]", masked))
    semicolon_count = len(re.findall(r"[；;]", masked))
    colon_count = len(re.findall(r"[：:]", masked))
    conjunction_count = len(
        re.findall(
            r"(?:并且|而且|以及|同时|从而|进而|但是|然而|因此|因而|如果|虽然|不仅|而|并|且|"
            r"\b(?:and|but|because|therefore|although|while|if)\b)",
            masked,
            flags=re.IGNORECASE,
        )
    )
    payload = {
        "language": _language(core),
        "openingFamily": family,
        "commaBucket": min(comma_count, 4),
        "semicolonBucket": min(semicolon_count, 3),
        "colonBucket": min(colon_count, 2),
        "conjunctionBucket": min(conjunction_count, 4),
        "lengthBucket": _length_bucket(core),
    }
    return _sha256_json(payload), family


def _pattern_counts(text: str) -> tuple[Counter[str], Counter[str], dict[str, str], list[int]]:
    openings: Counter[str] = Counter()
    skeletons: Counter[str] = Counter()
    skeleton_families: dict[str, str] = {}
    sentence_lengths: list[int] = []
    for sentence in _sentences(text):
        family = _opening_family(sentence)
        skeleton_hash, skeleton_family = _sentence_skeleton(sentence)
        openings[family] += 1
        skeletons[skeleton_hash] += 1
        skeleton_families[skeleton_hash] = skeleton_family
        sentence_lengths.append(len(_WHITESPACE_RE.sub("", sentence)))
    return openings, skeletons, skeleton_families, sentence_lengths


def _count_items(counts: Counter[str], *, key: str) -> list[dict[str, object]]:
    return [
        {key: pattern_id, "count": int(count)}
        for pattern_id, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        if count > 0
    ]


def build_source_pattern_profile(texts: Iterable[str]) -> dict[str, object]:
    """Build an immutable, text-free document pattern baseline."""

    opening_counts: Counter[str] = Counter()
    skeleton_counts: Counter[str] = Counter()
    skeleton_families: dict[str, str] = {}
    chunk_count = 0
    sentence_count = 0
    text_char_count = 0
    for raw_text in texts:
        text = str(raw_text or "")
        if not text.strip():
            continue
        chunk_count += 1
        text_char_count += len(text)
        if (
            chunk_count > MAX_SOURCE_PATTERN_PROFILE_CHUNKS
            or text_char_count > MAX_SOURCE_PATTERN_PROFILE_TEXT_CHARS
        ):
            raise ValueError("source pattern profile input exceeds its bounded document budget")
        openings, skeletons, families, lengths = _pattern_counts(text)
        opening_counts.update(openings)
        skeleton_counts.update(skeletons)
        skeleton_families.update(families)
        sentence_count += len(lengths)
        if sentence_count > MAX_SOURCE_PATTERN_PROFILE_SENTENCES:
            raise ValueError("source pattern profile sentence count exceeds its bounded document budget")
    skeleton_items = [
        {
            "patternSha256": pattern_hash,
            "openingFamily": skeleton_families.get(pattern_hash, "unknown"),
            "count": int(count),
        }
        for pattern_hash, count in sorted(skeleton_counts.items(), key=lambda item: (-item[1], item[0]))
        if count > 0
    ]
    profile: dict[str, object] = {
        "schema": SOURCE_PATTERN_PROFILE_SCHEMA,
        "schemaVersion": SOURCE_PATTERN_PROFILE_VERSION,
        "contextScope": "document",
        "chunkCount": chunk_count,
        "sentenceCount": sentence_count,
        "openingFamilyCounts": _count_items(opening_counts, key="familyId"),
        "sentenceSkeletonCounts": skeleton_items,
        "claims": dict(_SOURCE_PROFILE_CLAIMS),
    }
    profile["profileSha256"] = _sha256_json(profile)
    return profile


def _valid_source_profile(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    if set(value) != {
        "schema",
        "schemaVersion",
        "contextScope",
        "chunkCount",
        "sentenceCount",
        "openingFamilyCounts",
        "sentenceSkeletonCounts",
        "claims",
        "profileSha256",
    }:
        return False
    if (
        value.get("schema") != SOURCE_PATTERN_PROFILE_SCHEMA
        or value.get("schemaVersion") != SOURCE_PATTERN_PROFILE_VERSION
        or value.get("contextScope") != "document"
    ):
        return False
    chunk_count = value.get("chunkCount")
    sentence_count = value.get("sentenceCount")
    if (
        isinstance(chunk_count, bool)
        or not isinstance(chunk_count, int)
        or chunk_count < 0
        or chunk_count > MAX_SOURCE_PATTERN_PROFILE_CHUNKS
        or isinstance(sentence_count, bool)
        or not isinstance(sentence_count, int)
        or sentence_count < 0
        or sentence_count > MAX_SOURCE_PATTERN_PROFILE_SENTENCES
        or (chunk_count == 0) != (sentence_count == 0)
        or chunk_count > sentence_count
    ):
        return False
    claims = value.get("claims")
    if claims != _SOURCE_PROFILE_CLAIMS:
        return False

    opening_items = value.get("openingFamilyCounts")
    skeleton_items = value.get("sentenceSkeletonCounts")
    if (
        not isinstance(opening_items, list)
        or len(opening_items) > len(_OPENING_FAMILY_IDS)
        or not isinstance(skeleton_items, list)
        or len(skeleton_items) > min(
            sentence_count,
            MAX_SOURCE_PATTERN_PROFILE_PATTERN_ENTRIES,
        )
    ):
        return False

    opening_total = 0
    seen_families: set[str] = set()
    normalized_openings: list[tuple[str, int]] = []
    for item in opening_items:
        if not isinstance(item, dict) or set(item) != {"familyId", "count"}:
            return False
        family_id = item.get("familyId")
        count = item.get("count")
        if (
            not isinstance(family_id, str)
            or family_id not in _OPENING_FAMILY_IDS
            or family_id in seen_families
            or isinstance(count, bool)
            or not isinstance(count, int)
            or count <= 0
            or count > sentence_count
        ):
            return False
        seen_families.add(family_id)
        opening_total += count
        normalized_openings.append((family_id, count))
    if opening_total != sentence_count or normalized_openings != sorted(
        normalized_openings,
        key=lambda item: (-item[1], item[0]),
    ):
        return False

    skeleton_total = 0
    seen_skeletons: set[str] = set()
    normalized_skeletons: list[tuple[str, str, int]] = []
    for item in skeleton_items:
        if not isinstance(item, dict) or set(item) != {
            "patternSha256",
            "openingFamily",
            "count",
        }:
            return False
        pattern_hash = item.get("patternSha256")
        opening_family = item.get("openingFamily")
        count = item.get("count")
        if (
            not isinstance(pattern_hash, str)
            or re.fullmatch(r"[0-9a-f]{64}", pattern_hash) is None
            or pattern_hash in seen_skeletons
            or not isinstance(opening_family, str)
            or opening_family not in _OPENING_FAMILY_IDS
            or isinstance(count, bool)
            or not isinstance(count, int)
            or count <= 0
            or count > sentence_count
        ):
            return False
        seen_skeletons.add(pattern_hash)
        skeleton_total += count
        normalized_skeletons.append((pattern_hash, opening_family, count))
    if skeleton_total != sentence_count or normalized_skeletons != sorted(
        normalized_skeletons,
        key=lambda item: (-item[2], item[0]),
    ):
        return False

    expected_hash = str(value.get("profileSha256", "") or "")
    if re.fullmatch(r"[0-9a-f]{64}", expected_hash) is None:
        return False
    payload = dict(value)
    payload.pop("profileSha256", None)
    return expected_hash == _sha256_json(payload)


def source_pattern_profile_valid(value: object) -> bool:
    """Strictly validate a persisted, text-free document pattern profile."""

    return _valid_source_profile(value)


def _document_positive_pattern_rows(
    before: Counter[str],
    after: Counter[str],
    *,
    kind: str,
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for pattern_id in sorted(before.keys() | after.keys()):
        baseline_count = int(before.get(pattern_id, 0))
        result_count = int(after.get(pattern_id, 0))
        introduced_count = max(0, result_count - baseline_count)
        if introduced_count <= 0:
            continue
        row: dict[str, object] = {
            "kind": kind,
            "baselineCount": baseline_count,
            "resultCount": result_count,
            "introducedCount": introduced_count,
        }
        if kind == "opening_family":
            row["familyId"] = pattern_id
        else:
            row["patternSha256"] = pattern_id
        rows.append(row)
    return rows


def _document_pattern_row_blocks(row: dict[str, object], *, kind: str) -> bool:
    result_count = int(row.get("resultCount", 0) or 0)
    introduced_count = int(row.get("introducedCount", 0) or 0)
    if kind == "opening_family":
        return bool(
            result_count >= OPENING_DOCUMENT_AFTER_MIN
            and introduced_count >= OPENING_CUMULATIVE_DELTA_MIN
        )
    return bool(
        result_count >= SKELETON_DOCUMENT_AFTER_MIN
        and introduced_count >= SKELETON_CUMULATIVE_DELTA_MIN
    )


def assess_source_relative_document_delta(
    input_texts: Iterable[str],
    output_texts: Iterable[str],
) -> dict[str, object]:
    """Assess cumulative pattern introduction across ordered chunk lists.

    Chunk lists are profiled independently rather than concatenated, so a
    chunk ending without punctuation cannot merge with the next chunk and
    falsify sentence/opening counts.  The evidence contains hashes and counts
    only; no body text or matched spans are persisted.
    """

    def bounded_text_list(values: Iterable[str]) -> list[str]:
        result: list[str] = []
        total_chars = 0
        for raw_text in values:
            if len(result) >= MAX_SOURCE_PATTERN_PROFILE_CHUNKS:
                raise ValueError("document delta chunk count exceeds its bounded document budget")
            if not isinstance(raw_text, str):
                raise TypeError("document delta texts must all be strings")
            total_chars += len(raw_text)
            if total_chars > MAX_SOURCE_PATTERN_PROFILE_TEXT_CHARS:
                raise ValueError("document delta text exceeds its bounded document budget")
            result.append(raw_text)
        return result

    baseline_texts = bounded_text_list(input_texts)
    result_texts = bounded_text_list(output_texts)
    if len(baseline_texts) != len(result_texts):
        raise ValueError("input_texts and output_texts must have the same length")

    baseline_profile = build_source_pattern_profile(baseline_texts)
    result_profile = build_source_pattern_profile(result_texts)
    baseline_openings, baseline_skeletons, _ = _profile_counts(baseline_profile)
    result_openings, result_skeletons, _ = _profile_counts(result_profile)
    opening_rows = _document_positive_pattern_rows(
        baseline_openings,
        result_openings,
        kind="opening_family",
    )
    skeleton_rows = _document_positive_pattern_rows(
        baseline_skeletons,
        result_skeletons,
        kind="sentence_skeleton",
    )
    blocking_openings = [
        row
        for row in opening_rows
        if _document_pattern_row_blocks(row, kind="opening_family")
    ]
    blocking_skeletons = [
        row
        for row in skeleton_rows
        if _document_pattern_row_blocks(row, kind="sentence_skeleton")
    ]
    blocking_codes: list[str] = []
    if blocking_openings:
        blocking_codes.append(REPEATED_OPENING_FAMILY_INTRODUCED)
    if blocking_skeletons:
        blocking_codes.append(REPEATED_SENTENCE_SKELETON_INTRODUCED)
    advisory_codes: list[str] = []
    if opening_rows and not blocking_openings:
        advisory_codes.append("document_opening_family_delta_observed")
    if skeleton_rows and not blocking_skeletons:
        advisory_codes.append("document_sentence_skeleton_delta_observed")

    return {
        "schema": SOURCE_RELATIVE_DOCUMENT_DELTA_SCHEMA,
        "schemaVersion": SOURCE_RELATIVE_DOCUMENT_DELTA_VERSION,
        "ready": True,
        "passed": not blocking_codes,
        "binding": {
            "chunkCount": len(baseline_texts),
            "baselineProfileSha256": str(baseline_profile.get("profileSha256", "") or ""),
            "resultProfileSha256": str(result_profile.get("profileSha256", "") or ""),
            "baselineChunksSha256": _sha256_json(
                [_sha256_text(text.strip()) for text in baseline_texts]
            ),
            "resultChunksSha256": _sha256_json(
                [_sha256_text(text.strip()) for text in result_texts]
            ),
        },
        "openingFamilyDelta": {
            "introducedPatternCount": len(opening_rows),
            "blockingPatternCount": len(blocking_openings),
            "maxIntroducedCount": max(
                (int(row["introducedCount"]) for row in opening_rows),
                default=0,
            ),
            "maxResultCount": max(
                (int(row["resultCount"]) for row in opening_rows),
                default=0,
            ),
            "issueCodes": [REPEATED_OPENING_FAMILY_INTRODUCED]
            if blocking_openings
            else [],
            "patterns": opening_rows[:24],
        },
        "sentenceSkeletonDelta": {
            "introducedPatternCount": len(skeleton_rows),
            "blockingPatternCount": len(blocking_skeletons),
            "maxIntroducedCount": max(
                (int(row["introducedCount"]) for row in skeleton_rows),
                default=0,
            ),
            "maxResultCount": max(
                (int(row["resultCount"]) for row in skeleton_rows),
                default=0,
            ),
            "issueCodes": [REPEATED_SENTENCE_SKELETON_INTRODUCED]
            if blocking_skeletons
            else [],
            "patterns": skeleton_rows[:24],
        },
        "blockingIssueCodes": blocking_codes,
        "advisoryIssueCodes": advisory_codes,
        "claims": {
            "providerIndependent": True,
            "deltaOnly": True,
            "heuristicOnly": True,
            "storesInputText": False,
            "storesOutputText": False,
            "storesMatchedText": False,
            "preservesChunkBoundaries": True,
            "isAiDetector": False,
            "claimsAuthorshipDetection": False,
            "claimsDetectionRate": False,
            "claimsSemanticEquivalence": False,
        },
    }


def source_relative_document_delta_passed(value: object) -> bool:
    """Validate the release-critical document-delta evidence envelope."""

    if not isinstance(value, dict) or set(value) != {
        "schema",
        "schemaVersion",
        "ready",
        "passed",
        "binding",
        "openingFamilyDelta",
        "sentenceSkeletonDelta",
        "blockingIssueCodes",
        "advisoryIssueCodes",
        "claims",
    }:
        return False
    if (
        value.get("schema") != SOURCE_RELATIVE_DOCUMENT_DELTA_SCHEMA
        or value.get("schemaVersion") != SOURCE_RELATIVE_DOCUMENT_DELTA_VERSION
        or value.get("ready") is not True
        or value.get("passed") is not True
        or value.get("blockingIssueCodes") != []
    ):
        return False
    binding = value.get("binding")
    if not isinstance(binding, dict) or set(binding) != {
        "chunkCount",
        "baselineProfileSha256",
        "resultProfileSha256",
        "baselineChunksSha256",
        "resultChunksSha256",
    }:
        return False
    chunk_count = binding.get("chunkCount")
    if (
        isinstance(chunk_count, bool)
        or not isinstance(chunk_count, int)
        or chunk_count < 0
        or chunk_count > MAX_SOURCE_PATTERN_PROFILE_CHUNKS
    ):
        return False
    if any(
        re.fullmatch(r"[0-9a-f]{64}", str(binding.get(key, "") or "")) is None
        for key in (
            "baselineProfileSha256",
            "resultProfileSha256",
            "baselineChunksSha256",
            "resultChunksSha256",
        )
    ):
        return False

    for raw_delta, kind in (
        (value.get("openingFamilyDelta"), "opening_family"),
        (value.get("sentenceSkeletonDelta"), "sentence_skeleton"),
    ):
        if not isinstance(raw_delta, dict) or set(raw_delta) != {
            "introducedPatternCount",
            "blockingPatternCount",
            "maxIntroducedCount",
            "maxResultCount",
            "issueCodes",
            "patterns",
        }:
            return False
        integer_fields = (
            raw_delta.get("introducedPatternCount"),
            raw_delta.get("blockingPatternCount"),
            raw_delta.get("maxIntroducedCount"),
            raw_delta.get("maxResultCount"),
        )
        if any(
            isinstance(item, bool) or not isinstance(item, int) or item < 0
            for item in integer_fields
        ):
            return False
        if raw_delta.get("blockingPatternCount") != 0 or raw_delta.get("issueCodes") != []:
            return False
        patterns = raw_delta.get("patterns")
        introduced_count = int(raw_delta.get("introducedPatternCount", 0) or 0)
        if (
            not isinstance(patterns, list)
            or len(patterns) > 24
            or introduced_count < len(patterns)
            or (introduced_count <= 24 and introduced_count != len(patterns))
        ):
            return False
        visible_ids: list[str] = []
        visible_max_introduced = 0
        visible_max_result = 0
        for row in patterns:
            identifier_key = "familyId" if kind == "opening_family" else "patternSha256"
            if not isinstance(row, dict) or set(row) != {
                "kind",
                "baselineCount",
                "resultCount",
                "introducedCount",
                identifier_key,
            }:
                return False
            pattern_id = row.get(identifier_key)
            if kind == "opening_family":
                if not isinstance(pattern_id, str) or pattern_id not in _OPENING_FAMILY_IDS:
                    return False
            elif (
                not isinstance(pattern_id, str)
                or re.fullmatch(r"[0-9a-f]{64}", pattern_id) is None
            ):
                return False
            counts = (
                row.get("baselineCount"),
                row.get("resultCount"),
                row.get("introducedCount"),
            )
            if any(
                isinstance(item, bool) or not isinstance(item, int) or item < 0
                for item in counts
            ):
                return False
            baseline_count, result_count, row_introduced = counts
            if (
                row.get("kind") != kind
                or row_introduced <= 0
                or row_introduced != max(0, result_count - baseline_count)
                or _document_pattern_row_blocks(row, kind=kind)
            ):
                return False
            visible_ids.append(pattern_id)
            visible_max_introduced = max(visible_max_introduced, row_introduced)
            visible_max_result = max(visible_max_result, result_count)
        if visible_ids != sorted(visible_ids) or len(visible_ids) != len(set(visible_ids)):
            return False
        if (
            int(raw_delta.get("maxIntroducedCount", 0) or 0) < visible_max_introduced
            or int(raw_delta.get("maxResultCount", 0) or 0) < visible_max_result
        ):
            return False

    opening_count = int(
        (value.get("openingFamilyDelta") or {}).get("introducedPatternCount", 0) or 0
    )
    skeleton_count = int(
        (value.get("sentenceSkeletonDelta") or {}).get("introducedPatternCount", 0) or 0
    )
    expected_advisory: list[str] = []
    if opening_count:
        expected_advisory.append("document_opening_family_delta_observed")
    if skeleton_count:
        expected_advisory.append("document_sentence_skeleton_delta_observed")
    if value.get("advisoryIssueCodes") != expected_advisory:
        return False
    return value.get("claims") == {
        "providerIndependent": True,
        "deltaOnly": True,
        "heuristicOnly": True,
        "storesInputText": False,
        "storesOutputText": False,
        "storesMatchedText": False,
        "preservesChunkBoundaries": True,
        "isAiDetector": False,
        "claimsAuthorshipDetection": False,
        "claimsDetectionRate": False,
        "claimsSemanticEquivalence": False,
    }


def _profile_counts(
    profile: dict[str, object] | None,
) -> tuple[Counter[str], Counter[str], dict[str, str]]:
    openings: Counter[str] = Counter()
    skeletons: Counter[str] = Counter()
    skeleton_families: dict[str, str] = {}
    if not _valid_source_profile(profile):
        return openings, skeletons, skeleton_families
    for item in profile.get("openingFamilyCounts", []):
        if not isinstance(item, dict):
            continue
        family_id = str(item.get("familyId", "") or "")
        count = int(item.get("count", 0) or 0)
        if family_id and count > 0:
            openings[family_id] = count
    for item in profile.get("sentenceSkeletonCounts", []):
        if not isinstance(item, dict):
            continue
        pattern_hash = str(item.get("patternSha256", "") or "")
        family = str(item.get("openingFamily", "unknown") or "unknown")
        count = int(item.get("count", 0) or 0)
        if re.fullmatch(r"[0-9a-f]{64}", pattern_hash) and count > 0:
            skeletons[pattern_hash] = count
            skeleton_families[pattern_hash] = family
    return openings, skeletons, skeleton_families


def _positive_pattern_rows(
    before: Counter[str],
    after: Counter[str],
    *,
    kind: str,
    document_before: Counter[str] | None = None,
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for pattern_id in sorted(before.keys() | after.keys()):
        input_count = int(before.get(pattern_id, 0))
        output_count = int(after.get(pattern_id, 0))
        introduced = max(0, output_count - input_count)
        if introduced <= 0:
            continue
        doc_before = int((document_before or Counter()).get(pattern_id, 0))
        doc_after = max(0, doc_before - input_count) + output_count if document_before is not None else output_count
        row: dict[str, object] = {
            "kind": kind,
            "inputCount": input_count,
            "outputCount": output_count,
            "introducedCount": introduced,
            "documentBeforeCount": doc_before if document_before is not None else None,
            "documentAfterCount": doc_after if document_before is not None else None,
            "documentIntroducedCount": max(0, doc_after - doc_before) if document_before is not None else None,
        }
        if kind == "opening_family":
            row["familyId"] = pattern_id
        else:
            row["patternSha256"] = pattern_id
        rows.append(row)
    return rows


def _row_blocks(row: dict[str, object], *, kind: str, document_ready: bool) -> bool:
    output_count = int(row.get("outputCount", 0) or 0)
    introduced = int(row.get("introducedCount", 0) or 0)
    if kind == "opening_family":
        local_block = output_count >= OPENING_LOCAL_AFTER_MIN and introduced >= OPENING_LOCAL_DELTA_MIN
        document_block = bool(
            document_ready
            and int(row.get("documentAfterCount", 0) or 0) >= OPENING_DOCUMENT_AFTER_MIN
            and int(row.get("documentIntroducedCount", 0) or 0) >= OPENING_DOCUMENT_DELTA_MIN
        )
    else:
        local_block = output_count >= SKELETON_LOCAL_AFTER_MIN and introduced >= SKELETON_LOCAL_DELTA_MIN
        document_block = bool(
            document_ready
            and int(row.get("documentAfterCount", 0) or 0) >= SKELETON_DOCUMENT_AFTER_MIN
            and int(row.get("documentIntroducedCount", 0) or 0) >= SKELETON_DOCUMENT_DELTA_MIN
        )
    return local_block or document_block


def _sentence_boundary_delta(input_lengths: list[int], output_lengths: list[int]) -> dict[str, object]:
    input_count = len(input_lengths)
    output_count = len(output_lengths)
    input_short = sum(1 for length in input_lengths if length <= 6)
    output_short = sum(1 for length in output_lengths if length <= 6)
    input_avg = sum(input_lengths) / max(input_count, 1)
    output_avg = sum(output_lengths) / max(output_count, 1)

    collapse_count = max(0, input_count - output_count)
    fragment_increase = max(0, output_short - input_short)
    collapsed = bool(
        input_count >= 4
        and collapse_count >= 3
        and output_count <= max(1, math.ceil(input_count * 0.5))
        and output_avg >= max(36.0, input_avg * 1.45)
    )
    fragmented = bool(
        output_count >= 5
        and fragment_increase >= 2
        and output_short / max(output_count, 1) >= 0.25
    )
    issue_codes: list[str] = []
    if collapsed:
        issue_codes.append(SENTENCE_BOUNDARY_COLLAPSE_INTRODUCED)
    if fragmented:
        issue_codes.append(SENTENCE_FRAGMENTATION_INTRODUCED)
    return {
        "inputSentenceCount": input_count,
        "outputSentenceCount": output_count,
        "inputShortSentenceCount": input_short,
        "outputShortSentenceCount": output_short,
        "collapseCount": collapse_count,
        "fragmentIncrease": fragment_increase,
        "collapsed": collapsed,
        "fragmented": fragmented,
        "issueCodes": issue_codes,
    }


def assess_source_relative_style_delta(
    input_text: str,
    output_text: str,
    *,
    source_pattern_profile: dict[str, object] | None = None,
) -> dict[str, object]:
    """Assess a candidate using only per-pattern positive deltas.

    A missing profile is an explicit ``local`` fallback, not a fabricated
    document assessment.  The returned object is safe to persist and expose.
    """

    if not isinstance(input_text, str) or not isinstance(output_text, str):
        raise TypeError("input_text and output_text must both be strings")

    input_openings, input_skeletons, _input_families, input_lengths = _pattern_counts(input_text)
    output_openings, output_skeletons, _output_families, output_lengths = _pattern_counts(output_text)
    profile_supplied = source_pattern_profile is not None
    document_ready = _valid_source_profile(source_pattern_profile)
    invalid_supplied_profile = bool(profile_supplied and not document_ready)
    document_openings, document_skeletons, _document_families = _profile_counts(
        source_pattern_profile if document_ready else None
    )
    opening_rows = _positive_pattern_rows(
        input_openings,
        output_openings,
        kind="opening_family",
        document_before=document_openings if document_ready else None,
    )
    skeleton_rows = _positive_pattern_rows(
        input_skeletons,
        output_skeletons,
        kind="sentence_skeleton",
        document_before=document_skeletons if document_ready else None,
    )
    blocking_openings = [row for row in opening_rows if _row_blocks(row, kind="opening_family", document_ready=document_ready)]
    blocking_skeletons = [row for row in skeleton_rows if _row_blocks(row, kind="sentence_skeleton", document_ready=document_ready)]
    boundary_delta = _sentence_boundary_delta(input_lengths, output_lengths)

    blocking_codes: list[str] = []
    if invalid_supplied_profile:
        blocking_codes.append(SOURCE_PATTERN_PROFILE_INVALID)
    if blocking_openings:
        blocking_codes.append(REPEATED_OPENING_FAMILY_INTRODUCED)
    if blocking_skeletons:
        blocking_codes.append(REPEATED_SENTENCE_SKELETON_INTRODUCED)
    blocking_codes.extend(str(code) for code in boundary_delta["issueCodes"])
    blocking_codes = list(dict.fromkeys(blocking_codes))

    advisory_codes: list[str] = []
    if opening_rows and not blocking_openings:
        advisory_codes.append("opening_family_delta_observed")
    if skeleton_rows and not blocking_skeletons:
        advisory_codes.append("sentence_skeleton_delta_observed")

    source_profile_sha256 = (
        str((source_pattern_profile or {}).get("profileSha256", "") or "")
        if document_ready
        else ""
    )
    return {
        "schema": SOURCE_RELATIVE_STYLE_DELTA_SCHEMA,
        "schemaVersion": SOURCE_RELATIVE_STYLE_DELTA_VERSION,
        "ready": not invalid_supplied_profile,
        "passed": not blocking_codes,
        "contextScope": "document" if document_ready else "invalid" if invalid_supplied_profile else "local",
        "binding": {
            "sourceProfileSha256": source_profile_sha256,
            "baselineTextSha256": _sha256_text(input_text.strip()),
            "candidateTextSha256": _sha256_text(output_text.strip()),
        },
        "openingFamilyDelta": {
            "introducedPatternCount": len(opening_rows),
            "blockingPatternCount": len(blocking_openings),
            "maxIntroducedCount": max((int(row["introducedCount"]) for row in opening_rows), default=0),
            "maxDocumentAfterCount": max((int(row.get("documentAfterCount", 0) or 0) for row in opening_rows), default=0),
            "issueCodes": [REPEATED_OPENING_FAMILY_INTRODUCED] if blocking_openings else [],
            "patterns": opening_rows[:12],
        },
        "sentenceSkeletonDelta": {
            "introducedPatternCount": len(skeleton_rows),
            "blockingPatternCount": len(blocking_skeletons),
            "maxIntroducedCount": max((int(row["introducedCount"]) for row in skeleton_rows), default=0),
            "maxDocumentAfterCount": max((int(row.get("documentAfterCount", 0) or 0) for row in skeleton_rows), default=0),
            "issueCodes": [REPEATED_SENTENCE_SKELETON_INTRODUCED] if blocking_skeletons else [],
            "patterns": skeleton_rows[:12],
        },
        "sentenceBoundaryDelta": boundary_delta,
        "blockingIssueCodes": blocking_codes,
        "advisoryIssueCodes": advisory_codes,
        "claims": {
            "providerIndependent": True,
            "deltaOnly": True,
            "heuristicOnly": True,
            "storesInputText": False,
            "storesOutputText": False,
            "storesMatchedText": False,
            "isAiDetector": False,
            "claimsAuthorshipDetection": False,
            "claimsDetectionRate": False,
            "claimsSemanticEquivalence": False,
        },
    }


def source_relative_style_delta_passed(value: object) -> bool:
    """Strictly validate the release-critical portion of persisted evidence."""

    if not isinstance(value, dict):
        return False
    if set(value) != {
        "schema",
        "schemaVersion",
        "ready",
        "passed",
        "contextScope",
        "binding",
        "openingFamilyDelta",
        "sentenceSkeletonDelta",
        "sentenceBoundaryDelta",
        "blockingIssueCodes",
        "advisoryIssueCodes",
        "claims",
    }:
        return False
    if value.get("schema") != SOURCE_RELATIVE_STYLE_DELTA_SCHEMA or value.get("schemaVersion") != SOURCE_RELATIVE_STYLE_DELTA_VERSION:
        return False
    if value.get("ready") is not True or value.get("passed") is not True:
        return False
    if value.get("contextScope") not in {"document", "local"}:
        return False
    if value.get("blockingIssueCodes") != []:
        return False
    binding = value.get("binding")
    if not isinstance(binding, dict):
        return False
    for key in ("baselineTextSha256", "candidateTextSha256"):
        if not re.fullmatch(r"[0-9a-f]{64}", str(binding.get(key, "") or "")):
            return False
    if value.get("contextScope") == "document" and not re.fullmatch(
        r"[0-9a-f]{64}", str(binding.get("sourceProfileSha256", "") or "")
    ):
        return False
    if value.get("contextScope") == "local" and str(binding.get("sourceProfileSha256", "") or ""):
        return False
    if set(binding) != {
        "sourceProfileSha256",
        "baselineTextSha256",
        "candidateTextSha256",
    }:
        return False

    def exact_nonnegative_int(raw: object) -> int | None:
        if isinstance(raw, bool) or not isinstance(raw, int) or raw < 0:
            return None
        return raw

    def valid_pattern_delta(raw: object, *, kind: str) -> bool:
        if not isinstance(raw, dict) or set(raw) != {
            "introducedPatternCount",
            "blockingPatternCount",
            "maxIntroducedCount",
            "maxDocumentAfterCount",
            "issueCodes",
            "patterns",
        }:
            return False
        introduced_pattern_count = exact_nonnegative_int(raw.get("introducedPatternCount"))
        blocking_pattern_count = exact_nonnegative_int(raw.get("blockingPatternCount"))
        max_introduced_count = exact_nonnegative_int(raw.get("maxIntroducedCount"))
        max_document_after_count = exact_nonnegative_int(raw.get("maxDocumentAfterCount"))
        patterns = raw.get("patterns")
        if (
            introduced_pattern_count is None
            or blocking_pattern_count != 0
            or max_introduced_count is None
            or max_document_after_count is None
            or raw.get("issueCodes") != []
            or not isinstance(patterns, list)
            or len(patterns) > 12
            or introduced_pattern_count < len(patterns)
            or (introduced_pattern_count <= 12 and introduced_pattern_count != len(patterns))
            or (introduced_pattern_count == 0) != (max_introduced_count == 0)
        ):
            return False
        pattern_ids: list[str] = []
        visible_max_introduced = 0
        visible_max_document_after = 0
        for row in patterns:
            identifier_key = "familyId" if kind == "opening_family" else "patternSha256"
            if not isinstance(row, dict) or set(row) != {
                "kind",
                "inputCount",
                "outputCount",
                "introducedCount",
                "documentBeforeCount",
                "documentAfterCount",
                "documentIntroducedCount",
                identifier_key,
            }:
                return False
            pattern_id = row.get(identifier_key)
            if kind == "opening_family":
                if not isinstance(pattern_id, str) or pattern_id not in _OPENING_FAMILY_IDS:
                    return False
            elif (
                not isinstance(pattern_id, str)
                or re.fullmatch(r"[0-9a-f]{64}", pattern_id) is None
            ):
                return False
            input_count = exact_nonnegative_int(row.get("inputCount"))
            output_count = exact_nonnegative_int(row.get("outputCount"))
            introduced_count = exact_nonnegative_int(row.get("introducedCount"))
            if (
                row.get("kind") != kind
                or input_count is None
                or output_count is None
                or introduced_count is None
                or introduced_count <= 0
                or introduced_count != max(0, output_count - input_count)
            ):
                return False
            if value.get("contextScope") == "document":
                document_before = exact_nonnegative_int(row.get("documentBeforeCount"))
                document_after = exact_nonnegative_int(row.get("documentAfterCount"))
                document_introduced = exact_nonnegative_int(row.get("documentIntroducedCount"))
                if (
                    document_before is None
                    or document_after is None
                    or document_introduced is None
                    or document_after != max(0, document_before - input_count) + output_count
                    or document_introduced != max(0, document_after - document_before)
                ):
                    return False
                visible_max_document_after = max(visible_max_document_after, document_after)
            elif any(
                row.get(key) is not None
                for key in (
                    "documentBeforeCount",
                    "documentAfterCount",
                    "documentIntroducedCount",
                )
            ):
                return False
            if _row_blocks(
                row,
                kind=kind,
                document_ready=value.get("contextScope") == "document",
            ):
                return False
            pattern_ids.append(pattern_id)
            visible_max_introduced = max(visible_max_introduced, introduced_count)
        if pattern_ids != sorted(pattern_ids) or len(pattern_ids) != len(set(pattern_ids)):
            return False
        if (
            max_introduced_count < visible_max_introduced
            or max_document_after_count < visible_max_document_after
            or (value.get("contextScope") == "local" and max_document_after_count != 0)
        ):
            return False
        return True

    opening_delta = value.get("openingFamilyDelta")
    skeleton_delta = value.get("sentenceSkeletonDelta")
    if not valid_pattern_delta(opening_delta, kind="opening_family") or not valid_pattern_delta(
        skeleton_delta,
        kind="sentence_skeleton",
    ):
        return False
    advisory_issue_codes = value.get("advisoryIssueCodes")
    if not isinstance(advisory_issue_codes, list) or advisory_issue_codes != list(
        dict.fromkeys(advisory_issue_codes)
    ):
        return False
    expected_advisory_codes: list[str] = []
    if int(opening_delta.get("introducedPatternCount", 0) or 0) > 0:
        expected_advisory_codes.append("opening_family_delta_observed")
    if int(skeleton_delta.get("introducedPatternCount", 0) or 0) > 0:
        expected_advisory_codes.append("sentence_skeleton_delta_observed")
    if advisory_issue_codes != expected_advisory_codes:
        return False

    boundary = value.get("sentenceBoundaryDelta")
    if not isinstance(boundary, dict) or set(boundary) != {
        "inputSentenceCount",
        "outputSentenceCount",
        "inputShortSentenceCount",
        "outputShortSentenceCount",
        "collapseCount",
        "fragmentIncrease",
        "collapsed",
        "fragmented",
        "issueCodes",
    }:
        return False
    input_sentence_count = exact_nonnegative_int(boundary.get("inputSentenceCount"))
    output_sentence_count = exact_nonnegative_int(boundary.get("outputSentenceCount"))
    input_short_count = exact_nonnegative_int(boundary.get("inputShortSentenceCount"))
    output_short_count = exact_nonnegative_int(boundary.get("outputShortSentenceCount"))
    collapse_count = exact_nonnegative_int(boundary.get("collapseCount"))
    fragment_increase = exact_nonnegative_int(boundary.get("fragmentIncrease"))
    if (
        input_sentence_count is None
        or output_sentence_count is None
        or input_short_count is None
        or output_short_count is None
        or collapse_count != max(0, input_sentence_count - output_sentence_count)
        or fragment_increase != max(0, output_short_count - input_short_count)
        or input_short_count > input_sentence_count
        or output_short_count > output_sentence_count
        or boundary.get("collapsed") is not False
        or boundary.get("fragmented") is not False
        or boundary.get("issueCodes") != []
    ):
        return False
    claims = value.get("claims")
    return claims == {
        "providerIndependent": True,
        "deltaOnly": True,
        "heuristicOnly": True,
        "storesInputText": False,
        "storesOutputText": False,
        "storesMatchedText": False,
        "isAiDetector": False,
        "claimsAuthorshipDetection": False,
        "claimsDetectionRate": False,
        "claimsSemanticEquivalence": False,
    }


__all__ = [
    "SOURCE_RELATIVE_STYLE_DELTA_SCHEMA",
    "SOURCE_RELATIVE_STYLE_DELTA_VERSION",
    "SOURCE_RELATIVE_DOCUMENT_DELTA_SCHEMA",
    "SOURCE_RELATIVE_DOCUMENT_DELTA_VERSION",
    "SOURCE_PATTERN_PROFILE_SCHEMA",
    "SOURCE_PATTERN_PROFILE_VERSION",
    "REPEATED_OPENING_FAMILY_INTRODUCED",
    "REPEATED_SENTENCE_SKELETON_INTRODUCED",
    "SENTENCE_BOUNDARY_COLLAPSE_INTRODUCED",
    "SENTENCE_FRAGMENTATION_INTRODUCED",
    "build_source_pattern_profile",
    "source_pattern_profile_valid",
    "assess_source_relative_style_delta",
    "source_relative_style_delta_passed",
    "assess_source_relative_document_delta",
    "source_relative_document_delta_passed",
]
