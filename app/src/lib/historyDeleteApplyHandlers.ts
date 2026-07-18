import {
  buildHistoryDeleteResultNotice,
  resolveHistoryDeleteDocumentFollowup,
} from "@/lib/historyDeleteCopy";
import type {
  ExecuteHistoryDeleteInput,
  HistoryCoreHandlers,
  HistoryHandlersDeps,
} from "@/lib/historyHandlerTypes";
import type { DeleteHistoryResult } from "@/types/app";

export function createHistoryDeleteApplyHandlers(
  deps: HistoryHandlersDeps,
  core: HistoryCoreHandlers,
) {
  async function applyHistoryDeleteSuccess(input: ExecuteHistoryDeleteInput, result: DeleteHistoryResult) {
    const items = await core.refreshHistoryList();
    deps.setHistoryOrphanScan(null);
    void core.refreshHistoryArtifactGovernance();
    const followup = resolveHistoryDeleteDocumentFollowup({
      currentDocId: deps.getDocumentStatus()?.docId,
      deletedDocId: input.docId,
      removedDocument: result.removedDocument,
      historyItems: items,
    });
    if (followup.type === "clear-current") {
      deps.setDocumentStatus(null);
      deps.setHistory(null);
      deps.setProtectionMap(null);
      deps.setScopeDiagnostics(null);
      deps.clearDocumentDerivedState();
    } else if (followup.type === "reload" && followup.sourcePath) {
      await deps.loadLatestRoundSnapshot(
        await deps.refreshDocumentState(followup.sourcePath),
        deps.getModelConfig(),
        { historyItem: followup.historyItem, allowProfileFallback: true },
      );
    } else if (followup.type === "clear-snapshot") {
      deps.clearDocumentDerivedState();
    }
    deps.setNotice(buildHistoryDeleteResultNotice(result));
    deps.setRuntimeStep(input.doneLabel);
  }

  return {
    applyHistoryDeleteSuccess,
  };
}
