import {
  appendBatchPreviewFailure,
  planBatchRerunFeedback,
  resolveBatchRerunRoundResult,
  toOptionalUiFeedbackFromBatchPlan,
  upsertScopedRerunFailures,
} from "@/lib/batchRerunHelpers";
import { stringifyError } from "@/lib/errorText";
import { scopeRerunFailures } from "@/lib/exportHelpers";
import { PREVIEW_MAX_CHARS } from "@/lib/storageKeys";
import { buildLoadedRoundSnapshotReviewDecisions } from "@/lib/reviewDecisions";
import {
  beginRoundArtifactSnapshotIntent,
  guardRoundArtifactSnapshotCommit,
  roundArtifactPathsMatch,
  roundArtifactSnapshotIdentityMatches,
  selectRoundArtifactEffectivePreview,
} from "@/lib/roundArtifactSnapshot";
import type {
  BatchRerunHandlersDeps,
  MaterializeBatchRerunResultState,
} from "@/lib/batchRerunHandlerTypes";
import type {
  BatchRerunFailure,
  BatchRerunResult,
  BatchRerunTarget,
} from "@/types/app";

export function createBatchRerunMaterializeHandlers(deps: BatchRerunHandlersDeps) {
  function upsertRerunFailure(failure: BatchRerunFailure) {
    deps.setRerunFailures((current) => upsertScopedRerunFailures(
      current,
      failure,
      deps.getActiveRerunFailureScopeKey(),
    ));
  }

  async function materializeBatchRerunResultState(
    result: BatchRerunResult,
    targets: BatchRerunTarget[],
  ): Promise<MaterializeBatchRerunResultState> {
    void targets;
    let failures: BatchRerunFailure[] = result.failures.map((failure) => ({ ...failure }));
    const visibleCompare = deps.getActiveCompareData();
    const identityCompare = result.compare ?? visibleCompare;
    if (
      !visibleCompare
      || !identityCompare
      || !result.outputPath
      || !roundArtifactPathsMatch(identityCompare.outputPath, result.outputPath)
    ) {
      failures = appendBatchPreviewFailure(failures, "当前 Diff 身份不完整，未应用后台重跑结果快照。");
      return { failures, latestCompare: null, applied: false };
    }
    const expectedVisibleIdentity = {
      outputPath: visibleCompare.outputPath,
      docId: visibleCompare.docId,
      round: visibleCompare.round,
    };
    const snapshotIdentity = {
      outputPath: result.outputPath,
      docId: identityCompare.docId,
      round: identityCompare.round,
    };
    if (!roundArtifactSnapshotIdentityMatches(expectedVisibleIdentity, snapshotIdentity)) {
      failures = appendBatchPreviewFailure(failures, "后台重跑结果不属于当前 Diff，旧响应已丢弃。");
      return { failures, latestCompare: null, applied: false };
    }
    const requestIntent = beginRoundArtifactSnapshotIntent(
      deps.roundArtifactSnapshotIntentRef,
      snapshotIdentity,
    );
    let snapshot;
    try {
      snapshot = await deps.service.readRoundSnapshot(result.outputPath, {
        maxChars: PREVIEW_MAX_CHARS,
      });
    } catch (appError) {
      failures = appendBatchPreviewFailure(failures, stringifyError(appError));
      const latestVisibleCompare = deps.getActiveCompareData();
      const requestStillCurrent = requestIntent.epoch === deps.roundArtifactSnapshotIntentRef.current?.epoch;
      if (
        !requestStillCurrent
        || !latestVisibleCompare
        || !roundArtifactSnapshotIdentityMatches(expectedVisibleIdentity, {
          outputPath: latestVisibleCompare.outputPath,
          docId: latestVisibleCompare.docId,
          round: latestVisibleCompare.round,
        })
      ) {
        return { failures, latestCompare: null, applied: false };
      }
      deps.commitUi(() => {
        deps.setLastExportResult(null);
        deps.setRerunFailures(scopeRerunFailures(failures, visibleCompare));
      });
      return { failures, latestCompare: null, applied: true };
    }
    const guarded = guardRoundArtifactSnapshotCommit(
      requestIntent,
      deps.roundArtifactSnapshotIntentRef.current,
      snapshot,
      { expectedCompareRevision: result.compare?.compareRevision || result.compare?.updatedAt },
    );
    const latestVisibleCompare = deps.getActiveCompareData();
    if (
      guarded.status === "stale"
      || !latestVisibleCompare
      || !roundArtifactSnapshotIdentityMatches(expectedVisibleIdentity, {
        outputPath: latestVisibleCompare.outputPath,
        docId: latestVisibleCompare.docId,
        round: latestVisibleCompare.round,
      })
    ) {
      return { failures, latestCompare: null, applied: false };
    }
    const latestCompare = snapshot.compare;
    const nextRoundResult = resolveBatchRerunRoundResult(result, latestCompare, deps.getRoundResult());
    const nextDecisions = buildLoadedRoundSnapshotReviewDecisions(
      latestCompare,
      snapshot.review.decisions,
    );
    deps.commitUi(() => {
      if (nextRoundResult) deps.setRoundResult(nextRoundResult);
      deps.setCompareData(latestCompare);
      deps.setLiveCompareRef(latestCompare);
      deps.setReviewDecisions(nextDecisions);
      deps.setPreview(selectRoundArtifactEffectivePreview(snapshot));
      deps.setLastExportResult(null);
      deps.setRerunFailures(scopeRerunFailures(failures, latestCompare));
    });
    return { failures, latestCompare, applied: true };
  }

  async function applyBatchRerunResult(
    actionLabel: string,
    result: BatchRerunResult,
    targets: BatchRerunTarget[],
    suffix = "",
  ) {
    const { failures, applied } = await materializeBatchRerunResultState(result, targets);
    if (!applied) return;
    deps.applyOptionalUiFeedback(toOptionalUiFeedbackFromBatchPlan(
      planBatchRerunFeedback({ actionLabel, result, failures, suffix }),
    ));
  }

  return {
    upsertRerunFailure,
    materializeBatchRerunResultState,
    applyBatchRerunResult,
  };
}
