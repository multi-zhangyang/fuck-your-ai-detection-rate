from __future__ import annotations

import json
import os
import re
import time
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Callable, NamedTuple, Sequence

from ai_json import extract_json_payload
from academic_readability import (
    ACADEMIC_COLLOCATION_CONFLICT_INTRODUCED,
    ACADEMIC_READABILITY_DELTA_SCHEMA,
    ACADEMIC_READABILITY_DELTA_VERSION,
    COLLOQUIAL_REGISTER_INTRODUCED,
    PREDICATE_COMPLETENESS_REGRESSION,
    TELEGRAPHIC_CLAUSE_CHAIN_INTRODUCED,
    VAGUE_CAUSAL_REFERENCE_INTRODUCED,
    assess_academic_readability_delta,
)
from fyadr_records import ROOT_DIR, update_round
from chunking import ChunkManifest, DEFAULT_CHUNK_LIMIT, build_manifest, restore_text_from_chunks, save_manifest
from factual_guards import (
    FACTUAL_SCOPE_QUALIFIER_CHANGED,
    build_factual_relation_guard,
    collect_factual_relation_issues,
    validate_factual_relation_stability,
)
from prompt_library import (
    DEFAULT_PROMPT_PROFILE,
    get_chunk_metric,
    get_max_rounds,
    get_prompt_mapping,
    get_prompt_sequence_key,
    get_round_dimension,
    normalize_prompt_profile,
    normalize_prompt_sequence,
)
from runtime_error_safety import (
    safe_exception_details,
    safe_public_error_message,
    sanitize_persisted_error,
)
from source_relative_style_delta import (
    REPEATED_OPENING_FAMILY_INTRODUCED,
    REPEATED_SENTENCE_SKELETON_INTRODUCED,
    SENTENCE_BOUNDARY_COLLAPSE_INTRODUCED,
    SENTENCE_FRAGMENTATION_INTRODUCED,
    SOURCE_RELATIVE_STYLE_DELTA_SCHEMA,
    SOURCE_RELATIVE_STYLE_DELTA_VERSION,
    assess_source_relative_document_delta,
    assess_source_relative_style_delta,
    build_source_pattern_profile,
    source_relative_document_delta_passed,
    source_relative_style_delta_passed,
)
from style_blacklist_registry import (
    build_ai_abstract_padding_pattern,
    build_ai_burst_connector_pattern,
    build_chengyu_pattern,
    build_colon_parallel_pattern,
    build_en_mechanical_connector_pattern,
    build_en_template_phrase_pattern,
    build_generic_closing_pattern,
    build_introduced_template_phrase_pattern,
    build_mechanical_connector_pattern,
    build_nested_number_marker_pattern,
    build_passive_voice_pattern,
    build_template_phrase_pattern,
)


Transform = Callable[[str, str, int, str], str]
ProgressCallback = Callable[[dict[str, object]], None]
CancelCheck = Callable[[], bool]
ROUND_CHECKPOINT_VERSION = 6
ROUND_COMPARE_VERSION = 3
MAX_VALIDATION_ATTEMPTS = 2
MAX_FAILED_OUTPUT_CHARS = 12000
CANDIDATE_SELECTION_SCHEMA = "fyadr.chunk-candidate-selection"
CANDIDATE_SELECTION_VERSION = 2
FAILED_ATTEMPT_EVIDENCE_SCHEMA = "fyadr.failed-attempt-evidence"
FAILED_ATTEMPT_EVIDENCE_VERSION = 1
DOCUMENT_PATTERN_ACCUMULATION_BLOCKED = "document_pattern_delta_accumulation_blocked"
MAX_CHUNK_CANDIDATE_COUNT = MAX_VALIDATION_ATTEMPTS + 1  # baseline + bounded model attempts
LEXICAL_RETENTION_MIN_SCORE = 0.58
CANDIDATE_STYLE_REGRESSION_TOLERANCE = 0.75
CANDIDATE_STYLE_MIN_GAIN = 0.05
DEFAULT_ROUND_CONCURRENCY = 1
MAX_ROUND_CONCURRENCY = 16
CHECKPOINT_SOFT_MISMATCH_KEYS: set[str] = set()
FAILED_ATTEMPT_GUARD_CATEGORIES = frozenset(
    {
        "structure",
        "factual",
        "readability",
        "style",
        "provider",
        "local_validation",
    }
)
FAILED_ATTEMPT_ISSUE_CODES = frozenset(
    {
        "structure_placeholder_preservation",
        "format_anchor_preservation",
        "paragraph_structure_preservation",
        "citation_preservation",
        "number_preservation",
        "term_preservation",
        "language_stability",
        "factual_relation_preservation",
        FACTUAL_SCOPE_QUALIFIER_CHANGED,
        "repetition_stability",
        "length_stability",
        "sentence_surface_stability",
        "academic_register_stability",
        "academic_collocation_stability",
        "predicate_completeness",
        "machine_style_drift",
        "answer_style_rejected",
        "empty_output",
        "provider_auth",
        "provider_rate_limit",
        "provider_timeout",
        "provider_network",
        "provider_server",
        "provider_client_configuration",
        "provider_failure",
        "reasoning_content_suppressed",
        "validation_rejected_unspecified",
    }
)
FAILED_ATTEMPT_PUBLIC_FORBIDDEN_KEYS = frozenset(
    {
        "_text",
        "text",
        "inputtext",
        "outputtext",
        "candidatetext",
        "matchedtext",
        "excerpt",
        "preview",
        "prompt",
        "rawprompt",
        "prompttext",
        "promptinput",
        "error",
        "rawerror",
        "hardvalidationerror",
        "providermessage",
        "provider_message",
        "endpoint",
        "reasoning",
        "reasoning_content",
        "reasoning_details",
        "reasoning_summary",
        "reasoning_text",
        "thinking",
        "thinking_text",
        "analysis",
        "analysis_text",
        "chain_of_thought",
        "thought",
        "thoughts",
    }
)
CANDIDATE_PUBLIC_REASON_CODES = frozenset(
    {
        "hard_validation_failed",
        "factual_relation_guard_failed",
        "deterministic_lexical_retention_below_minimum",
        "academic_readability_delta_failed",
        "source_relative_style_delta_failed",
        "no_material_change",
        "no_safe_changed_generated_candidate",
        "no_same_dimension_converged_candidate",
        "same_dimension_converged",
        "style_regression_within_safety_tolerance",
        "same_dimension_gain_outweighed_by_cross_dimension_style_regression",
        "same_dimension_preserved",
        "combined_style_penalty_improved",
        "baseline_already_same_dimension_safe",
        "no_combined_style_gain",
        "hard_and_factual_guards_passed",
        "no_measurable_combined_style_gain",
        "same_dimension_not_effective",
        "all_model_candidates_failed_hard_validation",
        "baseline_preserved_but_round_failed",
        "baseline_preserved_but_rerun_failed",
        DOCUMENT_PATTERN_ACCUMULATION_BLOCKED,
        REPEATED_OPENING_FAMILY_INTRODUCED,
        REPEATED_SENTENCE_SKELETON_INTRODUCED,
        SENTENCE_BOUNDARY_COLLAPSE_INTRODUCED,
        SENTENCE_FRAGMENTATION_INTRODUCED,
        "source_pattern_profile_invalid",
    }
)
CANDIDATE_FACTUAL_ISSUE_CODES = frozenset(
    {
        "entity_order_changed",
        "number_order_changed",
        "entity_value_binding_missing_entity",
        "entity_value_binding_missing_number",
        "negation_scope_removed",
        FACTUAL_SCOPE_QUALIFIER_CHANGED,
    }
)
CANDIDATE_READABILITY_ISSUE_CODES = frozenset(
    {
        COLLOQUIAL_REGISTER_INTRODUCED,
        ACADEMIC_COLLOCATION_CONFLICT_INTRODUCED,
        PREDICATE_COMPLETENESS_REGRESSION,
        TELEGRAPHIC_CLAUSE_CHAIN_INTRODUCED,
        VAGUE_CAUSAL_REFERENCE_INTRODUCED,
    }
)
SOURCE_RELATIVE_BLOCKING_ISSUE_CODES = frozenset(
    {
        REPEATED_OPENING_FAMILY_INTRODUCED,
        REPEATED_SENTENCE_SKELETON_INTRODUCED,
        SENTENCE_BOUNDARY_COLLAPSE_INTRODUCED,
        SENTENCE_FRAGMENTATION_INTRODUCED,
        "source_pattern_profile_invalid",
    }
)
SOURCE_RELATIVE_ADVISORY_ISSUE_CODES = frozenset(
    {
        "opening_family_delta_observed",
        "sentence_skeleton_delta_observed",
        "document_opening_family_delta_observed",
        "document_sentence_skeleton_delta_observed",
    }
)
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
ENGLISH_SPACING_TOKEN_RE = re.compile(r"[A-Za-z0-9]+(?:[._+-][A-Za-z0-9]+)*")
ENGLISH_GLUE_LEFT_WORDS = frozenset(
    {
        "a", "an", "the", "as", "is", "are", "was", "were", "be", "been", "being",
        "in", "on", "at", "of", "to", "for", "with", "by", "from", "and", "or",
        "but", "then", "using", "employing",
    }
)
ENGLISH_GLUE_RIGHT_WORDS = frozenset(
    {
        "a", "an", "the", "as", "is", "are", "was", "were", "be", "been", "being",
        "in", "on", "at", "of", "to", "for", "with", "by", "from", "and", "or",
        "but", "then", "addition", "using", "employing",
    }
)
CONTENT_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9_-]*")
LEXICAL_RETENTION_UNIT_RE = re.compile(
    r"[\u3400-\u4DBF\u4E00-\u9FFF]|[A-Za-z0-9]+(?:[._%+/-][A-Za-z0-9]+)*"
)
CONTENT_STOPWORDS = frozenset(
    {
        "about", "above", "after", "again", "against", "along", "also", "among", "and",
        "another", "any", "are", "around", "because", "been", "being", "between", "both",
        "can", "could", "does", "doing", "each", "either", "from", "had", "has", "have",
        "having", "into", "main", "make", "makes", "making", "many", "may", "might",
        "more", "most", "much", "must", "one", "only", "other", "our", "out", "over",
        "same", "should", "such", "than", "that", "the", "their", "them", "then",
        "there", "these", "this", "those", "through", "thus", "under", "use", "used",
        "uses", "using", "was", "were", "while", "with", "within", "would",
    }
)
INTERNAL_REPETITION_SCORE_THRESHOLD = 0.72
ADJACENT_OVERLAP_SCORE_THRESHOLD = 0.50
ADJACENT_OVERLAP_WINDOW = 3
CJK_CHAR_RE = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF]")
ASCII_WORD_CHAR_RE = re.compile(r"[A-Za-z0-9]")
PARAGRAPH_BREAK_RE = re.compile(r"\n\s*\n")
LEADING_MARKUP_RE = re.compile(r"^[>\-\*\s#]+")
CJK_NUMBER_MARKER_CHARS = "\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u96f6"
# Keep one canonical parenthesized-marker grammar for both the leading-marker
# validator and model-facing structure-token protection.  The previous two
# grammars disagreed on full-width parentheses around Arabic digits: ``（1）``
# was neither recognized as a leading marker nor protected as one atomic token.
PARENTHESIZED_STRUCTURE_MARKER_PATTERN = (
    rf"(?:[\uff08(]\s*(?:[0-9]+|[{CJK_NUMBER_MARKER_CHARS}]+)\s*[\uff09)])"
)
LEADING_STRUCTURE_MARKER_PATTERN = (
    rf"(?:\u7b2c[{CJK_NUMBER_MARKER_CHARS}0-9]+[\u7ae0\u8282])"
    r"|(?:[0-9]+(?:\.[0-9]+){1,4})(?=\s)"
    r"|(?:[0-9]+[.．、])"
    rf"|(?:[{CJK_NUMBER_MARKER_CHARS}]+[.．、])"
    r"|(?:[0-9]+)(?=\s)"
    rf"|{PARENTHESIZED_STRUCTURE_MARKER_PATTERN}"
    r"|(?:[0-9]+[)\uff09])"
)
LEADING_STRUCTURE_RE = re.compile(rf"^(?P<marker>{LEADING_STRUCTURE_MARKER_PATTERN})\s*")
NUMERIC_CITATION_RE = re.compile(r"\[(?:\d+|\d+[-\u2013\u2014]\d+)(?:[,\uff0c;\uff1b]\s*(?:\d+|\d+[-\u2013\u2014]\d+))*\]")
_AUTHOR_TOKEN = r"(?:[\u4e00-\u9fff]{2,12}\s*(?:\u7b49)?(?:\u548c[\u4e00-\u9fff]{2,12})?|[A-Z][A-Za-z]+(?:\s+(?:&|and)\s+[A-Z][A-Za-z]+|\s+et\s+al\.)?)"
_AUTHOR_YEAR_SEGMENT = rf"(?:{_AUTHOR_TOKEN}\s*[,\uff0c]\s*\d{{4}}[a-z]?(?:\s*[,\uff0c]\s*\d{{4}}[a-z]?)*)"
AUTHOR_YEAR_CITATION_RE = re.compile(rf"[\uff08(]{_AUTHOR_YEAR_SEGMENT}(?:\s*[;\uff1b]\s*{_AUTHOR_YEAR_SEGMENT})*[\uff09)]")
UNIT_PATTERN = r"(?:%|\uff05|cm|mm|m|km|kg|g|mg|\u03bcg|ug|L|mL|ml|s|min|h|d|\u2103|\u00b0C|K|Pa|kPa|MPa|Hz|kHz|MHz|GHz|px|dpi)"
NUMERIC_WITH_UNIT_RE = re.compile(rf"(?<![\d.])\d+(?:\.\d+)?\s*{UNIT_PATTERN}(?![A-Za-z0-9.])")
NUMERIC_RANGE_WITH_UNIT_RE = re.compile(rf"(?<![\d.])\d+(?:\.\d+)?\s*(?:-|\u2013|\u2014|~|\uff5e|\u81f3)\s*\d+(?:\.\d+)?\s*{UNIT_PATTERN}(?![A-Za-z0-9.])")
NUMBER_TOKEN_RE = re.compile(r"(?<![A-Za-z0-9_.])\d+(?:[.,]\d+)*(?:\.\d+)?\s*(?:%|\uff05)?(?![A-Za-z0-9_.])")
INLINE_CODE_TOKEN_PATTERN = r"`[^`\n]+`"
LATEX_TOKEN_PATTERN = r"(?:\$\$[^$\n]+\$\$|\$[^$\n]+\$|\\\([^\n]+?\\\)|\\\[[^\n]+?\\\])"
URL_TOKEN_PATTERN = r"https?://[^\s`，,。；;）)\]】>\"']+"
DOI_TOKEN_PATTERN = r"(?<![A-Za-z0-9])10\.\d{4,9}/[-._;()/:A-Za-z0-9]+"
TECH_VERSION_TOKEN_RE = re.compile(
    r"(?<![A-Za-z0-9])(?:"
    r"(?:GPT|BERT|RoBERTa|YOLO|ResNet|VGG|LLaMA|Qwen|DeepSeek|CUDA|PyTorch|TensorFlow|Python|Node\.js|React|Vue|Vite|Flask|Django)\s*v?\d+(?:\.\d+)*[A-Za-z0-9._-]*"
    r"|(?:[A-Z][A-Za-z]*[A-Z][A-Za-z0-9]*(?:[-_][A-Za-z0-9.]+)+)"
    r"|(?:[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)"
    r"|(?:[A-Za-z]{2,}[.-]?\d+(?:\.\d+)*(?:[-_][A-Za-z0-9.]+)?)"
    r"|(?:(?:v|V)\d+(?:\.\d+){1,3})"
    r")(?![A-Za-z0-9])"
)
INLINE_STRUCTURE_TOKEN_RE = re.compile(
    INLINE_CODE_TOKEN_PATTERN
    + "|" + LATEX_TOKEN_PATTERN
    + "|" + URL_TOKEN_PATTERN
    + "|" + DOI_TOKEN_PATTERN
    + "|" + NUMERIC_CITATION_RE.pattern
    + "|" + AUTHOR_YEAR_CITATION_RE.pattern
    + r"|(?:[\u56fe\u8868]\s*\d+(?:[\.\-\u2013\u2014]\d+)*)"
    + r"|(?:\u5f0f\s*[\uff08(]?\s*\d+(?:[-\u2013\u2014]\d+)?\s*[\uff09)]?)"
    + r"|(?:\u516c\u5f0f\s*[\uff08(]?\s*\d+(?:[-\u2013\u2014]\d+)?\s*[\uff09)]?)"
    + "|" + NUMERIC_RANGE_WITH_UNIT_RE.pattern
    + "|" + NUMERIC_WITH_UNIT_RE.pattern
    + "|" + PARENTHESIZED_STRUCTURE_MARKER_PATTERN
    + "|" + NUMBER_TOKEN_RE.pattern
    + "|" + TECH_VERSION_TOKEN_RE.pattern
)
PLACEHOLDER_RE = re.compile(r"@@FYADR_[A-Z]+_\d{3}@@")
PLACEHOLDER_TYPE_RE = re.compile(r"@@FYADR_([A-Z]+)_\d{3}@@")
CN_SENTENCE_RE = re.compile(r"[^。！？；!?;]+[。！？；!?;]?")
MECHANICAL_CONNECTOR_RE = re.compile(build_mechanical_connector_pattern())
TEMPLATE_PHRASE_RE = re.compile(build_template_phrase_pattern())
EN_MECHANICAL_CONNECTOR_RE = re.compile(build_en_mechanical_connector_pattern(), re.I)
EN_TEMPLATE_PHRASE_RE = re.compile(build_en_template_phrase_pattern(), re.I)
STYLE_CARD_VERSION = 2
STYLE_CARD_TOP_LIMIT = 5
STYLE_VALIDATION_MIN_CHARS = 80
STYLE_VALIDATION_MAX_ISSUES = 6
CONNECTOR_DENSITY_RISK_THRESHOLD = 0.40
CONNECTOR_DENSITY_HIGH_RISK_THRESHOLD = 0.65
MECHANICAL_BURST_DENSITY_THRESHOLD = 0.45
MECHANICAL_BURST_CONNECTOR_FLOOR = 0.35
DIMENSION_DENSITY_MIN_IMPROVEMENT = 0.05
DIMENSION_DENSITY_MAX_REGRESSION = 0.02
HARD_MACHINE_STYLE_CODES = frozenset(
    {
        "academic_register_drift",
        "connector_density_increased",
        "template_density_increased",
        "template_phrase_drift",
        "generic_closing_added",
        "abstract_padding_increased",
    }
)
# High-precision colloquial forms that are inappropriate when a model newly
# introduces them into thesis prose. These rules are deliberately narrow:
# normal written-language expressions such as “实际工程中” and “应用范围扩大”
# are not matched. A source expression that is merely preserved is tolerated
# by the delta detector below.
ACADEMIC_REGISTER_DRIFT_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "跟着变化",
        re.compile(r"(?:也|就|会)?跟着(?:增强|提高|上升|下降|降低|增大|减小|变化|改变|变强|变弱)"),
    ),
    ("用得越来越广", re.compile(r"(?:被)?用得越来越广")),
    ("说白了", re.compile(r"说白了")),
    (
        "挺……",
        re.compile(r"挺(?:好|多|大|高|低|快|慢|强|弱|方便|容易|难|重要|明显|不错|合适|有效|清楚|常见|麻烦|复杂|简单)(?:的|了)?"),
    ),
    ("搞……", re.compile(r"搞(?:清楚|明白|懂|定|好|出来|一下|一搞|研究|开发|分析|设计)")),
    ("随便……", re.compile(r"随便(?:选|选择|使用|设置|调整|修改|处理|采用|看看|写|填|换|改)")),
    ("咱们", re.compile(r"咱们")),
)
CODE_LIKE_TERM_RE = re.compile(
    r"(?<![A-Za-z0-9_])(?:"
    r"[A-Za-z_][A-Za-z0-9_]*(?:[./:_-][A-Za-z0-9_]+)+"
    r"|[A-Z][A-Za-z0-9_]*[a-z][A-Za-z0-9_]*[A-Z][A-Za-z0-9_]*"
    r"|[A-Z]{2,}[A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*"
    r"|Django|RESTful|API|JWT|ORM|S3|RGW|Ceph|MySQL|Vue|React|Flask|Python|Boto3|Vite|DOCX|PDF|AI|AIGC|GPT|GPTZero|Google|DeepSeek|Qwen|LLM|CSS|HTML|JSON|HTTP|REST|URL|OpenAI|LangChain"
    r")(?![A-Za-z0-9_])"
)
INTRODUCED_TEMPLATE_PHRASE_RE = re.compile(build_introduced_template_phrase_pattern())
GENERIC_CLOSING_RE = re.compile(build_generic_closing_pattern(), re.IGNORECASE)
AI_BURST_CONNECTOR_RE = re.compile(build_ai_burst_connector_pattern())
AI_ABSTRACT_PADDING_RE = re.compile(build_ai_abstract_padding_pattern())
# Passive density is a readability advisory only.  Passive voice is legitimate
# academic syntax; the signal is surfaced only when several sentences rely on
# the same construction and is never a factual hard gate.
PASSIVE_VOICE_RE = re.compile(build_passive_voice_pattern())
# A small set of content-light idioms/formulas is counted as a register
# advisory.  Factual result phrases such as “显著提高” are intentionally absent.
CHENGYU_RE = re.compile(build_chengyu_pattern())
# Nested (1)(2)(3)/（1）（2）（3） markers and X：A；B；C colon-semicolon parallel
# templates are common LLM list scaffolds.  Counts stay advisory; legitimate
# academic enumerations already present in the source are preserved by prompts
# and by delta-based validation (we only flag *introduced* density).
NESTED_NUMBER_MARKER_RE = re.compile(build_nested_number_marker_pattern())
COLON_PARALLEL_RE = re.compile(build_colon_parallel_pattern())
# Coarse, parser-free surface-structure distribution.  It can reveal repeated
# frames in a long passage, but it cannot infer authorship or writing quality.
# The result therefore remains advisory and must never force passive voice,
# subordinate clauses, or stacked modifiers into otherwise clear prose.
STRUCT_PASSIVE_MARKER_RE = re.compile(
    r"(?:^|[。！？!?；;])\s*(?:[^。！？!?；;]{0,8}?(?:被|予以|加以|为[^。！？!?；;]{0,12}?所|受到|得以))"
)
# 从句/状语前置: sentence opens with a subordinate/adverbial lead-in.
STRUCT_SUBORD_LEAD_RE = re.compile(
    r"^(?:若|如果|假如|倘若|虽然|尽管|即使|由于|因为|鉴于|当[^。！？!?；;]{0,12}?时|通过[^。！？!?；;]{1,20}?(?:，|,|。|；|;)|"
    r"在[^。！？!?；;]{1,20}?(?:上|中|下|方面|过程|情况|前|后)，|基于|随着|相对于|为了|一旦|只要|只有|除非|既然|以便)"
    r"|^[一-鿿]{2,8}(?:里|中|上|下|内|外|时|后|前|过程|情况)[:,，][一-鿿]"
)
# 长前置定语: a 的-chain of length >=3 before the head (lots of stacked modifiers).
STRUCT_LONG_PREMODIFIER_RE = re.compile(
    r"(?:[一-鿿]{2,8}的){3,}[一-鿿]{2,}"
)
# 枚举/并列: sentence carries an enumerative connector mid-sentence.
STRUCT_ENUMERATIVE_RE = re.compile(
    r"(?:一方面|另一方面|首先|其次|再次|最后|此外|另外|同时|以及|并且|一是|二是|三是|其一|其二|其三)"
)
SENTENCE_TERMINAL_RE = re.compile(r"[。！？!?；;.][\"'”’）)\]】》]*$")
WEAK_TRAILING_PUNCT_RE = re.compile(r"[，,、：:（(【\[][\"'”’）)\]】》]*$")
REPEATED_PUNCT_RE = re.compile(r"([，,。！？!?；;：:、])\1+")
MIXED_BAD_PUNCT_RE = re.compile(r"(?:[，,][。.!?]|[。.!?][，,])")
CN_TRAILING_FRAGMENT_RE = re.compile(
    r"(?:的|和|与|及|以及|并|但|而|或|在|对|把|被|将|为|以|从|向|通过|由于|因为|因此|同时|其中|例如|包括|并且|从而|为了)$"
)
EN_TRAILING_FRAGMENT_RE = re.compile(
    r"\b(?:and|or|the|a|an|of|to|with|by|from|as|is|are|was|were|that|which|while|because|therefore|including|using|employing|in|on|at|for)$",
    re.IGNORECASE,
)
ANSWER_WRAPPER_RE = re.compile(
    r"^(?:以下|下面|当然|好的|已根据|根据你的要求|here\s+(?:is|are)|the\s+rewritten|rewritten\s+text|revised\s+text).{0,80}[:：]",
    re.IGNORECASE,
)
NON_PROSE_HEADING_RE = re.compile(
    r"^(?:"
    r"摘\s*要|目录|参考文献|致\s*谢|Abstract|References|Acknowledg(?:e)?ments?"
    r"|关键词\s*[:：]?.*|Key\s+words?\s*[:：]?.*"
    r"|第[一二三四五六七八九十百零0-9]+[章节]\s*.*"
    r"|\d+(?:\.\d+){0,4}\s+[^\n。！？!?]{1,72}"
    r"|(?:\d+|[一二三四五六七八九十]+)[.．、]\s*[^\n：:。！？；!?;]{1,60}"
    r")$",
    re.IGNORECASE,
)
REFERENCE_ENTRY_RE = re.compile(
    r"^(?:\[\d+\]|[［【]\d+[］】])\s*\S.{5,}",
    re.IGNORECASE,
)
BALANCED_SURFACE_PAIRS = (
    ("（", "）"),
    ("(", ")"),
    ("【", "】"),
    ("[", "]"),
    ("《", "》"),
    ("“", "”"),
    ("‘", "’"),
)
class ProtectedText(NamedTuple):
    text: str
    tokens: dict[str, str]
    token_types: dict[str, str]


class ChunkRewriteResult(NamedTuple):
    index: int
    chunk_id: str
    output_text: str
    validation_events: list[dict[str, object]]
    progress_events: list[dict[str, object]]


def _serialize_exception_details(exc: BaseException) -> dict[str, object]:
    return safe_exception_details(exc)


def _clamp_round_concurrency(value: object) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        normalized = DEFAULT_ROUND_CONCURRENCY
    return max(1, min(MAX_ROUND_CONCURRENCY, normalized))


