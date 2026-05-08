from __future__ import annotations

from chunking import Chunk, ChunkManifest, ParagraphManifest, restore_text_from_chunks, split_paragraph_to_chunks


def main() -> int:
    failures: list[str] = []
    text = (
        "This sentence contains SuperLongIdentifierTokenWithoutPunctuation and another ordinary phrase "
        * 10
    ).strip()
    chunks = split_paragraph_to_chunks(text, 120, "char")
    if len(chunks) < 2:
        failures.append("expected long English text to split")
    if " ".join(chunks) != text:
        failures.append("English chunk boundaries must preserve word spacing when restored")

    paragraph_a = "Using Qwen2.5-1.5B-Instruct as the base model."
    paragraph_b = "The adapter is then constructed with 500 samples employing 4-bit QLoRA."
    merged_output = f"{paragraph_a} {paragraph_b}"
    manifest = ChunkManifest(
        chunk_limit=1800,
        chunk_metric="char",
        paragraph_count=2,
        chunk_count=1,
        paragraphs=[
            ParagraphManifest(0, paragraph_a, ["p0_p1_c0"], "merged-short-paragraphs", len(paragraph_a)),
            ParagraphManifest(1, paragraph_b, ["p0_p1_c0"], "merged-short-paragraphs", len(paragraph_b)),
        ],
        chunks=[
            Chunk(
                "p0_p1_c0",
                0,
                0,
                f"{paragraph_a}\n\n{paragraph_b}",
                len(paragraph_a) + len(paragraph_b) + 2,
                17,
                paragraph_indices=[0, 1],
            )
        ],
    )
    restored_parts = restore_text_from_chunks(manifest, {"p0_p1_c0": merged_output}).split("\n\n")
    if restored_parts != [paragraph_a, paragraph_b]:
        failures.append(f"merged English output must split on safe sentence boundaries: {restored_parts}")

    if failures:
        raise AssertionError("; ".join(failures))
    print("chunking regression passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
