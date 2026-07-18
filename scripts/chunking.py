from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal


DEFAULT_CHUNK_LIMIT = 1800
MAX_PARAGRAPHS_PER_CHUNK = 4
# ``chunk_limit`` is the public contract.  Older code silently replaced the
# default 1800-character limit with a 280-character "adaptive" limit.  A
# normal 400--800 character thesis paragraph was therefore rewritten as two or
# three context-free fragments even though it fit comfortably in one model
# request.  Keep complete paragraphs whenever they fit, and only split truly
# oversized paragraphs.  When a split is required, leave some headroom instead
# of falling all the way back to tiny sentence groups.
GENERATION_TARGET_RATIO = 0.80
CN_MIN_TAIL_LIMIT = 90
EN_MIN_TAIL_CHAR_LIMIT = 140
WORD_MIN_TAIL_LIMIT = 35
SENTENCE_BOUNDARY_RE = re.compile(r"(?<=[。！？；!?;])")
ENGLISH_SENTENCE_BOUNDARY_RE = re.compile(r"(?<=[.!?;:])\s+")
WORD_RE = re.compile(r"\b\w+(?:[-']\w+)*\b")
CJK_CHAR_RE = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF]")
ChunkMetric = Literal["char", "word"]


@dataclass
class Chunk:
    chunk_id: str
    paragraph_index: int
    chunk_index: int
    text: str
    char_count: int
    word_count: int
    paragraph_indices: list[int] | None = None


@dataclass
class ParagraphManifest:
    paragraph_index: int
    original_text: str
    chunk_ids: list[str]
    split_reason: str
    original_metric_count: int


@dataclass
class ChunkManifest:
    chunk_limit: int
    chunk_metric: ChunkMetric
    paragraph_count: int
    chunk_count: int
    paragraphs: list[ParagraphManifest]
    chunks: list[Chunk]

    def to_dict(self) -> dict:
        return {
            "chunk_limit": self.chunk_limit,
            "chunk_metric": self.chunk_metric,
            "paragraph_count": self.paragraph_count,
            "chunk_count": self.chunk_count,
            "paragraphs": [asdict(paragraph) for paragraph in self.paragraphs],
            "chunks": [asdict(chunk) for chunk in self.chunks],
        }


def split_text_to_paragraphs(text: str) -> list[str]:
    normalized = text.replace("\r\n", "\n")
    paragraphs: list[str] = []
    current: list[str] = []
    for raw_line in normalized.split("\n"):
        line = raw_line.rstrip()
        if not line.strip():
            if current:
                paragraphs.append("\n".join(current).strip())
                current = []
            continue
        current.append(line)
    if current:
        paragraphs.append("\n".join(current).strip())
    return paragraphs


def split_paragraph_to_chunks(paragraph: str, chunk_limit: int, chunk_metric: ChunkMetric = "char") -> list[str]:
    compact = paragraph.strip()
    if not compact:
        return []
    paragraph_language = _detect_paragraph_language(compact)
    adaptive_limit = _adaptive_generation_chunk_limit(compact, chunk_limit, chunk_metric, paragraph_language)
    if _measure_chunk(compact, chunk_metric) <= adaptive_limit:
        return [compact]

    sentences = _split_into_generation_sentences(compact, chunk_metric, paragraph_language)
    target_limit = _target_generation_chunk_limit(chunk_limit, chunk_metric, paragraph_language)
    hard_limit = _hard_generation_chunk_limit(chunk_limit, chunk_metric, paragraph_language)
    min_tail_limit = _min_tail_generation_chunk_limit(chunk_metric, paragraph_language)
    chunks: list[str] = []
    current = ""

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        if _measure_chunk(sentence, chunk_metric) > hard_limit:
            if current:
                chunks.append(current)
                current = ""
            chunks.extend(_split_long_sentence(sentence, target_limit, chunk_metric))
            continue

        candidate = sentence if not current else _join_fragments(current, sentence, chunk_metric)
        if _measure_chunk(candidate, chunk_metric) <= target_limit or (
            _measure_chunk(current, chunk_metric) < min_tail_limit
            and _measure_chunk(candidate, chunk_metric) <= hard_limit
        ):
            current = candidate
            continue

        chunks.append(current)
        current = sentence

    if current:
        chunks.append(current)
    return _merge_tiny_tail_chunks(chunks, chunk_metric, paragraph_language, chunk_limit)


