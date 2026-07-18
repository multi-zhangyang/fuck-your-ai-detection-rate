import { formatPendingAutoActionStatus } from "@/lib/autoRun";
import type { PendingAutoAction } from "@/lib/autoRunTypes";
import type { NotificationKind } from "@/lib/uiTypes";

export function deriveAppNotificationStatus(input: {
  error: string;
  notice: string;
  statusAutoAction: PendingAutoAction | null;
  activeRuntimeTaskCount: number;
  uiBusy: boolean;
  unreadNotificationCount: number;
  hasActiveOperationFeedback: boolean;
  operationStatusText: string;
}): {
  notificationStatusText: string;
  notificationStatusLabel: string;
  notificationStatusKind: NotificationKind | null;
  hasStatusFeedback: boolean;
} {
  const notificationStatusText = input.error
    ? input.error
    : input.statusAutoAction
      ? formatPendingAutoActionStatus(input.statusAutoAction)
      : input.notice
        ? input.notice
        : input.activeRuntimeTaskCount
          ? `${input.activeRuntimeTaskCount} 个运行中`
          : input.uiBusy
            ? input.operationStatusText
            : input.unreadNotificationCount
              ? `${input.unreadNotificationCount} 未读`
              : "无未读";
  const hasStatusFeedback = Boolean(input.error || input.notice || input.statusAutoAction || input.hasActiveOperationFeedback);
  const notificationStatusLabel = input.error
    ? "错误反馈"
    : input.statusAutoAction
      ? input.statusAutoAction.kind === "manual-intervention"
        ? "等待人工"
        : "自动执行"
      : input.notice
        ? "操作反馈"
        : input.hasActiveOperationFeedback
          ? "处理中"
          : input.unreadNotificationCount
            ? "未读通知"
            : "通知";
  const notificationStatusKind: NotificationKind | null = input.error ? "error" : input.notice ? "success" : null;
  return {
    notificationStatusText,
    notificationStatusLabel,
    notificationStatusKind,
    hasStatusFeedback,
  };
}
