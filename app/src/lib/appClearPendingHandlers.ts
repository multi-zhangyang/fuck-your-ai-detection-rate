import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { PendingAutoAction } from "@/lib/autoRunTypes";

export type AppClearPendingHandlersDeps = {
  setPendingAutoAction: Dispatch<SetStateAction<PendingAutoAction | null>>;
  setNotice: (notice: string) => void;
  pendingAutoActionRef: MutableRefObject<PendingAutoAction | null>;
  clearAutoRetryScope: (scopeKey: string | null | undefined) => void;
  sameWorkspacePath: (a: string, b: string) => boolean;
};

export function createAppClearPendingHandlers(deps: AppClearPendingHandlersDeps) {
  function clearPendingAutoActionWithNotice(actionId: string, notice: string) {
    deps.setPendingAutoAction((current) => (current?.id === actionId ? null : current));
    deps.setNotice(notice);
  }

  function clearPendingAutoActionForSource(sourcePath: string | null | undefined) {
    if (!sourcePath) return;
    deps.setPendingAutoAction((current) => {
      if (!current || !deps.sameWorkspacePath(current.sourcePath, sourcePath)) return current;
      return null;
    });
  }

  function clearPendingAutoActionForManualContextChange() {
    const pending = deps.pendingAutoActionRef.current;
    if (pending?.scopeKey) deps.clearAutoRetryScope(pending.scopeKey);
    deps.setPendingAutoAction(null);
  }

  return {
    clearPendingAutoActionWithNotice,
    clearPendingAutoActionForSource,
    clearPendingAutoActionForManualContextChange,
  };
}