def build_manifest(text: str, chunk_limit: int = DEFAULT_CHUNK_LIMIT, chunk_metric: ChunkMetric = "char") -> ChunkManifest:
    paragraphs = split_text_to_paragraphs(text)
    manifest_paragraphs: list[ParagraphManifest] = []
    manifest_chunks: list[Chunk] = []

    for paragraph_index, paragraph in enumerate(paragraphs):
        original_metric_count = _measure_chunk(paragraph.strip(), chunk_metric)
        chunk_texts = split_paragraph_to_chunks(paragraph, chunk_limit, chunk_metric=chunk_metric)
        split_reason = _describe_split_reason(
            chunk_texts,
            original_metric_count=original_metric_count,
            chunk_limit=chunk_limit,
        )
        chunk_ids: list[str] = []
        for chunk_index, chunk_text in enumerate(chunk_texts):
            chunk_id = f"p{paragraph_index}_c{chunk_index}"
            chunk_ids.append(chunk_id)
            manifest_chunks.append(
                Chunk(
                    chunk_id=chunk_id,
                    paragraph_index=paragraph_index,
                    chunk_index=chunk_index,
                    text=chunk_text,
                    char_count=len(chunk_text),
                    word_count=count_words(chunk_text),
                )
            )
        manifest_paragraphs.append(
            ParagraphManifest(
                paragraph_index=paragraph_index,
                original_text=paragraph,
                chunk_ids=chunk_ids,
                split_reason=split_reason,
                original_metric_count=original_metric_count,
            )
        )

    return ChunkManifest(
        chunk_limit=chunk_limit,
        chunk_metric=chunk_metric,
        paragraph_count=len(manifest_paragraphs),
        chunk_count=len(manifest_chunks),
        paragraphs=manifest_paragraphs,
        chunks=manifest_chunks,
    )


def _build_merged_paragraph_manifest(
    paragraphs: list[str],
    *,
    chunk_limit: int,
    chunk_metric: ChunkMetric,
) -> ChunkManifest:
    manifest_paragraphs = [
        ParagraphManifest(
            paragraph_index=paragraph_index,
            original_text=paragraph,
            chunk_ids=[],
            split_reason="pending",
            original_metric_count=_measure_chunk(paragraph.strip(), chunk_metric),
        )
        for paragraph_index, paragraph in enumerate(paragraphs)
    ]
    manifest_chunks: list[Chunk] = []

    current_indices: list[int] = []
    current_parts: list[str] = []
    current_language = ""

    def flush_current() -> None:
        nonlocal current_language
        if not current_indices:
            return
        chunk_text = "\n\n".join(part.strip() for part in current_parts if part.strip()).strip()
        chunk_id = f"p{current_indices[0]}_p{current_indices[-1]}_c0"
        manifest_chunks.append(
            Chunk(
                chunk_id=chunk_id,
                paragraph_index=current_indices[0],
                chunk_index=0,
                text=chunk_text,
                char_count=len(chunk_text),
                word_count=count_words(chunk_text),
                paragraph_indices=list(current_indices),
            )
        )
        split_reason = "paragraph-kept" if len(current_indices) == 1 else "merged-short-paragraphs"
        for paragraph_index in current_indices:
            manifest_paragraphs[paragraph_index].chunk_ids = [chunk_id]
            manifest_paragraphs[paragraph_index].split_reason = split_reason
        current_indices.clear()
        current_parts.clear()
        current_language = ""

    for paragraph_index, paragraph in enumerate(paragraphs):
        clean_paragraph = paragraph.strip()
        if not clean_paragraph:
            continue
        paragraph_language = _detect_paragraph_language(clean_paragraph)
        if _is_standalone_paragraph(clean_paragraph):
            flush_current()
            chunk_id = f"p{paragraph_index}_c0"
            manifest_chunks.append(
                Chunk(
                    chunk_id=chunk_id,
                    paragraph_index=paragraph_index,
                    chunk_index=0,
                    text=clean_paragraph,
                    char_count=len(clean_paragraph),
                    word_count=count_words(clean_paragraph),
                    paragraph_indices=[paragraph_index],
                )
            )
            manifest_paragraphs[paragraph_index].chunk_ids = [chunk_id]
            manifest_paragraphs[paragraph_index].split_reason = "standalone-paragraph"
            continue
        paragraph_metric_count = _measure_chunk(clean_paragraph, chunk_metric)
        if paragraph_metric_count > chunk_limit:
            flush_current()
            chunk_texts = split_paragraph_to_chunks(clean_paragraph, chunk_limit, chunk_metric=chunk_metric)
            chunk_ids: list[str] = []
            for chunk_index, chunk_text in enumerate(chunk_texts):
                chunk_id = f"p{paragraph_index}_c{chunk_index}"
                chunk_ids.append(chunk_id)
                manifest_chunks.append(
                    Chunk(
                        chunk_id=chunk_id,
                        paragraph_index=paragraph_index,
                        chunk_index=chunk_index,
                        text=chunk_text,
                        char_count=len(chunk_text),
                        word_count=count_words(chunk_text),
                        paragraph_indices=[paragraph_index],
                    )
                )
            manifest_paragraphs[paragraph_index].chunk_ids = chunk_ids
            manifest_paragraphs[paragraph_index].split_reason = "oversized-paragraph"
            continue

        if current_language and paragraph_language != current_language:
            flush_current()
        candidate_parts = [*current_parts, clean_paragraph]
        candidate_text = "\n\n".join(candidate_parts).strip()
        would_exceed_limit = bool(current_indices) and _measure_chunk(candidate_text, chunk_metric) > chunk_limit
        would_exceed_count = len(current_indices) >= MAX_PARAGRAPHS_PER_CHUNK
        if would_exceed_limit or would_exceed_count:
            flush_current()
        current_language = paragraph_language
        current_indices.append(paragraph_index)
        current_parts.append(clean_paragraph)

    flush_current()

    return ChunkManifest(
        chunk_limit=chunk_limit,
        chunk_metric=chunk_metric,
        paragraph_count=len(manifest_paragraphs),
        chunk_count=len(manifest_chunks),
        paragraphs=manifest_paragraphs,
        chunks=manifest_chunks,
    )


