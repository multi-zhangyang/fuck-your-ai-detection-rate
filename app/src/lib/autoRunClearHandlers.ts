import {
  buildClearPendingAutoActionIfId,
} from "@/lib/autoRun";
import { sameWorkspacePath } from "@/lib/documentPaths";
import type { AutoRunClearHandlers, AutoRunHandlersDeps } from "@/lib/autoRunHandlerTypes";

export function createAutoRunClearHandlers(deps: AutoRunHandlersDeps): AutoRunClearHandlers {
  function clearAutoRetryScope(scopeKey: string | null | undefined) {
    if (!scopeKey) return;
    const nextCounts = { ...deps.getAutoRetryCounts() };
    delete nextCounts[scopeKey];
    deps.setAutoRetryCounts(nextCounts);
  }

  function clearPendingAutoActionWithNotice(actionId: string, notice: string) {
    deps.setPendingAutoAction(buildClearPendingAutoActionIfId(actionId));
    deps.setNotice(notice);
  }

  function clearPendingAutoActionForSource(sourcePath: string | null | undefined) {
    if (!sourcePath) return;
    deps.setPendingAutoAction((current) => {
      if (!current || !sameWorkspacePath(current.sourcePath, sourcePath)) return current;
      return null;
    });
  }

  function clearPendingAutoActionForManualContextChange() {
    // pending scopeKey is read via setPendingAutoAction null path; counts cleared by caller if needed
    deps.setPendingAutoAction((current) => {
      if (current?.scopeKey) clearAutoRetryScope(current.scopeKey);
      return null;
    });
  }

  return {
    clearAutoRetryScope,
    clearPendingAutoActionWithNotice,
    clearPendingAutoActionForSource,
    clearPendingAutoActionForManualContextChange,
  };
}
