"""Compatibility hook for deterministic rewrite post-processing.

FYADR previously tried to increase a sentence-length score by replacing the
first comma in a run of similarly sized sentences with a full stop.  That
operation preserved characters but not syntax: it could turn
``不仅……，而且……`` into two broken fragments, split a list after its first
item, or detach a conditional clause from its main clause.  It also ran after
protected placeholders had been restored, so the advertised placeholder
guard did not protect citations or numbers in production.

Sentence boundaries carry meaning and cannot be repaired safely with a
parser-free punctuation substitution.  The public function is retained for
checkpoint/report compatibility, but it is intentionally non-mutating.  Style
improvement belongs in the model prompt and in advisory diagnostics; hard
validation remains responsible for facts, structure, and surface integrity.
"""

from __future__ import annotations

import re


def _sentence_lengths(text: str) -> list[int]:
    normalized = re.sub(r"\s+", " ", str(text or "")).strip()
    if not normalized:
        return []
    return [
        len(part.strip())
        for part in re.split(r"(?<=[。！？；!?;])\s*|(?<=[.!?;])\s+", normalized)
        if part and part.strip()
    ]


def _percentile(values: list[int], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    if len(ordered) == 1:
        return float(ordered[0])
    position = max(0.0, min(1.0, fraction)) * (len(ordered) - 1)
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    offset = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * offset


def _robust_length_ratio(text: str) -> tuple[float, int]:
    lengths = _sentence_lengths(text)
    if not lengths:
        return 0.0, 0
    return round(_percentile(lengths, 0.9) / max(_percentile(lengths, 0.1), 1.0), 2), len(lengths)


def deterministic_burstiness_postprocess(text: str) -> tuple[str, dict[str, object]]:
    """Return *text* unchanged with an explicit semantic-safety report.

    Keeping a stable report shape avoids breaking historical callers while
    guaranteeing idempotence and byte-for-byte content/format preservation.
    """

    ratio, sentence_count = _robust_length_ratio(text)
    return text, {
        "burstinessBefore": ratio,
        "burstinessAfter": ratio,
        "splitCount": 0,
        "applied": False,
        "sentenceCountBefore": sentence_count,
        "sentenceCountAfter": sentence_count,
        "reason": "disabled: punctuation-only sentence splitting is not semantics-safe",
    }
