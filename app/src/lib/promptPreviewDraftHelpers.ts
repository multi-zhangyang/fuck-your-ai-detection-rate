import type { PromptId, PromptPreviewItem } from "@/types/app";

export function resolveActivePromptItem(
  items: PromptPreviewItem[],
  activePromptId: PromptId,
): PromptPreviewItem | null {
  return items.find((item) => item.id === activePromptId) ?? items[0] ?? null;
}

export function buildActivePromptVersion(activeItem: PromptPreviewItem | null): string {
  return activeItem ? `${activeItem.id}:${activeItem.updatedAt}:${activeItem.content.length}` : "";
}

export function isPromptDraftDirty(
  activeItem: PromptPreviewItem | null,
  draftContent: string,
): boolean {
  return Boolean(activeItem && draftContent !== activeItem.content);
}

export function isPromptMetaDirty(
  activeItem: PromptPreviewItem | null,
  draftLabel: string,
  draftDescription: string,
): boolean {
  return Boolean(
    activeItem
    && (draftLabel !== activeItem.label || draftDescription !== activeItem.description),
  );
}

export function countPromptContentLines(content: string): number {
  return content ? content.split(/\r?\n/).length : 0;
}

export function hasPromptPreviewUnsavedChanges(input: {
  dirty: boolean;
  metaDirty: boolean;
  createMode: boolean;
  newLabel: string;
  newDescription: string;
  newContent: string;
}): boolean {
  if (!input.createMode) {
    return input.dirty || input.metaDirty;
  }
  return Boolean(
    input.newLabel.trim()
    || input.newDescription.trim()
    || input.newContent.trim(),
  );
}
