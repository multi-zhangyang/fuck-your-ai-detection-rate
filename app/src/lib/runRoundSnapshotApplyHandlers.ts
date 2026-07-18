import { isCompleteRoundCompareData } from "@/lib/documentPaths";
import { buildIncompleteRoundSnapshotError } from "@/lib/historyHelpers";
import { buildLoadedRoundSnapshotReviewDecisions } from "@/lib/reviewDecisions";
import {
  buildLoadedRoundSnapshotUiInput,
  type ApplySelectedRoundSnapshotInput,
} from "@/lib/roundResultHelpers";
import { PREVIEW_MAX_CHARS } from "@/lib/storageKeys";
import type { RunRoundHandlersDeps } from "@/lib/runRoundHandlerTypes";
import type {
  OutputPreview,
  ReviewDecision,
  RoundCompareData,
  RoundResult,
} from "@/types/app";
import { buildLoadedRoundSnapshotView } from "@/lib/historyHelpers";
import {
  beginRoundArtifactSnapshotIntent,
  guardRoundArtifactSnapshotCommit,
  roundArtifactPathsMatch,
  selectRoundArtifactEffectivePreview,
} from "@/lib/roundArtifactSnapshot";

export function createRunRoundSnapshotApplyHandlers(deps: RunRoundHandlersDeps) {
  function applyLoadedRoundSnapshotUi(input: {
    outputPreview: OutputPreview;
    nextCompareData: RoundCompareData;
    savedReviewDecisions: Record<string, ReviewDecision>;
    roundResult: RoundResult;
  }) {
    deps.commitUi(() => {
      deps.setPreview(input.outputPreview);
      deps.setCompareData(input.nextCompareData);
      deps.setLastExportResult(null);
      deps.setLiveCompare(input.nextCompareData);
      deps.setRoundResult(input.roundResult);
      deps.setReviewDecisions(buildLoadedRoundSnapshotReviewDecisions(
        input.nextCompareData,
        input.savedReviewDecisions,
      ));
    });
  }

  async function fetchCompleteRoundSnapshot(outputPath: string) {
    const artifactSnapshot = await deps.service.readRoundSnapshot(outputPath, {
      maxChars: PREVIEW_MAX_CHARS,
    });
    const outputPreview = selectRoundArtifactEffectivePreview(artifactSnapshot);
    const nextCompareData = artifactSnapshot.compare;
    const savedReview = artifactSnapshot.review;
    if (!isCompleteRoundCompareData(nextCompareData)) throw buildIncompleteRoundSnapshotError();
    return { artifactSnapshot, outputPreview, nextCompareData, savedReview };
  }

  function resolveSelectionIdentity(selection: ApplySelectedRoundSnapshotInput) {
    if (selection.expectedIdentity) return selection.expectedIdentity;
    const visibleCompare = deps.getLiveCompare();
    if (
      visibleCompare
      && selection.outputPath
      && roundArtifactPathsMatch(visibleCompare.outputPath, selection.outputPath)
    ) {
      return {
        outputPath: selection.outputPath,
        docId: visibleCompare.docId,
        round: visibleCompare.round,
      };
    }
    return null;
  }

  async function applySelectedRoundSnapshot(selection: ApplySelectedRoundSnapshotInput) {
    if (!selection.outputPath) {
      deps.clearDocumentDerivedState();
      return null;
    }
    const expectedIdentity = resolveSelectionIdentity(selection);
    if (!expectedIdentity) {
      throw new Error("无法确定轮次快照身份，已阻止未绑定的恢复请求。");
    }
    const requestIntent = beginRoundArtifactSnapshotIntent(
      deps.roundArtifactSnapshotIntentRef,
      expectedIdentity,
    );
    const snapshot = await fetchCompleteRoundSnapshot(selection.outputPath);
    const guarded = guardRoundArtifactSnapshotCommit(
      requestIntent,
      deps.roundArtifactSnapshotIntentRef.current,
      snapshot.artifactSnapshot,
    );
    if (guarded.status === "stale") return null;
    applyLoadedRoundSnapshotUi(buildLoadedRoundSnapshotUiInput(selection, snapshot));
    return buildLoadedRoundSnapshotView({
      matchedItem: selection.matchedItem,
      latestRound: selection.latestRound,
      compareData: snapshot.nextCompareData,
    });
  }

  return {
    applyLoadedRoundSnapshotUi,
    fetchCompleteRoundSnapshot,
    applySelectedRoundSnapshot,
  };
}
