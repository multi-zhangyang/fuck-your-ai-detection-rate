import { createRunRoundSnapshotApplyHandlers } from "@/lib/runRoundSnapshotApplyHandlers";
import { createRunRoundSnapshotLoadHandlers } from "@/lib/runRoundSnapshotLoadHandlers";
import type { AutoSnapshotLoadedSnapshot } from "@/lib/autoSnapshotRestoreSessionHelpers";
import type {
  LoadLatestRoundSnapshotOptions,
  RunRoundHandlersDeps,
} from "@/lib/runRoundHandlerTypes";
import type { ApplySelectedRoundSnapshotInput } from "@/lib/roundResultHelpers";
import type {
  DocumentStatus,
  ModelConfig,
  OutputPreview,
  ReviewDecision,
  RoundCompareData,
  RoundResult,
} from "@/types/app";

export type RunRoundSnapshotHandlers = {
  applyLoadedRoundSnapshotUi: (input: {
    outputPreview: OutputPreview;
    nextCompareData: RoundCompareData;
    savedReviewDecisions: Record<string, ReviewDecision>;
    roundResult: RoundResult;
  }) => void;
  fetchCompleteRoundSnapshot: (outputPath: string) => Promise<{
    artifactSnapshot: import("@/types/app").RoundArtifactSnapshot;
    outputPreview: OutputPreview;
    nextCompareData: RoundCompareData;
    savedReview: { decisions: Record<string, ReviewDecision> };
  }>;
  applySelectedRoundSnapshot: (selection: ApplySelectedRoundSnapshotInput) => Promise<AutoSnapshotLoadedSnapshot | null>;
  loadLatestRoundSnapshot: (
    status: DocumentStatus,
    config: ModelConfig,
    options?: LoadLatestRoundSnapshotOptions,
  ) => Promise<AutoSnapshotLoadedSnapshot | null>;
  loadRoundSnapshotByOutputPath: (outputPath: string) => Promise<RoundCompareData | null>;
};

export function createRunRoundSnapshotHandlers(deps: RunRoundHandlersDeps): RunRoundSnapshotHandlers {
  const apply = createRunRoundSnapshotApplyHandlers(deps);
  const load = createRunRoundSnapshotLoadHandlers(deps, apply);
  return {
    ...apply,
    ...load,
  };
}