def _detect_paragraph_language(paragraph: str) -> str:
    latin_words = len(WORD_RE.findall(paragraph))
    cjk_chars = len(CJK_CHAR_RE.findall(paragraph))
    latin_chars = sum(1 for char in paragraph if char.isascii() and char.isalpha())
    if latin_words >= 5 and cjk_chars == 0 and latin_chars >= 25:
        return "en"
    if latin_words >= 8 and cjk_chars <= 4 and latin_chars >= max(30, cjk_chars * 8):
        return "en"
    if latin_words >= 12 and latin_chars >= max(40, cjk_chars * 6):
        return "en"
    return "default"


def _adaptive_generation_chunk_limit(
    paragraph: str,
    chunk_limit: int,
    chunk_metric: ChunkMetric,
    paragraph_language: str,
) -> int:
    # The limit supplied by the caller is already selected for the active
    # model/profile.  Language-specific hidden caps make the UI/API value
    # misleading and, more importantly, destroy paragraph-level coherence.
    return max(1, chunk_limit)


def _target_generation_chunk_limit(chunk_limit: int, chunk_metric: ChunkMetric, paragraph_language: str) -> int:
    return max(1, min(chunk_limit, round(chunk_limit * GENERATION_TARGET_RATIO)))


def _hard_generation_chunk_limit(chunk_limit: int, chunk_metric: ChunkMetric, paragraph_language: str) -> int:
    return max(1, chunk_limit)


def _min_tail_generation_chunk_limit(chunk_metric: ChunkMetric, paragraph_language: str) -> int:
    if chunk_metric == "word":
        return WORD_MIN_TAIL_LIMIT
    if paragraph_language == "en":
        return EN_MIN_TAIL_CHAR_LIMIT
    return CN_MIN_TAIL_LIMIT


def _split_into_generation_sentences(text: str, chunk_metric: ChunkMetric, paragraph_language: str) -> list[str]:
    if paragraph_language == "en" or chunk_metric == "word":
        return _split_english_sentences(text)
    return _split_into_sentences(text, chunk_metric)


def _split_english_sentences(text: str) -> list[str]:
    pieces = re.split(r"(?<=[.!?;:])\s+", text.strip())
    sentences = [piece.strip() for piece in pieces if piece and piece.strip()]
    return sentences or [text]


