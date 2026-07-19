import {
  buildRoundResultFromCompareData,
  buildRoundResultFromHistoryRound,
} from "@/lib/roundResultBuildHelpers";
import type {
  HistoryRound,
  OutputPreview,
  ReviewDecision,
  RoundArtifactSnapshot,
  RoundArtifactSnapshotIdentity,
  RoundCompareData,
} from "@/types/app";

export function buildRoundResultFromSnapshotSelection(input: {
  latestRound: Parameters<typeof buildRoundResultFromHistoryRound>[0] | null | undefined;
  compareData: Parameters<typeof buildRoundResultFromCompareData>[0];
}) {
  return input.latestRound
    ? buildRoundResultFromHistoryRound(input.latestRound, input.compareData)
    : buildRoundResultFromCompareData(input.compareData);
}

export type CompleteRoundSnapshot = {
  artifactSnapshot: RoundArtifactSnapshot;
  outputPreview: OutputPreview;
  nextCompareData: RoundCompareData;
  savedReview: { decisions: Record<string, ReviewDecision> };
};

export type ApplySelectedRoundSnapshotInput = {
  outputPath?: string | null;
  matchedItem?: import("@/types/app").HistoryDocumentSummary | null;
  latestRound?: HistoryRound | null;
  expectedIdentity?: RoundArtifactSnapshotIdentity | null;
  shouldCommit?: () => boolean;
};

export function buildLoadedRoundSnapshotUiInput(
  selection: ApplySelectedRoundSnapshotInput,
  snapshot: CompleteRoundSnapshot,
) {
  return {
    outputPreview: snapshot.outputPreview,
    nextCompareData: snapshot.nextCompareData,
    savedReviewDecisions: snapshot.savedReview.decisions,
    roundResult: buildRoundResultFromSnapshotSelection({
      latestRound: selection.latestRound,
      compareData: snapshot.nextCompareData,
    }),
  };
}
