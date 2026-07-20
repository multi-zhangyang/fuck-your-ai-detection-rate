import {
  invalidateHistoryRequest,
} from "@/lib/historyRequestGeneration";
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
    const refreshed = await core.refreshHistoryList();
    // A superseded list must never be used to decide which document to load
    // next. The winning refresh owns the visible list and its follow-up.
    if (refreshed.status !== "current" || !refreshed.isCurrent()) {
      if (result.removedDocument && deps.getDocumentStatus()?.docId === input.docId) {
        deps.setDocumentStatus(null);
        deps.setHistory(null);
        deps.setProtectionMap(null);
        deps.setScopeDiagnostics(null);
        deps.clearDocumentDerivedState();
      }
      return;
    }
    const items = refreshed.items;
    const historyShouldCommit = () => refreshed.isCurrent();
    invalidateHistoryRequest(deps.setHistoryOrphanScan as unknown as object, "orphan");
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
      if (!historyShouldCommit()) return;
      try {
        const reloadedStatus = await deps.refreshDocumentState(followup.sourcePath, undefined, {
          shouldCommit: historyShouldCommit,
        });
        if (!historyShouldCommit()) return;
        await deps.loadLatestRoundSnapshot(
          reloadedStatus,
          deps.getModelConfig(),
          {
            historyItem: followup.historyItem,
            allowProfileFallback: true,
            shouldCommit: historyShouldCommit,
          },
        );
      } catch (appError) {
        if (!historyShouldCommit()) return;
        throw appError;
      }
    } else if (followup.type === "clear-snapshot") {
      deps.clearDocumentDerivedState();
    }
    if (!historyShouldCommit()) return;
    deps.setNotice(buildHistoryDeleteResultNotice(result));
    deps.setRuntimeStep(input.doneLabel);
  }

  return {
    applyHistoryDeleteSuccess,
  };
}
