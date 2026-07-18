import { isRawHtmlErrorText } from "@/lib/errorText";
import { readStorageValue, writeStorageValue } from "@/lib/safeStorage";
import type { AppNotification, NotificationKind } from "@/lib/uiTypes";

export const NOTIFICATION_HISTORY_KEY = "fyadr.notificationHistory";

export function loadNotificationHistory(): AppNotification[] {
  try {
    const raw = readStorageValue(NOTIFICATION_HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const normalized = dedupeNotifications(parsed).slice(0, 80);
    if (normalized.length !== parsed.length) {
      writeStorageValue(NOTIFICATION_HISTORY_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    return [];
  }
}

export function saveNotificationHistory(items: AppNotification[]) {
  try {
    writeStorageValue(NOTIFICATION_HISTORY_KEY, JSON.stringify(dedupeNotifications(items).slice(0, 80)));
  } catch {
    // Notification history is non-critical; the live in-memory notice still remains visible.
  }
}

export function getNotificationKey(item: Pick<AppNotification, "kind" | "text">): string {
  return `${item.kind}:${item.text.trim()}`;
}

export function dedupeNotifications(items: AppNotification[]): AppNotification[] {
  const seen = new Set<string>();
  const normalized: AppNotification[] = [];
  for (const item of items) {
    const text = typeof item?.text === "string" ? item.text.trim() : "";
    if (!text || isRawHtmlErrorText(text)) {
      continue;
    }
    const safeItem = { ...item, text };
    const key = getNotificationKey(safeItem);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(safeItem);
  }
  return normalized;
}

export function createNotification(kind: NotificationKind, text: string): AppNotification {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title: kind === "error" ? "当前有错误" : "最新消息",
    text,
    time: new Date().toISOString(),
    read: false,
  };
}