SHARED_OUTPUT_CONTRACT = """
[OUTPUT CONTRACT]
- Only return the rewritten body text for the current input chunk.
- Preserve the original meaning, facts, claims, conclusions, numbering, and paragraph role.
- Preserve every placeholder token like @@FYADR_REF_001@@ exactly once and in its original order; do not translate, delete, duplicate, split, or rename it.
- Do not add, remove, or replace viewpoints or conclusions.
- Do not output explanations, suggestions, options, comments, invitations, or summaries.
- Do not output phrases like: 修改后：, 改写后：, 可以改成, 如果你愿意, 说明：, 原因很简单, 我也可以继续帮你.
- Do not turn the text into chat, Q&A, title suggestions, bullet recommendations, or markdown formatting unless the input already contains it.
- Prefer concrete, source-grounded wording over stock academic formulas.
- Adjust repeated sentence openings only when it improves readability; do not optimise a sentence-length score or invent short fragments.
- Keep conditional/causal pairs, correlative constructions, item-value lists, and citations attached to the clauses they qualify.
- Avoid newly introducing generic closings or content-free padding such as 综上所述 / 具有重要意义 / 在……背景下 / 随着……的发展, unless the source already uses them.
- Keep total length close to the source; do not pad with empty elaboration.
- Invalid output is rejected. There is no silent source fallback for failed validation.
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
    if FACTUAL_SCOPE_QUALIFIER_CHANGED in error or "scope qualifier" in error:
        steps.append(
            "- Restore the source scope exactly: do not add, remove, move, or strengthen only/all/any/necessarily qualifiers."
        )
    if "number" in error or "numeric" in error:
        steps.append("- Preserve all numbers, ranges, percentages, metric names, and nearby labels exactly.")
    if "required term" in error or "term" in error:
        steps.append("- Preserve all required technical terms, file names, model names, and identifiers exactly.")
    if "paragraph count" in error or "paragraph breaks" in error:
        steps.append("- Keep the same paragraph count and do not merge or split natural paragraphs.")
    if "citation" in error:
        steps.append("- Keep citation markers in the same sentence-level position as the source.")
    if "placeholder" in error:
        steps.append("- Copy every @@FYADR_*@@ placeholder exactly once and in the same left-to-right order as the input.")
    if "language" in error or "english" in error:
        steps.append("- Keep the output language identical to the input language; English input must remain English.")
    if "spacing" in error:
        steps.append("- Preserve normal English spaces between adjacent words, terms, numbers, and punctuation.")
    if "repeated content" in error:
        steps.append("- Do not repeat the same claim, role description, or system function twice inside the output.")
    if "markdown" in error or "answer-style" in error:
        steps.append("- Output body text only; do not add headings, bullets, explanations, markdown, or labels.")
    if "machine-like writing style" in error or "connector" in error or "template" in error or "sentence rhythm" in error:
        steps.extend(
            [
                "- Reduce newly introduced stock phrases and repeated transitions; keep concrete wording tied to the source paragraph.",
                "- Repair repeated sentence frames only at complete semantic boundaries; do not add short fragments or chase a length ratio.",
                "- Do not end with a generic summary sentence unless the source already does so.",
            ]
        )
    if "academic_register_drift" in error or "colloquial" in error:
        steps.append(
            "- Replace newly introduced conversational wording with precise academic written language; "
            "do not copy phrases such as 跟着增强、用得越来越广、说白了、挺、搞、随便 or 咱们."
        )
    if "expanded abnormally" in error:
        steps.append("- Shorten the rewrite and remove newly added background or commentary.")
    if "shrank abnormally" in error:
        steps.append("- Restore missing conditions, causes, examples, and conclusion details from the source.")
    return "\n".join(dict.fromkeys(steps))


def should_freeze_chunk(prompt_profile: str, chunk_text: str) -> bool:
    """Keep structural metadata out of the prose rewrite path.

    A title, section number, keyword line, or bibliography entry has no useful
    sentence-level style to rewrite.  Sending it through a long prose prompt
    tends to expand short labels, alter table-of-contents text, or damage a
    reference.  Full English and Chinese prose is still rewritten normally;
    this is a narrow role/format guard rather than a language shortcut.
    """

    compact = re.sub(r"[ \t]+", " ", str(chunk_text or "").strip())
    if not compact or "\n\n" in compact:
        return False
    if len(compact) <= 4:
        return True
    if len(compact) <= 96 and NON_PROSE_HEADING_RE.fullmatch(compact):
        return True
    if len(compact) <= 600 and REFERENCE_ENTRY_RE.match(compact):
        return True
    return False


def _estimate_api_calls(manifest: ChunkManifest) -> dict[str, int]:
    return {
        "estimatedApiCalls": manifest.chunk_count,
        "estimatedMaxApiCalls": manifest.chunk_count * MAX_VALIDATION_ATTEMPTS,
        "maxApiCallsPerEditableChunk": MAX_VALIDATION_ATTEMPTS,
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


def _classify_sentence_structure(sentence: str) -> str:
    """Classify one sentence into a structure type (first-match wins, parser-free).

    Returns one of: passive / subordinate_lead / long_premodifier / enumerative /
    plain_active.  Priority only resolves overlapping surface markers; it does
    not rank one structure as more human or intrinsically better than another.
    """
    s = sentence.strip()
    if not s:
        return "plain_active"
    if STRUCT_PASSIVE_MARKER_RE.search("。" + s if not s.startswith(("被", "予", "加", "为", "受", "得")) else s):
        return "passive"
    if STRUCT_SUBORD_LEAD_RE.match(s):
        return "subordinate_lead"
    if STRUCT_LONG_PREMODIFIER_RE.search(s):
        return "long_premodifier"
    if STRUCT_ENUMERATIVE_RE.search(s):
        return "enumerative"
    return "plain_active"


def _structure_type_distribution(text: str) -> dict[str, object]:
    """Return a coarse surface-type distribution and top-type concentration.

    This is useful for finding long runs of the same visible frame, not for
    inferring authorship.  Few sentences (<3) return zero concentration because
    the sample is too small to interpret.
    """
    sentences = _split_sentences_for_quality(text)
    counts: dict[str, int] = {
        "passive": 0, "subordinate_lead": 0, "long_premodifier": 0,
        "enumerative": 0, "plain_active": 0,
    }
    for sentence in sentences:
        counts[_classify_sentence_structure(sentence)] += 1
    total = sum(counts.values())
    if total < 3:
        return {
            "structureTypeCounts": counts,
            "structureTypeTotal": total,
            "dominantStructureType": "",
            "structureConcentration": 0.0,
        }
    dominant = max(counts, key=lambda k: counts[k])
    concentration = round(counts[dominant] / total, 4)
    return {
        "structureTypeCounts": counts,
        "structureTypeTotal": total,
        "dominantStructureType": dominant,
        "structureConcentration": concentration,
    }


def _style_risk_metrics(text: str) -> dict[str, object]:
    language = detect_chunk_language(text)
    connector_pattern, template_pattern = _style_patterns_for_language(language)
    connector_count = len(connector_pattern.findall(text))
    template_count = len(template_pattern.findall(text))
    closing_count = len(GENERIC_CLOSING_RE.findall(text))
    burst_connector_count = len(AI_BURST_CONNECTOR_RE.findall(text)) if language != "en" else 0
    abstract_padding_count = len(AI_ABSTRACT_PADDING_RE.findall(text)) if language != "en" else 0
    passive_count = len(PASSIVE_VOICE_RE.findall(text)) if language != "en" else 0
    chengyu_count = len(CHENGYU_RE.findall(text)) if language != "en" else 0
    nested_number_count = len(NESTED_NUMBER_MARKER_RE.findall(text)) if language != "en" else 0
    colon_parallel_count = len(COLON_PARALLEL_RE.findall(text)) if language != "en" else 0
    structure_dist = _structure_type_distribution(text) if language != "en" else {
        "structureTypeCounts": {}, "structureTypeTotal": 0,
        "dominantStructureType": "", "structureConcentration": 0.0,
    }
    opening_profile = _sentence_opening_profile(text)
    sentence_stats = _sentence_length_stats(text)
    paragraph_stats = _paragraph_length_stats(text)
    sentence_count = int(sentence_stats.get("count", 0) or 0)
    char_count = len(re.sub(r"\s+", "", text)) if language != "en" else max(len(text), 1)
    return {
        "language": language,
        "sentenceCount": sentence_count,
        "sentenceStats": sentence_stats,
        "paragraphStats": paragraph_stats,
        "paragraphCount": paragraph_stats.get("count", 0),
        "paragraphLengthCv": paragraph_stats.get("variationCoefficient", 0.0),
        "adjacentParagraphUniformity": paragraph_stats.get("adjacentParagraphUniformity", 0.0),
        "connectorCount": connector_count,
        "templateCount": template_count,
        "closingCount": closing_count,
        "burstConnectorCount": burst_connector_count,
        "abstractPaddingCount": abstract_padding_count,
        "passiveVoiceCount": passive_count,
        "chengyuCount": chengyu_count,
        "nestedNumberCount": nested_number_count,
        "colonParallelCount": colon_parallel_count,
        "structureTypeCounts": structure_dist["structureTypeCounts"],
        "structureTypeTotal": structure_dist["structureTypeTotal"],
        "dominantStructureType": structure_dist["dominantStructureType"],
        "structureConcentration": structure_dist["structureConcentration"],
        "connectorDensity": round(connector_count / max(sentence_count, 1), 4),
        "templateDensity": round(template_count / max(sentence_count, 1), 4),
        "burstConnectorDensity": round(burst_connector_count / max(sentence_count, 1), 4),
        "abstractPaddingDensity": round(abstract_padding_count / max(sentence_count, 1), 4),
        "passiveDensity": round(passive_count / max(sentence_count, 1), 4),
        "chengyuDensity": round(chengyu_count / max(sentence_count, 1), 4),
        # Nested-number density is markers per sentence; colon-parallel density is
        # matched templates per sentence.  Both are style-risk fingerprints only.
        "nestedNumberDensity": round(nested_number_count / max(sentence_count, 1), 4),
        "colonParallelDensity": round(colon_parallel_count / max(sentence_count, 1), 4),
        # Robust sentence-length spread.  The old max/min ratio could be
        # "improved" from ~1 to >6 simply by prepending one meaningless
        # two-character sentence.  P90/P10 keeps the public field compatible
        # while preventing a single outlier from dominating the score.
        "burstinessRatio": round(
            float(sentence_stats.get("p90", 0)) / max(float(sentence_stats.get("p10", 0)), 1), 2
        ) if sentence_count else 0.0,
        "rawBurstinessRatio": round(
            float(sentence_stats.get("max", 0)) / max(float(sentence_stats.get("min", 0)), 1), 2
        ) if sentence_count else 0.0,
        "sentenceLengthVariation": sentence_stats.get("variationCoefficient", 0.0),
        "shortSentenceCount": sentence_stats.get("shortSentenceCount", 0),
        "shortSentenceRate": sentence_stats.get("shortSentenceRate", 0.0),
        "repeatedSentenceOpening": opening_profile.get("repeatedSentenceOpening", ""),
        "repeatedSentenceOpeningCount": opening_profile.get("repeatedSentenceOpeningCount", 0),
        "sentenceOpeningConcentration": opening_profile.get("sentenceOpeningConcentration", 0.0),
        "charCount": char_count,
    }


def _find_introduced_colloquial_phrases(input_text: str, output_text: str) -> tuple[int, list[str]]:
    """Find only colloquial occurrences added by the rewrite.

    Counts are compared per rule instead of per exact surface spelling. Thus a
    source phrase such as “跟着增强” may be preserved as “也跟着增强” without a
    false positive, while a source with no such expression cannot acquire one
    silently.
    """

    introduced_count = 0
    introduced_phrases: list[str] = []
    for _label, pattern in ACADEMIC_REGISTER_DRIFT_RULES:
        input_matches = list(pattern.finditer(input_text))
        output_matches = list(pattern.finditer(output_text))
        delta = len(output_matches) - len(input_matches)
        if delta <= 0:
            continue
        introduced_count += delta
        introduced_phrases.extend(match.group(0) for match in output_matches[-delta:])
    return introduced_count, list(dict.fromkeys(introduced_phrases))


def _collect_machine_style_validation_issues(input_text: str, output_text: str) -> list[dict[str, object]]:
    issues: list[dict[str, object]] = []
    introduced_colloquial_count, introduced_colloquial_phrases = _find_introduced_colloquial_phrases(
        input_text,
        output_text,
    )
    if introduced_colloquial_count:
        issues.append(
            {
                "code": "academic_register_drift",
                "level": "high",
                "message": "改写新引入口语化表达，不符合学术书面语要求。",
                "evidence": {
                    "introducedColloquialPhraseCount": introduced_colloquial_count,
                    "introducedColloquialPhrases": introduced_colloquial_phrases[:5],
                },
            }
        )

    # Register drift is precise enough to protect short thesis chunks. The
    # density heuristics below retain their minimum-length requirement.
    if max(len(input_text.strip()), len(output_text.strip())) < STYLE_VALIDATION_MIN_CHARS:
        return issues[:STYLE_VALIDATION_MAX_ISSUES]

    input_metrics = _style_risk_metrics(input_text)
    output_metrics = _style_risk_metrics(output_text)
    output_sentence_count = int(output_metrics.get("sentenceCount", 0) or 0)
    if output_sentence_count <= 0:
        return issues[:STYLE_VALIDATION_MAX_ISSUES]

    input_connector_count = int(input_metrics.get("connectorCount", 0) or 0)
    output_connector_count = int(output_metrics.get("connectorCount", 0) or 0)
    input_template_count = int(input_metrics.get("templateCount", 0) or 0)
    output_template_count = int(output_metrics.get("templateCount", 0) or 0)
    input_closing_count = int(input_metrics.get("closingCount", 0) or 0)
    output_closing_count = int(output_metrics.get("closingCount", 0) or 0)
    input_padding_count = int(input_metrics.get("abstractPaddingCount", 0) or 0)
    output_padding_count = int(output_metrics.get("abstractPaddingCount", 0) or 0)
    output_connector_density = float(output_metrics.get("connectorDensity", 0) or 0)
    output_template_density = float(output_metrics.get("templateDensity", 0) or 0)
    input_burst_density = float(input_metrics.get("burstConnectorDensity", 0) or 0)
    output_burst_density = float(output_metrics.get("burstConnectorDensity", 0) or 0)
    output_padding_density = float(output_metrics.get("abstractPaddingDensity", 0) or 0)

    if output_sentence_count >= 3 and output_connector_count >= input_connector_count + 2 and output_connector_density >= 0.45:
        issues.append(
            {
                "code": "connector_density_increased",
                "level": "high" if output_connector_density >= 0.7 else "medium",
                "message": "Output introduced a high density of mechanical transitions.",
                "evidence": {
                    "inputConnectorCount": input_connector_count,
                    "outputConnectorCount": output_connector_count,
                    "outputConnectorDensity": output_connector_density,
                },
            }
        )

    introduced_templates = _find_introduced_template_phrases(input_text, output_text)
    # Broad technical constructions are useful for diagnostics but are not a
    # reliable hard signal.  Only a *curated, newly introduced* boilerplate
    # phrase may trigger style drift; e.g. "通过缓存实现状态同步" is a
    # perfectly concrete technical sentence and must not be rejected merely
    # because it matches a productive syntactic frame.
    if introduced_templates and output_template_count >= input_template_count + 1 and output_template_density >= 0.14:
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
    elif len(introduced_templates) >= 1 and output_template_density >= 0.1:
        issues.append(
            {
                "code": "template_phrase_drift",
                "level": "high" if len(introduced_templates) >= 2 else "medium",
                "message": "Output added detector-friendly template phrases.",
                "evidence": introduced_templates[:5],
            }
        )

    input_variance = float((input_metrics.get("sentenceStats") or {}).get("variance", 0) or 0)
    output_variance = float((output_metrics.get("sentenceStats") or {}).get("variance", 0) or 0)
    # Only flag relative regularization: identical or already-regular source text must pass.
    if (
        output_sentence_count >= 4
        and output_variance < 28
        and input_variance > 0
        and output_variance < max(12.0, input_variance * 0.55)
        and (input_variance - output_variance) >= 8.0
    ):
        issues.append(
            {
                "code": "sentence_rhythm_over_regularized",
                "level": "high" if output_variance < 18 else "medium",
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
                "level": "high",
                "message": "Output added a generic summary closing phrase.",
                "evidence": {
                    "inputClosingCount": input_closing_count,
                    "outputClosingCount": output_closing_count,
                },
            }
        )

    if (
        output_sentence_count >= 3
        and output_padding_count >= input_padding_count + 2
        and output_padding_density >= 0.25
    ):
        issues.append(
            {
                "code": "abstract_padding_increased",
                "level": "high",
                "message": "Output added empty abstract padding phrases that inflate AI-like academic tone.",
                "evidence": {
                    "inputPaddingCount": input_padding_count,
                    "outputPaddingCount": output_padding_count,
                    "outputPaddingDensity": output_padding_density,
                },
            }
        )

    if (
        output_sentence_count >= 4
        and output_burst_density >= 0.5
        and output_connector_density >= 0.4
        and output_burst_density >= input_burst_density + 0.15
    ):
        issues.append(
            {
                "code": "mechanical_burst_pattern",
                "level": "medium",
                "message": "Output follows a mechanical transition burst pattern.",
                "evidence": {
                    "inputBurstConnectorDensity": input_burst_density,
                    "outputBurstConnectorDensity": output_burst_density,
                    "outputConnectorDensity": output_connector_density,
                },
            }
        )

    # Nested numbered lists and colon-semicolon parallel templates are advisory
    # only.  Flag when the rewrite *introduces* denser scaffolds than the source
    # already had (preserve legitimate academic enumerations that pre-exist).
    input_nested_count = int(input_metrics.get("nestedNumberCount", 0) or 0)
    output_nested_count = int(output_metrics.get("nestedNumberCount", 0) or 0)
    input_colon_count = int(input_metrics.get("colonParallelCount", 0) or 0)
    output_colon_count = int(output_metrics.get("colonParallelCount", 0) or 0)
    output_nested_density = float(output_metrics.get("nestedNumberDensity", 0) or 0)
    output_colon_density = float(output_metrics.get("colonParallelDensity", 0) or 0)
    if (
        output_sentence_count >= 2
        and output_nested_count >= input_nested_count + 3
        and output_nested_density >= 0.45
    ):
        issues.append(
            {
                "code": "nested_number_scaffold_introduced",
                "level": "medium",
                "message": "Output introduced nested numbered-list markers such as (1)(2)(3).",
                "evidence": {
                    "inputNestedNumberCount": input_nested_count,
                    "outputNestedNumberCount": output_nested_count,
                    "outputNestedNumberDensity": output_nested_density,
                },
            }
        )
    if (
        output_sentence_count >= 1
        and output_colon_count >= input_colon_count + 1
        and (output_colon_density >= 0.15 or output_colon_count >= input_colon_count + 1)
    ):
        issues.append(
            {
                "code": "colon_parallel_scaffold_introduced",
                "level": "medium",
                "message": "Output introduced colon-semicolon parallel list templates (X：A；B；C).",
                "evidence": {
                    "inputColonParallelCount": input_colon_count,
                    "outputColonParallelCount": output_colon_count,
                    "outputColonParallelDensity": output_colon_density,
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


def _sentence_opening_profile(text: str) -> dict[str, object]:
    """Summarize repeated sentence openings without parsing full syntax."""

    counts: dict[str, int] = {}
    for sentence in _split_sentences_for_quality(text):
        compact = re.sub(r"^[\s，,;；:：]+", "", sentence.strip())
        compact = re.sub(
            r"^(?:首先|其次|再次|最后|此外|因此|然而|同时|另外)[，,]?",
            "",
            compact,
        ).strip()
        cjk = "".join(CJK_CHAR_RE.findall(compact))
        if cjk:
            signature = cjk[:3]
        else:
            words = LATIN_WORD_RE.findall(compact.lower())
            signature = " ".join(words[:2])
        if len(signature) < 2:
            continue
        counts[signature] = counts.get(signature, 0) + 1
    total = sum(counts.values())
    repeated_count = max(counts.values(), default=0)
    repeated_opening = max(counts, key=counts.get) if counts else ""
    return {
        "sentenceOpeningCounts": counts,
        "sentenceOpeningTotal": total,
        "repeatedSentenceOpening": repeated_opening if repeated_count >= 2 else "",
        "repeatedSentenceOpeningCount": repeated_count if repeated_count >= 2 else 0,
        "sentenceOpeningConcentration": round(repeated_count / total, 4) if total >= 4 else 0.0,
    }


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
    if sentence_count >= 20 and float(sentence_stats.get("variationCoefficient", 0) or 0) < 0.16:
        risk_codes.append("global_uniform_sentence_rhythm")
    if sum(connector_counts.values()) / max(sentence_count, 1) >= 0.45:
        risk_codes.append("global_connector_density")
    if sum(template_counts.values()) >= 4:
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
        # This profile is a frozen, text-free baseline consumed by the release
        # selector, not merely a model-facing style hint.  It contains only
        # enumerated opening families, sentence-skeleton hashes, and counts.
        "documentPatternBaseline": build_source_pattern_profile(chunks),
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

    local_items = [
        *[
            item for item, count in local_connectors.items()
            if count >= 2 or item in global_connectors
        ],
        *[
            item for item, count in local_templates.items()
            if count >= 2 or item in global_templates
        ],
    ]
    has_global_risk = bool(global_style_profile.get("riskCodes"))
    if not has_global_risk and not local_items and not active_opening:
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


def _score_rewrite_output(input_text: str, output_text: str) -> float:
    input_len = max(len(input_text.strip()), 1)
    output_len = max(len(output_text.strip()), 1)
    expansion_ratio = output_len / input_len
    expansion_penalty = abs(expansion_ratio - 1.0) * 3.0
    risks = _assess_machine_like_risks(output_text)
    risk_penalty = sum(2.0 if risk.get("level") == "high" else 1.0 for risk in risks)
    sentence_stats = _sentence_length_stats(output_text)
    rhythm_penalty = (
        0.6
        if int(sentence_stats.get("count", 0) or 0) >= 6
        and float(sentence_stats.get("variationCoefficient", 0) or 0) < 0.13
        else 0
    )
    output_style_metrics = _style_risk_metrics(output_text)
    connector_penalty = int(output_style_metrics.get("connectorCount", 0) or 0) * 0.18
    template_penalty = int(output_style_metrics.get("templateCount", 0) or 0) * 0.35
    style_validation_penalty = sum(
        2.2 if str(issue.get("level", "")).lower() == "high" else 1.1
        for issue in _collect_machine_style_validation_issues(input_text, output_text)
    )
    return expansion_penalty + risk_penalty + rhythm_penalty + connector_penalty + template_penalty + style_validation_penalty


def _count_lexical_retention_units(text: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for raw_unit in LEXICAL_RETENTION_UNIT_RE.findall(str(text or "")):
        unit = raw_unit.lower() if raw_unit.isascii() else raw_unit
        counts[unit] = counts.get(unit, 0) + 1
    return counts


def _deterministic_lexical_retention_proxy(input_text: str, output_text: str) -> dict[str, object]:
    """Return a provider-free lexical-retention proxy.

    This deliberately is *not* a semantic-equivalence score, embedding score,
    model judgement, or AI-detector result.  It measures retained lexical/CJK
    units plus length stability so that a hard-valid but aggressively changed
    candidate cannot win solely on a style metric.  Hard factual/format guards
    remain authoritative.
    """

    source = str(input_text or "").strip()
    output = str(output_text or "").strip()
    source_counts = _count_lexical_retention_units(source)
    output_counts = _count_lexical_retention_units(output)
    source_total = sum(source_counts.values())
    output_total = sum(output_counts.values())
    overlap_total = sum(
        min(source_count, output_counts.get(unit, 0))
        for unit, source_count in source_counts.items()
    )
    source_coverage = overlap_total / max(source_total, 1)
    output_precision = overlap_total / max(output_total, 1)
    length_similarity = min(len(source), len(output)) / max(len(source), len(output), 1)
    if source == output:
        score = 1.0
    else:
        score = (source_coverage * 0.55) + (output_precision * 0.20) + (length_similarity * 0.25)
    return {
        "name": "deterministic-lexical-retention-proxy",
        "score": round(max(0.0, min(score, 1.0)), 4),
        "minimumScore": LEXICAL_RETENTION_MIN_SCORE,
        "sourceCoverage": round(source_coverage, 4),
        "outputPrecision": round(output_precision, 4),
        "lengthSimilarity": round(length_similarity, 4),
        "usesEmbedding": False,
        "usesModel": False,
        "claimsSemanticEquivalence": False,
        "isAiDetector": False,
        "claimsDetectionRate": False,
    }


def _candidate_dimension_is_active(round_dimension: dict[str, object] | None) -> bool:
    if not round_dimension:
        return False
    dimension_id = str(round_dimension.get("id", "neutral") or "neutral")
    primary_metric = str(round_dimension.get("primaryMetric", "") or "")
    return bool(primary_metric and dimension_id not in {"neutral", "structure_warmup"})


def _evaluate_rewrite_candidate(
    *,
    input_text: str,
    output_text: str,
    candidate_id: str,
    origin: str,
    attempt: int,
    hard_valid: bool,
    hard_validation_error: str = "",
    round_dimension: dict[str, object] | None = None,
    global_style_profile: dict[str, object] | None = None,
) -> dict[str, object]:
    normalized_output = str(output_text or "").strip()
    retention = _deterministic_lexical_retention_proxy(input_text, normalized_output)
    academic_readability_delta = assess_academic_readability_delta(
        str(input_text or ""),
        normalized_output,
    )
    source_pattern_profile: dict[str, object] | None
    if global_style_profile is None:
        # Explicit caller choice: no document context is available, so the
        # evidence must disclose a strict local fallback.
        source_pattern_profile = None
    elif isinstance(global_style_profile, dict) and isinstance(
        global_style_profile.get("documentPatternBaseline"), dict
    ):
        source_pattern_profile = global_style_profile["documentPatternBaseline"]
    else:
        # A caller claimed document context but omitted/corrupted its required
        # pattern baseline.  Pass an invalid supplied profile so the assessor
        # fails closed instead of silently relabelling it as local.
        source_pattern_profile = {}
    source_relative_style_delta = assess_source_relative_style_delta(
        str(input_text or ""),
        normalized_output,
        source_pattern_profile=source_pattern_profile,
    )
    source_relative_style_guard_passed = source_relative_style_delta_passed(source_relative_style_delta)
    readability_guard_passed = academic_readability_delta.get("ok") is True
    readability_issue_codes = list(
        dict.fromkeys(
            str(code)
            for code in academic_readability_delta.get("issueCodes", [])
            if str(code or "").strip()
        )
    )
    factual_issues = collect_factual_relation_issues(input_text, normalized_output) if normalized_output else []
    factual_issue_codes = list(
        dict.fromkeys(str(issue.get("code", "") or "") for issue in factual_issues if issue.get("code"))
    )
    retention_score = float(retention.get("score", 0.0) or 0.0)
    safety_reasons: list[str] = []
    if not hard_valid:
        safety_reasons.append("hard_validation_failed")
    if factual_issue_codes:
        safety_reasons.append("factual_relation_guard_failed")
    if retention_score < LEXICAL_RETENTION_MIN_SCORE:
        safety_reasons.append("deterministic_lexical_retention_below_minimum")
    if not readability_guard_passed:
        safety_reasons.append("academic_readability_delta_failed")
    if not source_relative_style_guard_passed:
        safety_reasons.append("source_relative_style_delta_failed")
    changed = normalized_output != str(input_text or "").strip()
    if origin != "baseline" and not changed:
        safety_reasons.append("no_material_change")

    hard_validation_issue_codes: list[str] = []
    if not hard_valid and normalized_output:
        hard_validation_issue_codes = list(
            dict.fromkeys(
                str(issue.get("code", "") or "")
                for issue in _collect_machine_style_validation_issues(input_text, normalized_output)
                if str(issue.get("code", "") or "") in HARD_MACHINE_STYLE_CODES
                and str(issue.get("level", "")).lower() == "high"
            )
        )

    if hard_valid and normalized_output:
        dimension_direction = _assess_dimension_direction(input_text, normalized_output, round_dimension)
        style_penalty: float | None = round(_score_rewrite_output(input_text, normalized_output), 4)
    else:
        dimension_direction = {
            "dimensionId": str((round_dimension or {}).get("id", "neutral") or "neutral"),
            "direction": "not_evaluated",
            "ok": False,
            "satisfied": False,
            "note": "hard validation failed before same-dimension evaluation",
        }
        style_penalty = None

    return {
        "candidateId": candidate_id,
        "origin": origin,
        "attempt": attempt,
        "textSha256": _sha256_text(normalized_output),
        "charCount": len(normalized_output),
        "changedFromBaseline": changed,
        "hardValid": hard_valid,
        "hardValidationError": str(hard_validation_error or "")[:800],
        # Stable, text-free diagnoses let checkpoint/compare consumers explain
        # why a rejected candidate failed without parsing or displaying raw
        # exception prose.  The field is additive to candidate-selection v1;
        # older evidence may omit it and normalizes to an empty list.
        "hardValidationIssueCodes": hard_validation_issue_codes,
        "factualGuardPassed": not factual_issue_codes,
        "factualIssueCodes": factual_issue_codes,
        "academicReadabilityDelta": academic_readability_delta,
        "readabilityGuardPassed": readability_guard_passed,
        "readabilityIssueCodes": readability_issue_codes,
        "sourceRelativeStyleDelta": source_relative_style_delta,
        "sourceRelativeStyleGuardPassed": source_relative_style_guard_passed,
        "deterministicLexicalRetentionProxy": retention,
        "sameDimensionDirection": dimension_direction,
        "stylePenalty": style_penalty,
        "safetyEligible": bool(
            hard_valid
            and not factual_issue_codes
            and retention_score >= LEXICAL_RETENTION_MIN_SCORE
            and readability_guard_passed
            and source_relative_style_guard_passed
        ),
        "rejectionReasonCodes": safety_reasons,
        "_text": normalized_output,
    }


def _candidate_style_penalty(candidate: dict[str, object]) -> float:
    try:
        value = candidate.get("stylePenalty")
        return float(value) if value is not None else float("inf")
    except (TypeError, ValueError):
        return float("inf")


def _candidate_retention_score(candidate: dict[str, object]) -> float:
    retention = candidate.get("deterministicLexicalRetentionProxy")
    if not isinstance(retention, dict):
        return 0.0
    try:
        return float(retention.get("score", 0.0) or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _candidate_same_dimension_ok(candidate: dict[str, object]) -> bool:
    direction = candidate.get("sameDimensionDirection")
    return bool(isinstance(direction, dict) and direction.get("ok", False))


def _candidate_source_relative_style_ok(candidate: dict[str, object]) -> bool:
    """Fail closed for every changed model candidate lacking v4.1 evidence."""

    if candidate.get("origin") != "model" or not bool(candidate.get("changedFromBaseline")):
        return True
    evidence = candidate.get("sourceRelativeStyleDelta")
    return bool(
        candidate.get("sourceRelativeStyleGuardPassed") is True
        and source_relative_style_delta_passed(evidence)
        and isinstance(evidence, dict)
        and isinstance(evidence.get("binding"), dict)
        and str(evidence["binding"].get("candidateTextSha256", "") or "")
        == str(candidate.get("textSha256", "") or "")
    )


def _select_rewrite_candidate(
    candidates: list[dict[str, object]],
    *,
    round_dimension: dict[str, object] | None,
) -> tuple[dict[str, object], list[str]]:
    baseline = next(candidate for candidate in candidates if candidate.get("origin") == "baseline")
    generated = [
        candidate
        for candidate in candidates
        if candidate.get("origin") == "model"
        and bool(candidate.get("safetyEligible"))
        and bool(candidate.get("changedFromBaseline"))
        and _candidate_source_relative_style_ok(candidate)
    ]
    if not generated:
        return baseline, ["no_safe_changed_generated_candidate"]

    active_dimension = _candidate_dimension_is_active(round_dimension)
    if active_dimension:
        converged = [candidate for candidate in generated if _candidate_same_dimension_ok(candidate)]
        if not converged:
            return baseline, ["no_same_dimension_converged_candidate"]
        best = min(
            converged,
            key=lambda candidate: (
                _candidate_style_penalty(candidate),
                -_candidate_retention_score(candidate),
                int(candidate.get("attempt", 0) or 0),
            ),
        )
        baseline_style = _candidate_style_penalty(baseline)
        best_style = _candidate_style_penalty(best)
        if not _candidate_same_dimension_ok(baseline):
            if best_style <= baseline_style + CANDIDATE_STYLE_REGRESSION_TOLERANCE:
                return best, ["same_dimension_converged", "style_regression_within_safety_tolerance"]
            return baseline, ["same_dimension_gain_outweighed_by_cross_dimension_style_regression"]
        if best_style <= baseline_style - CANDIDATE_STYLE_MIN_GAIN:
            return best, ["same_dimension_preserved", "combined_style_penalty_improved"]
        return baseline, ["baseline_already_same_dimension_safe", "no_combined_style_gain"]

    best = min(
        generated,
        key=lambda candidate: (
            _candidate_style_penalty(candidate),
            -_candidate_retention_score(candidate),
            int(candidate.get("attempt", 0) or 0),
        ),
    )
    if _candidate_style_penalty(best) <= _candidate_style_penalty(baseline) - CANDIDATE_STYLE_MIN_GAIN:
        return best, ["hard_and_factual_guards_passed", "combined_style_penalty_improved"]
    return baseline, ["no_measurable_combined_style_gain"]


def _candidate_requires_conditional_retry(
    candidate: dict[str, object],
    baseline: dict[str, object],
    *,
    round_dimension: dict[str, object] | None,
) -> bool:
    # Keep the one-call fast path only when this candidate would actually win
    # under the same final selector used after the bounded attempt loop.  The
    # previous shortcut returned False for every safety-eligible neutral pass,
    # even when its style penalty tied or regressed against the baseline; that
    # made the newly enforced minimum-gain policy silently skip its one allowed
    # repair attempt.
    selected, _reason_codes = _select_rewrite_candidate(
        [baseline, candidate],
        round_dimension=round_dimension,
    )
    return selected is not candidate


def _candidate_selection_retry_reason_codes(
    candidate: dict[str, object],
    baseline: dict[str, object],
    *,
    round_dimension: dict[str, object] | None,
) -> list[str]:
    """Return the final-selector reasons that justify one bounded retry."""

    selected, reason_codes = _select_rewrite_candidate(
        [baseline, candidate],
        round_dimension=round_dimension,
    )
    if selected is candidate:
        return []
    return list(dict.fromkeys(str(code) for code in reason_codes if str(code or "").strip()))


ACADEMIC_READABILITY_RETRY_GUIDANCE = {
    COLLOQUIAL_REGISTER_INTRODUCED: (
        "Use formal academic written register and remove newly introduced conversational or informal phrasing."
    ),
    ACADEMIC_COLLOCATION_CONFLICT_INTRODUCED: (
        "Repair the newly introduced academic verb-object or collocation conflict without changing the underlying claim."
    ),
    PREDICATE_COMPLETENESS_REGRESSION: (
        "Restore a complete predicate for every affected clause; do not leave a prepositional phrase as a sentence fragment."
    ),
    TELEGRAPHIC_CLAUSE_CHAIN_INTRODUCED: (
        "Replace the excessive bare-action clause chain with complete, naturally connected academic sentences."
    ),
    VAGUE_CAUSAL_REFERENCE_INTRODUCED: (
        "Remove any newly added vague causal reference unless its explicit, source-grounded antecedent is stated."
    ),
}

SOURCE_RELATIVE_STYLE_RETRY_GUIDANCE = {
    REPEATED_OPENING_FAMILY_INTRODUCED: (
        "Do not replace one formulaic opening sequence with another repeated opening family; vary only where the source meaning permits."
    ),
    REPEATED_SENTENCE_SKELETON_INTRODUCED: (
        "Remove the newly repeated sentence skeleton while preserving the source's claims, order, and paragraph role."
    ),
    SENTENCE_BOUNDARY_COLLAPSE_INTRODUCED: (
        "Restore complete source sentence boundaries; do not collapse several independent claims into one run-on sentence."
    ),
    SENTENCE_FRAGMENTATION_INTRODUCED: (
        "Merge newly created short fragments back into complete semantic units; do not game rhythm with tiny sentences."
    ),
}


def _build_candidate_selection_retry_note(
    candidate: dict[str, object],
    baseline: dict[str, object],
    *,
    round_dimension: dict[str, object] | None,
) -> str:
    reasons = list(candidate.get("rejectionReasonCodes") or [])
    reasons.extend(
        _candidate_selection_retry_reason_codes(
            candidate,
            baseline,
            round_dimension=round_dimension,
        )
    )
    direction = candidate.get("sameDimensionDirection")
    direction_note = str(direction.get("note", "") or "") if isinstance(direction, dict) else ""
    if _candidate_dimension_is_active(round_dimension) and not _candidate_same_dimension_ok(candidate):
        reasons.append("same_dimension_not_effective")
    lines = [
        "[CANDIDATE SELECTION RETRY]",
        "- The previous candidate was evaluated but not selected; make one bounded repair attempt.",
        "- Preserve facts, relations, terms, numbers, citations, paragraph role, and protected placeholders exactly.",
        "- The retention signal below only measures lexical/CJK-unit retention and length stability.",
        "- It is not semantic-equivalence evidence, an embedding/model judgement, or an AI-detector result.",
    ]
    if reasons:
        lines.append(f"- Decision reasons: {', '.join(dict.fromkeys(str(item) for item in reasons if item))}.")
    if any(
        reason in {"no_measurable_combined_style_gain", "no_combined_style_gain"}
        for reason in reasons
    ):
        lines.append(
            "- The previous candidate showed no measurable combined style gain; "
            "make only the minimum necessary, source-grounded changes that produce a measurable improvement."
        )
    readability_issue_codes = list(
        dict.fromkeys(
            str(code)
            for code in (candidate.get("readabilityIssueCodes") or [])
            if str(code or "").strip()
        )
    )
    for issue_code in readability_issue_codes:
        guidance = ACADEMIC_READABILITY_RETRY_GUIDANCE.get(issue_code)
        if guidance:
            lines.append(f"- Academic-readability repair: {guidance}")
    source_relative = candidate.get("sourceRelativeStyleDelta")
    contextual_issue_codes = (
        list(source_relative.get("blockingIssueCodes") or [])
        if isinstance(source_relative, dict)
        else []
    )
    for issue_code in contextual_issue_codes:
        guidance = SOURCE_RELATIVE_STYLE_RETRY_GUIDANCE.get(str(issue_code))
        if guidance:
            lines.append(f"- Source-relative style repair: {guidance}")
    if direction_note:
        lines.append(f"- Same-dimension feedback: {direction_note}")
    retention = candidate.get("deterministicLexicalRetentionProxy")
    if isinstance(retention, dict):
        lines.append(
            "- Deterministic lexical-retention proxy: "
            f"{float(retention.get('score', 0.0) or 0.0):.3f}; minimum {LEXICAL_RETENTION_MIN_SCORE:.2f}."
        )
    lines.append("- Return only the repaired chunk; do not explain or claim any AI-detection result.")
    return "\n".join(lines)


def _bounded_evidence_int(value: object, *, maximum: int = 2_000_000_000) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0 or value > maximum:
        return None
    return value


def _bounded_evidence_number(value: object) -> int | float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    if not (-1_000_000_000 <= number <= 1_000_000_000):
        return None
    return int(number) if number.is_integer() else round(number, 6)


def _public_sha256(value: object, *, allow_empty: bool = False) -> str:
    normalized = str(value or "").strip().lower()
    if allow_empty and not normalized:
        return ""
    return normalized if re.fullmatch(r"[0-9a-f]{64}", normalized) else ""


def _public_chunk_id(value: object) -> str:
    normalized = str(value or "").strip()
    return normalized if re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", normalized) else ""


def _public_candidate_id(value: object) -> str:
    normalized = str(value or "").strip()
    if normalized == "baseline" or re.fullmatch(r"model-attempt-[1-9][0-9]?", normalized):
        return normalized
    return "invalid"


def _public_code_list(
    value: object,
    allowed: frozenset[str],
    *,
    maximum: int = 24,
) -> list[str]:
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for raw in value[:maximum]:
        code = str(raw or "").strip()
        if code in allowed and code not in result:
            result.append(code)
    return result


def _public_claims(value: object, keys: tuple[str, ...]) -> dict[str, object]:
    raw = value if isinstance(value, dict) else {}
    return {
        key: raw.get(key)
        for key in keys
        if isinstance(raw.get(key), bool)
    }


def _public_source_pattern_summary(
    value: object,
    *,
    kind: str,
    document_delta: bool,
) -> dict[str, object]:
    raw = value if isinstance(value, dict) else {}
    max_count_key = "maxResultCount" if document_delta else "maxDocumentAfterCount"
    row_count_keys = (
        ("baselineCount", "resultCount", "introducedCount")
        if document_delta
        else (
            "inputCount",
            "outputCount",
            "introducedCount",
            "documentBeforeCount",
            "documentAfterCount",
            "documentIntroducedCount",
        )
    )
    rows: list[dict[str, object]] = []
    raw_rows = raw.get("patterns")
    if isinstance(raw_rows, list):
        for raw_row in raw_rows[: 24 if document_delta else 12]:
            if not isinstance(raw_row, dict) or raw_row.get("kind") != kind:
                continue
            row: dict[str, object] = {"kind": kind}
            for key in row_count_keys:
                if raw_row.get(key) is None and not document_delta and key.startswith("document"):
                    row[key] = None
                    continue
                count = _bounded_evidence_int(raw_row.get(key), maximum=1_000_000)
                if count is not None:
                    row[key] = count
            if kind == "opening_family":
                family_id = str(raw_row.get("familyId", "") or "").strip()
                if re.fullmatch(r"(?:cn|en)\.[a-z_]{1,48}", family_id):
                    row["familyId"] = family_id
            elif kind == "sentence_skeleton":
                pattern_sha256 = _public_sha256(raw_row.get("patternSha256"))
                if pattern_sha256:
                    row["patternSha256"] = pattern_sha256
            rows.append(row)
    result: dict[str, object] = {
        "issueCodes": _public_code_list(
            raw.get("issueCodes"),
            SOURCE_RELATIVE_BLOCKING_ISSUE_CODES,
            maximum=4,
        ),
        "patterns": rows,
    }
    for key in (
        "introducedPatternCount",
        "blockingPatternCount",
        "maxIntroducedCount",
        max_count_key,
    ):
        count = _bounded_evidence_int(raw.get(key), maximum=1_000_000)
        if count is not None:
            result[key] = count
    return result


def _public_source_relative_style_delta(value: object) -> dict[str, object]:
    raw = value if isinstance(value, dict) else {}
    binding = raw.get("binding") if isinstance(raw.get("binding"), dict) else {}
    boundary = (
        raw.get("sentenceBoundaryDelta")
        if isinstance(raw.get("sentenceBoundaryDelta"), dict)
        else {}
    )
    public_boundary: dict[str, object] = {
        "issueCodes": _public_code_list(
            boundary.get("issueCodes"),
            SOURCE_RELATIVE_BLOCKING_ISSUE_CODES,
            maximum=2,
        )
    }
    for key in (
        "inputSentenceCount",
        "outputSentenceCount",
        "inputShortSentenceCount",
        "outputShortSentenceCount",
        "collapseCount",
        "fragmentIncrease",
    ):
        count = _bounded_evidence_int(boundary.get(key), maximum=1_000_000)
        if count is not None:
            public_boundary[key] = count
    for key in ("collapsed", "fragmented"):
        if isinstance(boundary.get(key), bool):
            public_boundary[key] = boundary.get(key)
    context_scope = raw.get("contextScope") if raw.get("contextScope") in {"document", "local", "invalid"} else "invalid"
    return {
        "schema": SOURCE_RELATIVE_STYLE_DELTA_SCHEMA if raw.get("schema") == SOURCE_RELATIVE_STYLE_DELTA_SCHEMA else "",
        "schemaVersion": SOURCE_RELATIVE_STYLE_DELTA_VERSION if raw.get("schemaVersion") == SOURCE_RELATIVE_STYLE_DELTA_VERSION else 0,
        "ready": raw.get("ready") if isinstance(raw.get("ready"), bool) else False,
        "passed": raw.get("passed") if isinstance(raw.get("passed"), bool) else False,
        "contextScope": context_scope,
        "binding": {
            "sourceProfileSha256": _public_sha256(binding.get("sourceProfileSha256"), allow_empty=True),
            "baselineTextSha256": _public_sha256(binding.get("baselineTextSha256")),
            "candidateTextSha256": _public_sha256(binding.get("candidateTextSha256")),
        },
        "openingFamilyDelta": _public_source_pattern_summary(
            raw.get("openingFamilyDelta"),
            kind="opening_family",
            document_delta=False,
        ),
        "sentenceSkeletonDelta": _public_source_pattern_summary(
            raw.get("sentenceSkeletonDelta"),
            kind="sentence_skeleton",
            document_delta=False,
        ),
        "sentenceBoundaryDelta": public_boundary,
        "blockingIssueCodes": _public_code_list(
            raw.get("blockingIssueCodes"),
            SOURCE_RELATIVE_BLOCKING_ISSUE_CODES,
            maximum=8,
        ),
        "advisoryIssueCodes": _public_code_list(
            raw.get("advisoryIssueCodes"),
            SOURCE_RELATIVE_ADVISORY_ISSUE_CODES,
            maximum=4,
        ),
        "claims": _public_claims(
            raw.get("claims"),
            (
                "providerIndependent",
                "deltaOnly",
                "heuristicOnly",
                "storesInputText",
                "storesOutputText",
                "storesMatchedText",
                "isAiDetector",
                "claimsAuthorshipDetection",
                "claimsDetectionRate",
                "claimsSemanticEquivalence",
            ),
        ),
    }


def _public_source_relative_document_delta(value: object) -> dict[str, object]:
    raw = value if isinstance(value, dict) else {}
    binding = raw.get("binding") if isinstance(raw.get("binding"), dict) else {}
    return {
        "schema": "fyadr.source-relative-document-style-delta" if raw.get("schema") == "fyadr.source-relative-document-style-delta" else "",
        "schemaVersion": 1 if raw.get("schemaVersion") == 1 else 0,
        "ready": raw.get("ready") if isinstance(raw.get("ready"), bool) else False,
        "passed": raw.get("passed") if isinstance(raw.get("passed"), bool) else False,
        "binding": {
            "chunkCount": _bounded_evidence_int(binding.get("chunkCount"), maximum=100_000),
            "baselineProfileSha256": _public_sha256(binding.get("baselineProfileSha256")),
            "resultProfileSha256": _public_sha256(binding.get("resultProfileSha256")),
            "baselineChunksSha256": _public_sha256(binding.get("baselineChunksSha256")),
            "resultChunksSha256": _public_sha256(binding.get("resultChunksSha256")),
        },
        "openingFamilyDelta": _public_source_pattern_summary(
            raw.get("openingFamilyDelta"),
            kind="opening_family",
            document_delta=True,
        ),
        "sentenceSkeletonDelta": _public_source_pattern_summary(
            raw.get("sentenceSkeletonDelta"),
            kind="sentence_skeleton",
            document_delta=True,
        ),
        "blockingIssueCodes": _public_code_list(
            raw.get("blockingIssueCodes"),
            SOURCE_RELATIVE_BLOCKING_ISSUE_CODES,
            maximum=4,
        ),
        "advisoryIssueCodes": _public_code_list(
            raw.get("advisoryIssueCodes"),
            SOURCE_RELATIVE_ADVISORY_ISSUE_CODES,
            maximum=4,
        ),
        "claims": _public_claims(
            raw.get("claims"),
            (
                "providerIndependent",
                "deltaOnly",
                "heuristicOnly",
                "storesInputText",
                "storesOutputText",
                "storesMatchedText",
                "preservesChunkBoundaries",
                "isAiDetector",
                "claimsAuthorshipDetection",
                "claimsDetectionRate",
                "claimsSemanticEquivalence",
            ),
        ),
    }


def _public_direction(value: object) -> dict[str, object]:
    raw = value if isinstance(value, dict) else {}
    result: dict[str, object] = {}
    for key in ("dimensionId", "direction", "primaryMetric", "secondaryMetric"):
        raw_value = str(raw.get(key, "") or "").strip()
        if re.fullmatch(r"[A-Za-z0-9_.:/-]{1,120}", raw_value):
            result[key] = raw_value
    for key in ("ok", "satisfied"):
        if isinstance(raw.get(key), bool):
            result[key] = raw.get(key)
    for key in (
        "before",
        "after",
        "variationBefore",
        "variationAfter",
        "openingConcentrationBefore",
        "openingConcentrationAfter",
        "burstBefore",
        "burstAfter",
        "paddingBefore",
        "paddingAfter",
        "closingBefore",
        "closingAfter",
        "chengyuBefore",
        "chengyuAfter",
    ):
        number = _bounded_evidence_number(raw.get(key))
        if number is not None:
            result[key] = number
    for key in ("riskCodesBefore", "riskCodesAfter"):
        codes = raw.get(key)
        if isinstance(codes, list):
            result[key] = [
                code
                for code in (str(item or "").strip() for item in codes[:16])
                if re.fullmatch(r"[a-z][a-z0-9_]{0,95}", code)
            ]
    structure = raw.get("structureDirection")
    if isinstance(structure, dict):
        public_structure: dict[str, object] = {}
        if isinstance(structure.get("effective"), bool):
            public_structure["effective"] = structure.get("effective")
        concentration = _bounded_evidence_number(structure.get("concentration"))
        if concentration is not None:
            public_structure["concentration"] = concentration
        result["structureDirection"] = public_structure
    return result


def _public_candidate_evidence(candidate: dict[str, object]) -> dict[str, object]:
    """Project a candidate through an explicit, text-free v2 allowlist."""

    candidate_id = str(candidate.get("candidateId", "") or "").strip()
    if candidate_id != "baseline" and not re.fullmatch(r"model-attempt-[1-9][0-9]?", candidate_id):
        candidate_id = "invalid"
    origin = candidate.get("origin") if candidate.get("origin") in {"baseline", "model"} else "invalid"
    attempt = _bounded_evidence_int(candidate.get("attempt"), maximum=MAX_VALIDATION_ATTEMPTS)
    char_count = _bounded_evidence_int(candidate.get("charCount"), maximum=10_000_000)
    readability = candidate.get("academicReadabilityDelta") if isinstance(candidate.get("academicReadabilityDelta"), dict) else {}
    retention = candidate.get("deterministicLexicalRetentionProxy") if isinstance(candidate.get("deterministicLexicalRetentionProxy"), dict) else {}
    public_retention: dict[str, object] = {
        "name": "deterministic-lexical-retention-proxy",
    }
    for key in ("score", "minimumScore", "sourceCoverage", "outputPrecision", "lengthSimilarity"):
        number = _bounded_evidence_number(retention.get(key))
        if number is not None:
            public_retention[key] = number
    for key in ("usesEmbedding", "usesModel", "claimsSemanticEquivalence", "isAiDetector", "claimsDetectionRate"):
        if isinstance(retention.get(key), bool):
            public_retention[key] = retention.get(key)
    style_penalty = candidate.get("stylePenalty")
    public_style_penalty = None if style_penalty is None else _bounded_evidence_number(style_penalty)
    return {
        "candidateId": candidate_id,
        "origin": origin,
        "attempt": attempt,
        "textSha256": _public_sha256(candidate.get("textSha256")),
        "charCount": char_count,
        "changedFromBaseline": candidate.get("changedFromBaseline") if isinstance(candidate.get("changedFromBaseline"), bool) else False,
        "hardValid": candidate.get("hardValid") if isinstance(candidate.get("hardValid"), bool) else False,
        "hardValidationIssueCodes": _public_code_list(
            candidate.get("hardValidationIssueCodes"),
            HARD_MACHINE_STYLE_CODES,
            maximum=8,
        ),
        "factualGuardPassed": candidate.get("factualGuardPassed") if isinstance(candidate.get("factualGuardPassed"), bool) else False,
        "factualIssueCodes": _public_code_list(
            candidate.get("factualIssueCodes"),
            CANDIDATE_FACTUAL_ISSUE_CODES,
            maximum=8,
        ),
        "academicReadabilityDelta": {
            "schema": ACADEMIC_READABILITY_DELTA_SCHEMA if readability.get("schema") == ACADEMIC_READABILITY_DELTA_SCHEMA else "",
            "schemaVersion": ACADEMIC_READABILITY_DELTA_VERSION if readability.get("schemaVersion") == ACADEMIC_READABILITY_DELTA_VERSION else 0,
            "ok": readability.get("ok") if isinstance(readability.get("ok"), bool) else False,
            "issueCodes": _public_code_list(
                readability.get("issueCodes"),
                CANDIDATE_READABILITY_ISSUE_CODES,
                maximum=8,
            ),
        },
        "readabilityGuardPassed": candidate.get("readabilityGuardPassed") if isinstance(candidate.get("readabilityGuardPassed"), bool) else False,
        "readabilityIssueCodes": _public_code_list(
            candidate.get("readabilityIssueCodes"),
            CANDIDATE_READABILITY_ISSUE_CODES,
            maximum=8,
        ),
        "sourceRelativeStyleDelta": _public_source_relative_style_delta(candidate.get("sourceRelativeStyleDelta")),
        "sourceRelativeStyleGuardPassed": candidate.get("sourceRelativeStyleGuardPassed") if isinstance(candidate.get("sourceRelativeStyleGuardPassed"), bool) else False,
        "deterministicLexicalRetentionProxy": public_retention,
        "sameDimensionDirection": _public_direction(candidate.get("sameDimensionDirection")),
        "stylePenalty": public_style_penalty,
        "safetyEligible": candidate.get("safetyEligible") if isinstance(candidate.get("safetyEligible"), bool) else False,
        "rejectionReasonCodes": _public_code_list(
            candidate.get("rejectionReasonCodes"),
            CANDIDATE_PUBLIC_REASON_CODES,
            maximum=16,
        ),
    }


def _public_candidate_selection_event(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None
    raw_candidates = value.get("candidates")
    candidates = [
        _public_candidate_evidence(candidate)
        for candidate in (raw_candidates[:MAX_CHUNK_CANDIDATE_COUNT] if isinstance(raw_candidates, list) else [])
        if isinstance(candidate, dict)
    ]
    retention = value.get("retentionAssessment") if isinstance(value.get("retentionAssessment"), dict) else {}
    event: dict[str, object] = {
        "event": "candidate-selection",
        "schema": CANDIDATE_SELECTION_SCHEMA if value.get("schema") == CANDIDATE_SELECTION_SCHEMA else "",
        "schemaVersion": CANDIDATE_SELECTION_VERSION if value.get("schemaVersion") == CANDIDATE_SELECTION_VERSION else 0,
        "round": _bounded_evidence_int(value.get("round"), maximum=1_000),
        "chunkId": _public_chunk_id(value.get("chunkId")),
        "policy": "bounded-provider-independent-safe-best-of-baseline-and-attempts",
        "isAiDetector": False if value.get("isAiDetector") is False else None,
        "claimsDetectionRate": False if value.get("claimsDetectionRate") is False else None,
        "retentionAssessment": {
            "name": "deterministic-lexical-retention-proxy",
            "usesEmbedding": retention.get("usesEmbedding") if isinstance(retention.get("usesEmbedding"), bool) else None,
            "usesModel": retention.get("usesModel") if isinstance(retention.get("usesModel"), bool) else None,
            "claimsSemanticEquivalence": retention.get("claimsSemanticEquivalence") if isinstance(retention.get("claimsSemanticEquivalence"), bool) else None,
            "isAiDetector": False if retention.get("isAiDetector") is False else None,
            "claimsDetectionRate": False if retention.get("claimsDetectionRate") is False else None,
        },
        "candidateLimit": _bounded_evidence_int(value.get("candidateLimit"), maximum=MAX_CHUNK_CANDIDATE_COUNT),
        "modelAttemptLimit": _bounded_evidence_int(value.get("modelAttemptLimit"), maximum=MAX_VALIDATION_ATTEMPTS),
        "modelAttemptCount": _bounded_evidence_int(value.get("modelAttemptCount"), maximum=MAX_VALIDATION_ATTEMPTS),
        "conditionalRetryCount": _bounded_evidence_int(value.get("conditionalRetryCount"), maximum=MAX_VALIDATION_ATTEMPTS),
        "decision": value.get("decision") if value.get("decision") in {"generated_selected", "preserved_baseline", "hard_failure_preserved_baseline"} else "invalid",
        "publishedRewrite": value.get("publishedRewrite") if isinstance(value.get("publishedRewrite"), bool) else None,
        "runFailed": value.get("runFailed") if isinstance(value.get("runFailed"), bool) else None,
        "selectedCandidateId": _public_candidate_id(value.get("selectedCandidateId")),
        "selectedOrigin": value.get("selectedOrigin") if value.get("selectedOrigin") in {"baseline", "model"} else "invalid",
        "selectedTextSha256": _public_sha256(value.get("selectedTextSha256")),
        "resultTextSha256": _public_sha256(value.get("resultTextSha256")),
        "selectedCharCount": _bounded_evidence_int(value.get("selectedCharCount"), maximum=10_000_000),
        "resultCharCount": _bounded_evidence_int(value.get("resultCharCount"), maximum=10_000_000),
        "postprocessApplied": value.get("postprocessApplied") if isinstance(value.get("postprocessApplied"), bool) else None,
        "resultSourceRelativeStyleDelta": _public_source_relative_style_delta(value.get("resultSourceRelativeStyleDelta")),
        "reasonCodes": _public_code_list(value.get("reasonCodes"), CANDIDATE_PUBLIC_REASON_CODES, maximum=24),
        "candidates": candidates,
    }
    if "publishedTextSha256" in value:
        event["publishedTextSha256"] = _public_sha256(value.get("publishedTextSha256"))
    if "publishedCharCount" in value:
        event["publishedCharCount"] = _bounded_evidence_int(value.get("publishedCharCount"), maximum=10_000_000)
    arbitration = value.get("documentArbitration")
    if isinstance(arbitration, dict):
        event["documentArbitration"] = {
            "decision": "baseline_preserved" if arbitration.get("decision") == "baseline_preserved" else "invalid",
            "reasonCode": DOCUMENT_PATTERN_ACCUMULATION_BLOCKED if arbitration.get("reasonCode") == DOCUMENT_PATTERN_ACCUMULATION_BLOCKED else "invalid",
            "rejectedDocumentDelta": _public_source_relative_document_delta(arbitration.get("rejectedDocumentDelta")),
        }
    return event


def _build_candidate_selection_event(
    *,
    chunk_id: str,
    round_number: int,
    candidates: list[dict[str, object]],
    selected: dict[str, object],
    reason_codes: list[str],
    conditional_retry_count: int,
    decision: str | None = None,
    run_failed: bool = False,
) -> dict[str, object]:
    selected_origin = str(selected.get("origin", "baseline") or "baseline")
    published_rewrite = bool(
        not run_failed
        and selected_origin == "model"
        and selected.get("changedFromBaseline")
        and selected.get("safetyEligible")
        and _candidate_source_relative_style_ok(selected)
    )
    resolved_decision = decision or ("generated_selected" if published_rewrite else "preserved_baseline")
    selected_text_sha256 = str(selected.get("textSha256", "") or "")
    event: dict[str, object] = {
        "event": "candidate-selection",
        "schema": CANDIDATE_SELECTION_SCHEMA,
        "schemaVersion": CANDIDATE_SELECTION_VERSION,
        "round": round_number,
        "chunkId": chunk_id,
        "policy": "bounded-provider-independent-safe-best-of-baseline-and-attempts",
        "isAiDetector": False,
        "claimsDetectionRate": False,
        "retentionAssessment": {
            "name": "deterministic-lexical-retention-proxy",
            "usesEmbedding": False,
            "usesModel": False,
            "claimsSemanticEquivalence": False,
            "isAiDetector": False,
            "claimsDetectionRate": False,
        },
        "candidateLimit": MAX_CHUNK_CANDIDATE_COUNT,
        "modelAttemptLimit": MAX_VALIDATION_ATTEMPTS,
        "modelAttemptCount": len([candidate for candidate in candidates if candidate.get("origin") == "model"]),
        "conditionalRetryCount": conditional_retry_count,
        "decision": resolved_decision,
        "publishedRewrite": published_rewrite,
        "runFailed": run_failed,
        "selectedCandidateId": selected.get("candidateId", "baseline"),
        "selectedOrigin": selected_origin,
        "selectedTextSha256": selected_text_sha256,
        "resultTextSha256": selected_text_sha256,
        "selectedCharCount": selected.get("charCount", 0),
        "resultCharCount": selected.get("charCount", 0),
        "postprocessApplied": False,
        "resultSourceRelativeStyleDelta": selected.get("sourceRelativeStyleDelta"),
        "reasonCodes": list(dict.fromkeys(reason_codes)),
        "candidates": [_public_candidate_evidence(candidate) for candidate in candidates[:MAX_CHUNK_CANDIDATE_COUNT]],
    }
    if published_rewrite:
        event["publishedTextSha256"] = selected_text_sha256
        event["publishedCharCount"] = selected.get("charCount", 0)
    return event


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
    if previous_char in ".!?;:," and ASCII_WORD_CHAR_RE.match(next_char):
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


def _extract_citation_counts(text: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for pattern in (NUMERIC_CITATION_RE, AUTHOR_YEAR_CITATION_RE):
        for match in pattern.finditer(text):
            marker = _normalize_citation_marker(match.group(0))
            counts[marker] = counts.get(marker, 0) + 1
    return counts


def _exact_occurrence_positions(text: str, needle: str) -> list[int]:
    if not needle:
        return []
    positions: list[int] = []
    cursor = 0
    while cursor <= len(text) - len(needle):
        position = text.find(needle, cursor)
        if position < 0:
            break
        positions.append(position)
        cursor = position + 1
    return positions


def protect_structure_tokens(text: str, exact_anchors: Sequence[str] | None = None) -> ProtectedText:
    tokens: dict[str, str] = {}
    token_types: dict[str, str] = {}

    normalized_anchors = [
        str(anchor)
        for anchor in (exact_anchors or [])
        if str(anchor)
    ]
    if not normalized_anchors:
        def replace_match(match: re.Match[str]) -> str:
            original = match.group(0)
            token_type = _classify_protected_token(original)
            placeholder = f"@@FYADR_{token_type}_{len(tokens) + 1:03d}@@"
            tokens[placeholder] = original
            token_types[placeholder] = token_type
            return placeholder

        protected_text = INLINE_STRUCTURE_TOKEN_RE.sub(replace_match, text)
        return ProtectedText(protected_text, tokens, token_types)

    if len(set(normalized_anchors)) != len(normalized_anchors):
        raise ValueError("DOCX model format-anchor plan contains duplicate anchors.")

    spans: list[tuple[int, int, str]] = [
        (match.start(), match.end(), _classify_protected_token(match.group(0)))
        for match in INLINE_STRUCTURE_TOKEN_RE.finditer(text)
    ]
    for anchor in normalized_anchors:
        occurrences = _exact_occurrence_positions(text, anchor)
        if len(occurrences) != 1:
            raise ValueError("DOCX model format anchor is missing or ambiguous before API execution.")
        anchor_start = occurrences[0]
        anchor_end = anchor_start + len(anchor)
        contained_by_existing = False
        retained: list[tuple[int, int, str]] = []
        for span_start, span_end, token_type in spans:
            if anchor_start >= span_start and anchor_end <= span_end:
                contained_by_existing = True
                retained.append((span_start, span_end, token_type))
                continue
            if span_start >= anchor_start and span_end <= anchor_end:
                # Protect the complete Word-styled anchor instead of emitting
                # nested number/citation placeholders inside it.
                continue
            if anchor_start < span_end and anchor_end > span_start:
                raise ValueError("DOCX model format anchor partially overlaps a protected structure token.")
            retained.append((span_start, span_end, token_type))
        spans = retained
        if not contained_by_existing:
            spans.append((anchor_start, anchor_end, "FMT"))

    spans.sort(key=lambda item: (item[0], item[1]))
    for previous, current in zip(spans, spans[1:]):
        if current[0] < previous[1]:
            raise ValueError("DOCX model protection spans overlap after anchor binding.")

    protected_parts: list[str] = []
    cursor = 0
    for start, end, token_type in spans:
        protected_parts.append(text[cursor:start])
        original = text[start:end]
        placeholder = f"@@FYADR_{token_type}_{len(tokens) + 1:03d}@@"
        tokens[placeholder] = original
        token_types[placeholder] = token_type
        protected_parts.append(placeholder)
        cursor = end
    protected_parts.append(text[cursor:])
    return ProtectedText("".join(protected_parts), tokens, token_types)


def _classify_protected_token(token: str) -> str:
    compact = token.strip()
    if compact.startswith("`") and compact.endswith("`"):
        return "CODE"
    if compact.startswith(("$", "\\(", "\\[")):
        return "EQN"
    if re.fullmatch(URL_TOKEN_PATTERN, compact, flags=re.IGNORECASE) or re.fullmatch(
        DOI_TOKEN_PATTERN, compact, flags=re.IGNORECASE
    ):
        return "URL"
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


def validate_immutable_text_anchors(
    input_text: str,
    output_text: str,
    anchors: Sequence[str],
    chunk_id: str,
) -> None:
    """Require exact anchor count and order after placeholder restoration."""

    positions: list[int] = []
    for anchor in anchors:
        source_positions = _exact_occurrence_positions(input_text, anchor)
        output_positions = _exact_occurrence_positions(output_text, anchor)
        if len(source_positions) != 1:
            raise ValueError(f"Chunk {chunk_id} has an invalid source format-anchor binding")
        if not output_positions:
            raise ValueError(f"Chunk {chunk_id} removed a Word format-sensitive text anchor")
        if len(output_positions) != 1:
            raise ValueError(f"Chunk {chunk_id} duplicated a Word format-sensitive text anchor")
        positions.append(output_positions[0])
    if positions != sorted(positions):
        raise ValueError(f"Chunk {chunk_id} reordered Word format-sensitive text anchors")


def restore_structure_tokens(text: str, tokens: dict[str, str]) -> str:
    restored = text
    for placeholder, original in tokens.items():
        restored = restored.replace(placeholder, original)
    return restored


def _normalize_required_token(token: str) -> str:
    translation = str.maketrans("０１２３４５６７８９％，．", "0123456789%,.")
    return re.sub(r"\s+", "", token.translate(translation))


def _extract_required_number_counts(text: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for match in NUMBER_TOKEN_RE.finditer(text):
        token = _normalize_required_token(match.group(0))
        if token:
            counts[token] = counts.get(token, 0) + 1
    return counts


def _extract_required_terms(text: str) -> set[str]:
    terms = {match.group(0).strip() for match in TECH_VERSION_TOKEN_RE.finditer(text)}
    terms.update(match.group(0).strip() for match in CODE_LIKE_TERM_RE.finditer(text))
    return {term for term in terms if len(term) >= 2}


def _is_count_sensitive_required_term(term: str) -> bool:
    """Compatibility policy used by the DOCX export audit.

    The live chunk validator only requires each protected term to remain
    present, which permits a repeated noun to become an unambiguous pronoun.
    Export audit callers still use this helper to report occurrence deltas in
    persisted/historical artifacts, so the function remains stable here.
    """

    return len(term) >= 3 and (
        any(char.isdigit() for char in term)
        or any(char in term for char in ".-_/")
        or (any(char.islower() for char in term) and any(char.isupper() for char in term))
    )


def _extract_required_term_counts(text: str) -> dict[str, int]:
    return {
        term: text.count(term)
        for term in _extract_required_terms(text)
        if _is_count_sensitive_required_term(term)
    }


def _is_spacing_sensitive_english_token(token: str) -> bool:
    return (
        any(char.isdigit() for char in token)
        or any(char in token for char in ".-_/")
        or (any(char.islower() for char in token) and any(char.isupper() for char in token))
    )


def _is_spacing_sensitive_english_pair(left_text: str, right_text: str, collapsed_separator: str) -> bool:
    if collapsed_separator:
        return True
    return (
        _is_spacing_sensitive_english_token(left_text)
        or _is_spacing_sensitive_english_token(right_text)
        or left_text.lower() in ENGLISH_GLUE_LEFT_WORDS
        or right_text.lower() in ENGLISH_GLUE_RIGHT_WORDS
    )


def find_english_spacing_corruptions(input_text: str, output_text: str, *, limit: int = 8) -> list[str]:
    if detect_chunk_language(input_text) != "en":
        return []
    input_lower = input_text.lower()
    output_lower = output_text.lower()
    findings: list[str] = []
    seen: set[str] = set()
    tokens = list(ENGLISH_SPACING_TOKEN_RE.finditer(input_text))
    for left, right in zip(tokens, tokens[1:]):
        separator = input_text[left.end() : right.start()]
        if not separator or not any(char.isspace() for char in separator):
            continue
        left_text = left.group(0)
        right_text = right.group(0)
        if len(left_text) == 1 and len(right_text) == 1:
            continue
        collapsed_separator = re.sub(r"\s+", "", separator)
        if not _is_spacing_sensitive_english_pair(left_text, right_text, collapsed_separator):
            continue
        candidates = (
            [f"{left_text}{right_text}"]
            if not collapsed_separator
            else [f"{left_text}{collapsed_separator}{right_text}"]
        )
        if collapsed_separator:
            candidates.append(f"{left_text}{right_text}")
        for candidate in candidates:
            candidate_lower = candidate.lower()
            if len(candidate_lower) < 5 or candidate_lower in input_lower or candidate_lower in seen:
                continue
            if candidate_lower in output_lower:
                findings.append(candidate[:90])
                seen.add(candidate_lower)
                break
        if len(findings) >= limit:
            break
    return findings


def _validate_required_numbers(input_text: str, output_text: str, chunk_id: str) -> None:
    input_counts = _extract_required_number_counts(input_text)
    output_counts = _extract_required_number_counts(output_text)
    missing = sorted(
        token for token, count in input_counts.items()
        if output_counts.get(token, 0) < count
    )
    if missing:
        raise ValueError(f"Chunk {chunk_id} changed or removed numbers: {', '.join(missing[:8])}")
    introduced = sorted(
        token for token, count in output_counts.items()
        if count > input_counts.get(token, 0)
    )
    if introduced:
        raise ValueError(f"Chunk {chunk_id} introduced or duplicated numbers: {', '.join(introduced[:8])}")


def _validate_required_terms(input_text: str, output_text: str, chunk_id: str) -> None:
    required_terms = _extract_required_terms(input_text)
    if not required_terms:
        return
    missing = sorted(term for term in required_terms if term not in output_text)
    if missing:
        raise ValueError(f"Chunk {chunk_id} changed or removed protected terms: {', '.join(missing[:8])}")


def _validate_english_spacing_stability(input_text: str, output_text: str, chunk_id: str) -> None:
    corruptions = find_english_spacing_corruptions(input_text, output_text)
    if corruptions:
        raise ValueError(f"Chunk {chunk_id} removed English spacing: {', '.join(corruptions[:5])}")


def _content_terms(text: str) -> set[str]:
    terms = {
        token.lower()
        for token in CONTENT_TOKEN_RE.findall(text)
        if len(token) >= 3 and token.lower() not in CONTENT_STOPWORDS
    }
    for cjk_block in re.findall(r"[\u4e00-\u9fff]{2,}", text):
        if len(cjk_block) <= 4:
            terms.add(cjk_block)
            continue
        terms.update(cjk_block[index : index + 2] for index in range(0, len(cjk_block) - 1))
    return terms


def _content_overlap_score(left_text: str, right_text: str) -> tuple[float, list[str], int, int]:
    left_terms = _content_terms(left_text)
    right_terms = _content_terms(right_text)
    smaller = min(len(left_terms), len(right_terms))
    if smaller < 8:
        return 0.0, [], len(left_terms), len(right_terms)
    overlap = sorted(left_terms & right_terms)
    return len(overlap) / smaller, overlap[:20], len(left_terms), len(right_terms)


def _sample_for_validation(text: str, limit: int = 180) -> str:
    compact = re.sub(r"\s+", " ", str(text or "")).strip()
    return compact[:limit]


def _repetition_units(text: str) -> list[str]:
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", str(text or "").strip()) if part.strip()]
    if len(paragraphs) >= 2:
        return paragraphs
    return [sentence for sentence in _split_sentences_for_quality(text) if len(_content_terms(sentence)) >= 8]


def find_internal_repetition_issues(text: str, *, limit: int = 4) -> list[dict[str, object]]:
    units = _repetition_units(text)
    issues: list[dict[str, object]] = []
    for left_index, left_text in enumerate(units):
        for right_index in range(left_index + 1, len(units)):
            right_text = units[right_index]
            score, overlap_terms, left_count, right_count = _content_overlap_score(left_text, right_text)
            if score < INTERNAL_REPETITION_SCORE_THRESHOLD:
                continue
            issues.append(
                {
                    "leftIndex": left_index,
                    "rightIndex": right_index,
                    "score": round(score, 3),
                    "overlapTerms": overlap_terms[:12],
                    "leftTermCount": left_count,
                    "rightTermCount": right_count,
                    "leftSample": _sample_for_validation(left_text),
                    "rightSample": _sample_for_validation(right_text),
                }
            )
            if len(issues) >= limit:
                return issues
    return issues


def _validate_repetition_stability(input_text: str, output_text: str, chunk_id: str) -> None:
    output_issues = find_internal_repetition_issues(output_text, limit=1)
    if not output_issues:
        return
    input_issues = find_internal_repetition_issues(input_text, limit=1)
    if input_issues:
        return
    issue = output_issues[0]
    raise ValueError(
        f"Chunk {chunk_id} introduced repeated content: overlap score {issue.get('score')}"
    )


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
    if input_length < 12:
        return
    minimum_ratio = 0.58 if input_length < 80 else 0.55
    maximum_length = (
        max(int(input_length * 1.60), input_length + 24)
        if input_length < 80
        else max(int(input_length * 1.65), input_length + 220)
    )
    if output_length < int(input_length * minimum_ratio):
        raise ValueError(f"Chunk {chunk_id} shrank abnormally; possible content loss")
    if output_length > maximum_length:
        raise ValueError(f"Chunk {chunk_id} expanded abnormally; possible answer-style drift")


def _has_sentence_terminal(text: str) -> bool:
    return bool(SENTENCE_TERMINAL_RE.search(str(text or "").strip()))


def _surface_pair_delta(text: str, left: str, right: str) -> int:
    return str(text or "").count(left) - str(text or "").count(right)


def find_sentence_surface_issues(input_text: str, output_text: str, *, limit: int = 8) -> list[dict[str, object]]:
    source = str(input_text or "").strip()
    current = str(output_text or "").strip()
    issues: list[dict[str, object]] = []
    if not current:
        return [{"code": "empty_output", "message": "Output is empty."}]

    def add(code: str, message: str, **extra: object) -> None:
        if len(issues) < limit:
            payload: dict[str, object] = {"code": code, "message": message}
            payload.update(extra)
            issues.append(payload)

    wrapper_match = is_disallowed_answer_style_output(source, current)
    if wrapper_match:
        add("answer_style_wrapper", "Output contains chat-style or answer-style wrapper text.", pattern=wrapper_match)
    elif ANSWER_WRAPPER_RE.search(current) and not ANSWER_WRAPPER_RE.search(source):
        add("answer_style_wrapper", "Output starts with an answer-style wrapper instead of body text.")

    if len(current) >= 12:
        repeated = sorted(set(match.group(0) for match in REPEATED_PUNCT_RE.finditer(current)))
        introduced_repeated = [item for item in repeated if item not in source]
        if introduced_repeated:
            add("repeated_punctuation", "Output introduced abnormal repeated punctuation.", samples=introduced_repeated[:5])
        bad_punct = sorted(set(match.group(0) for match in MIXED_BAD_PUNCT_RE.finditer(current)))
        introduced_bad_punct = [item for item in bad_punct if item not in source]
        if introduced_bad_punct:
            add("mixed_bad_punctuation", "Output contains malformed adjacent punctuation.", samples=introduced_bad_punct[:5])

    for left, right in BALANCED_SURFACE_PAIRS:
        source_delta = _surface_pair_delta(source, left, right)
        current_delta = _surface_pair_delta(current, left, right)
        if current_delta != source_delta and source_delta == 0:
            add(
                "unbalanced_punctuation_pair",
                "Output introduced unbalanced brackets or quotation marks.",
                pair=f"{left}{right}",
                delta=current_delta,
            )

    if len(source) >= 20 and len(current) >= 12:
        if _has_sentence_terminal(source) and not _has_sentence_terminal(current):
            add("missing_sentence_terminal", "Output appears to end before a complete sentence terminator.")
        if WEAK_TRAILING_PUNCT_RE.search(current) and not WEAK_TRAILING_PUNCT_RE.search(source):
            add("trailing_weak_punctuation", "Output ends with weak punctuation and looks incomplete.")
        compact_current = current.rstrip("\"'”’）)]】》").strip()
        if CN_TRAILING_FRAGMENT_RE.search(compact_current) and not CN_TRAILING_FRAGMENT_RE.search(source.rstrip("\"'”’）)]】》").strip()):
            add("trailing_sentence_fragment", "Output ends with a dangling Chinese connector or function word.")
        if detect_chunk_language(source) == "en" and EN_TRAILING_FRAGMENT_RE.search(compact_current):
            add("trailing_sentence_fragment", "English output ends with a dangling function word.")

    return issues


def _validate_sentence_surface_integrity(input_text: str, output_text: str, chunk_id: str) -> None:
    issues = find_sentence_surface_issues(input_text, output_text, limit=3)
    if not issues:
        return
    summary = "; ".join(str(issue.get("code", "")) for issue in issues if issue.get("code"))
    raise ValueError(f"Chunk {chunk_id} has incomplete or malformed sentence surface: {summary}")


def _find_introduced_template_phrases(input_text: str, output_text: str) -> list[str]:
    return sorted(
        set(INTRODUCED_TEMPLATE_PHRASE_RE.findall(output_text))
        - set(INTRODUCED_TEMPLATE_PHRASE_RE.findall(input_text))
    )


def validate_structure_placeholders(output_text: str, tokens: dict[str, str], chunk_id: str) -> None:
    if not tokens:
        return
    expected = list(tokens)
    actual = PLACEHOLDER_RE.findall(output_text)
    missing = [placeholder for placeholder in expected if placeholder not in actual]
    if missing:
        raise ValueError(f"Chunk {chunk_id} removed protected structure placeholders: {', '.join(missing[:5])}")

    unexpected = sorted(set(actual) - set(expected))
    if unexpected:
        raise ValueError(f"Chunk {chunk_id} introduced unknown structure placeholders: {', '.join(unexpected[:5])}")

    duplicated = [placeholder for placeholder in expected if actual.count(placeholder) != 1]
    if duplicated:
        raise ValueError(
            f"Chunk {chunk_id} duplicated protected structure placeholders: {', '.join(duplicated[:5])}"
        )

    # Each number/citation receives a position-specific token.  Exact sequence
    # equality protects numeric comparison order and citation-to-claim binding
    # without trying to infer semantics from the rewritten Chinese sentence.
    if actual != expected:
        raise ValueError(f"Chunk {chunk_id} reordered protected structure placeholders")


def _validate_machine_style_stability(input_text: str, output_text: str, chunk_id: str) -> None:
    issues = [
        issue
        for issue in _collect_machine_style_validation_issues(input_text, output_text)
        if str(issue.get("code", "")) in HARD_MACHINE_STYLE_CODES
        and str(issue.get("level", "")).lower() == "high"
    ]
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

    input_citation_counts = _extract_citation_counts(input_text)
    output_citation_counts = _extract_citation_counts(output_text)
    missing = sorted(
        marker for marker, count in input_citation_counts.items()
        if output_citation_counts.get(marker, 0) < count
    )
    if missing:
        raise ValueError(f"Chunk {chunk_id} removed citation markers: {', '.join(missing[:5])}")
    introduced = sorted(
        marker for marker, count in output_citation_counts.items()
        if count > input_citation_counts.get(marker, 0)
    )
    if introduced:
        raise ValueError(f"Chunk {chunk_id} introduced or duplicated citation markers: {', '.join(introduced[:5])}")


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
    _validate_english_spacing_stability(input_text, normalized_output, chunk_id)
    _validate_repetition_stability(input_text, normalized_output, chunk_id)
    validate_factual_relation_stability(input_text, normalized_output, f"Chunk {chunk_id}")
    _validate_language_stability(input_text, normalized_output, chunk_id)
    _validate_length_stability(input_text, normalized_output, chunk_id)
    _validate_sentence_surface_integrity(input_text, normalized_output, chunk_id)
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
    immutable_format_anchor_count: int = 0,
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
    if immutable_format_anchor_count > 0:
        sections.append(
            "[WORD FORMAT ANCHOR LOCK]\n"
            f"- This chunk contains {immutable_format_anchor_count} source-bound Word format anchor(s).\n"
            "- Their @@FYADR_*@@ placeholders represent text attached to bold/italic/superscript/colour/hyperlink runs.\n"
            "- Keep each placeholder exactly once and in the same order; rewrite only the prose around it."
        )
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


PARENT_INPUT_PROVENANCE_KEYS = (
    "parentOutputPath",
    "parentCompareRevision",
    "parentContentRevision",
    "parentReviewRevision",
    "effectiveInputSha256",
    "materializationSource",
)


def _normalize_parent_input_provenance(checkpoint_metadata: dict[str, object] | None) -> dict[str, str]:
    raw = checkpoint_metadata.get("parent_input_provenance") if isinstance(checkpoint_metadata, dict) else None
    if not isinstance(raw, dict):
        return {}
    normalized = {
        key: str(raw.get(key, "") or "").strip()
        for key in PARENT_INPUT_PROVENANCE_KEYS
    }
    optional_digest = str(raw.get("parentArtifactSnapshotDigest", "") or "").strip()
    if optional_digest:
        normalized["parentArtifactSnapshotDigest"] = optional_digest
    required_nonempty = (
        "parentOutputPath",
        "parentCompareRevision",
        "parentContentRevision",
        "effectiveInputSha256",
        "materializationSource",
    )
    if any(not normalized.get(key) for key in required_nonempty):
        raise ValueError("Downstream round input provenance is incomplete.")
    return normalized


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
    signature: dict[str, object] = {
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
        "style_card_version": (checkpoint_metadata or {}).get("style_card_version"),
        "global_style_profile_sha256": (checkpoint_metadata or {}).get("global_style_profile_sha256"),
        "source_pattern_profile_sha256": (checkpoint_metadata or {}).get("source_pattern_profile_sha256"),
    }
    signature.update(_normalize_parent_input_provenance(checkpoint_metadata))
    return signature


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
    return not _checkpoint_mismatch_keys(payload, signature)


def _checkpoint_mismatch_keys(payload: dict[str, object], signature: dict[str, object]) -> list[str]:
    mismatch_keys: list[str] = []
    for key, expected_value in signature.items():
        if key in CHECKPOINT_SOFT_MISMATCH_KEYS:
            continue
        if payload.get(key) != expected_value:
            mismatch_keys.append(key)
    return mismatch_keys


def _checkpoint_has_saved_outputs(payload: dict[str, object]) -> bool:
    chunk_outputs = payload.get("chunk_outputs")
    if isinstance(chunk_outputs, dict) and any(isinstance(value, str) and value.strip() for value in chunk_outputs.values()):
        return True
    try:
        return int(payload.get("completed_chunk_count", 0) or 0) > 0
    except (TypeError, ValueError):
        return False


def _checkpoint_output_has_authoritative_candidate_selection(
    *,
    chunk_id: str,
    input_text: str,
    output_text: str,
    raw_events: object,
    source_pattern_profile: dict[str, object],
) -> bool:
    """Admit one resumed output only with current, internally bound evidence."""

    normalized_input = str(input_text or "").strip()
    normalized_output = str(output_text or "").strip()
    if not normalized_input or not normalized_output or normalized_output != output_text:
        return False
    events = [event for event in raw_events if isinstance(event, dict)] if isinstance(raw_events, list) else []
    candidate_events = [
        event
        for event in events
        if event.get("event") == "candidate-selection"
        and str(event.get("chunkId", "") or "") == chunk_id
    ]

    # Structural metadata never enters the model/selector. Its only resumable
    # form is an exact source identity accompanied by one frozen event.
    if not candidate_events:
        frozen_events = [
            event
            for event in events
            if event.get("event") == "chunk-frozen"
            and str(event.get("chunkId", "") or "") == chunk_id
        ]
        return len(frozen_events) == 1 and normalized_output == normalized_input

    if len(candidate_events) != 1:
        return False
    event = candidate_events[0]
    if (
        event.get("schema") != CANDIDATE_SELECTION_SCHEMA
        or event.get("schemaVersion") != CANDIDATE_SELECTION_VERSION
        or event.get("runFailed") is not False
        or event.get("isAiDetector") is not False
        or event.get("claimsDetectionRate") is not False
    ):
        return False

    decision = str(event.get("decision", "") or "")
    selected_origin = str(event.get("selectedOrigin", "") or "")
    published_rewrite = event.get("publishedRewrite")
    if decision == "generated_selected":
        if published_rewrite is not True or selected_origin != "model" or normalized_output == normalized_input:
            return False
    elif decision == "preserved_baseline":
        if published_rewrite is not False or selected_origin != "baseline" or normalized_output != normalized_input:
            return False
    else:
        # hard_failure_preserved_baseline and unknown decisions are never
        # completed work, even if a forged chunk_outputs entry exists.
        return False

    output_sha256 = _sha256_text(normalized_output)
    result_sha256 = str(event.get("resultTextSha256", "") or "")
    if result_sha256 != output_sha256:
        return False
    try:
        if int(event.get("resultCharCount", -1)) != len(normalized_output):
            return False
    except (TypeError, ValueError):
        return False
    if published_rewrite is True:
        if str(event.get("publishedTextSha256", "") or "") != output_sha256:
            return False
        try:
            if int(event.get("publishedCharCount", -1)) != len(normalized_output):
                return False
        except (TypeError, ValueError):
            return False
    elif str(event.get("publishedTextSha256", "") or ""):
        return False

    selected_candidate_id = str(event.get("selectedCandidateId", "") or "")
    candidates = event.get("candidates")
    if not isinstance(candidates, list):
        return False
    selected_candidates = [
        candidate
        for candidate in candidates
        if isinstance(candidate, dict)
        and str(candidate.get("candidateId", "") or "") == selected_candidate_id
    ]
    if len(selected_candidates) != 1:
        return False
    selected_candidate = selected_candidates[0]
    selected_sha256 = str(event.get("selectedTextSha256", "") or "")
    if (
        not selected_sha256
        or str(selected_candidate.get("textSha256", "") or "") != selected_sha256
        or str(selected_candidate.get("origin", "") or "") != selected_origin
        or selected_candidate.get("hardValid") is not True
        or selected_candidate.get("safetyEligible") is not True
        or selected_candidate.get("factualGuardPassed") is not True
        or selected_candidate.get("readabilityGuardPassed") is not True
        or list(selected_candidate.get("readabilityIssueCodes") or [])
    ):
        return False
    try:
        if int(event.get("selectedCharCount", -1)) != int(selected_candidate.get("charCount", -2)):
            return False
    except (TypeError, ValueError):
        return False
    if event.get("postprocessApplied") is not True and selected_sha256 != output_sha256:
        return False
    if decision == "generated_selected" and selected_candidate.get("changedFromBaseline") is not True:
        return False
    if decision == "preserved_baseline" and selected_candidate.get("changedFromBaseline") is not False:
        return False

    readability = selected_candidate.get("academicReadabilityDelta")
    if (
        not isinstance(readability, dict)
        or readability.get("schema") != ACADEMIC_READABILITY_DELTA_SCHEMA
        or readability.get("schemaVersion") != ACADEMIC_READABILITY_DELTA_VERSION
        or readability.get("ok") is not True
        or list(readability.get("issueCodes") or [])
    ):
        return False
    # Recompute the delta from checkpoint text so forged positive evidence
    # cannot bless a newly unreadable output.
    if assess_academic_readability_delta(normalized_input, normalized_output).get("ok") is not True:
        return False
    source_relative = selected_candidate.get("sourceRelativeStyleDelta")
    if not source_relative_style_delta_passed(source_relative):
        return False
    source_binding = source_relative.get("binding") if isinstance(source_relative, dict) else None
    if (
        not isinstance(source_binding, dict)
        or str(source_binding.get("baselineTextSha256", "") or "") != _sha256_text(normalized_input)
        or str(source_binding.get("candidateTextSha256", "") or "") != selected_sha256
    ):
        return False
    result_source_relative = event.get("resultSourceRelativeStyleDelta")
    if not source_relative_style_delta_passed(result_source_relative):
        return False
    result_binding = (
        result_source_relative.get("binding")
        if isinstance(result_source_relative, dict)
        else None
    )
    if (
        not isinstance(result_binding, dict)
        or str(result_binding.get("baselineTextSha256", "") or "") != _sha256_text(normalized_input)
        or str(result_binding.get("candidateTextSha256", "") or "") != output_sha256
    ):
        return False
    fresh_result_source_relative = assess_source_relative_style_delta(
        normalized_input,
        normalized_output,
        source_pattern_profile=source_pattern_profile,
    )
    if (
        not source_relative_style_delta_passed(fresh_result_source_relative)
        or _sha256_json(fresh_result_source_relative) != _sha256_json(result_source_relative)
    ):
        return False
    return True


def _normalize_checkpoint_outputs(
    raw_outputs: object,
    *,
    manifest_chunks_by_id: dict[str, object],
    raw_events: object = None,
) -> dict[str, str]:
    if not isinstance(raw_outputs, dict):
        return {}

    source_pattern_profile = build_source_pattern_profile(
        [str(chunk.text) for chunk in manifest_chunks_by_id.values()]
    )
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
        if not _checkpoint_output_has_authoritative_candidate_selection(
            chunk_id=chunk_id,
            input_text=chunk.text,
            output_text=output_text,
            raw_events=raw_events,
            source_pattern_profile=source_pattern_profile,
        ):
            continue
        cleaned_outputs[chunk_id] = output_text
    return cleaned_outputs


def _normalize_checkpoint_validation_events(
    raw_events: object,
    *,
    valid_chunk_ids: set[str],
    completed_chunk_ids: set[str] | None = None,
) -> list[dict[str, object]]:
    if not isinstance(raw_events, list):
        return []

    cleaned_events: list[dict[str, object]] = []
    for raw_event in raw_events:
        event = _public_validation_event(raw_event)
        if event is None:
            continue
        chunk_id = event.get("chunkId")
        if chunk_id is not None and str(chunk_id) not in valid_chunk_ids:
            continue
        if (
            chunk_id is not None
            and completed_chunk_ids is not None
            and str(chunk_id) not in completed_chunk_ids
            and event.get("event") not in {"validation-retry", "candidate-selection-retry"}
        ):
            # An incomplete chunk will receive a fresh terminal selection on
            # resume.  Retain its rejected-attempt diagnostics, but discard the
            # stale run-failed selection so final compare evidence remains one
            # authoritative candidate decision per completed chunk.
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
    mismatch_keys = _checkpoint_mismatch_keys(payload, signature)
    if mismatch_keys:
        if _checkpoint_has_saved_outputs(payload):
            raise RuntimeError(
                "Existing checkpoint does not match the current document state "
                f"({', '.join(mismatch_keys)}). Reset this round before starting a fresh run."
            )
        try:
            checkpoint_path.unlink(missing_ok=True)
        except OSError:
            pass
        return {}, []

    cleaned_outputs = _normalize_checkpoint_outputs(
        payload.get("chunk_outputs"),
        manifest_chunks_by_id=manifest_chunks_by_id,
        raw_events=payload.get("validation_events"),
    )
    cleaned_events = _normalize_checkpoint_validation_events(
        payload.get("validation_events"),
        # A failed chunk has no saved output yet, but its bounded validation
        # attempts are still valid audit evidence.  Filtering by completed
        # outputs erased those events on resume, so a later successful compare
        # could no longer explain the earlier academic-register hard failure.
        # Keep diagnostic retries for every chunk in the compatible manifest;
        # stale terminal decisions for incomplete chunks are removed so the
        # resumed run can publish one authoritative candidate selection.
        valid_chunk_ids=set(manifest_chunks_by_id),
        completed_chunk_ids=set(cleaned_outputs),
    )
    safe_last_error, safe_last_error_details = _sanitize_checkpoint_error(
        payload.get("last_error"),
        payload.get("last_error_details"),
    )
    if (
        cleaned_outputs == payload.get("chunk_outputs")
        and cleaned_events == payload.get("validation_events", [])
        and safe_last_error == str(payload.get("last_error", "") or "").strip()
        and safe_last_error_details
        == (payload.get("last_error_details") if isinstance(payload.get("last_error_details"), dict) else {})
    ):
        return cleaned_outputs, cleaned_events

    _save_round_checkpoint(
        checkpoint_path,
        signature=signature,
        chunk_outputs=cleaned_outputs,
        validation_events=cleaned_events,
        last_error=safe_last_error or None,
        last_error_details=safe_last_error_details or None,
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


def _sanitize_checkpoint_error(
    raw_message: object,
    raw_details: object = None,
) -> tuple[str, dict[str, object]]:
    """Keep checkpoint failure state actionable without retaining prose."""

    if not str(raw_message or "").strip() and not (
        isinstance(raw_details, dict) and raw_details
    ):
        return "", {}
    _safe_message, safe_details = sanitize_persisted_error(raw_message, raw_details)
    details = safe_details if isinstance(safe_details, dict) else {}
    error_category = str(details.get("errorCategory", "") or "").strip().lower()
    status_code = details.get("statusCode")
    issue_codes: list[str]
    guard_category: str
    if error_category and error_category != "local":
        synthetic = f"Provider request failed (category={error_category}"
        if status_code is not None:
            synthetic += f", HTTP {status_code}"
        synthetic += ")"
        guard_category, issue_codes = _classify_failed_attempt_diagnostic(synthetic)
        public_message = "Provider request failed; upstream content and reasoning were suppressed."
    elif "interrupted by user" in str(raw_message or "").casefold():
        guard_category = "local_validation"
        issue_codes = ["validation_rejected_unspecified"]
        public_message = "Round interrupted by user before processing the next chunk."
    else:
        guard_category, issue_codes = _classify_failed_attempt_diagnostic(raw_message)
        public_message = "Chunk processing failed; raw validation details were suppressed."
    projected_details = {
        key: details[key]
        for key in (
            "errorCategory",
            "statusCode",
            "retryable",
            "attempts",
            "cooldownSeconds",
            "retryAfterSeconds",
        )
        if key in details
    }
    projected_details.update(
        {
            "guardCategory": guard_category,
            "issueCodes": issue_codes,
            "errorStored": False,
            "reasoningSuppressed": True,
            "providerContentStored": False,
        }
    )
    return public_message, projected_details


def _save_round_checkpoint(
    checkpoint_path: Path,
    *,
    signature: dict[str, object],
    chunk_outputs: dict[str, str],
    validation_events: list[dict[str, object]] | None = None,
    last_error: str | None = None,
    last_error_details: dict[str, object] | None = None,
) -> None:
    safe_last_error, safe_last_error_details = _sanitize_checkpoint_error(
        last_error,
        last_error_details,
    )
    payload: dict[str, object] = {
        **signature,
        "completed_chunk_count": len(chunk_outputs),
        "chunk_outputs": chunk_outputs,
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    if validation_events is not None:
        payload["validation_events"] = _public_validation_events(validation_events)
    if safe_last_error:
        payload["last_error"] = safe_last_error
    if safe_last_error_details:
        payload["last_error_details"] = safe_last_error_details
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


_FAILED_ATTEMPT_ISSUE_ALIASES = {
    "academic_register_drift": "academic_register_stability",
    COLLOQUIAL_REGISTER_INTRODUCED: "academic_register_stability",
    ACADEMIC_COLLOCATION_CONFLICT_INTRODUCED: "academic_collocation_stability",
    PREDICATE_COMPLETENESS_REGRESSION: "predicate_completeness",
    TELEGRAPHIC_CLAUSE_CHAIN_INTRODUCED: "sentence_surface_stability",
    VAGUE_CAUSAL_REFERENCE_INTRODUCED: "factual_relation_preservation",
    "connector_density_increased": "machine_style_drift",
    "template_density_increased": "machine_style_drift",
    "template_phrase_drift": "machine_style_drift",
    "generic_closing_added": "machine_style_drift",
    "abstract_padding_increased": "machine_style_drift",
    "missing_sentence_terminal": "sentence_surface_stability",
    "trailing_weak_punctuation": "sentence_surface_stability",
    "trailing_sentence_fragment": "sentence_surface_stability",
    FACTUAL_SCOPE_QUALIFIER_CHANGED: FACTUAL_SCOPE_QUALIFIER_CHANGED,
}


def _normalize_failed_attempt_issue_codes(value: object) -> list[str]:
    raw_values = value if isinstance(value, (list, tuple, set, frozenset)) else []
    normalized: list[str] = []
    for raw_value in raw_values:
        code = str(raw_value or "").strip().lower()
        code = _FAILED_ATTEMPT_ISSUE_ALIASES.get(code, code)
        if code in FAILED_ATTEMPT_ISSUE_CODES and code not in normalized:
            normalized.append(code)
    return normalized


def _classify_failed_attempt_diagnostic(
    error: object,
    *,
    issue_codes: object = None,
    guard_category: object = None,
) -> tuple[str, list[str]]:
    """Map private exception prose onto one bounded, stable public taxonomy."""

    normalized_codes = _normalize_failed_attempt_issue_codes(issue_codes)
    requested_category = str(guard_category or "").strip().lower()
    if requested_category not in FAILED_ATTEMPT_GUARD_CATEGORIES:
        requested_category = ""
    if normalized_codes:
        inferred_category = requested_category
        if not inferred_category:
            first = normalized_codes[0]
            if first.startswith("provider_") or first == "reasoning_content_suppressed":
                inferred_category = "provider"
            elif first in {
                "structure_placeholder_preservation",
                "format_anchor_preservation",
                "paragraph_structure_preservation",
                "citation_preservation",
                "number_preservation",
                "term_preservation",
            }:
                inferred_category = "structure"
            elif first in {
                "factual_relation_preservation",
                "language_stability",
                FACTUAL_SCOPE_QUALIFIER_CHANGED,
            }:
                inferred_category = "factual"
            elif first in {
                "sentence_surface_stability",
                "academic_register_stability",
                "academic_collocation_stability",
                "predicate_completeness",
            }:
                inferred_category = "readability"
            elif first in {"machine_style_drift", "repetition_stability"}:
                inferred_category = "style"
            else:
                inferred_category = "local_validation"
        return inferred_category, normalized_codes

    message = str(error or "").strip().casefold()
    provider_category_match = re.search(r"category\s*=\s*([a-z_\-]+)", message)
    provider_category = provider_category_match.group(1) if provider_category_match else ""
    provider_status_match = re.search(r"\bhttp\s+(\d{3})\b", message)
    provider_status = int(provider_status_match.group(1)) if provider_status_match else None
    if provider_category or "provider request failed" in message or "upstream response" in message:
        if provider_category in {"auth", "authentication", "permission"} or provider_status in {401, 403}:
            return "provider", ["provider_auth"]
        if provider_category in {"rate_limit", "ratelimit"} or provider_status == 429:
            return "provider", ["provider_rate_limit"]
        if provider_category == "timeout" or provider_status in {408, 504}:
            return "provider", ["provider_timeout"]
        if provider_category in {"network", "connection"}:
            return "provider", ["provider_network"]
        if provider_category in {"server", "upstream"} or (provider_status is not None and provider_status >= 500):
            return "provider", ["provider_server"]
        if provider_category in {"client_configuration", "configuration"}:
            return "provider", ["provider_client_configuration"]
        return "provider", ["provider_failure"]

    if re.search(
        r"(?:<\s*/?\s*(?:think|thinking|reasoning|analysis|thought)\b|"
        r"reasoning[_ ]content|chain[_ ]of[_ ]thought|thinking[_ ]text)",
        message,
    ):
        return "provider", ["reasoning_content_suppressed"]

    rules: tuple[tuple[tuple[str, ...], str, str], ...] = (
        (("placeholder", "@@fyadr_", "structure token"), "structure", "structure_placeholder_preservation"),
        (("format-anchor", "format anchor", "格式锚点"), "structure", "format_anchor_preservation"),
        (("paragraph", "段落"), "structure", "paragraph_structure_preservation"),
        (("citation", "引用"), "structure", "citation_preservation"),
        (("number", "numeric", "数字", "数值"), "structure", "number_preservation"),
        (("required term", "protected term", "technical term", "术语"), "structure", "term_preservation"),
        (("language", "english", "chinese", "语言"), "factual", "language_stability"),
        (
            (FACTUAL_SCOPE_QUALIFIER_CHANGED, "scope qualifier", "范围限定词"),
            "factual",
            FACTUAL_SCOPE_QUALIFIER_CHANGED,
        ),
        (("factual", "relation", "binding", "order", "事实", "关系", "顺序"), "factual", "factual_relation_preservation"),
        (("repeated content", "repetition", "重复"), "style", "repetition_stability"),
        (("shrank", "expanded", "length", "ratio", "长度", "扩写", "压缩"), "local_validation", "length_stability"),
        (("sentence surface", "sentence fragment", "malformed sentence", "句子残缺"), "readability", "sentence_surface_stability"),
        (("academic_register", "colloquial", "conversational", "口语"), "readability", "academic_register_stability"),
        (("collocation", "搭配"), "readability", "academic_collocation_stability"),
        (("predicate", "谓语"), "readability", "predicate_completeness"),
        (("machine-like", "machine style", "template", "connector", "机械", "模板", "连接词"), "style", "machine_style_drift"),
        (("answer-style", "markdown", "disallowed", "wrapper"), "local_validation", "answer_style_rejected"),
        (("empty output", "returned empty", "空输出"), "local_validation", "empty_output"),
        (("timeout", "timed out"), "provider", "provider_timeout"),
        (("rate limit", "429"), "provider", "provider_rate_limit"),
        (("connection", "network"), "provider", "provider_network"),
    )
    for terms, category, code in rules:
        if any(term in message for term in terms):
            return requested_category or category, [code]
    return requested_category or "local_validation", ["validation_rejected_unspecified"]


def _coerce_failed_attempt_char_count(value: object, *, fallback: int = 0) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError, OverflowError):
        normalized = fallback
    return max(0, min(normalized, 2_000_000_000))


def _normalize_failed_attempt_evidence(value: object) -> dict[str, object] | None:
    """Migrate a legacy failed-attempt record to metadata-only evidence."""

    if not isinstance(value, dict):
        return None
    raw_output = value.get("outputText")
    output_text = str(raw_output or "").strip() if isinstance(raw_output, str) else ""
    output_char_count = _coerce_failed_attempt_char_count(
        value.get("outputCharCount"),
        fallback=len(output_text),
    )
    output_sha256 = _sha256_text(output_text) if output_text else ""
    if not output_sha256:
        declared_sha256 = str(value.get("outputTextSha256", "") or "").strip().lower()
        if re.fullmatch(r"[0-9a-f]{64}", declared_sha256):
            output_sha256 = declared_sha256
    guard_category, issue_codes = _classify_failed_attempt_diagnostic(
        value.get("error", ""),
        issue_codes=value.get("issueCodes"),
        guard_category=value.get("guardCategory"),
    )
    evidence: dict[str, object] = {
        "schema": FAILED_ATTEMPT_EVIDENCE_SCHEMA,
        "schemaVersion": FAILED_ATTEMPT_EVIDENCE_VERSION,
        "attempt": _bounded_evidence_int(value.get("attempt"), maximum=10_000),
        "outputCharCount": output_char_count,
        "outputTextSha256": output_sha256,
        "truncated": bool(value.get("truncated")) or len(output_text) > MAX_FAILED_OUTPUT_CHARS,
        "guardCategory": guard_category,
        "issueCodes": issue_codes,
        "textStored": False,
        "errorStored": False,
        "reasoningSuppressed": True,
        "providerContentStored": False,
    }
    return evidence


def _serialize_failed_output(
    text: str,
    *,
    error: object = "",
    issue_codes: object = None,
    guard_category: object = None,
) -> dict[str, object]:
    """Return failed-output identity and stable reasons without its body."""

    normalized_text = str(text or "").strip()
    return _normalize_failed_attempt_evidence(
        {
            "outputText": normalized_text,
            "outputCharCount": len(normalized_text),
            "truncated": len(normalized_text) > MAX_FAILED_OUTPUT_CHARS,
            "error": str(error or ""),
            "issueCodes": issue_codes,
            "guardCategory": guard_category,
        }
    ) or {}


def _sanitize_public_diagnostic_value(value: object) -> object:
    if isinstance(value, dict):
        return {
            str(key): _sanitize_public_diagnostic_value(item)
            for key, item in value.items()
            if str(key).strip().lower() not in FAILED_ATTEMPT_PUBLIC_FORBIDDEN_KEYS
        }
    if isinstance(value, list):
        return [_sanitize_public_diagnostic_value(item) for item in value]
    if isinstance(value, tuple):
        return [_sanitize_public_diagnostic_value(item) for item in value]
    return value


def _public_validation_event(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None
    event_name = str(value.get("event", "") or "")
    location: dict[str, object] = {
        "round": _bounded_evidence_int(value.get("round"), maximum=1_000),
        "chunkId": _public_chunk_id(value.get("chunkId")),
    }
    for key in ("paragraphIndex", "chunkIndex"):
        index = _bounded_evidence_int(value.get(key), maximum=10_000_000)
        if index is not None:
            location[key] = index
    if event_name == "validation-retry":
        evidence = _normalize_failed_attempt_evidence(value)
        if evidence is None:
            return None
        return {
            "event": event_name,
            **location,
            **evidence,
        }
    if event_name == "candidate-selection":
        return _public_candidate_selection_event(value)
    if event_name == "candidate-selection-retry":
        candidate = value.get("candidate")
        attempt = _bounded_evidence_int(value.get("attempt"), maximum=MAX_VALIDATION_ATTEMPTS)
        return {
            "event": event_name,
            "schema": CANDIDATE_SELECTION_SCHEMA if value.get("schema") == CANDIDATE_SELECTION_SCHEMA else "",
            "schemaVersion": CANDIDATE_SELECTION_VERSION if value.get("schemaVersion") == CANDIDATE_SELECTION_VERSION else 0,
            **location,
            "attempt": attempt,
            "reasonCodes": _public_code_list(
                value.get("reasonCodes"),
                CANDIDATE_PUBLIC_REASON_CODES,
                maximum=24,
            ),
            "candidate": _public_candidate_evidence(candidate) if isinstance(candidate, dict) else {},
        }
    if event_name == "source-fallback":
        guard_category, issue_codes = _classify_failed_attempt_diagnostic(
            value.get("error", ""),
            issue_codes=value.get("issueCodes"),
            guard_category=value.get("guardCategory"),
        )
        return {
            "event": event_name,
            **location,
            "reasonCode": "legacy_source_fallback",
            "attempts": _bounded_evidence_int(value.get("attempts"), maximum=MAX_VALIDATION_ATTEMPTS),
            "guardCategory": guard_category,
            "issueCodes": issue_codes,
            "textStored": False,
            "errorStored": False,
            "reasoningSuppressed": True,
            "providerContentStored": False,
        }
    if event_name == "chunk-frozen":
        return {
            "event": event_name,
            **location,
            "reasonCode": "structure_or_metadata_preserved",
        }
    if event_name in {
        "deterministic-burstiness-postprocess",
        "deterministic-burstiness-postprocess-skipped",
    }:
        projected: dict[str, object] = {
            "event": event_name,
            **location,
        }
        for key in (
            "splitCount",
            "burstinessBefore",
            "burstinessAfter",
            "connectorDensityBefore",
            "connectorDensityAfter",
            "structureConcentrationBefore",
            "structureConcentrationAfter",
        ):
            number = _bounded_evidence_number(value.get(key))
            if number is not None:
                projected[key] = number
        if event_name.endswith("-skipped"):
            reason_codes = _public_code_list(
                value.get("reasonCodes"),
                SOURCE_RELATIVE_BLOCKING_ISSUE_CODES,
                maximum=8,
            )
            projected["reasonCode"] = (
                "source_relative_style_delta_failed"
                if reason_codes
                else "combined_style_postprocess_rejected"
            )
            projected["reasonCodes"] = reason_codes
        return projected
    if event_name == "document-pattern-delta-arbitration":
        return {
            "event": event_name,
            **location,
            "decision": "baseline_preserved" if value.get("decision") == "baseline_preserved" else "invalid",
            "reasonCodes": _public_code_list(
                value.get("reasonCodes"),
                SOURCE_RELATIVE_BLOCKING_ISSUE_CODES,
                maximum=4,
            ),
            "documentDelta": _public_source_relative_document_delta(value.get("documentDelta")),
        }
    # Unknown historical diagnostics are not trusted merely because their
    # keys avoid a blacklist.  Preserve only a bounded event code and location
    # so a future migration can identify the family without retaining payload.
    safe_event_code = event_name if re.fullmatch(r"[a-z][a-z0-9-]{0,95}", event_name) else "unknown-diagnostic-event"
    return {
        "event": safe_event_code,
        **location,
        "payloadStored": False,
    }


def _public_validation_events(values: object) -> list[dict[str, object]]:
    if not isinstance(values, list):
        return []
    projected: list[dict[str, object]] = []
    for value in values:
        event = _public_validation_event(value)
        if event is not None:
            projected.append(event)
    return projected


def _collect_adjacent_overlap_pairs(manifest: ChunkManifest, chunk_outputs: dict[str, str]) -> list[dict[str, object]]:
    pairs: list[dict[str, object]] = []
    chunks = list(manifest.chunks)
    for right_index, right_chunk in enumerate(chunks):
        right_output = str(chunk_outputs.get(right_chunk.chunk_id, "") or "")
        if not right_output.strip():
            continue
        left_start = max(0, right_index - ADJACENT_OVERLAP_WINDOW)
        for left_chunk in chunks[left_start:right_index]:
            if left_chunk.paragraph_index == right_chunk.paragraph_index:
                continue
            if abs(int(left_chunk.paragraph_index) - int(right_chunk.paragraph_index)) > 1:
                continue
            left_output = str(chunk_outputs.get(left_chunk.chunk_id, "") or "")
            if not left_output.strip():
                continue
            output_score, overlap_terms, left_terms, right_terms = _content_overlap_score(left_output, right_output)
            if output_score < ADJACENT_OVERLAP_SCORE_THRESHOLD:
                continue
            source_score, _, _, _ = _content_overlap_score(str(left_chunk.text), str(right_chunk.text))
            pairs.append(
                {
                    "leftChunkId": left_chunk.chunk_id,
                    "rightChunkId": right_chunk.chunk_id,
                    "leftParagraphIndex": left_chunk.paragraph_index,
                    "rightParagraphIndex": right_chunk.paragraph_index,
                    "outputOverlapScore": round(output_score, 3),
                    "sourceOverlapScore": round(source_score, 3),
                    "sourceAlreadyOverlapped": source_score >= ADJACENT_OVERLAP_SCORE_THRESHOLD,
                    "overlapTerms": overlap_terms[:12],
                    "leftTermCount": left_terms,
                    "rightTermCount": right_terms,
                    "leftSample": _sample_for_validation(left_output),
                    "rightSample": _sample_for_validation(right_output),
                }
            )
            break
    return pairs[:24]


def _append_unique_quality_list(quality: dict[str, object], key: str, value: object) -> None:
    items = list(quality.get(key) or [])
    if value not in items:
        items.append(value)
    quality[key] = items


def _mark_adjacent_overlap_quality(chunk_payload: dict[str, object], issue: dict[str, object]) -> None:
    quality = chunk_payload.get("quality")
    if not isinstance(quality, dict):
        quality = {}
        chunk_payload["quality"] = quality
    flag = "adjacent_semantic_overlap"
    _append_unique_quality_list(quality, "flags", flag)
    _append_unique_quality_list(
        quality,
        "rewriteAdvice",
        "Review the neighboring paragraph overlap; rerun or manually keep only the paragraph that should carry this claim.",
    )
    review_reasons = list(quality.get("reviewReasons") or [])
    review_reasons.append(
        {
            "code": flag,
            "level": "high" if not issue.get("sourceAlreadyOverlapped") else "medium",
            "message": "Adjacent paragraph or chunk has highly similar content.",
            "evidence": issue,
        }
    )
    quality["reviewReasons"] = review_reasons
    quality["needsReview"] = True


def _annotate_adjacent_overlap_quality(
    compare_chunks: list[dict[str, object]],
    adjacent_pairs: list[dict[str, object]],
) -> None:
    chunks_by_id = {str(chunk.get("chunkId")): chunk for chunk in compare_chunks}
    for issue in adjacent_pairs:
        for key in ("leftChunkId", "rightChunkId"):
            chunk = chunks_by_id.get(str(issue.get(key, "")))
            if chunk is not None:
                _mark_adjacent_overlap_quality(chunk, issue)


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
    input_provenance: dict[str, str] | None = None,
) -> dict[str, object]:
    public_validation_events = _public_validation_events(validation_events)
    compare_chunks: list[dict[str, object]] = []
    source_fallback_events = {
        str(event.get("chunkId")): event
        for event in public_validation_events
        if event.get("event") == "source-fallback" and event.get("chunkId")
    }
    candidate_selection_events = {
        str(event.get("chunkId")): event
        for event in public_validation_events
        if event.get("event") == "candidate-selection" and event.get("chunkId")
    }
    failed_attempt_events: dict[str, list[dict[str, object]]] = {}
    for event in public_validation_events:
        if event.get("event") != "validation-retry" or not event.get("chunkId"):
            continue
        failed_attempt = _normalize_failed_attempt_evidence(event)
        if failed_attempt is None:
            continue
        failed_attempt_events.setdefault(str(event.get("chunkId")), []).append(failed_attempt)
    round_dimension = resolve_round_dimension(prompt_profile, round_number, prompt_sequence)
    for chunk in manifest.chunks:
        output_text = chunk_outputs.get(chunk.chunk_id, "")
        quality = _build_chunk_quality(chunk.text, output_text, round_dimension=round_dimension)
        fallback_event = source_fallback_events.get(chunk.chunk_id)
        selection_event = candidate_selection_events.get(chunk.chunk_id)
        if selection_event is not None:
            quality = _apply_candidate_selection_quality(quality, selection_event)
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
                    "fallbackIssueCodes": list(fallback_event.get("issueCodes") or []),
                    "fallbackGuardCategory": fallback_event.get("guardCategory", "local_validation"),
                    "fallbackErrorStored": False,
                    "fallbackAttempts": fallback_event.get("attempts", MAX_VALIDATION_ATTEMPTS),
                    "fallbackAt": fallback_event.get("createdAt", ""),
                }
            )
        failed_attempts = failed_attempt_events.get(chunk.chunk_id)
        if failed_attempts:
            chunk_payload["failedAttempts"] = failed_attempts[-4:]
        if selection_event is not None:
            chunk_payload["candidateSelection"] = selection_event
            # The selector may later run against review-materialized text that
            # differs from frozen inputText.  Persist its exact authoritative
            # baseline outside the text-free evidence so release can recompute
            # the bound delta instead of guessing from the original chunk.
            chunk_payload["candidateBaselineText"] = chunk.text.strip()
        compare_chunks.append(chunk_payload)

    adjacent_overlap_pairs = _collect_adjacent_overlap_pairs(manifest, chunk_outputs)
    _annotate_adjacent_overlap_quality(compare_chunks, adjacent_overlap_pairs)
    enriched_quality_summary = dict(quality_summary)
    enriched_quality_summary["adjacentOverlapCount"] = len(adjacent_overlap_pairs)
    enriched_quality_summary["adjacentOverlapPairs"] = adjacent_overlap_pairs[:12]

    payload: dict[str, object] = {
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
        "validationEvents": public_validation_events,
        "qualitySummary": enriched_quality_summary,
        "chunks": compare_chunks,
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    pattern_profile = (
        (quality_summary.get("globalStyleProfile") or {}).get("documentPatternBaseline")
        if isinstance(quality_summary.get("globalStyleProfile"), dict)
        else None
    )
    if isinstance(pattern_profile, dict):
        profile_sha256 = str(pattern_profile.get("profileSha256", "") or "")
        if profile_sha256:
            payload["sourcePatternProfiles"] = {profile_sha256: pattern_profile}
    document_delta = quality_summary.get("sourceRelativeDocumentDelta")
    if isinstance(document_delta, dict):
        payload["sourceRelativeDocumentDelta"] = document_delta
    if input_provenance:
        payload.update(input_provenance)
    return payload


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
    input_provenance: dict[str, str] | None = None,
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
        input_provenance=input_provenance,
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


def _percentile(values: list[int], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    position = max(0.0, min(1.0, percentile)) * (len(ordered) - 1)
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def _sentence_length_stats(text: str) -> dict[str, object]:
    sentences = _split_sentences_for_quality(text)
    lengths = [len(sentence) for sentence in sentences if sentence]
    if not lengths:
        return {
            "count": 0,
            "avg": 0,
            "min": 0,
            "max": 0,
            "variance": 0,
            "variationCoefficient": 0,
            "p10": 0,
            "p90": 0,
            "shortSentenceCount": 0,
            "shortSentenceRate": 0,
        }
    avg = sum(lengths) / len(lengths)
    variance = sum((length - avg) ** 2 for length in lengths) / len(lengths)
    p10 = _percentile(lengths, 0.10)
    p90 = _percentile(lengths, 0.90)
    short_sentence_count = sum(1 for length in lengths if length <= 6)
    return {
        "count": len(lengths),
        "avg": round(avg, 2),
        "min": min(lengths),
        "max": max(lengths),
        "variance": round(variance, 2),
        "variationCoefficient": round((variance ** 0.5) / max(avg, 1.0), 4),
        "p10": round(p10, 2),
        "p90": round(p90, 2),
        "shortSentenceCount": short_sentence_count,
        "shortSentenceRate": round(short_sentence_count / len(lengths), 4),
    }


def _paragraph_length_stats(text: str) -> dict[str, object]:
    """Paragraph-length CV and adjacent-length uniformity (advisory only).

    Adjacent paragraphs of nearly equal length are a first-class structural tell
    in academic detectors.  Metrics are computed on blank-line-separated natural
    paragraphs; n<2 returns zeros so single-paragraph chunks stay silent.
    """
    paragraphs = _split_contract_paragraphs(text)
    # Prefer compact char length so internal line wraps do not inflate variance.
    lengths = [len(re.sub(r"\s+", "", paragraph)) for paragraph in paragraphs if paragraph]
    if len(lengths) < 2:
        return {
            "count": len(lengths),
            "lengths": lengths,
            "avg": float(lengths[0]) if lengths else 0.0,
            "min": lengths[0] if lengths else 0,
            "max": lengths[0] if lengths else 0,
            "variationCoefficient": 0.0,
            "adjacentParagraphUniformity": 0.0,
        }
    avg = sum(lengths) / len(lengths)
    variance = sum((length - avg) ** 2 for length in lengths) / len(lengths)
    cv = (variance ** 0.5) / max(avg, 1.0)
    pair_ratios: list[float] = []
    for left, right in zip(lengths, lengths[1:]):
        pair_max = max(left, right, 1)
        pair_ratios.append(min(left, right) / pair_max)
    adjacent_uniformity = sum(pair_ratios) / len(pair_ratios)
    return {
        "count": len(lengths),
        "lengths": lengths,
        "avg": round(avg, 2),
        "min": min(lengths),
        "max": max(lengths),
        "variationCoefficient": round(cv, 4),
        "adjacentParagraphUniformity": round(adjacent_uniformity, 4),
    }


def _assess_machine_like_risks(
    text: str,
    metrics: dict[str, object] | None = None,
) -> list[dict[str, object]]:
    compact = re.sub(r"\s+", "", text)
    risks: list[dict[str, object]] = []
    if not compact:
        return risks

    metrics = metrics if isinstance(metrics, dict) else _style_risk_metrics(text)
    closing_count = int(metrics.get("closingCount", 0) or 0)
    sentence_stats = metrics.get("sentenceStats") if isinstance(metrics.get("sentenceStats"), dict) else _sentence_length_stats(text)
    sentence_count = int(metrics.get("sentenceCount", 0) or 0)
    connector_density = float(metrics.get("connectorDensity", 0) or 0)
    template_density = float(metrics.get("templateDensity", 0) or 0)
    burst_density = float(metrics.get("burstConnectorDensity", 0) or 0)
    padding_density = float(metrics.get("abstractPaddingDensity", 0) or 0)

    if connector_density >= CONNECTOR_DENSITY_RISK_THRESHOLD:
        risks.append({
            "code": "connector_overuse",
            "level": "high" if connector_density >= CONNECTOR_DENSITY_HIGH_RISK_THRESHOLD else "medium",
            "message": "连接词密度偏高，容易形成模板化论文腔。",
        })
    if template_density >= 0.18:
        risks.append({
            "code": "template_phrase_density",
            "level": "high",
            "message": "高频模板句式偏多，建议局部重写。",
        })
    if closing_count >= 1:
        risks.append({
            "code": "generic_closing_phrase",
            "level": "high" if closing_count >= 2 or sentence_count <= 3 else "medium",
            "message": "泛化总结句偏明显，建议改成贴合段落内容的表达。",
        })
    if padding_density >= 0.22:
        risks.append({
            "code": "abstract_padding_density",
            "level": "high",
            "message": "空泛学术填充语偏多，容易抬高 AI 痕迹。",
        })
    if (
        burst_density >= MECHANICAL_BURST_DENSITY_THRESHOLD
        and connector_density >= MECHANICAL_BURST_CONNECTOR_FLOOR
    ):
        risks.append({
            "code": "mechanical_burst_pattern",
            "level": "medium",
            "message": "连接词爆发模式明显，句间推进过于机械。",
        })
    # Readability/register advisories only; neither is an authorship test.
    passive_density = float(metrics.get("passiveDensity", 0) or 0)
    if sentence_count >= 2 and passive_density >= 0.4:
        risks.append({
            "code": "passive_voice_overuse",
            "level": "high" if passive_density >= 0.7 else "medium",
            "message": "被动句式连续出现较多，可检查其中是否存在不必要的同构表达；语义需要时应保留被动句。",
        })
    chengyu_density = float(metrics.get("chengyuDensity", 0) or 0)
    if sentence_count >= 2 and chengyu_density >= 0.4:
        risks.append({
            "code": "chengyu_density_high",
            "level": "medium",
            "message": "四字套语 / 文言公式偏密，可将不承载信息的部分改为具体表述。",
        })
    # Nested numbered-list density and colon-semicolon parallel templates are
    # machine-like *scaffolds*, not authorship proof.  Advisory only.
    nested_number_count = int(metrics.get("nestedNumberCount", 0) or 0)
    nested_number_density = float(metrics.get("nestedNumberDensity", 0) or 0)
    if sentence_count >= 2 and nested_number_count >= 3 and nested_number_density >= 0.45:
        risks.append({
            "code": "nested_number_scaffold",
            "level": "medium",
            "message": "嵌套编号列表（如（1）（2）（3）或 (1)(2)(3)）偏密，易呈机械枚举脚手架；若为原文已有学术枚举则应保留。",
        })
    colon_parallel_count = int(metrics.get("colonParallelCount", 0) or 0)
    colon_parallel_density = float(metrics.get("colonParallelDensity", 0) or 0)
    if colon_parallel_count >= 1 and (colon_parallel_density >= 0.2 or colon_parallel_count >= 2):
        risks.append({
            "code": "colon_parallel_scaffold",
            "level": "medium",
            "message": "出现“X：A；B；C”式冒号—分号并列模板，宜改为连贯陈述或仅保留原文已有的并列结构。",
        })
    sentence_variation = float(metrics.get("sentenceLengthVariation", 0) or 0)
    if sentence_count >= 6 and sentence_variation < 0.13:
        risks.append({
            "code": "low_burstiness_ratio",
            "level": "medium",
            "message": "连续多句的长度过于接近，可检查是否存在重复句模；不建议为追求数值而硬拆短句。",
        })
    short_sentence_count = int(metrics.get("shortSentenceCount", 0) or 0)
    short_sentence_rate = float(metrics.get("shortSentenceRate", 0) or 0)
    if sentence_count >= 5 and short_sentence_count >= 2 and short_sentence_rate >= 0.25:
        risks.append({
            "code": "sentence_fragment_gaming",
            "level": "medium",
            "message": "过短句较密，可能是为刻意拉开句长而产生的碎片；应以完整语义单元为准。",
        })

    # Structure classification remains a coarse advisory for repeated surface
    # frames.  It must never imply that passive voice or stacked "的" modifiers
    # are intrinsically more human; those constructions can reduce clarity.
    structure_concentration = float(metrics.get("structureConcentration", 0) or 0)
    dominant_type = str(metrics.get("dominantStructureType", "") or "")
    structure_total = int(metrics.get("structureTypeTotal", 0) or 0)
    if structure_total >= 8 and dominant_type in ("plain_active", "enumerative") and structure_concentration >= 0.9:
        risks.append({
            "code": "structure_template_concentration",
            "level": "medium",
            "message": "连续多句采用相同的表层起句和陈述框架，可在不改变逻辑的前提下局部调整；无需强行改成被动句或长定语。",
        })
    # Adjacent-paragraph length symmetry is advisory only and orthogonal to
    # sentence-level burstiness.  Never suggest merging or splitting paragraphs.
    paragraph_count = int(metrics.get("paragraphCount", 0) or 0)
    paragraph_length_cv = float(metrics.get("paragraphLengthCv", 0) or 0)
    adjacent_paragraph_uniformity = float(metrics.get("adjacentParagraphUniformity", 0) or 0)
    if (
        paragraph_count >= 3
        and paragraph_length_cv < 0.12
        and adjacent_paragraph_uniformity >= 0.85
    ):
        risks.append({
            "code": "paragraph_length_symmetry",
            "level": "medium",
            "message": "相邻自然段长度过于整齐，可在段内调整信息密度与句长；不要合并、拆分或重排自然段。",
        })
    return risks


def resolve_round_dimension(
    prompt_profile: str | None,
    round_number: int,
    prompt_sequence: object | None = None,
) -> dict[str, str]:
    """解析某轮的扰动维度元数据。失败时返回 neutral，绝不阻断流程。"""
    try:
        return get_round_dimension(prompt_profile, round_number, prompt_sequence)
    except (ValueError, KeyError):
        return {"promptId": "", "id": "neutral", "label": "", "description": "", "primaryMetric": ""}


# Structure OOD dual-check under sentence_structure.  Thresholds intentionally
# match the advisory risk (long sample + high concentration of plain/enumerative
# frames).  They only steer rerun guidance — never hard validation.
STRUCTURE_DIRECTION_MIN_SENTENCES = 8
STRUCTURE_DIRECTION_CONCENTRATION = 0.85
STRUCTURE_DIRECTION_DOMINANT_TYPES = frozenset({"plain_active", "enumerative"})


def _structure_direction_from_metrics(metrics: dict[str, object]) -> dict[str, object]:
    """Build structureDirection sub-signal from style metrics.

    effective=False only on long samples still concentrated in plain_active /
    enumerative frames.  Short samples and already-dispersed samples stay
    effective so the dual-check does not thrash natural prose.
    """
    concentration = float(metrics.get("structureConcentration", 0) or 0)
    dominant = str(metrics.get("dominantStructureType", "") or "")
    total = int(metrics.get("structureTypeTotal", 0) or metrics.get("sentenceCount", 0) or 0)
    applicable = (
        total >= STRUCTURE_DIRECTION_MIN_SENTENCES
        and dominant in STRUCTURE_DIRECTION_DOMINANT_TYPES
    )
    effective = True
    if applicable and concentration >= STRUCTURE_DIRECTION_CONCENTRATION:
        effective = False
    return {
        "primaryMetric": "structureConcentration",
        "concentration": round(concentration, 3),
        "dominantType": dominant,
        "total": total,
        "applicable": applicable,
        "effective": effective,
    }


def _attach_structure_direction(
    result: dict[str, object],
    *,
    dimension_id: str,
    output_metrics: dict[str, object],
) -> dict[str, object]:
    """Dual-check: under sentence_structure, structureConcentration can fail the
    pass even when burstiness already looks fine.

    Guidance only asks for local subject/opening diversification — never passive
    voice, stacked 的-chains, or type quotas.
    """
    if dimension_id != "sentence_structure":
        return result
    structure_direction = _structure_direction_from_metrics(output_metrics)
    result = {**result, "structureDirection": structure_direction}
    if structure_direction.get("effective", True):
        return result
    # Structure sub-signal not effective: force dimension_direction_not_effective
    # so targeted-rerun can inject structure-diversify guidance.
    structure_note = (
        "连续多句表层框架仍高度集中；请局部调整重复主语与开句切入点，"
        "不要为分散结构类型强塞被动句、长“的”定语或额外从句。"
    )
    rhythm_ok = bool(result.get("ok", True))
    # Keep rhythm note if rhythm itself already failed; otherwise replace with
    # structure-specific guidance so the rerun loop steers at the real gap.
    if rhythm_ok:
        result["note"] = structure_note
        result["direction"] = "diversify_surface_frames"
    else:
        existing = str(result.get("note", "") or "").strip()
        result["note"] = f"{existing} {structure_note}".strip() if existing else structure_note
    result["ok"] = False
    result["satisfied"] = False
    result["secondaryMetric"] = "structureConcentration"
    return result


def _transition_dimension_risk_codes(metrics: dict[str, object]) -> set[str]:
    """Return the exact RateAudit transition risks represented by metrics."""

    connector_density = float(metrics.get("connectorDensity", 0) or 0)
    burst_density = float(metrics.get("burstConnectorDensity", 0) or 0)
    risks: set[str] = set()
    if connector_density >= CONNECTOR_DENSITY_RISK_THRESHOLD:
        risks.add("connector_overuse")
    if (
        burst_density >= MECHANICAL_BURST_DENSITY_THRESHOLD
        and connector_density >= MECHANICAL_BURST_CONNECTOR_FLOOR
    ):
        risks.add("mechanical_burst_pattern")
    return risks


def _template_dimension_risk_codes(metrics: dict[str, object]) -> set[str]:
    """Return the exact RateAudit template-dimension risks for one metric set."""

    risks: set[str] = set()
    sentence_count = int(metrics.get("sentenceCount", 0) or 0)
    if float(metrics.get("templateDensity", 0) or 0) >= 0.18:
        risks.add("template_phrase_density")
    if int(metrics.get("closingCount", 0) or 0) >= 1:
        risks.add("generic_closing_phrase")
    if float(metrics.get("abstractPaddingDensity", 0) or 0) >= 0.22:
        risks.add("abstract_padding_density")
    if sentence_count >= 2 and float(metrics.get("chengyuDensity", 0) or 0) >= 0.4:
        risks.add("chengyu_density_high")
    return risks


def _assess_dimension_direction(
    input_text: str,
    output_text: str,
    dimension: dict[str, object] | None,
) -> dict[str, object]:
    """Advisory input/output direction check for the active editing pass.

    The comparison is intentionally relative to the source.  It does not claim
    to identify authorship, and it must not reward metric hacks such as adding
    a meaningless two-character sentence.  Hard validation is reserved for
    factual/format integrity; this result only supplies rerun guidance.

    Under sentence_structure (primaryMetric=burstinessRatio), structureConcentration
    is dual-checked as a sub-signal: long plain_active/enumerative concentration
    (>=0.85 on >=8 sentences) fails the pass even when rhythm already looks fine.
    """
    if not dimension:
        return {"dimensionId": "neutral", "direction": "n/a", "ok": True, "note": "no dimension bound"}
    dimension_id = str(dimension.get("id", "neutral"))
    primary_metric = str(dimension.get("primaryMetric", ""))
    if dimension_id in ("neutral", "structure_warmup") or not primary_metric:
        return {"dimensionId": dimension_id, "direction": "n/a", "ok": True, "note": "warmup/neutral dimension, no enforced direction"}
    if max(len(input_text.strip()), len(output_text.strip())) < STYLE_VALIDATION_MIN_CHARS:
        return {"dimensionId": dimension_id, "direction": "skip", "ok": True, "note": "chunk too short to assess direction"}

    input_metrics = _style_risk_metrics(input_text)
    output_metrics = _style_risk_metrics(output_text)
    if int(output_metrics.get("sentenceCount", 0) or 0) < 2:
        return {"dimensionId": dimension_id, "direction": "skip", "ok": True, "note": "fewer than 2 sentences"}

    if primary_metric == "burstinessRatio":
        before = float(input_metrics.get("burstinessRatio", 0) or 0)
        after = float(output_metrics.get("burstinessRatio", 0) or 0)
        before_variation = float(input_metrics.get("sentenceLengthVariation", 0) or 0)
        after_variation = float(output_metrics.get("sentenceLengthVariation", 0) or 0)
        input_sentence_count = int(input_metrics.get("sentenceCount", 0) or 0)
        output_sentence_count = int(output_metrics.get("sentenceCount", 0) or 0)
        before_short = int(input_metrics.get("shortSentenceCount", 0) or 0)
        after_short = int(output_metrics.get("shortSentenceCount", 0) or 0)
        before_opening = float(input_metrics.get("sentenceOpeningConcentration", 0) or 0)
        after_opening = float(output_metrics.get("sentenceOpeningConcentration", 0) or 0)

        if min(input_sentence_count, output_sentence_count) < 5:
            result = {
                "dimensionId": dimension_id,
                "direction": "skip",
                "primaryMetric": "burstinessRatio",
                "before": round(before, 2),
                "after": round(after, 2),
                "variationBefore": round(before_variation, 3),
                "variationAfter": round(after_variation, 3),
                "ok": True,
                "satisfied": True,
                "note": "句子数量不足，句长统计不稳定；不据此要求重写。",
            }
            return _attach_structure_direction(
                result, dimension_id=dimension_id, output_metrics=output_metrics
            )

        introduced_fragments = after_short > before_short and after_short >= 2
        source_already_varied = before_variation >= 0.20
        source_has_repeated_frame = before_opening >= 0.45
        if source_already_varied:
            regressed = after_variation < max(0.12, before_variation - 0.10)
            ok = not regressed and not introduced_fragments
            note = ""
            if introduced_fragments:
                note = "输出新增了多个过短碎句；请恢复完整语义单元，不要用短句投机句长指标。"
            elif regressed:
                note = "原文已有自然长短变化，输出却明显趋于等长；仅调整重复句模，不要机械拆句。"
            result = {
                "dimensionId": dimension_id,
                "direction": "preserve_natural_rhythm",
                "primaryMetric": "burstinessRatio",
                "before": round(before, 2),
                "after": round(after, 2),
                "variationBefore": round(before_variation, 3),
                "variationAfter": round(after_variation, 3),
                "openingConcentrationBefore": round(before_opening, 3),
                "openingConcentrationAfter": round(after_opening, 3),
                "ok": ok,
                "satisfied": ok,
                "note": note or "原文已有自然句长变化，保持即可。",
            }
            return _attach_structure_direction(
                result, dimension_id=dimension_id, output_metrics=output_metrics
            )

        if not source_has_repeated_frame and not introduced_fragments:
            result = {
                "dimensionId": dimension_id,
                "direction": "preserve_natural_rhythm",
                "primaryMetric": "burstinessRatio",
                "before": round(before, 2),
                "after": round(after, 2),
                "variationBefore": round(before_variation, 3),
                "variationAfter": round(after_variation, 3),
                "openingConcentrationBefore": round(before_opening, 3),
                "openingConcentrationAfter": round(after_opening, 3),
                "ok": True,
                "satisfied": True,
                "note": "句长虽接近，但开句与语义结构并不重复；不根据单一长度统计要求重写。",
            }
            return _attach_structure_direction(
                result, dimension_id=dimension_id, output_metrics=output_metrics
            )

        improved = (
            after_variation >= before_variation + 0.05
            or after_variation >= 0.18
            or after_opening <= max(0.30, before_opening - 0.15)
        )
        ok = improved and not introduced_fragments
        if introduced_fragments:
            note = "输出用多个过短碎句拉开了统计值，未形成自然节奏；请合并碎片并按语义边界调整句式。"
        elif not improved:
            note = "连续句式仍较整齐；可局部调整重复开句或合并/拆分完整分句，但不要强造短句。"
        else:
            note = ""
        result = {
            "dimensionId": dimension_id,
            "direction": "increase_natural_variation",
            "primaryMetric": "burstinessRatio",
            "before": round(before, 2),
            "after": round(after, 2),
            "variationBefore": round(before_variation, 3),
            "variationAfter": round(after_variation, 3),
            "openingConcentrationBefore": round(before_opening, 3),
            "openingConcentrationAfter": round(after_opening, 3),
            "ok": ok,
            "satisfied": False,
            "note": note,
        }
        return _attach_structure_direction(
            result, dimension_id=dimension_id, output_metrics=output_metrics
        )
    if primary_metric == "connectorDensity":
        before = float(input_metrics.get("connectorDensity", 0) or 0)
        after = float(output_metrics.get("connectorDensity", 0) or 0)
        before_burst = float(input_metrics.get("burstConnectorDensity", 0) or 0)
        after_burst = float(output_metrics.get("burstConnectorDensity", 0) or 0)
        before_risks = _transition_dimension_risk_codes(input_metrics)
        after_risks = _transition_dimension_risk_codes(output_metrics)
        base_payload = {
            "dimensionId": dimension_id,
            "direction": "decrease_connector_density",
            "primaryMetric": "connectorDensity",
            "secondaryMetric": "burstConnectorDensity",
            "before": round(before, 4),
            "after": round(after, 4),
            "burstBefore": round(before_burst, 4),
            "burstAfter": round(after_burst, 4),
            "riskCodesBefore": sorted(before_risks),
            "riskCodesAfter": sorted(after_risks),
        }

        # Already below the SAME thresholds used by RateAudit: no rewrite is
        # needed.  In particular, 0.40 is not "low" because it is the public
        # connector_overuse threshold.
        if not before_risks and not after_risks:
            return {
                **base_payload,
                "ok": True,
                "satisfied": True,
                "note": "输入与输出的公式化连接词密度都较低，无需为该指标改写。",
            }

        if before_risks and not after_risks:
            return {
                **base_payload,
                "ok": True,
                "satisfied": True,
                "note": "公式化连接词与成组推进信号已降到诊断阈值以下。",
            }

        if not before_risks and after_risks:
            return {
                **base_payload,
                "ok": False,
                "satisfied": False,
                "note": "输出新增了公式化连接词风险；仅删除不承担逻辑作用的部分，并保留必要的因果、转折和条件标记。",
            }

        connector_improved = after <= before - DIMENSION_DENSITY_MIN_IMPROVEMENT
        burst_improved = (
            "mechanical_burst_pattern" in before_risks
            and after_burst <= before_burst - DIMENSION_DENSITY_MIN_IMPROVEMENT
        )
        introduced_risks = after_risks - before_risks
        connector_regressed = (
            after > before + DIMENSION_DENSITY_MAX_REGRESSION
            and bool(before_risks | after_risks)
        )
        burst_regressed = (
            after_burst > before_burst + DIMENSION_DENSITY_MAX_REGRESSION
            and "mechanical_burst_pattern" in (before_risks | after_risks)
        )
        ok = bool(
            (connector_improved or burst_improved)
            and not introduced_risks
            and not connector_regressed
            and not burst_regressed
        )
        return {
            **base_payload,
            "ok": ok,
            "satisfied": False,
            "note": (
                "连接词维度已出现可测量下降，但仍需保留必要逻辑标记。"
                if ok
                else "连接词维度没有出现可测量改善；仅删除冗余公式化过渡语，不要改写真实逻辑关系。"
            ),
        }
    if primary_metric == "templateDensity":
        before_template = float(input_metrics.get("templateDensity", 0) or 0)
        after_template = float(output_metrics.get("templateDensity", 0) or 0)
        before_padding = float(input_metrics.get("abstractPaddingDensity", 0) or 0)
        after_padding = float(output_metrics.get("abstractPaddingDensity", 0) or 0)
        before_chengyu = float(input_metrics.get("chengyuDensity", 0) or 0)
        after_chengyu = float(output_metrics.get("chengyuDensity", 0) or 0)
        before_closing = int(input_metrics.get("closingCount", 0) or 0)
        after_closing = int(output_metrics.get("closingCount", 0) or 0)
        before_risks = _template_dimension_risk_codes(input_metrics)
        after_risks = _template_dimension_risk_codes(output_metrics)
        base_payload = {
            "dimensionId": dimension_id,
            "direction": "decrease_template_expression_risk",
            "primaryMetric": "templateDensity",
            "secondaryMetric": "abstractPaddingDensity",
            "before": round(before_template, 4),
            "after": round(after_template, 4),
            "paddingBefore": round(before_padding, 4),
            "paddingAfter": round(after_padding, 4),
            "closingBefore": before_closing,
            "closingAfter": after_closing,
            "chengyuBefore": round(before_chengyu, 4),
            "chengyuAfter": round(after_chengyu, 4),
            "riskCodesBefore": sorted(before_risks),
            "riskCodesAfter": sorted(after_risks),
        }

        if not before_risks and not after_risks:
            return {
                **base_payload,
                "ok": True,
                "satisfied": True,
                "note": "输入与输出均未达到模板与空泛表达阈值，无需为该维度改写。",
            }
        if before_risks and not after_risks:
            return {
                **base_payload,
                "ok": True,
                "satisfied": True,
                "note": "模板句、泛化收束和空泛填充信号已降到同维度诊断阈值以下。",
            }
        if not before_risks and after_risks:
            return {
                **base_payload,
                "ok": False,
                "satisfied": False,
                "note": "输出新增了模板或空泛表达风险；请恢复具体陈述，不要新增背景、意义或总结。",
            }

        introduced_risks = after_risks - before_risks
        removed_risks = before_risks - after_risks
        improved = bool(
            removed_risks
            or after_template <= before_template - DIMENSION_DENSITY_MIN_IMPROVEMENT
            or after_padding <= before_padding - DIMENSION_DENSITY_MIN_IMPROVEMENT
            or after_chengyu <= before_chengyu - DIMENSION_DENSITY_MIN_IMPROVEMENT
            or after_closing < before_closing
        )
        regressed = bool(
            after_template > before_template + DIMENSION_DENSITY_MAX_REGRESSION
            or after_padding > before_padding + DIMENSION_DENSITY_MAX_REGRESSION
            or after_chengyu > before_chengyu + DIMENSION_DENSITY_MAX_REGRESSION
            or after_closing > before_closing
        )
        ok = bool(improved and not introduced_risks and not regressed)
        return {
            **base_payload,
            "ok": ok,
            "satisfied": False,
            "note": (
                "模板与空泛表达维度已出现可测量下降，且未引入新的同类风险。"
                if ok
                else "模板与空泛表达没有出现可靠改善；只处理命中的套话、空泛判断和泛化收束，不要顺带重写其他内容。"
            ),
        }
    if primary_metric == "structureConcentration":
        # Optional direct binding (dual-check path under sentence_structure is the
        # production default via secondaryMetric + _attach_structure_direction).
        structure_direction = _structure_direction_from_metrics(output_metrics)
        effective = bool(structure_direction.get("effective", True))
        note = (
            ""
            if effective
            else (
                "连续多句表层框架仍高度集中；请局部调整重复主语与开句切入点，"
                "不要为分散结构类型强塞被动句、长“的”定语或额外从句。"
            )
        )
        return {
            "dimensionId": dimension_id,
            "direction": "diversify_surface_frames" if not effective else "preserve_surface_frames",
            "primaryMetric": "structureConcentration",
            "before": round(float(input_metrics.get("structureConcentration", 0) or 0), 3),
            "after": structure_direction.get("concentration", 0.0),
            "ok": effective,
            "satisfied": effective,
            "note": note or "表层框架集中度可接受，无需为该指标改写。",
            "structureDirection": structure_direction,
        }
    return {"dimensionId": dimension_id, "direction": "n/a", "ok": True, "satisfied": False, "note": "unrecognized primary metric"}


def _build_chunk_quality(
    input_text: str,
    output_text: str,
    *,
    round_dimension: dict[str, object] | None = None,
) -> dict[str, object]:
    input_len = max(len(input_text), 1)
    output_len = len(output_text)
    expansion_ratio = round(output_len / input_len, 3)
    input_citations = _extract_citations(input_text)
    output_citations = _extract_citations(output_text)
    protected = protect_structure_tokens(input_text)
    missing_citations = sorted(input_citations - output_citations)
    risks = _assess_machine_like_risks(output_text)
    style_metrics = _style_risk_metrics(output_text)
    introduced_templates = _find_introduced_template_phrases(input_text, output_text)
    introduced_colloquial_count, introduced_colloquial_phrases = _find_introduced_colloquial_phrases(
        input_text,
        output_text,
    )
    style_validation_issues = _collect_machine_style_validation_issues(input_text, output_text)
    repetition_issues = find_internal_repetition_issues(output_text)
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
    if introduced_colloquial_count:
        flags.append("academic_register_drift")
        rewrite_advice.append("重跑时改回准确、克制的学术书面语，删除模型新引入的聊天式、随意式表达。")
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
    # structure-OOD advisory: if the structure_template_concentration risk fired,
    # add a structure-specific nudge beyond the generic machine-like advice.
    if any(str(r.get("code")) == "structure_template_concentration" for r in risks):
        advisory_flags.append("structure_template_concentration")
        rewrite_advice.append("连续多句表层框架相似：优先调整重复主语和开句方式；不要为追求指标强塞被动句、长定语或额外从句。")
    # Paragraph-length symmetry: vary density inside each paragraph; never
    # merge/split blank-line boundaries (those are a hard contract elsewhere).
    if any(str(r.get("code")) == "paragraph_length_symmetry" for r in risks):
        advisory_flags.append("paragraph_length_symmetry")
        rewrite_advice.append(
            "相邻自然段长度过于整齐：可在各段内部调整信息量与句式节奏，使段长有自然起伏；"
            "严禁合并、拆分、重排或删除自然段。"
        )
    if any(str(r.get("code")) == "nested_number_scaffold" for r in risks):
        advisory_flags.append("nested_number_scaffold")
        rewrite_advice.append("嵌套编号列表偏密：不要新增（1）（2）（3）式脚手架；原文已有学术枚举应原样保留边界与编号。")
    if any(str(r.get("code")) == "colon_parallel_scaffold" for r in risks):
        advisory_flags.append("colon_parallel_scaffold")
        rewrite_advice.append("冒号—分号并列模板偏明显：避免新增“X：A；B；C”脚手架；原文已有并列项只可在不改序的前提下微调措辞。")
    if introduced_templates:
        advisory_flags.append("template_phrase_drift")
        review_reasons.append({
            "code": "template_phrase_drift",
            "level": "low",
            "message": "改写后新增了偏模板化的表达；这只是提示，不作为强制审阅依据。",
            "evidence": introduced_templates[:5],
        })
        rewrite_advice.append("可选优化：避开新增模板化总结句，改成更贴合原段落语境的具体表达。")
    hard_style_validation_issues = [
        issue
        for issue in style_validation_issues
        if str(issue.get("code", "")) in HARD_MACHINE_STYLE_CODES
        and str(issue.get("level", "")).lower() == "high"
    ]
    if style_validation_issues:
        if hard_style_validation_issues:
            flags.append("machine_style_drift")
        else:
            advisory_flags.append("machine_style_drift")
        review_reasons.extend(style_validation_issues)
        rewrite_advice.append("建议定向重跑：减少新引入的套路句、机械连接词和过整齐句长，保留原文事实边界。")
    # 轮次维度定向诊断（核心护城河：多轮换维度，检测本轮主攻维度是否朝降 AI 方向移动）
    dimension_direction = _assess_dimension_direction(input_text, output_text, round_dimension)
    if not bool(dimension_direction.get("ok", True)) and round_dimension:
        dim_id = str(round_dimension.get("id", ""))
        advisory_flags.append("dimension_direction_not_effective")
        review_reasons.append({
            "code": "dimension_direction_not_effective",
            "level": "medium",
            "message": str(dimension_direction.get("note", "")),
            "evidence": {
                "dimensionId": dim_id,
                "primaryMetric": dimension_direction.get("primaryMetric", ""),
                "before": dimension_direction.get("before"),
                "after": dimension_direction.get("after"),
            },
        })
        rewrite_advice.append(str(dimension_direction.get("note", "")))
    if repetition_issues:
        flags.append("repeated_content")
        review_reasons.append(
            {
                "code": "repeated_content",
                "level": "high",
                "message": "Output contains repeated or highly overlapping content.",
                "evidence": repetition_issues[:3],
            }
        )
        rewrite_advice.append("Review repeated sentences or paragraphs; rerun this chunk if the repetition was introduced by the model.")
    return {
        "expansionRatio": expansion_ratio,
        "missingCitationCount": len(missing_citations),
        "missingCitations": missing_citations[:8],
        "introducedTemplatePhraseCount": len(introduced_templates),
        "introducedTemplatePhrases": introduced_templates[:5],
        "introducedColloquialPhraseCount": introduced_colloquial_count,
        "introducedColloquialPhrases": introduced_colloquial_phrases[:5],
        "academicRegisterDrift": bool(introduced_colloquial_count),
        "styleValidationIssueCount": len(style_validation_issues),
        "styleValidationIssues": style_validation_issues,
        "repetitionIssueCount": len(repetition_issues),
        "repetitionIssues": repetition_issues[:3],
        "machineLikeRiskCount": len(risks),
        "machineLikeRisks": risks,
        "styleMetrics": {
            "sentenceCount": style_metrics.get("sentenceCount", 0),
            "sentenceVariance": (style_metrics.get("sentenceStats") or {}).get("variance", 0) if isinstance(style_metrics.get("sentenceStats"), dict) else 0,
            "burstinessRatio": style_metrics.get("burstinessRatio", 0.0),
            "rawBurstinessRatio": style_metrics.get("rawBurstinessRatio", 0.0),
            "sentenceLengthVariation": style_metrics.get("sentenceLengthVariation", 0.0),
            "shortSentenceRate": style_metrics.get("shortSentenceRate", 0.0),
            "passiveDensity": style_metrics.get("passiveDensity", 0.0),
            "chengyuDensity": style_metrics.get("chengyuDensity", 0.0),
            "connectorDensity": style_metrics.get("connectorDensity", 0.0),
            "nestedNumberDensity": style_metrics.get("nestedNumberDensity", 0.0),
            "colonParallelDensity": style_metrics.get("colonParallelDensity", 0.0),
            "structureConcentration": style_metrics.get("structureConcentration", 0.0),
            "dominantStructureType": style_metrics.get("dominantStructureType", ""),
            "paragraphCount": style_metrics.get("paragraphCount", 0),
            "paragraphLengthCv": style_metrics.get("paragraphLengthCv", 0.0),
            "adjacentParagraphUniformity": style_metrics.get("adjacentParagraphUniformity", 0.0),
        },
        "protectedTokenCount": len(protected.tokens),
        "protectedTokenTypes": summarize_protected_token_types(protected),
        "roundDimension": round_dimension or {},
        "dimensionDirection": dimension_direction,
        "flags": flags,
        "advisoryFlags": advisory_flags,
        "reviewReasons": review_reasons,
        "rewriteAdvice": list(dict.fromkeys(rewrite_advice)),
        "needsReview": bool(flags),
    }


def _apply_candidate_selection_quality(
    quality: dict[str, object],
    selection_event: dict[str, object],
) -> dict[str, object]:
    next_quality = dict(quality)
    next_quality["candidateSelectionDecision"] = str(selection_event.get("decision", "") or "")
    next_quality["candidateSelectionPublishedRewrite"] = bool(selection_event.get("publishedRewrite"))
    next_quality["candidateSelectionSchemaVersion"] = selection_event.get("schemaVersion")
    if bool(selection_event.get("publishedRewrite")):
        return next_quality

    flags = list(next_quality.get("flags") or [])
    review_reasons = list(next_quality.get("reviewReasons") or [])
    rewrite_advice = list(next_quality.get("rewriteAdvice") or [])
    if "candidate_baseline_preserved" not in flags:
        flags.insert(0, "candidate_baseline_preserved")
    review_reasons.insert(
        0,
        {
            "code": "candidate_baseline_preserved",
            "level": "high",
            "message": "本块未发布新的模型改写；有上限的候选选择显式保留了上一版。",
            "evidence": {
                "decision": selection_event.get("decision", "preserved_baseline"),
                "reasonCodes": list(selection_event.get("reasonCodes") or []),
                "modelAttemptCount": selection_event.get("modelAttemptCount", 0),
                "publishedRewrite": False,
            },
        },
    )
    rewrite_advice.insert(0, "请人工检查上一版，或依据候选决策原因定向重跑；当前块不能计为成功的新改写。")
    next_quality["flags"] = list(dict.fromkeys(flags))
    next_quality["reviewReasons"] = review_reasons
    next_quality["rewriteAdvice"] = list(dict.fromkeys(rewrite_advice))
    next_quality["needsReview"] = True
    return next_quality


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
            "message": "历史记录：模型曾未通过硬校验。当前管线已改为硬失败，不再静默回落原文并标为成功。",
            "evidence": {
                "reason": fallback_event.get("reason", "validation-exhausted"),
                "attempts": fallback_event.get("attempts", MAX_VALIDATION_ATTEMPTS),
                "guardCategory": fallback_event.get("guardCategory", "local_validation"),
                "issueCodes": list(fallback_event.get("issueCodes") or []),
                "errorStored": False,
            },
        },
    )
    rewrite_advice.insert(0, "该标记仅兼容历史 compare；请定向重跑此块。新一轮失败会直接报错，不会伪装成功。")
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
    prompt_profile: str = DEFAULT_PROMPT_PROFILE,
    round_number: int = 1,
    prompt_sequence: list[str] | None = None,
    immutable_format_anchors_by_chunk: dict[str, Sequence[str]] | None = None,
) -> dict[str, object]:
    restored_preview = restore_text_from_chunks(manifest, chunk_outputs) if len(chunk_outputs) == manifest.chunk_count else ""
    split_summary = _build_paragraph_split_summary(manifest)
    retry_chunk_ids = sorted({str(event.get("chunkId", "")) for event in validation_events if event.get("event") == "validation-retry"})
    candidate_selection_events_by_chunk: dict[str, dict[str, object]] = {}
    for event in validation_events:
        if event.get("event") != "candidate-selection" or bool(event.get("runFailed")):
            continue
        chunk_id = str(event.get("chunkId", "") or "")
        if chunk_id:
            candidate_selection_events_by_chunk[chunk_id] = event
    candidate_selection_events = list(candidate_selection_events_by_chunk.values())
    generated_selection_events = [
        event for event in candidate_selection_events if bool(event.get("publishedRewrite"))
    ]
    preserved_baseline_events = [
        event for event in candidate_selection_events if str(event.get("decision", "")) == "preserved_baseline"
    ]
    candidate_model_attempt_count = sum(
        int(event.get("modelAttemptCount", 0) or 0) for event in candidate_selection_events
    )
    candidate_conditional_retry_count = sum(
        int(event.get("conditionalRetryCount", 0) or 0) for event in candidate_selection_events
    )
    source_fallback_chunk_ids = sorted(
        {str(event.get("chunkId", "")) for event in validation_events if event.get("event") == "source-fallback"}
    )
    deterministic_postprocess_chunk_ids = sorted(
        {str(event.get("chunkId", "")) for event in validation_events if event.get("event") == "deterministic-burstiness-postprocess"}
    )
    deterministic_postprocess_split_total = sum(
        int(event.get("splitCount", 0) or 0)
        for event in validation_events
        if event.get("event") == "deterministic-burstiness-postprocess"
    )
    output_text = restored_preview or "\n".join(chunk_outputs.values())
    risks = _assess_machine_like_risks(output_text)
    introduced_template_phrases: list[str] = []
    introduced_colloquial_phrase_count = 0
    introduced_colloquial_phrases: list[str] = []
    style_validation_issues: list[dict[str, object]] = []
    frozen_chunk_ids = sorted({str(event.get("chunkId", "")) for event in validation_events if event.get("event") == "chunk-frozen"})
    api_call_estimate = _estimate_api_calls(manifest)
    effective_style_profile = global_style_profile or _build_global_style_profile(manifest)
    style_card_chunk_ids = [
        chunk.chunk_id
        for chunk in manifest.chunks
        if _build_local_style_card(chunk.text, effective_style_profile)
    ]
    adjacent_overlap_pairs = _collect_adjacent_overlap_pairs(manifest, chunk_outputs)
    citation_input_count = sum(len(_extract_citations(chunk.text)) for chunk in manifest.chunks)
    citation_output_count = sum(len(_extract_citations(chunk_outputs.get(chunk.chunk_id, ""))) for chunk in manifest.chunks)
    protected_token_count = 0
    protected_token_types: dict[str, int] = {}
    for chunk in manifest.chunks:
        protected = protect_structure_tokens(
            chunk.text,
            exact_anchors=(immutable_format_anchors_by_chunk or {}).get(chunk.chunk_id, ()),
        )
        introduced_template_phrases.extend(
            _find_introduced_template_phrases(chunk.text, chunk_outputs.get(chunk.chunk_id, ""))
        )
        colloquial_count, colloquial_phrases = _find_introduced_colloquial_phrases(
            chunk.text,
            chunk_outputs.get(chunk.chunk_id, ""),
        )
        introduced_colloquial_phrase_count += colloquial_count
        introduced_colloquial_phrases.extend(colloquial_phrases)
        style_validation_issues.extend(_collect_machine_style_validation_issues(chunk.text, chunk_outputs.get(chunk.chunk_id, "")))
        protected_token_count += len(protected.tokens)
        for token_type, count in summarize_protected_token_types(protected).items():
            protected_token_types[token_type] = protected_token_types.get(token_type, 0) + count
    introduced_template_phrases = sorted(set(introduced_template_phrases))
    introduced_colloquial_phrases = list(dict.fromkeys(introduced_colloquial_phrases))
    round_dimension = resolve_round_dimension(prompt_profile, round_number, prompt_sequence)
    return {
        "label": "heuristic-writing-and-structure-report",
        "isAiDetector": False,
        "roundDimension": round_dimension,
        "paragraphSplitSummary": split_summary,
        "hardValidationRules": [
            "paragraph-count",
            "language-stability",
            "citation-preservation",
            "number-preservation",
            "term-preservation",
            "repetition-stability",
            "factual-order-and-binding-preservation",
            "word-format-anchor-preservation",
            "length-stability",
            "academic-register-stability",
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
        "adjacentOverlapCount": len(adjacent_overlap_pairs),
        "adjacentOverlapPairs": adjacent_overlap_pairs[:12],
        "globalStyleProfile": effective_style_profile,
        "validationRetryCount": len(retry_chunk_ids),
        "boundedCandidateDecisionSchema": CANDIDATE_SELECTION_SCHEMA,
        "boundedCandidateDecisionSchemaVersion": CANDIDATE_SELECTION_VERSION,
        "boundedCandidateDecisionCount": len(candidate_selection_events),
        "boundedCandidateModelAttemptCount": candidate_model_attempt_count,
        "boundedCandidateConditionalRetryCount": candidate_conditional_retry_count,
        "boundedCandidateGeneratedSelectedCount": len(generated_selection_events),
        "boundedCandidatePublishedRewriteCount": len(generated_selection_events),
        "boundedCandidatePreservedBaselineCount": len(preserved_baseline_events),
        "boundedCandidateDecisionIsAiDetector": False,
        "sourceFallbackCount": len(source_fallback_chunk_ids),
        "sourceFallbackChunkIds": source_fallback_chunk_ids[:24],
        "deterministicPostprocessCount": len(deterministic_postprocess_chunk_ids),
        "deterministicPostprocessSplitTotal": deterministic_postprocess_split_total,
        "deterministicPostprocessChunkIds": deterministic_postprocess_chunk_ids[:24],
        "validationEventCount": len(validation_events),
        "citationInputCount": citation_input_count,
        "citationOutputCount": citation_output_count,
        "protectedTokenCount": protected_token_count,
        "protectedTokenTypes": protected_token_types,
        "introducedTemplatePhraseCount": len(introduced_template_phrases),
        "introducedTemplatePhrases": introduced_template_phrases[:12],
        "introducedColloquialPhraseCount": introduced_colloquial_phrase_count,
        "introducedColloquialPhrases": introduced_colloquial_phrases[:12],
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
    payload: dict[str, object] = {
        "version": 1,
        "providerName": str(checkpoint_metadata.get("round_model_provider", "") or ""),
        "model": str(checkpoint_metadata.get("model", "") or ""),
        "apiType": str(checkpoint_metadata.get("api_type", "") or ""),
        "temperature": checkpoint_metadata.get("temperature"),
        "requestTimeoutSeconds": checkpoint_metadata.get("request_timeout_seconds"),
        "configuredRequestTimeoutSeconds": checkpoint_metadata.get("configured_request_timeout_seconds"),
        "maxRetries": checkpoint_metadata.get("max_retries"),
        "rateLimitWindowMinutes": checkpoint_metadata.get("rate_limit_window_minutes"),
        "rateLimitMaxRequests": checkpoint_metadata.get("rate_limit_max_requests"),
        "rewriteConcurrency": checkpoint_metadata.get("rewrite_concurrency"),
        "promptProfile": prompt_profile,
        "promptSequence": prompt_sequence,
        "estimatedApiCalls": quality_summary.get("estimatedApiCalls"),
        "estimatedMaxApiCalls": quality_summary.get("estimatedMaxApiCalls"),
        "maxApiCallsPerEditableChunk": quality_summary.get("maxApiCallsPerEditableChunk"),
        "chunkCount": manifest.chunk_count,
        "paragraphCount": manifest.paragraph_count,
        "splitParagraphCount": split_count,
        "validationRetryCount": quality_summary.get("validationRetryCount"),
        "boundedCandidateDecisionCount": quality_summary.get("boundedCandidateDecisionCount"),
        "boundedCandidateModelAttemptCount": quality_summary.get("boundedCandidateModelAttemptCount"),
        "boundedCandidateConditionalRetryCount": quality_summary.get("boundedCandidateConditionalRetryCount"),
        "boundedCandidatePublishedRewriteCount": quality_summary.get("boundedCandidatePublishedRewriteCount"),
        "boundedCandidatePreservedBaselineCount": quality_summary.get("boundedCandidatePreservedBaselineCount"),
        "boundedCandidateDecisionIsAiDetector": False,
        "sourceFallbackCount": quality_summary.get("sourceFallbackCount"),
        "validationEventCount": quality_summary.get("validationEventCount"),
        "machineLikeRiskCount": quality_summary.get("machineLikeRiskCount"),
        "protectedTokenCount": quality_summary.get("protectedTokenCount"),
        "immutableFormatAnchorCount": checkpoint_metadata.get("immutable_format_anchor_count", 0),
        "immutableFormatAnchorPlanSha256": checkpoint_metadata.get("immutable_format_anchor_plan_sha256", ""),
    }
    input_provenance = _normalize_parent_input_provenance(checkpoint_metadata)
    if input_provenance:
        payload["inputProvenance"] = input_provenance
    return payload


def _apply_deterministic_burstiness_pass(
    input_text: str,
    output_text: str,
    chunk_id: str,
    round_number: int,
    round_dimension: dict[str, object] | None,
    validation_events: list[dict[str, object]],
) -> str:
    """Run the compatibility post-process hook and accept only validated output.

    The current hook is intentionally non-mutating because parser-free comma
    replacement cannot preserve Chinese clause semantics.  The defensive
    acceptance logic remains for compatibility with older extension modules.
    """
    if not output_text or not round_dimension:
        return output_text
    primary_metric = str(round_dimension.get("primaryMetric", ""))
    if primary_metric != "burstinessRatio":
        return output_text
    try:
        from deterministic_postprocess import deterministic_burstiness_postprocess
        processed, report = deterministic_burstiness_postprocess(output_text)
    except Exception:  # pragma: no cover - defensive, never block a run
        return output_text
    if not report.get("applied") or processed == output_text:
        return output_text
    # Metric-guided commit (2026-07, research agent #3 "re-score → accept best"):
    # the deterministic split is committed only if it lowers the COMBINED AI-signal,
    # not just burstiness. A comma->period split can perversely raise
    # connectorDensity (if a fragment starts with a connector) or concentrate
    # structure (two plain_active halves). Re-score all three signals on the
    # candidate and only accept the split when burstiness improves AND it does
    # not worsen connector/structure signals — otherwise keep the pre-pass
    # output (accept-best, never make-it-worse).
    candidate_metrics = _style_risk_metrics(processed)
    orig_metrics = _style_risk_metrics(output_text)
    cand_connector = float(candidate_metrics.get("connectorDensity", 0) or 0)
    orig_connector = float(orig_metrics.get("connectorDensity", 0) or 0)
    cand_conc = float(candidate_metrics.get("structureConcentration", 0) or 0)
    orig_conc = float(orig_metrics.get("structureConcentration", 0) or 0)
    cand_burst = float(candidate_metrics.get("burstinessRatio", 0) or 0)
    orig_burst = float(orig_metrics.get("burstinessRatio", 0) or 0)
    burst_improved = cand_burst > orig_burst
    # Connector: reject only a real increase in mechanical-connector density
    # (a fragment that *starts* with a connector after splitting — the actual
    # AI tell), not a negligible 0.0x shift.
    connector_worsened = cand_connector > orig_connector + 0.1 and cand_connector >= 0.45
    # Structure: reject only if the split PUSHES the output into the AI-
    # concentrated zone (concentration climbs materially AND crosses the 0.85
    # advisory threshold toward plain_active/enumerative dominance). A small
    # redistribution that stays well below 0.85 is fine even if it nudges up,
    # because the split's purpose (burstiness) is the primary win and the
    # structure signal here remains healthy.
    cand_dom = str(candidate_metrics.get("dominantStructureType", "") or "")
    structure_worsened = (
        cand_conc > orig_conc + 0.1
        and cand_conc >= 0.85
        and cand_dom in ("plain_active", "enumerative")
    )
    if not burst_improved or connector_worsened or structure_worsened:
        validation_events.append(
            {
                "event": "deterministic-burstiness-postprocess-skipped",
                "round": round_number,
                "chunkId": chunk_id,
                "splitCount": int(report.get("splitCount", 0)),
                "burstinessBefore": report.get("burstinessBefore"),
                "burstinessAfter": report.get("burstinessAfter"),
                "reason": (
                    "split would worsen combined AI-signal "
                    f"(burst {orig_burst:.2f}->{cand_burst:.2f}, "
                    f"connector {orig_connector:.2f}->{cand_connector:.2f}, "
                    f"structure {orig_conc:.2f}->{cand_conc:.2f}); kept pre-pass output"
                ),
            }
        )
        return output_text
    # Re-run hard validation on the post-processed output. The transform is
    # pure punctuation (comma->period) with content preserved, so this must
    # pass; if it ever does not, keep the pre-pass output (safety first).
    try:
        validate_chunk_output(input_text, processed, chunk_id)
    except ValueError:
        return output_text
    validation_events.append(
        {
            "event": "deterministic-burstiness-postprocess",
            "round": round_number,
            "chunkId": chunk_id,
            "splitCount": int(report.get("splitCount", 0)),
            "burstinessBefore": report.get("burstinessBefore"),
            "burstinessAfter": report.get("burstinessAfter"),
            "connectorDensityBefore": round(orig_connector, 3),
            "connectorDensityAfter": round(cand_connector, 3),
            "structureConcentrationBefore": round(orig_conc, 3),
            "structureConcentrationAfter": round(cand_conc, 3),
        }
    )
    return processed


def _rewrite_round_chunk(
    *,
    index: int,
    chunk: object,
    round_number: int,
    normalized_prompt_profile: str,
    prompt_text: str,
    transform: Transform,
    global_style_profile: dict[str, object],
    round_dimension: dict[str, object] | None = None,
    immutable_text_anchors: Sequence[str] = (),
) -> ChunkRewriteResult:
    validation_events: list[dict[str, object]] = []
    progress_events: list[dict[str, object]] = []
    chunk_output = ""
    validation_error: ValueError | None = None
    protected_chunk = protect_structure_tokens(chunk.text, exact_anchors=immutable_text_anchors)
    if should_freeze_chunk(normalized_prompt_profile, chunk.text):
        chunk_output = chunk.text
        validation_events.append(
            {
                "event": "chunk-frozen",
                "round": round_number,
                "chunkId": chunk.chunk_id,
                "paragraphIndex": chunk.paragraph_index,
                "chunkIndex": chunk.chunk_index,
                "reason": "structure_or_metadata_preserved",
            }
        )
        validate_chunk_output(chunk.text, chunk_output, chunk.chunk_id)
        progress_events.append(
            {
                "phase": "chunk-frozen",
                "round": round_number,
                "chunkId": chunk.chunk_id,
                "paragraphIndex": chunk.paragraph_index,
                "chunkIndex": chunk.chunk_index,
            }
        )
        return ChunkRewriteResult(index, chunk.chunk_id, chunk_output, validation_events, progress_events)

    baseline_candidate = _evaluate_rewrite_candidate(
        input_text=chunk.text,
        output_text=chunk.text,
        candidate_id="baseline",
        origin="baseline",
        attempt=0,
        hard_valid=True,
        round_dimension=round_dimension,
        global_style_profile=global_style_profile,
    )
    candidates: list[dict[str, object]] = [baseline_candidate]
    selection_retry_note: str | None = None
    conditional_retry_count = 0

    for validation_attempt in range(1, MAX_VALIDATION_ATTEMPTS + 1):
        retry_note = _merge_generation_notes(
            _build_retry_note(chunk.text, str(validation_error)) if validation_error is not None else None,
            selection_retry_note,
        )
        raw_chunk_output = transform(
            protected_chunk.text,
            build_prompt_input(
                prompt_text,
                protected_chunk.text,
                round_number,
                chunk.chunk_id,
                retry_note=retry_note,
                # Build the visible relation lock from the same protected text
                # the model receives.  Exposing raw values here while the input
                # contained @@FYADR_*@@ tokens encouraged models to emit both
                # the raw value and its placeholder, duplicating numbers after
                # restoration.
                relation_guard=build_factual_relation_guard(protected_chunk.text),
                style_card=_build_local_style_card(chunk.text, global_style_profile),
                immutable_format_anchor_count=len(immutable_text_anchors),
            ),
            round_number,
            chunk.chunk_id,
        )
        output_for_review = raw_chunk_output
        protected_output = normalize_chunk_output(protected_chunk.text, raw_chunk_output)
        try:
            validate_structure_placeholders(protected_output, protected_chunk.tokens, chunk.chunk_id)
            rewritten_output = restore_structure_tokens(protected_output, protected_chunk.tokens)
            output_for_review = rewritten_output
            validate_immutable_text_anchors(
                chunk.text,
                rewritten_output,
                immutable_text_anchors,
                chunk.chunk_id,
            )
            validate_chunk_output(chunk.text, rewritten_output, chunk.chunk_id)
            candidate = _evaluate_rewrite_candidate(
                input_text=chunk.text,
                output_text=rewritten_output,
                candidate_id=f"model-attempt-{validation_attempt}",
                origin="model",
                attempt=validation_attempt,
                hard_valid=True,
                round_dimension=round_dimension,
                global_style_profile=global_style_profile,
            )
            candidates.append(candidate)
            validation_error = None
            selection_retry_note = None
            if (
                validation_attempt < MAX_VALIDATION_ATTEMPTS
                and _candidate_requires_conditional_retry(
                    candidate,
                    baseline_candidate,
                    round_dimension=round_dimension,
                )
            ):
                conditional_retry_count += 1
                selection_retry_note = _build_candidate_selection_retry_note(
                    candidate,
                    baseline_candidate,
                    round_dimension=round_dimension,
                )
                validation_events.append(
                    {
                        "event": "candidate-selection-retry",
                        "schema": CANDIDATE_SELECTION_SCHEMA,
                        "schemaVersion": CANDIDATE_SELECTION_VERSION,
                        "round": round_number,
                        "chunkId": chunk.chunk_id,
                        "paragraphIndex": chunk.paragraph_index,
                        "chunkIndex": chunk.chunk_index,
                        "attempt": validation_attempt,
                        "reasonCodes": list(candidate.get("rejectionReasonCodes") or [])
                        + _candidate_selection_retry_reason_codes(
                            candidate,
                            baseline_candidate,
                            round_dimension=round_dimension,
                        )
                        + (
                            ["same_dimension_not_effective"]
                            if _candidate_dimension_is_active(round_dimension)
                            and not _candidate_same_dimension_ok(candidate)
                            else []
                        ),
                        "candidate": _public_candidate_evidence(candidate),
                    }
                )
                continue
            break
        except ValueError as exc:
            validation_error = exc
            failed_candidate = _evaluate_rewrite_candidate(
                input_text=chunk.text,
                output_text=output_for_review,
                candidate_id=f"model-attempt-{validation_attempt}",
                origin="model",
                attempt=validation_attempt,
                hard_valid=False,
                hard_validation_error=str(exc),
                round_dimension=round_dimension,
                global_style_profile=global_style_profile,
            )
            candidates.append(failed_candidate)
            failed_output_payload = _serialize_failed_output(
                output_for_review,
                error=exc,
                issue_codes=(
                    list(failed_candidate.get("hardValidationIssueCodes") or [])
                    + list(failed_candidate.get("factualIssueCodes") or [])
                ),
            )
            validation_events.append(
                {
                    "event": "validation-retry",
                    "round": round_number,
                    "chunkId": chunk.chunk_id,
                    "paragraphIndex": chunk.paragraph_index,
                    "chunkIndex": chunk.chunk_index,
                    **failed_output_payload,
                    "attempt": validation_attempt,
                }
            )

        hard_valid_generated = [
            candidate
            for candidate in candidates
            if candidate.get("origin") == "model" and candidate.get("hardValid")
        ]
        if (
            validation_error is not None
            and validation_attempt >= MAX_VALIDATION_ATTEMPTS
            and not hard_valid_generated
        ):
            validation_events.append(
                _build_candidate_selection_event(
                    chunk_id=chunk.chunk_id,
                    round_number=round_number,
                    candidates=candidates,
                    selected=baseline_candidate,
                    reason_codes=["all_model_candidates_failed_hard_validation", "baseline_preserved_but_round_failed"],
                    conditional_retry_count=conditional_retry_count,
                    decision="hard_failure_preserved_baseline",
                    run_failed=True,
                )
            )
            progress_events.append(
                {
                    "phase": "chunk-validation-failed",
                    "round": round_number,
                    "chunkId": chunk.chunk_id,
                    "paragraphIndex": chunk.paragraph_index,
                    "chunkIndex": chunk.chunk_index,
                    "attempts": validation_attempt,
                    "message": "候选未通过确定性安全校验；失败正文和原始错误已隐藏。",
                    "guardCategory": failed_output_payload.get("guardCategory", "local_validation"),
                    "issueCodes": list(failed_output_payload.get("issueCodes") or []),
                    "textStored": False,
                    "errorStored": False,
                }
            )
            failure = ValueError(
                f"Chunk {chunk.chunk_id} failed hard validation after {validation_attempt} attempts: {validation_error}"
            )
            setattr(failure, "validation_events", list(validation_events))
            setattr(failure, "progress_events", list(progress_events))
            raise failure from validation_error

    selected_candidate, selection_reasons = _select_rewrite_candidate(
        candidates,
        round_dimension=round_dimension,
    )
    selection_event = _build_candidate_selection_event(
        chunk_id=chunk.chunk_id,
        round_number=round_number,
        candidates=candidates,
        selected=selected_candidate,
        reason_codes=selection_reasons,
        conditional_retry_count=conditional_retry_count,
    )
    validation_events.append(selection_event)
    chunk_output = str(selected_candidate.get("_text", chunk.text) or chunk.text)

    if bool(selection_event.get("publishedRewrite")):
        selected_before_postprocess = chunk_output
        postprocessed_output = _apply_deterministic_burstiness_pass(
            chunk.text,
            chunk_output,
            chunk.chunk_id,
            round_number,
            round_dimension,
            validation_events,
        )
        source_pattern_profile = (
            global_style_profile.get("documentPatternBaseline")
            if isinstance(global_style_profile.get("documentPatternBaseline"), dict)
            else {}
        )
        result_source_relative = assess_source_relative_style_delta(
            chunk.text,
            postprocessed_output,
            source_pattern_profile=source_pattern_profile,
        )
        if source_relative_style_delta_passed(result_source_relative):
            chunk_output = postprocessed_output
        else:
            # A punctuation-only post-pass is never allowed to bypass the same
            # source-relative release contract used for model candidates.
            chunk_output = selected_before_postprocess
            validation_events[:] = [
                event
                for event in validation_events
                if not (
                    event.get("event") == "deterministic-burstiness-postprocess"
                    and str(event.get("chunkId", "") or "") == chunk.chunk_id
                )
            ]
            validation_events.append(
                {
                    "event": "deterministic-burstiness-postprocess-skipped",
                    "round": round_number,
                    "chunkId": chunk.chunk_id,
                    "reason": "source-relative style-delta gate rejected the punctuation candidate",
                    "reasonCodes": list(result_source_relative.get("blockingIssueCodes") or []),
                }
            )
            result_source_relative = selected_candidate.get("sourceRelativeStyleDelta", {})
        selection_event["resultSourceRelativeStyleDelta"] = result_source_relative
        selection_event["postprocessApplied"] = chunk_output != selected_before_postprocess
        selection_event["resultTextSha256"] = _sha256_text(chunk_output)
        selection_event["resultCharCount"] = len(chunk_output)
        selection_event["publishedTextSha256"] = _sha256_text(chunk_output)
        selection_event["publishedCharCount"] = len(chunk_output)
    else:
        selection_event["postprocessApplied"] = False
        selection_event["resultTextSha256"] = _sha256_text(chunk_output)
        selection_event["resultCharCount"] = len(chunk_output)

    return ChunkRewriteResult(index, chunk.chunk_id, chunk_output, validation_events, progress_events)


def _arbitrate_document_pattern_accumulation(
    manifest: ChunkManifest,
    chunk_outputs: dict[str, str],
    validation_events: list[dict[str, object]],
) -> tuple[dict[str, object], list[str]]:
    """Deterministically prevent individually-small cross-chunk pattern bursts."""

    baseline_texts = [chunk.text.strip() for chunk in manifest.chunks]
    provisional_texts = [
        str(chunk_outputs.get(chunk.chunk_id, chunk.text) or chunk.text).strip()
        for chunk in manifest.chunks
    ]
    provisional_evidence = assess_source_relative_document_delta(
        baseline_texts,
        provisional_texts,
    )
    # Evaluate the complete provisional document first.  Net-zero cross-chunk
    # redistribution (one chunk removes a family while another adds it) is
    # safe and must not be rejected merely because the adding chunk appears
    # first in a sequential replay.
    if source_relative_document_delta_passed(provisional_evidence):
        return provisional_evidence, []
    current_texts = list(baseline_texts)
    selection_events: dict[str, dict[str, object]] = {}
    for event in validation_events:
        if (
            event.get("event") == "candidate-selection"
            and event.get("schema") == CANDIDATE_SELECTION_SCHEMA
            and event.get("schemaVersion") == CANDIDATE_SELECTION_VERSION
        ):
            chunk_id = str(event.get("chunkId", "") or "")
            if chunk_id:
                selection_events[chunk_id] = event

    rejected_chunk_ids: list[str] = []
    for index, chunk in enumerate(manifest.chunks):
        baseline_text = baseline_texts[index]
        proposed_text = str(chunk_outputs.get(chunk.chunk_id, baseline_text) or baseline_text).strip()
        selection = selection_events.get(chunk.chunk_id)
        if not isinstance(selection, dict) or selection.get("publishedRewrite") is not True:
            current_texts[index] = proposed_text
            continue

        trial_texts = list(current_texts)
        trial_texts[index] = proposed_text
        trial_evidence = assess_source_relative_document_delta(
            baseline_texts,
            trial_texts,
        )
        if source_relative_document_delta_passed(trial_evidence):
            current_texts[index] = proposed_text
            continue

        raw_candidates = selection.get("candidates")
        candidates = [
            candidate
            for candidate in raw_candidates
            if isinstance(candidate, dict)
        ] if isinstance(raw_candidates, list) else []
        baseline_candidates = [
            candidate
            for candidate in candidates
            if str(candidate.get("candidateId", "") or "") == "baseline"
            and str(candidate.get("origin", "") or "") == "baseline"
        ]
        if len(baseline_candidates) != 1:
            raise ValueError(
                f"Chunk {chunk.chunk_id} has no authoritative baseline for document arbitration."
            )
        reason_codes = list(selection.get("reasonCodes") or [])
        reason_codes.extend(
            [
                DOCUMENT_PATTERN_ACCUMULATION_BLOCKED,
                *list(trial_evidence.get("blockingIssueCodes") or []),
            ]
        )
        replacement = _build_candidate_selection_event(
            chunk_id=chunk.chunk_id,
            round_number=int(selection.get("round", 0) or 0),
            candidates=candidates,
            selected=baseline_candidates[0],
            reason_codes=list(
                dict.fromkeys(str(code) for code in reason_codes if str(code or "").strip())
            ),
            conditional_retry_count=int(selection.get("conditionalRetryCount", 0) or 0),
        )
        replacement["documentArbitration"] = {
            "decision": "baseline_preserved",
            "reasonCode": DOCUMENT_PATTERN_ACCUMULATION_BLOCKED,
            "rejectedDocumentDelta": trial_evidence,
        }
        selection.clear()
        selection.update(replacement)
        chunk_outputs[chunk.chunk_id] = baseline_text
        current_texts[index] = baseline_text
        rejected_chunk_ids.append(chunk.chunk_id)

        validation_events[:] = [
            event
            for event in validation_events
            if not (
                event is not selection
                and event.get("event") == "deterministic-burstiness-postprocess"
                and str(event.get("chunkId", "") or "") == chunk.chunk_id
            )
        ]
        validation_events.append(
            {
                "event": "document-pattern-delta-arbitration",
                "round": int(selection.get("round", 0) or 0),
                "chunkId": chunk.chunk_id,
                "decision": "baseline_preserved",
                "reasonCodes": list(trial_evidence.get("blockingIssueCodes") or []),
                "documentDelta": trial_evidence,
            }
        )

    final_evidence = assess_source_relative_document_delta(
        baseline_texts,
        current_texts,
    )
    if not source_relative_document_delta_passed(final_evidence):
        raise ValueError("Final document pattern-delta arbitration did not converge to a safe result.")
    return final_evidence, rejected_chunk_ids


def _finalize_round_outputs(
    *,
    doc_id: str,
    round_number: int,
    score_total: int | None,
    chunk_limit: int,
    prompts: dict[int, str],
    manifest: ChunkManifest,
    chunk_outputs: dict[str, str],
    validation_events: list[dict[str, object]],
    global_style_profile: dict[str, object],
    effective_checkpoint_metadata: dict[str, object],
    normalized_prompt_profile: str,
    normalized_prompt_sequence: list[str],
    normalized_input_path: Path,
    normalized_output_path: Path,
    normalized_manifest_path: Path,
    checkpoint_path: Path,
    compare_path: Path,
    quality_path: Path,
    effective_concurrency: int,
    api_call_estimate: dict[str, int],
    progress_callback: ProgressCallback | None,
    immutable_format_anchors_by_chunk: dict[str, Sequence[str]] | None = None,
) -> dict:
    """Restore the full text, write artifacts, and persist the round record.

    This is the tail of :func:`run_round`: once every chunk has a result (or the
    run was cancelled), it reassembles the output, writes the quality summary /
    compare payload, updates the history record, and clears the checkpoint.
    Returning a plain dict keeps :func:`run_round` a thin orchestrator.
    """

    source_relative_document_delta, document_arbitration_chunk_ids = (
        _arbitrate_document_pattern_accumulation(
            manifest,
            chunk_outputs,
            validation_events,
        )
    )
    restored = restore_text_from_chunks(manifest, chunk_outputs)

    if progress_callback is not None:
        progress_callback(
            {
                "phase": "restoring-output",
                "round": round_number,
                "completedChunks": len(chunk_outputs),
                "totalChunks": manifest.chunk_count,
                "activeChunks": 0,
                "queuedChunks": 0,
                "concurrency": effective_concurrency,
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
        round_number=round_number,
        prompt_sequence=normalized_prompt_sequence,
        immutable_format_anchors_by_chunk=immutable_format_anchors_by_chunk,
    )
    quality_summary["sourceRelativeDocumentDelta"] = source_relative_document_delta
    quality_summary["documentPatternArbitrationCount"] = len(
        document_arbitration_chunk_ids
    )
    quality_summary["documentPatternArbitrationChunkIds"] = (
        document_arbitration_chunk_ids[:24]
    )
    run_audit = _build_run_audit(
        checkpoint_metadata=effective_checkpoint_metadata,
        prompt_profile=normalized_prompt_profile,
        prompt_sequence=normalized_prompt_sequence,
        manifest=manifest,
        quality_summary=quality_summary,
    )
    input_provenance = _normalize_parent_input_provenance(effective_checkpoint_metadata)
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
        input_provenance=input_provenance,
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
        "input_provenance": input_provenance,
    }


def _normalize_immutable_format_anchor_plan(
    value: dict[int, Sequence[str]] | None,
) -> dict[int, list[str]]:
    normalized: dict[int, list[str]] = {}
    for raw_index, raw_anchors in (value or {}).items():
        try:
            paragraph_index = int(raw_index)
        except (TypeError, ValueError) as exc:
            raise ValueError("DOCX format-anchor plan has an invalid paragraph index.") from exc
        if paragraph_index < 0 or isinstance(raw_anchors, (str, bytes)):
            raise ValueError("DOCX format-anchor plan has an invalid paragraph binding.")
        anchors: list[str] = []
        for raw_anchor in raw_anchors:
            anchor = str(raw_anchor)
            if not anchor:
                continue
            if anchor in anchors:
                raise ValueError("DOCX format-anchor plan contains a duplicate paragraph anchor.")
            anchors.append(anchor)
        if anchors:
            normalized[paragraph_index] = anchors
    return normalized


def _bind_format_anchors_to_manifest_chunks(
    manifest: ChunkManifest,
    anchor_plan: dict[int, list[str]],
) -> dict[str, list[str]]:
    """Bind each source-unique paragraph anchor to exactly one model chunk."""

    bound: dict[str, list[str]] = {}
    for paragraph_index, anchors in anchor_plan.items():
        if paragraph_index >= len(manifest.paragraphs):
            raise ValueError("DOCX format-anchor paragraph is outside the model-input manifest.")
        paragraph = manifest.paragraphs[paragraph_index]
        chunks = [
            chunk
            for chunk in manifest.chunks
            if chunk.chunk_id in set(paragraph.chunk_ids)
        ]
        for anchor in anchors:
            if len(_exact_occurrence_positions(paragraph.original_text, anchor)) != 1:
                raise ValueError("DOCX format anchor is missing or ambiguous in its model paragraph.")
            candidates = [
                chunk
                for chunk in chunks
                if len(_exact_occurrence_positions(chunk.text, anchor)) == 1
            ]
            if len(candidates) != 1:
                raise ValueError(
                    "DOCX chunking split or duplicated a format-sensitive anchor; stopped before API execution."
                )
            chunk_id = candidates[0].chunk_id
            bound.setdefault(chunk_id, []).append(anchor)
    return bound


def run_round(
    doc_id: str,
    round_number: int,
    input_path: Path,
    output_path: Path,
    manifest_path: Path,
    transform: Transform,
    prompt_profile: str = DEFAULT_PROMPT_PROFILE,
    prompt_sequence: object | None = None,
    chunk_limit: int = DEFAULT_CHUNK_LIMIT,
    score_total: int | None = None,
    progress_callback: ProgressCallback | None = None,
    checkpoint_metadata: dict[str, object] | None = None,
    cancel_check: CancelCheck | None = None,
    max_concurrency: int = DEFAULT_ROUND_CONCURRENCY,
    immutable_format_anchors: dict[int, Sequence[str]] | None = None,
) -> dict:
    normalized_input_path = normalize_path(input_path)
    normalized_output_path = normalize_path(output_path)
    normalized_manifest_path = normalize_path(manifest_path)
    normalized_prompt_profile = normalize_prompt_profile(prompt_profile)
    normalized_prompt_sequence = normalize_prompt_sequence(normalized_prompt_profile, prompt_sequence)
    chunk_metric = get_chunk_metric(normalized_prompt_profile, normalized_prompt_sequence)

    text = normalized_input_path.read_text(encoding="utf-8")
    manifest = build_manifest(text, chunk_limit=chunk_limit, chunk_metric=chunk_metric)
    if manifest.paragraph_count <= 0 or manifest.chunk_count <= 0:
        raise ValueError(
            "未提取到可改写正文内容，已停止本轮，未调用 API。请检查 DOCX 正文边界或上传包含正文文本的文档。"
        )
    normalized_anchor_plan = _normalize_immutable_format_anchor_plan(immutable_format_anchors)
    chunk_format_anchors = _bind_format_anchors_to_manifest_chunks(manifest, normalized_anchor_plan)
    anchor_digest_payload = {
        str(paragraph_index): [sha256(anchor.encode("utf-8")).hexdigest() for anchor in anchors]
        for paragraph_index, anchors in sorted(normalized_anchor_plan.items())
    }
    api_call_estimate = _estimate_api_calls(manifest)
    global_style_profile = _build_global_style_profile(manifest)
    configured_concurrency = _clamp_round_concurrency(max_concurrency)
    effective_checkpoint_metadata = {
        **(checkpoint_metadata or {}),
        "rewrite_concurrency": configured_concurrency,
        "style_card_version": STYLE_CARD_VERSION,
        "global_style_profile_sha256": _sha256_json(global_style_profile),
        "source_pattern_profile_sha256": str(
            (global_style_profile.get("documentPatternBaseline") or {}).get("profileSha256", "")
            if isinstance(global_style_profile.get("documentPatternBaseline"), dict)
            else ""
        ),
        "immutable_format_anchor_count": sum(len(anchors) for anchors in normalized_anchor_plan.values()),
        "immutable_format_anchor_plan_sha256": _sha256_json(anchor_digest_payload),
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
    save_manifest(manifest, normalized_manifest_path)
    pending_chunk_count = max(0, manifest.chunk_count - len(chunk_outputs))
    effective_concurrency = max(1, min(configured_concurrency, pending_chunk_count or 1))
    if progress_callback is not None:
        raw_progress_callback = progress_callback

        def progress_callback(event: dict[str, object]) -> None:
            payload = dict(event)
            payload.setdefault("configuredConcurrency", configured_concurrency)
            raw_progress_callback(payload)

    if progress_callback is not None:
        progress_callback(
            {
                "phase": "chunking-ready",
                "round": round_number,
                "totalChunks": manifest.chunk_count,
                "completedChunks": len(chunk_outputs),
                "queuedChunks": pending_chunk_count,
                "activeChunks": 0,
                "concurrency": effective_concurrency,
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
                    "queuedChunks": pending_chunk_count,
                    "activeChunks": 0,
                    "concurrency": effective_concurrency,
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
                        "completedChunks": len(chunk_outputs),
                        "totalChunks": manifest.chunk_count,
                        "activeChunks": 0,
                        "queuedChunks": pending_chunk_count,
                        "concurrency": effective_concurrency,
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
    pending_chunks = [
        (index, chunk)
        for index, chunk in enumerate(manifest.chunks, start=1)
        if chunk.chunk_id not in chunk_outputs
    ]
    effective_concurrency = max(1, min(effective_concurrency, len(pending_chunks) or 1))
    first_error: tuple[int, str, BaseException] | None = None
    first_error_details: dict[str, object] | None = None
    next_submit_index = 0
    futures: dict[Future[ChunkRewriteResult], tuple[int, object]] = {}

    def emit_processing(index: int, chunk: object, active_count: int) -> None:
        if progress_callback is None:
            return
        progress_callback(
            {
                "phase": "processing-chunk",
                "round": round_number,
                "currentChunk": index,
                "completedChunks": len(chunk_outputs),
                "totalChunks": manifest.chunk_count,
                "activeChunks": active_count,
                "queuedChunks": max(0, len(pending_chunks) - next_submit_index),
                "concurrency": effective_concurrency,
                "chunkId": chunk.chunk_id,
                "paragraphIndex": chunk.paragraph_index,
                "chunkIndex": chunk.chunk_index,
                "outputPath": str(normalized_output_path),
                **api_call_estimate,
            }
        )

    round_dimension_for_chunks = resolve_round_dimension(
        normalized_prompt_profile, round_number, normalized_prompt_sequence
    )

    def submit_next(executor: ThreadPoolExecutor) -> bool:
        nonlocal next_submit_index
        if next_submit_index >= len(pending_chunks):
            return False
        if cancel_check is not None and cancel_check():
            return False
        index, chunk = pending_chunks[next_submit_index]
        next_submit_index += 1
        future = executor.submit(
            _rewrite_round_chunk,
            index=index,
            chunk=chunk,
            round_number=round_number,
            normalized_prompt_profile=normalized_prompt_profile,
            prompt_text=prompt_text,
            transform=transform,
            global_style_profile=global_style_profile,
            round_dimension=round_dimension_for_chunks,
            immutable_text_anchors=chunk_format_anchors.get(chunk.chunk_id, ()),
        )
        futures[future] = (index, chunk)
        emit_processing(index, chunk, len(futures))
        return True

    with ThreadPoolExecutor(max_workers=effective_concurrency) as executor:
        while len(futures) < effective_concurrency and submit_next(executor):
            pass
        while futures:
            done, _ = wait(futures, return_when=FIRST_COMPLETED)
            for future in done:
                index, chunk = futures.pop(future)
                try:
                    result = future.result()
                except Exception as exc:
                    exception_details = _serialize_exception_details(exc)
                    safe_error = safe_public_error_message(exc)
                    public_error, public_error_details = _sanitize_checkpoint_error(
                        safe_error,
                        exception_details,
                    )
                    cancelled_error = (
                        cancel_check is not None
                        and cancel_check()
                        and "interrupted by user" in str(exc).lower()
                    )
                    if cancelled_error:
                        _save_round_checkpoint(
                            checkpoint_path,
                            signature=checkpoint_signature,
                            chunk_outputs=chunk_outputs,
                            validation_events=validation_events,
                            last_error="Round interrupted by user before processing next chunk.",
                        )
                        if progress_callback is not None:
                            progress_callback(
                                {
                                    "phase": "cancel-requested",
                                    "round": round_number,
                                    "currentChunk": index,
                                    "completedChunks": len(chunk_outputs),
                                    "totalChunks": manifest.chunk_count,
                                    "activeChunks": len(futures),
                                    "queuedChunks": max(0, len(pending_chunks) - next_submit_index),
                                    "concurrency": effective_concurrency,
                                    "chunkId": chunk.chunk_id,
                                    **api_call_estimate,
                                }
                            )
                        continue
                    failed_validation_events = getattr(exc, "validation_events", None)
                    if isinstance(failed_validation_events, list) and failed_validation_events:
                        validation_events.extend(failed_validation_events)
                    failed_progress_events = getattr(exc, "progress_events", None)
                    if first_error is None:
                        first_error = (index, chunk.chunk_id, exc)
                        first_error_details = {
                            "chunkId": chunk.chunk_id,
                            **exception_details,
                        }
                    _save_round_checkpoint(
                        checkpoint_path,
                        signature=checkpoint_signature,
                        chunk_outputs=chunk_outputs,
                        validation_events=validation_events,
                        last_error=f"Chunk {chunk.chunk_id} failed: {safe_error}",
                        last_error_details=first_error_details,
                    )
                    if progress_callback is not None:
                        if isinstance(failed_progress_events, list):
                            for progress_event in failed_progress_events:
                                progress_callback(
                                    {
                                        **progress_event,
                                        "currentChunk": index,
                                        "completedChunks": len(chunk_outputs),
                                        "totalChunks": manifest.chunk_count,
                                        "activeChunks": len(futures),
                                        "queuedChunks": max(0, len(pending_chunks) - next_submit_index),
                                        "concurrency": effective_concurrency,
                                        "outputPath": str(normalized_output_path),
                                        **api_call_estimate,
                                    }
                                )
                        progress_callback(
                            {
                                "phase": "chunk-failed",
                                "round": round_number,
                                "currentChunk": index,
                                "completedChunks": len(chunk_outputs),
                                "totalChunks": manifest.chunk_count,
                                "activeChunks": len(futures),
                                "queuedChunks": max(0, len(pending_chunks) - next_submit_index),
                                "concurrency": effective_concurrency,
                                "chunkId": chunk.chunk_id,
                                "error": public_error,
                                **public_error_details,
                                **api_call_estimate,
                            }
                        )
                    continue

                chunk_outputs[result.chunk_id] = result.output_text
                validation_events.extend(result.validation_events)
                _save_round_checkpoint(
                    checkpoint_path,
                    signature=checkpoint_signature,
                    chunk_outputs=chunk_outputs,
                    validation_events=validation_events,
                    last_error=(
                        f"Chunk {first_error[1]} failed: {safe_public_error_message(first_error[2])}"
                        if first_error is not None
                        else None
                    ),
                    last_error_details=first_error_details,
                )
                for progress_event in result.progress_events:
                    if progress_callback is not None:
                        progress_callback(
                            {
                                **progress_event,
                                "currentChunk": len(chunk_outputs),
                                "completedChunks": len(chunk_outputs),
                                "totalChunks": manifest.chunk_count,
                                "activeChunks": len(futures),
                                "queuedChunks": max(0, len(pending_chunks) - next_submit_index),
                                "concurrency": effective_concurrency,
                                "outputPath": str(normalized_output_path),
                                **api_call_estimate,
                            }
                        )
                if progress_callback is not None:
                    progress_callback(
                        {
                            "phase": "chunk-complete",
                            "round": round_number,
                            "currentChunk": len(chunk_outputs),
                            "completedChunks": len(chunk_outputs),
                            "totalChunks": manifest.chunk_count,
                            "activeChunks": len(futures),
                            "queuedChunks": max(0, len(pending_chunks) - next_submit_index),
                            "concurrency": effective_concurrency,
                            "chunkId": result.chunk_id,
                            "paragraphIndex": chunk.paragraph_index,
                            "chunkIndex": chunk.chunk_index,
                            "outputPath": str(normalized_output_path),
                            "compareInputText": chunk.text,
                            "compareOutputText": result.output_text,
                            **api_call_estimate,
                        }
                    )

            if first_error is not None:
                continue
            while len(futures) < effective_concurrency and submit_next(executor):
                pass

        if first_error is not None:
            index, chunk_id, exc = first_error
            raise RuntimeError(f"Chunk {chunk_id} failed: {safe_public_error_message(exc)}") from exc

    if cancel_check is not None and cancel_check() and len(chunk_outputs) < manifest.chunk_count:
        _save_round_checkpoint(
            checkpoint_path,
            signature=checkpoint_signature,
            chunk_outputs=chunk_outputs,
            validation_events=validation_events,
            last_error="Round interrupted by user before processing next chunk.",
        )
        raise RuntimeError("Run was interrupted by user. Completed chunks are kept; click continue to resume this round.")

    return _finalize_round_outputs(
        doc_id=doc_id,
        round_number=round_number,
        score_total=score_total,
        chunk_limit=chunk_limit,
        prompts=prompts,
        manifest=manifest,
        chunk_outputs=chunk_outputs,
        validation_events=validation_events,
        global_style_profile=global_style_profile,
        effective_checkpoint_metadata=effective_checkpoint_metadata,
        normalized_prompt_profile=normalized_prompt_profile,
        normalized_prompt_sequence=normalized_prompt_sequence,
        normalized_input_path=normalized_input_path,
        normalized_output_path=normalized_output_path,
        normalized_manifest_path=normalized_manifest_path,
        checkpoint_path=checkpoint_path,
        compare_path=compare_path,
        quality_path=quality_path,
        effective_concurrency=effective_concurrency,
        api_call_estimate=api_call_estimate,
        progress_callback=progress_callback,
        immutable_format_anchors_by_chunk=chunk_format_anchors,
    )
