from __future__ import annotations

import ast
import json
import re
from typing import Any


REASONING_BLOCKS = (
    re.compile(r"(?is)<think(?:ing)?\b[^>]*>.*?</think(?:ing)?>"),
    re.compile(r"(?is)<reasoning\b[^>]*>.*?</reasoning>"),
    re.compile(r"(?is)<\|begin_of_thought\|>.*?<\|end_of_thought\|>"),
)
FENCED_BLOCK_RE = re.compile(r"(?is)```(?P<label>[a-z0-9_-]*)\s*(?P<body>.*?)```")
TRAILING_COMMA_RE = re.compile(r",\s*([}\]])")
LINE_COMMENT_RE = re.compile(r"(?m)^\s*//.*?$")
BLOCK_COMMENT_RE = re.compile(r"(?s)/\*.*?\*/")
UNWRAP_OBJECT_KEYS = (
    "data",
    "result",
    "payload",
    "json",
    "arguments",
)


def extract_json_payload(text: str) -> Any:
    errors: list[str] = []
    for candidate in _iter_json_candidates(str(text or "")):
        for repaired in _iter_repaired_candidates(candidate):
            try:
                return json.loads(repaired)
            except json.JSONDecodeError as exc:
                errors.append(str(exc))
            try:
                literal = ast.literal_eval(repaired)
            except (SyntaxError, ValueError):
                continue
            if isinstance(literal, (dict, list)):
                return literal
    detail = errors[-1] if errors else "no JSON object or array candidate found"
    raise ValueError(f"Could not parse AI JSON response: {detail}")


def extract_json_object(text: str, *, allow_array: bool = True) -> dict[str, Any]:
    payload = _unwrap_json_payload(extract_json_payload(text))
    if isinstance(payload, dict):
        return dict(payload)
    if allow_array and isinstance(payload, list):
        return {"items": payload}
    raise ValueError("AI JSON response did not contain a JSON object.")


def _strip_reasoning_blocks(text: str) -> str:
    cleaned = str(text or "").lstrip("\ufeff")
    for pattern in REASONING_BLOCKS:
        cleaned = pattern.sub("", cleaned)
    return cleaned.strip()


def _iter_json_candidates(text: str) -> list[str]:
    cleaned = _strip_reasoning_blocks(text)
    candidates: list[str] = []

    fenced_matches = list(FENCED_BLOCK_RE.finditer(cleaned))
    for match in sorted(fenced_matches, key=lambda item: 0 if item.group("label").lower() in {"json", "jsonc"} else 1):
        candidates.append(match.group("body").strip())

    candidates.append(cleaned.strip())
    candidates.extend(_balanced_json_spans(cleaned))

    seen: set[str] = set()
    deduped: list[str] = []
    for candidate in candidates:
        normalized = _strip_json_label(candidate)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    return deduped


def _strip_json_label(candidate: str) -> str:
    stripped = str(candidate or "").strip().lstrip("\ufeff")
    if stripped.lower().startswith("json\n"):
        return stripped[5:].strip()
    if stripped.lower().startswith("json\r\n"):
        return stripped[6:].strip()
    return stripped


def _balanced_json_spans(text: str) -> list[str]:
    spans: list[str] = []
    start: int | None = None
    stack: list[str] = []
    in_string = False
    escape = False

    for index, char in enumerate(text):
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            continue
        if char in "{[":
            if not stack:
                start = index
            stack.append("}" if char == "{" else "]")
            continue
        if char in "}]":
            if not stack:
                continue
            expected = stack.pop()
            if char != expected:
                start = None
                stack = []
                continue
            if not stack and start is not None:
                spans.append(text[start : index + 1])
                start = None

    if stack and start is not None:
        spans.append(text[start:] + "".join(reversed(stack)))
    return spans


def _iter_repaired_candidates(candidate: str) -> list[str]:
    base = _strip_json_label(candidate)
    variants = [
        base,
        _strip_json_comments(base),
        _auto_close_json(base),
        _auto_close_json(_strip_json_comments(base)),
    ]
    repaired: list[str] = []
    seen: set[str] = set()
    for value in variants:
        normalized = TRAILING_COMMA_RE.sub(r"\1", value.strip())
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        repaired.append(normalized)
    return repaired


def _strip_json_comments(candidate: str) -> str:
    return BLOCK_COMMENT_RE.sub("", LINE_COMMENT_RE.sub("", candidate))


def _auto_close_json(candidate: str) -> str:
    stack: list[str] = []
    in_string = False
    escape = False
    for char in candidate:
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
            continue
        if char == "{":
            stack.append("}")
        elif char == "[":
            stack.append("]")
        elif char in "}]":
            if stack and stack[-1] == char:
                stack.pop()
            else:
                return candidate
    if in_string:
        return candidate
    return candidate + "".join(reversed(stack))


def _unwrap_json_payload(payload: Any) -> Any:
    current = payload
    for _ in range(4):
        if isinstance(current, str):
            current = extract_json_payload(current)
            continue
        if not isinstance(current, dict):
            return current
        if _has_primary_object_fields(current):
            return current
        unwrapped = False
        for key in UNWRAP_OBJECT_KEYS:
            value = current.get(key)
            if isinstance(value, (dict, list)) or (isinstance(value, str) and _looks_like_json(value)):
                current = value
                unwrapped = True
                break
        if not unwrapped:
            return current
    return current


def _has_primary_object_fields(payload: dict[str, Any]) -> bool:
    return any(key not in UNWRAP_OBJECT_KEYS for key in payload)


def _looks_like_json(value: str) -> bool:
    stripped = value.strip()
    return stripped.startswith("{") or stripped.startswith("[") or stripped.startswith("```")
