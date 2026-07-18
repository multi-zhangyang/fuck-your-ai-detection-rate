import type { ConfirmDialogOptions } from "@/lib/uiTypes";
import type { DiffFilterMode } from "@/lib/diffFilterModel";

export function buildConfirmDialogState(options: ConfirmDialogOptions, id = Date.now()) {
  return {
    ...options,
    tone: options.tone ?? "neutral",
    confirmLabel: options.confirmLabel ?? "确定",
    cancelLabel: options.cancelLabel ?? "取消",
    id,
  };
}

export function nextDiffFocusRequest(
  current: { filterMode: DiffFilterMode; chunkId?: string; nonce: number } | null | undefined,
  filterMode: DiffFilterMode,
  chunkId?: string,
) {
  return {
    filterMode,
    chunkId,
    nonce: (current?.nonce ?? 0) + 1,
  };
}

export function markAllNotificationsRead<T extends { read: boolean }>(items: T[]): T[] {
  if (items.every((item) => item.read)) {
    return items;
  }
  return items.map((item) => ({ ...item, read: true }));
}