def _merge_tiny_tail_chunks(
    chunks: list[str],
    chunk_metric: ChunkMetric,
    paragraph_language: str,
    chunk_limit: int,
) -> list[str]:
    cleaned = [chunk.strip() for chunk in chunks if chunk and chunk.strip()]
    if len(cleaned) <= 1:
        return cleaned

    hard_limit = _hard_generation_chunk_limit(chunk_limit, chunk_metric, paragraph_language)
    min_tail_limit = _min_tail_generation_chunk_limit(chunk_metric, paragraph_language)
    merged: list[str] = []
    for chunk in cleaned:
        if (
            merged
            and _measure_chunk(chunk, chunk_metric) < min_tail_limit
            and _measure_chunk(_join_fragments(merged[-1], chunk, chunk_metric), chunk_metric) <= hard_limit
        ):
            merged[-1] = _join_fragments(merged[-1], chunk, chunk_metric)
        else:
            merged.append(chunk)

    if len(merged) >= 2 and _measure_chunk(merged[-1], chunk_metric) < min_tail_limit:
        candidate = _join_fragments(merged[-2], merged[-1], chunk_metric)
        merge_limit = min(
            chunk_limit,
            max(hard_limit, _target_generation_chunk_limit(chunk_limit, chunk_metric, paragraph_language) + min_tail_limit),
        )
        if _measure_chunk(candidate, chunk_metric) <= merge_limit:
            merged[-2] = candidate
            merged.pop()
    return merged


def _is_standalone_paragraph(paragraph: str) -> bool:
    compact = paragraph.strip()
    if not compact:
        return True
    if len(compact) > 80:
        return False
    heading_patterns = (
        r"^摘\s*要$",
        r"^关键词[:：]?.*$",
        r"^Abstract$",
        r"^Key\s+words?[:：]?.*$",
        r"^目录$",
        r"^参考文献$",
        r"^致\s*谢$",
        r"^图\s*\d*[\s、：:].*",
        r"^表\s*\d*[\s、：:].*",
        r"^\d+(?:\.\d+){0,3}\s+\S+.*$",
        r"^第[一二三四五六七八九十\d]+[章节]\s*.*$",
    )
    return any(re.match(pattern, compact, flags=re.IGNORECASE) for pattern in heading_patterns)


def restore_text_from_chunks(manifest: ChunkManifest, chunk_results: dict[str, str]) -> str:
    merged_outputs = _restore_merged_paragraph_outputs(manifest, chunk_results)
    if merged_outputs is not None:
        return "\n\n".join(merged_outputs)

    restored_paragraphs: list[str] = []
    for paragraph in manifest.paragraphs:
        parts = [chunk_results[chunk_id].strip() for chunk_id in paragraph.chunk_ids]
        restored_paragraphs.append(_join_rewritten_parts(parts, manifest.chunk_metric))
    return "\n\n".join(restored_paragraphs)


def _restore_merged_paragraph_outputs(manifest: ChunkManifest, chunk_results: dict[str, str]) -> list[str] | None:
    if not any((chunk.paragraph_indices or []) for chunk in manifest.chunks):
        return None

    restored_by_index: dict[int, str] = {}
    for chunk in manifest.chunks:
        paragraph_indices = chunk.paragraph_indices or [chunk.paragraph_index]
        output = chunk_results[chunk.chunk_id].strip()
        if len(paragraph_indices) == 1:
            restored_by_index[paragraph_indices[0]] = output
            continue
        original_parts = [manifest.paragraphs[index].original_text for index in paragraph_indices]
        restored_parts = _split_merged_output_to_paragraphs(output, original_parts)
        for paragraph_index, restored_part in zip(paragraph_indices, restored_parts):
            restored_by_index[paragraph_index] = restored_part.strip()

    return [restored_by_index.get(paragraph.paragraph_index, "") for paragraph in manifest.paragraphs]


def _split_merged_output_to_paragraphs(output: str, original_parts: list[str]) -> list[str]:
    expected_count = len(original_parts)
    split_by_blank = [part.strip() for part in re.split(r"\n\s*\n", output.strip()) if part.strip()]
    if len(split_by_blank) == expected_count:
        return split_by_blank
    if len(split_by_blank) > expected_count:
        return [*split_by_blank[: expected_count - 1], "\n\n".join(split_by_blank[expected_count - 1 :]).strip()]
    return _split_text_by_original_ratios(output, original_parts)


