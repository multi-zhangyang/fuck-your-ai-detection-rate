import { resolveLatestRoundSnapshotSelection } from "@/lib/historyHelpers";
import { buildRoundResultFromCompareData } from "@/lib/roundResultHelpers";
import type {
  LoadLatestRoundSnapshotOptions,
  RunRoundHandlersDeps,
} from "@/lib/runRoundHandlerTypes";
import type {
  DocumentStatus,
  ModelConfig,
  RoundCompareData,
} from "@/types/app";
import type { createRunRoundSnapshotApplyHandlers } from "@/lib/runRoundSnapshotApplyHandlers";
import {
  beginRoundArtifactSnapshotIntent,
  guardRoundArtifactSnapshotCommit,
  roundArtifactPathsMatch,
} from "@/lib/roundArtifactSnapshot";

type ApplyHandlers = ReturnType<typeof createRunRoundSnapshotApplyHandlers>;

export function createRunRoundSnapshotLoadHandlers(
  deps: RunRoundHandlersDeps,
  apply: ApplyHandlers,
) {
  async function loadLatestRoundSnapshot(
    status: DocumentStatus,
    config: ModelConfig,
    options?: LoadLatestRoundSnapshotOptions,
  ) {
    return apply.applySelectedRoundSnapshot(resolveLatestRoundSnapshotSelection({
      status,
      config,
      historyItems: options?.historyItems ?? deps.getHistoryItems(),
      historyItem: options?.historyItem,
      allowProfileFallback: options?.allowProfileFallback,
      promptOptions: deps.getPromptOptions(),
      promptWorkflows: deps.getPromptWorkflows(),
    }));
  }

  async function loadRoundSnapshotByOutputPath(outputPath: string) {
    deps.clearAutoSnapshotSuppression();
    const visibleCompare = deps.getLiveCompare();
    const status = deps.getDocumentStatus();
    const expectedRound = visibleCompare && roundArtifactPathsMatch(visibleCompare.outputPath, outputPath)
      ? visibleCompare.round
      : Math.max(0, ...(status?.completedRounds ?? []));
    const expectedIdentity = {
      outputPath,
      docId: visibleCompare?.docId || status?.docId || "",
      round: expectedRound,
    };
    if (!expectedIdentity.docId || expectedIdentity.round < 1) {
      throw new Error("无法确定轮次快照身份，已阻止未绑定的载入请求。");
    }
    const requestIntent = beginRoundArtifactSnapshotIntent(
      deps.roundArtifactSnapshotIntentRef,
      expectedIdentity,
    );
    const snapshot = await apply.fetchCompleteRoundSnapshot(outputPath);
    const guarded = guardRoundArtifactSnapshotCommit(
      requestIntent,
      deps.roundArtifactSnapshotIntentRef.current,
      snapshot.artifactSnapshot,
    );
    if (guarded.status === "stale") return null;
    apply.applyLoadedRoundSnapshotUi({
      outputPreview: snapshot.outputPreview,
      nextCompareData: snapshot.nextCompareData,
      savedReviewDecisions: snapshot.savedReview.decisions,
      roundResult: buildRoundResultFromCompareData(snapshot.nextCompareData),
    });
    return snapshot.nextCompareData;
  }

  return {
    loadLatestRoundSnapshot,
    loadRoundSnapshotByOutputPath,
  };
}
