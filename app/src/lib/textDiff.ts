import { diffArrays } from "diff";

export type TextDiffKind = "equal" | "added" | "removed";

export interface TextDiffPart {
  kind: TextDiffKind;
  value: string;
}

const TOKEN_PATTERN = /\r\n|[\r\n]|[^\S\r\n]+|\p{Script=Han}|[\p{L}\p{N}]+(?:[._:/+#@'’-][\p{L}\p{N}]+)*|./gu;

export function tokenizeForDiff(text: string): string[] {
  return text.match(TOKEN_PATTERN) || [];
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

  return parts;
}