def _split_text_by_original_ratios(output: str, original_parts: list[str]) -> list[str]:
    compact_output = output.strip()
    expected_count = len(original_parts)
    if expected_count <= 1:
        return [compact_output]
    original_lengths = [max(1, len(part.strip())) for part in original_parts]
    total_original = sum(original_lengths)
    cursor = 0
    restored: list[str] = []
    for index, original_length in enumerate(original_lengths[:-1]):
        remaining_parts = expected_count - index
        remaining_chars = len(compact_output) - cursor
        if remaining_chars <= remaining_parts:
            restored.append(compact_output[cursor:].strip())
            cursor = len(compact_output)
            continue
        ideal_end = cursor + round(len(compact_output) * original_length / total_original)
        split_at = _find_nearby_sentence_boundary(compact_output, ideal_end, cursor + 1, len(compact_output) - (remaining_parts - 1))
        restored.append(compact_output[cursor:split_at].strip())
        cursor = split_at
    restored.append(compact_output[cursor:].strip())
    return restored


def _find_nearby_sentence_boundary(text: str, ideal_end: int, min_end: int, max_end: int) -> int:
    ideal_end = max(min_end, min(max_end, ideal_end))
    sentence_boundaries = "。！？；：.!?;:"
    soft_boundaries = "，、, \t\r\n"
    best_index = -1
    best_rank: tuple[int, int] | None = None
    start = max(min_end, ideal_end - 120)
    end = min(max_end, ideal_end + 120)
    for index in range(start, end + 1):
        left = text[index - 1] if index > 0 else ""
        right = text[index] if index < len(text) else ""
        priority: int | None = None
        if left in sentence_boundaries:
            priority = 0
        elif left in soft_boundaries or right in soft_boundaries:
            priority = 1
        elif not (left.isascii() and right.isascii() and left.isalnum() and right.isalnum()):
            priority = 2
        if priority is None:
            continue
        rank = (priority, abs(index - ideal_end))
        if best_rank is None or rank < best_rank:
            best_rank = rank
            best_index = index
    return best_index if best_index >= min_end else ideal_end


def _join_rewritten_parts(parts: list[str], chunk_metric: ChunkMetric) -> str:
    cleaned_parts = [part for part in parts if part]
    if not cleaned_parts:
        return ""
    if chunk_metric == "word":
        return _join_english_rewritten_parts(cleaned_parts)
    text = cleaned_parts[0]
    for part in cleaned_parts[1:]:
        text = _join_fragments(text, part, chunk_metric)
    return text.strip()


def _join_english_rewritten_parts(parts: list[str]) -> str:
    text = parts[0]
    for part in parts[1:]:
        if not text:
            text = part
            continue
        if not part:
            continue
        if text[-1].isspace() or part[0].isspace():
            text = f"{text}{part}"
        elif text[-1] in "([{\"'??" or part[0] in ".,;:!?)]}\"'??":
            text = f"{text}{part}"
        else:
            text = f"{text} {part}"
    return re.sub(r"\s+([.,;:!?)])", r"\1", text).strip()


