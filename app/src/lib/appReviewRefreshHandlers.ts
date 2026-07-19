import type { MutableRefObject } from "react";

import { planReviewDecisionUpdate } from "@/lib/appReviewDecisionHelpers";
import { sameWorkspacePath } from "@/lib/documentPaths";
import { stringifyError } from "@/lib/errorText";
import { persistActiveDocument } from "@/lib/promptStorage";
import {
  isDocumentReleaseGateError,
  isTerminalReviewDecisionSaveError,
} from "@/lib/reviewDecisionSaveConflict";
import {
  beginRoundArtifactSnapshotIntent,
  guardRoundArtifactSnapshotCommit,
  selectRoundArtifactEffectivePreview,
  type RoundArtifactSnapshotIntentRef,
} from "@/lib/roundArtifactSnapshot";
import { PREVIEW_MAX_CHARS } from "@/lib/storageKeys";
import {
  createReviewDecisionSaveQueue,
  type ReviewDecisionSaveQueue,
} from "@/lib/reviewDecisionSaveQueue";
import {
  buildDefaultReviewDecisions,
  normalizeSavedReviewDecisionsForCompare,
} from "@/lib/reviewDecisions";
import type { AppService } from "@/lib/appService";
import type {
  DocumentHistory,
  DocumentProtectionMap,
  DocumentScopeDiagnostics,
  DocumentStatus,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
  ReviewDecision,
  OutputPreview,
  RoundCompareData,
  RoundProgressStatus,
  RoundResult,
} from "@/types/app";

export type ReviewSaveRevisionState = {
  baseRevision: string;
  currentRevision: string;
  blocked: boolean;
  conflictEpoch: number;
};

export type AppReviewRefreshHandlersDeps = {
  service: AppService;
  roundArtifactSnapshotIntentRef: RoundArtifactSnapshotIntentRef;
  getModelConfig: () => ModelConfig;
  getPromptOptions: () => PromptOption[];
  getPromptWorkflows: () => PromptWorkflow[];
  getCompareData: () => RoundCompareData | null;
  getRoundResult: () => RoundResult | null;
  reviewSaveQueueRef: MutableRefObject<ReviewDecisionSaveQueue<Record<string, ReviewDecision>> | null>;
  reviewSaveRevisionRef: MutableRefObject<Map<string, ReviewSaveRevisionState>>;
  setReviewDecisions: (updater: (current: Record<string, ReviewDecision>) => Record<string, ReviewDecision>) => void;
  setPreview: (value: OutputPreview | null) => void;
  setCompareData: (value: RoundCompareData | null) => void;
  setLiveCompare: (value: RoundCompareData | null) => void;
  setLastExportResult: (value: null) => void;
  setReviewRevision: (value: string) => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  setDocumentStatus: (status: DocumentStatus | null) => void;
  setHistory: (history: DocumentHistory | null) => void;
  setProtectionMap: (value: DocumentProtectionMap | null) => void;
  setScopeDiagnostics: (value: DocumentScopeDiagnostics | null) => void;
  getRefreshRoundProgressStatus: () => (
    status?: DocumentStatus | null,
    config?: ModelConfig,
    options?: { shouldCommit?: () => boolean },
  ) => Promise<RoundProgressStatus | null>;
  normalizeReviewDecisionsForSave: (decisions: Record<string, ReviewDecision>) => Record<string, ReviewDecision>;
  commitUi: (callback: () => void) => void;
};

