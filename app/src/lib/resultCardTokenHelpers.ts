import type { RoundCompareData } from "@/types/app";

export function extractNumberTokens(text: string): string[] {
  return [...text.matchAll(/(?:^|[^\w.])(\d+(?:\.\d+)?%?)/g)].map((match) => match[1]).filter(Boolean);
}

export function extractCitationTokens(text: string): string[] {
  const bracketCitations = text.match(/\[[\d,\-\s]+\]/g) ?? [];
  const authorYearCitations = text.match(/[（(][^（）()]{0,24}\d{4}[a-z]?[^（）()]{0,24}[）)]/gi) ?? [];
  return [...bracketCitations, ...authorYearCitations];
}

export function uniqueTokens(tokens: string[]): string[] {
  return [...new Set(tokens.map((token) => token.replace(/\s+/g, "").trim()).filter(Boolean))];
}

export function findMissingTokens(sourceTokens: string[], outputTokens: string[]): string[] {
  const outputSet = new Set(uniqueTokens(outputTokens));
  return uniqueTokens(sourceTokens).filter((token) => !outputSet.has(token));
}

export function normalizeDiffText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function hasTokenDifference(sourceText: string, outputText: string, extractor: (text: string) => string[]): boolean {
  const sourceTokens = extractor(sourceText);
  const outputTokens = extractor(outputText);
  return findMissingTokens(sourceTokens, outputTokens).length > 0 || findMissingTokens(outputTokens, sourceTokens).length > 0;
}

export function hasChunkTextChange(chunk: RoundCompareData["chunks"][number]): boolean {
  const inputText = normalizeDiffText(chunk.inputText);
  return normalizeDiffText(chunk.outputText) !== inputText;
}

export function compactFeedbackText(text: string, maxLength = 220): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}
