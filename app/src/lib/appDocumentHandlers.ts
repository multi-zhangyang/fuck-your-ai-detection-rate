import type { MutableRefObject } from "react";

import { planOptionalUiFeedbackApply, type OptionalUiFeedbackInput } from "@/lib/appOptionalUiFeedbackHelpers";
import { stringifyError } from "@/lib/errorText";
import {
  buildHistoryDocumentLoadFailureRuntimeStep,
  buildHistoryDocumentLoadingRuntimeStep,
} from "@/lib/historyLoadHelpers";
import type { TaskPhase } from "@/lib/taskState";
import type {
  BatchRerunFailure,
  ExportResult,
  HistoryDocumentSummary,
  ModelConfig,
  OutputPreview,
  ReviewDecision,
  RoundCompareData,
  RoundProgress,
  RoundProgressStatus,
  RoundResult,
} from "@/types/app";

export type AppDocumentHandlersDeps = {
  getModelConfig: () => ModelConfig;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  setRuntimeStep: (step: string) => void;
  setRoundResult: (value: RoundResult | null) => void;
  setProgress: (value: RoundProgress | null) => void;
  setPreview: (value: OutputPreview | null) => void;
  setCompareData: (value: RoundCompareData | null) => void;
  setLastExportResult: (value: ExportResult | null) => void;
  setRoundProgressStatus: (value: RoundProgressStatus | null) => void;
  setRerunFailures: (value: BatchRerunFailure[]) => void;
  setReviewDecisions: (value: Record<string, ReviewDecision>) => void;
  liveCompareRef: MutableRefObject<RoundCompareData | null>;
  beginTask: (phase: TaskPhase, options?: { globalBusy?: boolean; clearMessages?: boolean; runtimeStep?: string }) => number;
  finishTask: (ticket: number) => void;
  clearAutoSnapshotSuppression: () => void;
  invalidateRoundArtifactSnapshotRequests: () => void;
  clearPendingAutoActionForManualContextChange: () => void;
  loadSelectedHistoryDocument: (item: HistoryDocumentSummary, configOverride: ModelConfig) => Promise<{ notice: string; runtimeStep: string }>;
};

export function createAppDocumentHandlers(deps: AppDocumentHandlersDeps) {
  function clearDocumentDerivedState() {
    deps.invalidateRoundArtifactSnapshotRequests();
    deps.setRoundResult(null);
    deps.setProgress(null);
    deps.setPreview(null);
    deps.setCompareData(null);
    deps.setLastExportResult(null);
    deps.setRoundProgressStatus(null);
    deps.setRerunFailures([]);
    deps.liveCompareRef.current = null;
    deps.setReviewDecisions({});
  }

  function beginHistoryDocumentSelection() {
    deps.setRuntimeStep(buildHistoryDocumentLoadingRuntimeStep());
    deps.clearAutoSnapshotSuppression();
    deps.clearPendingAutoActionForManualContextChange();
    clearDocumentDerivedState();
  }

  function applyErrorRuntimeStep(appError: unknown, runtimeStep: string) {
    deps.setError(stringifyError(appError));
    deps.setRuntimeStep(runtimeStep);
  }

  async function handleSelectHistory(item: HistoryDocumentSummary, configOverride = deps.getModelConfig()) {
    const taskTicket = deps.beginTask("loading-history");
    try {
      beginHistoryDocumentSelection();
      const feedback = await deps.loadSelectedHistoryDocument(item, configOverride);
      deps.setNotice(feedback.notice);
      deps.setRuntimeStep(feedback.runtimeStep);
    } catch (appError) {
      applyErrorRuntimeStep(appError, buildHistoryDocumentLoadFailureRuntimeStep());
    } finally {
      deps.finishTask(taskTicket);
    }
  }

  function applyOptionalUiFeedback(input: OptionalUiFeedbackInput) {
    const planned = planOptionalUiFeedbackApply(input);
    if (planned.clearMessages) {
      deps.setError("");
      deps.setNotice("");
    }
    if (planned.notice) deps.setNotice(planned.notice);
    if (planned.setError) deps.setError(planned.setError);
    if (planned.runtimeStep) deps.setRuntimeStep(planned.runtimeStep);
  }

  return {
    clearDocumentDerivedState,
    beginHistoryDocumentSelection,
    handleSelectHistory,
    applyOptionalUiFeedback,
    applyErrorRuntimeStep,
  };
}
