import { diffArrays } from "diff";

export type TextDiffKind = "equal" | "added" | "removed";

export interface TextDiffPart {
  kind: TextDiffKind;
  value: string;
}

interface SegmentValue {
  segment: string;
}

interface SegmenterLike {
  segment(value: string): Iterable<SegmentValue>;
}

type SegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: "word" },
) => SegmenterLike;

const TOKEN_PATTERN = /\r\n|[\r\n]|[^\S\r\n]+|\p{Script=Han}+|[\p{L}\p{N}]+(?:[._:/+#@'’-][\p{L}\p{N}]+)*|./gu;
const HAN_PATTERN = /^\p{Script=Han}+$/u;
const Segmenter = (Intl as typeof Intl & { Segmenter?: SegmenterConstructor }).Segmenter;
const CHINESE_SEGMENTER = Segmenter ? new Segmenter("zh-CN", { granularity: "word" }) : null;

function segmentChinese(value: string): string[] {
  if (!CHINESE_SEGMENTER) return [...value];
  return [...CHINESE_SEGMENTER.segment(value)].map((item) => item.segment).filter(Boolean);
}

function weakAnchor(value: string): boolean {
  const compact = value.replace(/\s+/gu, "");
  if (!compact) return true;
  if (/^[\p{P}\p{S}]+$/u.test(compact)) return true;
  return /^\p{Script=Han}$/u.test(compact);
}

function mergeAdjacent(parts: TextDiffPart[]): TextDiffPart[] {
  const merged: TextDiffPart[] = [];
  for (const part of parts) {
    if (!part.value) continue;
    const previous = merged[merged.length - 1];
    if (previous?.kind === part.kind) previous.value += part.value;
    else merged.push({ ...part });
  }
  return merged;
}

function removeNoisyAnchors(parts: TextDiffPart[]): TextDiffPart[] {
  const cleaned: TextDiffPart[] = [];
  for (const [index, part] of parts.entries()) {
    const previous = parts[index - 1];
    const next = parts[index + 1];
    if (
      part.kind === "equal"
      && weakAnchor(part.value)
      && previous?.kind !== "equal"
      && next?.kind !== "equal"
    ) {
      cleaned.push({ kind: "removed", value: part.value });
      cleaned.push({ kind: "added", value: part.value });
    } else {
      cleaned.push(part);
    }
  }
  return mergeAdjacent(cleaned);
}

export function tokenizeForDiff(text: string): string[] {
  const blocks = text.match(TOKEN_PATTERN) || [];
  return blocks.flatMap((block) => HAN_PATTERN.test(block) ? segmentChinese(block) : [block]);
}

export function createTextDiff(original: string, rewritten: string): TextDiffPart[] {
  const changes = diffArrays(tokenizeForDiff(original), tokenizeForDiff(rewritten));
  const parts: TextDiffPart[] = [];

  for (const change of changes) {
    const value = change.value.join("");
    if (!value) continue;
    const kind: TextDiffKind = change.added ? "added" : change.removed ? "removed" : "equal";
    const previous = parts[parts.length - 1];
    if (previous?.kind === kind) previous.value += value;
    else parts.push({ kind, value });
  }

  return removeNoisyAnchors(parts);
}
