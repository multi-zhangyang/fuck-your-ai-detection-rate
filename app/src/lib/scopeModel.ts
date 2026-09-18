import type { CoreDocument, DocumentParagraph, ProtectionMapUnit } from "@/types/core";

export type ScopeState = "selected" | "available" | "locked";

export interface ScopeCounts {
  selected: number;
  available: number;
  locked: number;
  total: number;
}

function fallbackUnit(paragraph: DocumentParagraph, unitIndex: number): ProtectionMapUnit {
  return {
    unitIndex,
    paragraphId: paragraph.id,
    state: paragraph.safe ? (paragraph.selected ? "editable" : "available") : "locked",
    editable: paragraph.selected,
    selectable: paragraph.safe,
    reason: paragraph.protectionReason || paragraph.suggestionReason || "user_choice",
    label: paragraph.safe ? (paragraph.selected ? "正文" : "可选正文") : "固定内容",
    text: paragraph.text,
    styleId: paragraph.styleId,
    styleName: paragraph.styleName || "",
    order: paragraph.order,
  };
}

export function documentScopeUnits(document: CoreDocument): ProtectionMapUnit[] {
  const units = document.protectionMap.units?.length
    ? [...document.protectionMap.units]
    : document.paragraphs.map((paragraph, index) => fallbackUnit(paragraph, index));
  const included = new Set(units.map((unit) => unit.paragraphId).filter(Boolean));
  let nextIndex = units.reduce((maximum, unit) => Math.max(maximum, unit.unitIndex), -1) + 1;
  for (const paragraph of document.paragraphs) {
    if (!included.has(paragraph.id)) {
      units.push(fallbackUnit(paragraph, nextIndex));
      nextIndex += 1;
    }
  }
  return units.sort((left, right) => left.unitIndex - right.unitIndex);
}

export function scopeStateOf(unit: ProtectionMapUnit, selectedIds: ReadonlySet<string>): ScopeState {
  if (!unit.selectable || !unit.paragraphId) return "locked";
  return selectedIds.has(unit.paragraphId) ? "selected" : "available";
}

export function scopeCountsFromUnits(
  units: ProtectionMapUnit[],
  selectedIds: ReadonlySet<string>,
): ScopeCounts {
  return units.reduce<ScopeCounts>((result, unit) => {
    const state = scopeStateOf(unit, selectedIds);
    if (unit.text.trim() || state === "locked") {
      result[state] += 1;
      result.total += 1;
    }
    return result;
  }, { selected: 0, available: 0, locked: 0, total: 0 });
}

export function documentScopeCounts(
  document: CoreDocument,
  selectedIds: ReadonlySet<string>,
): ScopeCounts {
  return scopeCountsFromUnits(documentScopeUnits(document), selectedIds);
}
