from __future__ import annotations

import re
from collections import Counter
from typing import Any, Iterable


# Chinese prose normally places quantities directly beside Han characters (for
# example, ``实验值10次``). ``\w`` also includes those characters, so using it as
# a word boundary silently missed exactly the numbers users need protected.
# Digit-only boundaries keep complete numeric tokens without imposing an
# English-centric word boundary.
NUMBER_RE = re.compile(
    r"(?<![0-9A-Za-z])[-+−]?(?:\d{1,3}(?:[,，]\d{3})+|\d+)(?:\.\d+)?(?:[eE][-+]?\d+)?[%‰]?(?![0-9A-Za-z])"
)
CITATION_RE = re.compile(
    r"(?:[\[［](?:\d+\s*(?:[-–—,，]\s*\d+\s*)*)[\]］]|（[^（）\n]{1,40}?(?:19|20)\d{2}[^（）\n]{0,10}）|\([^()\n]{1,40}?(?:19|20)\d{2}[^()\n]{0,10}\))"
)
URL_RE = re.compile(r"(?:https?://|www\.)[^\s<>\]\[（）()]+", re.IGNORECASE)
CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")
LATIN_RE = re.compile(r"[A-Za-z]")


def _values(pattern: re.Pattern[str], text: str) -> Counter[str]:
    return Counter(match.group(0) for match in pattern.finditer(text))


def _difference(before: Counter[str], after: Counter[str]) -> tuple[list[str], list[str]]:
    removed = list((before - after).elements())
    added = list((after - before).elements())
    return removed, added


def _warning(category: str, label: str, before: Counter[str], after: Counter[str]) -> dict[str, Any] | None:
    removed, added = _difference(before, after)
    if not removed and not added:
        return None
    details: list[str] = []
    if removed:
        details.append(f"减少：{'、'.join(removed[:8])}")
    if added:
        details.append(f"新增：{'、'.join(added[:8])}")
    return {
        "category": category,
        "label": label,
        "removed": removed,
        "added": added,
        "message": f"{label}发生变化（{'；'.join(details)}）",
    }


def _dominant_language(text: str) -> str | None:
    cjk_count = len(CJK_RE.findall(text or ""))
    latin_count = len(LATIN_RE.findall(text or ""))
    total = cjk_count + latin_count
    if total < 80:
        return None
    if cjk_count / total >= 0.65:
        return "中文"
    if latin_count / total >= 0.65:
        return "英文"
    return None


def generate_rewrite_warnings(original: str, rewritten: str, protected_terms: Iterable[str] = ()) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []
    checks = (
        ("number", "数字", NUMBER_RE),
        ("citation", "引用", CITATION_RE),
        ("url", "URL", URL_RE),
    )
    for category, label, pattern in checks:
        value = _warning(category, label, _values(pattern, original), _values(pattern, rewritten))
        if value:
            warnings.append(value)
    terms = [str(term).strip() for term in protected_terms if str(term).strip()]
    if terms:
        before = Counter({term: original.count(term) for term in terms if original.count(term)})
        after = Counter({term: rewritten.count(term) for term in terms if rewritten.count(term)})
        value = _warning("protected_term", "保护词", before, after)
        if value:
            warnings.append(value)
    original_language = _dominant_language(original)
    rewritten_language = _dominant_language(rewritten)
    if original_language and rewritten_language and original_language != rewritten_language:
        warnings.append(
            {
                "category": "language",
                "label": "主要语言",
                "removed": [],
                "added": [],
                "message": f"主要语言可能发生变化（{original_language} → {rewritten_language}）",
            }
        )
    return warnings