def save_manifest(manifest: ChunkManifest, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")


def load_manifest(path: Path) -> ChunkManifest:
    data = json.loads(path.read_text(encoding="utf-8"))
    return ChunkManifest(
        chunk_limit=int(data["chunk_limit"]),
        chunk_metric=str(data.get("chunk_metric", "char")),
        paragraph_count=int(data["paragraph_count"]),
        chunk_count=int(data["chunk_count"]),
        paragraphs=[ParagraphManifest(**paragraph) for paragraph in data["paragraphs"]],
        chunks=[Chunk(**chunk) for chunk in data["chunks"]],
    )


def count_words(text: str) -> int:
    return len(WORD_RE.findall(text))


def _measure_chunk(text: str, chunk_metric: ChunkMetric) -> int:
    if chunk_metric == "word":
        return count_words(text)
    return len(text)


def _describe_split_reason(chunk_texts: list[str], *, original_metric_count: int, chunk_limit: int) -> str:
    if not chunk_texts:
        return "empty"
    if len(chunk_texts) == 1:
        return "paragraph-kept"
    if original_metric_count > chunk_limit:
        return "oversized-paragraph"
    return "sentence-group"


def _join_fragments(left: str, right: str, chunk_metric: ChunkMetric) -> str:
    if chunk_metric == "word":
        return f"{left} {right}".strip()
    if not left:
        return right.strip()
    if not right:
        return left.strip()
    left = left.strip()
    right = right.strip()
    if _needs_generation_space(left[-1], right[0]):
        return f"{left} {right}"
    return f"{left}{right}"


def _needs_generation_space(left: str, right: str) -> bool:
    if not left or not right:
        return False
    if not (left.isascii() and right.isascii()):
        return False
    if left.isspace() or right.isspace():
        return False
    if left.isalnum() and right.isalnum():
        return True
    if left in ".!?;:," and right.isalnum():
        return True
    if left.isalnum() and right in "([{":
        return True
    return False


def _split_into_sentences(text: str, chunk_metric: ChunkMetric) -> list[str]:
    pieces = ENGLISH_SENTENCE_BOUNDARY_RE.split(text) if chunk_metric == "word" else SENTENCE_BOUNDARY_RE.split(text)
    sentences = [piece.strip() for piece in pieces if piece and piece.strip()]
    return sentences or [text]


def _split_long_sentence(sentence: str, chunk_limit: int, chunk_metric: ChunkMetric) -> list[str]:
    fragments = re.split(r"(?<=[，、：:,])|(?<=[,;:])\s+", sentence)
    chunks: list[str] = []
    current = ""
    for fragment in fragments:
        fragment = fragment.strip()
        if not fragment:
            continue
        candidate = fragment if not current else _join_fragments(current, fragment, chunk_metric)
        if _measure_chunk(candidate, chunk_metric) <= chunk_limit:
            current = candidate
            continue
        if current:
            chunks.append(current)
            current = ""
        if _measure_chunk(fragment, chunk_metric) <= chunk_limit:
            current = fragment
            continue
        chunks.extend(_split_oversized_fragment(fragment, chunk_limit, chunk_metric))
    if current:
        chunks.append(current)
    return chunks


def _split_oversized_fragment(fragment: str, chunk_limit: int, chunk_metric: ChunkMetric) -> list[str]:
    if chunk_metric == "word":
        words = fragment.split()
        chunks: list[str] = []
        current_words: list[str] = []
        for word in words:
            candidate_words = [*current_words, word]
            if len(candidate_words) <= chunk_limit:
                current_words = candidate_words
                continue
            if current_words:
                chunks.append(" ".join(current_words))
            current_words = [word]
        if current_words:
            chunks.append(" ".join(current_words))
        return chunks

    return _split_oversized_text_by_safe_boundary(fragment, chunk_limit)


def _split_oversized_text_by_safe_boundary(fragment: str, chunk_limit: int) -> list[str]:
    chunks: list[str] = []
    remaining = fragment.strip()
    soft_boundaries = " \t。！？；;，、,:："
    while len(remaining) > chunk_limit:
        window = remaining[:chunk_limit]
        split_at = max(window.rfind(boundary) for boundary in soft_boundaries)
        if split_at < max(80, int(chunk_limit * 0.55)):
            split_at = chunk_limit
        else:
            split_at += 1
        chunks.append(remaining[:split_at].strip())
        remaining = remaining[split_at:].strip()
    if remaining:
        chunks.append(remaining)
    return chunks


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Chunk paper text by paragraph and sentence boundaries")
    subparsers = parser.add_subparsers(dest="command", required=True)

    build_parser = subparsers.add_parser("build", help="Build a chunk manifest from a text file")
    build_parser.add_argument("input", type=Path)
    build_parser.add_argument("output", type=Path)
    build_parser.add_argument("--chunk-limit", type=int, default=DEFAULT_CHUNK_LIMIT)
    build_parser.add_argument("--chunk-metric", choices=["char", "word"], default="char")

    args = parser.parse_args(argv)

    if args.command == "build":
        text = args.input.read_text(encoding="utf-8")
        manifest = build_manifest(text, chunk_limit=args.chunk_limit, chunk_metric=args.chunk_metric)
        save_manifest(manifest, args.output)
        return

    parser.error("Unknown command")


if __name__ == "__main__":
    main()
