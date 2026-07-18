import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import {
  buildConfirmDialogState,
  markAllNotificationsRead,
  nextDiffFocusRequest,
} from "@/lib/appUiShellHelpers";
import { clearAutoRetryScopeCounts } from "@/lib/appPendingAutoActionHelpers";
import type { AppNotification, ConfirmDialogOptions, ConfirmDialogState } from "@/lib/uiTypes";
import type { DiffFilterMode } from "@/lib/diffFilterModel";
import type { WorkbenchView } from "@/lib/workbenchNav";
import type { PendingAutoAction } from "@/lib/autoRunTypes";

export type AppWorkbenchShellDeps = {
  setNotificationCenterOpen: (open: boolean) => void;
  setNotifications: Dispatch<SetStateAction<AppNotification[]>>;
  saveNotificationHistory: (items: AppNotification[]) => void;
  setActiveView: (view: WorkbenchView) => void;
  setDiffFocusRequest: Dispatch<SetStateAction<{ filterMode: DiffFilterMode; chunkId?: string; nonce: number } | null>>;
  pendingAutoActionRef: MutableRefObject<PendingAutoAction | null>;
  setPendingAutoAction: Dispatch<SetStateAction<PendingAutoAction | null>>;
  autoRetryCountsRef: MutableRefObject<Record<string, number>>;
  setNotice: (notice: string) => void;
  confirmResolverRef: MutableRefObject<((confirmed: boolean) => void) | null>;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
};

export function createAppWorkbenchShellHandlers(deps: AppWorkbenchShellDeps) {
  function openNotificationCenter() {
    deps.setNotificationCenterOpen(true);
    deps.setNotifications((current) => {
      const next = markAllNotificationsRead(current);
      if (next === current) return current;
      deps.saveNotificationHistory(next);
      return next;
    });
  }

  function openTaskTargetView(view: WorkbenchView) {
    deps.setActiveView(view);
    deps.setNotificationCenterOpen(false);
  }

  function openDiffTaskTarget(filterMode: DiffFilterMode, chunkId?: string) {
    deps.setActiveView("home");
    deps.setNotificationCenterOpen(false);
    deps.setDiffFocusRequest((current) => nextDiffFocusRequest(current, filterMode, chunkId));
  }

  function clearAutoRetryScope(scopeKey: string | null | undefined) {
    deps.autoRetryCountsRef.current = clearAutoRetryScopeCounts(deps.autoRetryCountsRef.current, scopeKey);
  }

  function rejectPendingAutoAction(actionId?: string) {
    const rejected = deps.pendingAutoActionRef.current;
    if (!rejected || (actionId && rejected.id !== actionId)) return;
    deps.setPendingAutoAction((current) => (!current || (actionId && current.id !== actionId) ? current : null));
    clearAutoRetryScope(rejected.scopeKey);
    deps.setNotice("已拒绝自动执行，当前任务等待你手动处理。");
  }

  function requestConfirm(options: ConfirmDialogOptions): Promise<boolean> {
    deps.confirmResolverRef.current?.(false);
    return new Promise((resolve) => {
      deps.confirmResolverRef.current = resolve;
      deps.setConfirmDialog(buildConfirmDialogState(options));
    });
  }

  function settleConfirmDialog(confirmed: boolean) {
    deps.confirmResolverRef.current?.(confirmed);
    deps.confirmResolverRef.current = null;
    deps.setConfirmDialog(null);
  }

  function clearNotificationHistory() {
    deps.setNotifications([]);
    deps.saveNotificationHistory([]);
    deps.setNotice("通知历史已清空。");
  }

  return {
    openNotificationCenter,
    openTaskTargetView,
    openDiffTaskTarget,
    rejectPendingAutoAction,
    requestConfirm,
    settleConfirmDialog,
    clearNotificationHistory,
    clearAutoRetryScope,
  };
}
