import {
  buildExportCancelledNotice,
  buildExportFailureRuntimeStep,
  buildExportLoadingRuntimeStep,
  buildExportRiskConfirmOptions,
  buildExportSuccessRuntimeStep,
  extractExportFailure,
  formatExportError,
  formatExportNotice,
} from "@/lib/exportHelpers";
import {
  buildRevisionBoundExportOptions,
  exportResultMatchesOutput,
} from "@/lib/exportIdentity";
import { roundArtifactSnapshotIdentityMatches } from "@/lib/roundArtifactSnapshot";
import type { ExportHandlersDeps } from "@/lib/exportHandlers";
import { resolveCurrentExportOutputPath } from "@/lib/exportResolveHandlers";

export async function executeExportRound(deps: ExportHandlersDeps, outputPath: string, format: "txt" | "docx") {
  if (!(await deps.flushReviewDecisionSaves(outputPath))) {
    deps.setLastExportResult(null);
    deps.setError("审阅决定尚未安全保存，已阻止本次导出；请在刷新后的 Diff 上重新确认。");
    deps.setRuntimeStep("导出已暂停：等待审阅状态一致");
    return;
  }
  const taskTicket = deps.beginTask("exporting", { runtimeStep: buildExportLoadingRuntimeStep(format) });
  try {
    const priorExportResult = deps.getLastExportResult();
    const snapshot = await deps.service.readRoundSnapshot(outputPath);
    const currentDocument = deps.getDocumentStatus();
    const currentRound = deps.getRoundResult();
    if (
      currentDocument?.docId
      && currentRound?.round
      && !roundArtifactSnapshotIdentityMatches(snapshot, {
        outputPath,
        docId: currentDocument.docId,
        round: currentRound.round,
      })
    ) {
      throw new Error("导出已阻断：当前论文、轮次与服务端快照身份不一致。");
    }
    if (format === "docx") {
      const priorEvidence = exportResultMatchesOutput(priorExportResult, outputPath)
        ? priorExportResult
        : null;
      const confirmOptions = buildExportRiskConfirmOptions(
        "导出 Word",
        snapshot.compare,
        priorEvidence,
        snapshot.review.decisions,
      );
      if (confirmOptions && !(await deps.requestConfirm(confirmOptions))) {
        deps.setNotice(buildExportCancelledNotice());
        deps.setRuntimeStep("已取消 Word 导出");
        return;
      }
    }
    deps.setLastExportResult(null);
    deps.setLastExportFailure(null);
    const result = await deps.service.exportRound(
      outputPath,
      format,
      buildRevisionBoundExportOptions(snapshot),
    );
    deps.setLastExportResult(result);
    deps.setLastExportFailure(null);
    deps.setNotice(formatExportNotice(result));
    deps.setRuntimeStep(buildExportSuccessRuntimeStep());
  } catch (appError) {
    deps.setLastExportFailure(extractExportFailure(appError));
    deps.setError(formatExportError(appError));
    deps.setRuntimeStep(buildExportFailureRuntimeStep());
  } finally {
    deps.finishTask(taskTicket);
  }
}

export async function handleExportCurrent(deps: ExportHandlersDeps, format: "txt" | "docx") {
  const outputPath = resolveCurrentExportOutputPath(deps);
  if (!outputPath) return;
  await executeExportRound(deps, outputPath, format);
}