export function createAppReviewRefreshHandlers(deps: AppReviewRefreshHandlersDeps) {
  function reviewOutputPathsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
    if (sameWorkspacePath(left, right)) return true;
    const normalize = (value: string | null | undefined) => String(value || "")
      .replace(/\\/g, "/")
      .replace(/^\.\//, "")
      .replace(/^\/+/, "")
      .toLowerCase();
    const normalizedLeft = normalize(left);
    const normalizedRight = normalize(right);
    return Boolean(
      normalizedLeft
      && normalizedRight
      && (
        normalizedLeft.endsWith(`/${normalizedRight}`)
        || normalizedRight.endsWith(`/${normalizedLeft}`)
      ),
    );
  }

  function resolveReviewOutputKey(outputPath: string): string {
    const roundOutputPath = deps.getRoundResult()?.outputPath;
    if (roundOutputPath && reviewOutputPathsMatch(roundOutputPath, outputPath)) return roundOutputPath;
    const compareOutputPath = deps.getCompareData()?.outputPath;
    if (compareOutputPath && reviewOutputPathsMatch(compareOutputPath, outputPath)) return compareOutputPath;
    return outputPath;
  }

  function getVisibleRevision(outputPath: string): string {
    const compare = deps.getCompareData();
    if (!compare || !reviewOutputPathsMatch(compare.outputPath, outputPath)) return "";
    return String(compare.compareRevision || compare.updatedAt || "").trim();
  }

  function observeCompareRevision(outputPath: string, revision: string): ReviewSaveRevisionState | null {
    const normalizedRevision = String(revision || "").trim();
    if (!normalizedRevision) return null;
    const current = deps.reviewSaveRevisionRef.current.get(outputPath);
    if (
      current
      && (normalizedRevision === current.baseRevision || normalizedRevision === current.currentRevision)
    ) {
      return current;
    }
    const next: ReviewSaveRevisionState = {
      baseRevision: normalizedRevision,
      currentRevision: normalizedRevision,
      blocked: false,
      conflictEpoch: current?.conflictEpoch ?? 0,
    };
    deps.reviewSaveRevisionRef.current.set(outputPath, next);
    return next;
  }

  function compareIdentityMatches(left: RoundCompareData | null, right: RoundCompareData | null): boolean {
    return Boolean(
      left
      && right
      && reviewOutputPathsMatch(left.outputPath, right.outputPath)
      && String(left.docId || "") === String(right.docId || "")
      && Number(left.round || 0) === Number(right.round || 0),
    );
  }

  async function loadRevisionBoundReviewSnapshot(outputPath: string) {
    const artifactSnapshot = await deps.service.readRoundSnapshot(outputPath, {
      maxChars: PREVIEW_MAX_CHARS,
    });
    return {
      artifactSnapshot,
      outputPreview: selectRoundArtifactEffectivePreview(artifactSnapshot),
      nextCompare: artifactSnapshot.compare,
      savedReview: artifactSnapshot.review,
      compareRevision: artifactSnapshot.compareRevision,
    };
  }

  async function refreshRevisionBoundReviewState(
    outputPath: string,
    expectedIdentity: RoundCompareData | null = deps.getCompareData(),
  ): Promise<boolean> {
    const resolvedOutputPath = resolveReviewOutputKey(outputPath);
    if (!expectedIdentity) return false;
    const requestIntent = beginRoundArtifactSnapshotIntent(
      deps.roundArtifactSnapshotIntentRef,
      {
        outputPath: resolvedOutputPath,
        docId: expectedIdentity.docId,
        round: expectedIdentity.round,
      },
    );
    const snapshot = await loadRevisionBoundReviewSnapshot(resolvedOutputPath);
    const guarded = guardRoundArtifactSnapshotCommit(
      requestIntent,
      deps.roundArtifactSnapshotIntentRef.current,
      snapshot.artifactSnapshot,
    );
    if (guarded.status === "stale") return false;
    const visible = deps.getCompareData();
    if (!compareIdentityMatches(visible, expectedIdentity) || !compareIdentityMatches(snapshot.nextCompare, expectedIdentity)) {
      return false;
    }
    deps.commitUi(() => {
      deps.setPreview(snapshot.outputPreview);
      deps.setCompareData(snapshot.nextCompare);
      deps.setLiveCompare(snapshot.nextCompare);
      deps.setReviewDecisions(() => ({
        ...buildDefaultReviewDecisions(snapshot.nextCompare),
        ...normalizeSavedReviewDecisionsForCompare(snapshot.nextCompare, snapshot.savedReview.decisions),
      }));
      deps.setLastExportResult(null);
      const prior = deps.reviewSaveRevisionRef.current.get(resolvedOutputPath);
      deps.reviewSaveRevisionRef.current.set(resolvedOutputPath, {
        baseRevision: snapshot.compareRevision,
        currentRevision: snapshot.compareRevision,
        blocked: false,
        conflictEpoch: prior?.conflictEpoch ?? 0,
      });
      deps.setReviewRevision(`${snapshot.compareRevision}|${Date.now()}`);
    });
    return true;
  }

  async function refreshAfterStaleReviewSave(outputPath: string, expectedIdentity: RoundCompareData | null) {
    try {
      const applied = await refreshRevisionBoundReviewState(outputPath, expectedIdentity);
      if (!applied) {
        deps.setNotice("旧文档的审阅保存已被安全拦截，没有把刷新结果应用到当前页面。");
        return;
      }
      deps.setError("");
      deps.setNotice("其他页面或任务已更新候选，旧审阅决定未保存；已刷新到最新 Diff，请重新确认。");
    } catch (error) {
      deps.setError(`旧审阅决定已被安全拦截，但刷新最新 Diff 失败：${stringifyError(error)}`);
    }
  }

  function markStaleReviewSave(outputPath: string) {
    const expectedIdentity = deps.getCompareData();
    const visibleRevision = getVisibleRevision(outputPath);
    const current = observeCompareRevision(outputPath, visibleRevision) ?? {
      baseRevision: visibleRevision,
      currentRevision: visibleRevision,
      blocked: false,
      conflictEpoch: 0,
    };
    current.blocked = true;
    current.conflictEpoch += 1;
    deps.reviewSaveRevisionRef.current.set(outputPath, current);
    if (!expectedIdentity || !reviewOutputPathsMatch(expectedIdentity.outputPath, outputPath)) {
      // The conflict belongs to a background queue for a document that is no
      // longer visible. Keep that queue generation blocked, but never replace
      // the current document's notice/error or snapshot intent with paper A.
      return;
    }
    deps.setNotice("审阅候选已在其他页面或任务中变化，旧决定不会重放；正在刷新最新 Diff。");
    void refreshAfterStaleReviewSave(outputPath, expectedIdentity);
  }

  function getReviewSaveQueue() {
    if (!deps.reviewSaveQueueRef.current) {
      deps.reviewSaveQueueRef.current = createReviewDecisionSaveQueue({
        save: async (outputPath, decisions) => {
          const revisionState = deps.reviewSaveRevisionRef.current.get(outputPath)
            ?? observeCompareRevision(outputPath, getVisibleRevision(outputPath));
          if (!revisionState?.currentRevision) {
            throw new Error("当前 Diff 缺少审阅 revision，已阻止保存；请刷新后重试。");
          }
          if (revisionState.blocked) {
            const blockedError = new Error("旧审阅决定已失效，等待最新 Diff 刷新。") as Error & {
              status?: number;
              payload?: { code?: string };
            };
            blockedError.status = 409;
            blockedError.payload = { code: "stale_review_decisions" };
            throw blockedError;
          }
          const saved = await deps.service.saveReviewDecisions(
            outputPath,
            decisions,
            revisionState.currentRevision,
          );
          const nextRevision = String(
            saved.currentCompareRevision || saved.compareRevision || saved.updatedAt || "",
          ).trim();
          if (!nextRevision) {
            throw new Error("后端未返回新的审阅 revision，已停止后续保存。");
          }
          revisionState.currentRevision = nextRevision;
          deps.reviewSaveRevisionRef.current.set(outputPath, revisionState);
          deps.setReviewRevision(nextRevision);
        },
        onError: (error, outputPath) => {
          if (isDocumentReleaseGateError(error)) {
            deps.setError("审阅保存已被内容发布门禁阻止：该改写没有通过候选决策、内容完整性、可读性或哈希一致性校验。请保留原文或重新生成。");
            return;
          }
          if (isTerminalReviewDecisionSaveError(error)) {
            markStaleReviewSave(outputPath);
            return;
          }
          deps.setError(`审阅决策保存失败，系统将保留最新选择并尝试恢复：${stringifyError(error)}`);
        },
        isTerminalError: (error) => isTerminalReviewDecisionSaveError(error),
      });
    }
    return deps.reviewSaveQueueRef.current;
  }

  function scheduleReviewDecisionSave(outputPath: string, decisions: Record<string, ReviewDecision>) {
    const resolvedOutputPath = resolveReviewOutputKey(outputPath);
    const revisionState = observeCompareRevision(resolvedOutputPath, getVisibleRevision(resolvedOutputPath));
    if (!revisionState?.currentRevision) {
      deps.setError("当前 Diff 缺少审阅 revision，已阻止保存；请刷新后重新确认。");
      return;
    }
    if (revisionState.blocked) {
      deps.setNotice("旧审阅代际正在刷新，本次选择不会保存；请在最新 Diff 上重新确认。");
      return;
    }
    getReviewSaveQueue().schedule(resolvedOutputPath, deps.normalizeReviewDecisionsForSave(decisions));
  }

  async function flushReviewDecisionSaves(outputPath?: string): Promise<boolean> {
    const requestedOutputPath = outputPath
      || deps.getCompareData()?.outputPath
      || deps.getRoundResult()?.outputPath
      || "";
    if (!requestedOutputPath) return true;
    const normalizedOutputPath = resolveReviewOutputKey(requestedOutputPath);
    const queue = deps.reviewSaveQueueRef.current;
    if (!queue) return true;
    const beforeEpoch = deps.reviewSaveRevisionRef.current.get(normalizedOutputPath)?.conflictEpoch ?? 0;
    await queue.flush(normalizedOutputPath);
    const afterState = deps.reviewSaveRevisionRef.current.get(normalizedOutputPath);
    const afterEpoch = afterState?.conflictEpoch ?? 0;
    return Boolean(
      beforeEpoch === afterEpoch
      && !afterState?.blocked
      && queue.pendingCount(normalizedOutputPath) === 0,
    );
  }

  function updateReviewDecision(chunkId: string, decision: ReviewDecision) {
    deps.setReviewDecisions((current) => {
      const planned = planReviewDecisionUpdate({
        current,
        chunkId,
        decision,
        outputPath: deps.getCompareData()?.outputPath || deps.getRoundResult()?.outputPath,
      });
      if (planned.shouldScheduleSave && planned.outputPath) {
        scheduleReviewDecisionSave(planned.outputPath, planned.next);
      }
      return planned.next;
    });
  }

  async function refreshDocumentState(
    sourcePath: string,
    config = deps.getModelConfig(),
    options: {
      shouldCommit?: () => boolean;
      promptOptions?: PromptOption[];
      promptWorkflows?: PromptWorkflow[];
    } = {},
  ) {
    const [status, nextHistory, nextProtectionMap, nextScopeDiagnostics] = await Promise.all([
      deps.service.getDocumentStatus(sourcePath, config),
      deps.service.getDocumentHistory(sourcePath),
      deps.service.getDocumentProtectionMap(sourcePath),
      deps.service.getDocumentScopeDiagnostics(sourcePath),
    ]);
    if (options.shouldCommit && !options.shouldCommit()) return status;
    deps.setDocumentStatus(status);
    deps.setHistory(nextHistory);
    deps.setProtectionMap(nextProtectionMap);
    deps.setScopeDiagnostics(nextScopeDiagnostics);
    persistActiveDocument(
      status.sourcePath,
      status.promptProfile,
      status.promptSequence ?? config.promptSequence,
      options.promptOptions ?? deps.getPromptOptions(),
      options.promptWorkflows ?? deps.getPromptWorkflows(),
    );
    await deps.getRefreshRoundProgressStatus()(status, config, options);
    return status;
  }

  return {
    scheduleReviewDecisionSave,
    flushReviewDecisionSaves,
    refreshRevisionBoundReviewState,
    updateReviewDecision,
    refreshDocumentState,
  };
}
