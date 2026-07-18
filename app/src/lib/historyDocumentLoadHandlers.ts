import {
  buildExportCancelledNotice,
  buildExportRiskConfirmOptions,
  extractExportFailure,
  formatExportError,
  formatExportNotice,
} from "@/lib/exportHelpers";
import {
  buildRevisionBoundExportOptions,
  historyExportSelectionMatchesSnapshot,
} from "@/lib/exportIdentity";
import { createHistoryDocumentRouteHandlers } from "@/lib/historyDocumentRouteHandlers";
import type { HistoryHandlersDeps } from "@/lib/historyHandlerTypes";
import { buildMergedCompletionReviewDecisions } from "@/lib/runRoundPrep";
import { PREVIEW_MAX_CHARS } from "@/lib/storageKeys";
import {
  beginRoundArtifactSnapshotIntent,
  guardRoundArtifactSnapshotCommit,
  roundArtifactPathsMatch,
  selectRoundArtifactEffectivePreview,
} from "@/lib/roundArtifactSnapshot";
import type {
  HistoryDocumentSummary,
  HistoryExportSelection,
  ModelConfig,
  RoundResult,
} from "@/types/app";

type HistoryListGovernanceHandlers = {
  syncHistorySelectionConfigToUi: (nextConfig: ModelConfig) => void;
};

export function createHistoryDocumentLoadHandlers(
  deps: HistoryHandlersDeps,
  list: HistoryListGovernanceHandlers,
) {
  const route = createHistoryDocumentRouteHandlers(deps, list);

  async function loadCompletedRoundArtifacts(result: RoundResult) {
    const currentDocument = deps.getDocumentStatus();
    if (!currentDocument?.docId || result.round < 1) {
      throw new Error("当前论文身份不完整，已阻止未绑定的完成轮次快照载入。");
    }
    const requestIntent = beginRoundArtifactSnapshotIntent(
      deps.roundArtifactSnapshotIntentRef,
      {
        outputPath: result.outputPath,
        docId: currentDocument.docId,
        round: result.round,
      },
    );
    const snapshot = await deps.service.readRoundSnapshot(result.outputPath, {
      maxChars: PREVIEW_MAX_CHARS,
    });
    const guarded = guardRoundArtifactSnapshotCommit(
      requestIntent,
      deps.roundArtifactSnapshotIntentRef.current,
      snapshot,
    );
    if (guarded.status === "stale") return;
    const outputPreview = selectRoundArtifactEffectivePreview(snapshot);
    const nextCompareData = snapshot.compare;
    const savedReview = snapshot.review;
    deps.startTransition(() => {
      deps.setPreview(outputPreview);
      deps.setLiveCompareRef(nextCompareData);
      deps.setCompareData(nextCompareData);
      deps.setReviewDecisions(buildMergedCompletionReviewDecisions(nextCompareData, savedReview.decisions));
    });
  }

  async function handleExportFromHistory(item: HistoryExportSelection, format: "txt" | "docx") {
    if (!item.docId || !item.sourcePath || item.round < 1 || !item.outputPath) {
      deps.setNotice("当前历史记录没有可导出的输出路径。");
      return;
    }
    if (!(await deps.flushReviewDecisionSaves(item.outputPath))) {
      deps.setError("历史轮次的审阅决定尚未安全保存，已阻止导出；请在刷新后的 Diff 上重新确认。");
      deps.setRuntimeStep("历史导出已暂停：等待审阅状态一致");
      return;
    }
    const activeCompare = deps.getActiveCompareData();
    const affectsActiveEvidence = Boolean(
      activeCompare
      && activeCompare.docId === item.docId
      && activeCompare.round === item.round
      && roundArtifactPathsMatch(activeCompare.outputPath, item.outputPath),
    );
    const priorExportResult = affectsActiveEvidence ? deps.getLastExportResult() : null;
    const taskTicket = deps.beginTask("exporting");
    try {
      deps.setRuntimeStep(`正在导出第 ${item.round} 轮 ${format.toUpperCase()}。`);
      const snapshot = await deps.service.readRoundSnapshot(item.outputPath);
      if (!historyExportSelectionMatchesSnapshot(item, snapshot)) {
        throw new Error("历史导出已阻断：所选论文、轮次与服务端快照身份不一致。");
      }
      if (format === "docx") {
        const confirmOptions = buildExportRiskConfirmOptions(
          `导出第 ${item.round} 轮 Word`,
          snapshot.compare,
          priorExportResult,
          snapshot.review.decisions,
        );
        if (confirmOptions && !(await deps.requestConfirm(confirmOptions))) {
          deps.setNotice(buildExportCancelledNotice());
          deps.setRuntimeStep(`已取消第 ${item.round} 轮 Word 导出`);
          return;
        }
      }
      if (affectsActiveEvidence) {
        deps.setLastExportResult(null);
        deps.setLastExportFailure(null);
      }
      const exportResult = await deps.service.exportRound(
        item.outputPath,
        format,
        buildRevisionBoundExportOptions(snapshot),
      );
      if (affectsActiveEvidence) {
        deps.setLastExportResult(exportResult);
        deps.setLastExportFailure(null);
      }
      deps.setNotice(formatExportNotice(exportResult, `第 ${item.round} 轮`));
      deps.setRuntimeStep(`第 ${item.round} 轮导出完成`);
    } catch (appError) {
      if (affectsActiveEvidence) {
        deps.setLastExportFailure(extractExportFailure(appError));
      }
      deps.setError(formatExportError(appError));
      deps.setRuntimeStep(`第 ${item.round} 轮导出失败`);
    } finally {
      deps.finishTask(taskTicket);
    }
  }

  return {
    ...route,
    loadCompletedRoundArtifacts,
    handleExportFromHistory,
  };
}
