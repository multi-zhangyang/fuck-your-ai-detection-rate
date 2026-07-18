import { createRunRoundFailureCompletionHandlers } from "@/lib/runRoundFailureCompletionHandlers";
import { createRunRoundSuccessCompletionHandlers } from "@/lib/runRoundSuccessCompletionHandlers";
import type {
  RunRoundHandlersDeps,
  RunRoundProgressHandlers,
} from "@/lib/runRoundHandlerTypes";
import type { ClassifiedRunFailure, FinalizeFailedRoundInput } from "@/lib/runRoundPrep";
import type {
  CompleteSuccessfulRoundUiInput,
  FinalizeCompletedRoundInput,
} from "@/lib/runRoundHandlerTypes";
import type { DocumentStatus, ModelConfig } from "@/types/app";

export type RunRoundCompletionHandlers = {
  applyClassifiedRunFailure: (
    runMessage: string,
    userCanceled: boolean,
    mode: FinalizeFailedRoundInput["mode"],
  ) => ClassifiedRunFailure;
  finalizeFailedRound: (input: FinalizeFailedRoundInput) => Promise<void>;
  scheduleAfterSuccessfulRound: (
    resultRound: number,
    status: DocumentStatus,
    config: ModelConfig,
    sourcePath: string,
    outputPath: string,
  ) => Promise<void>;
  applySuccessfulRoundCompletionFeedback: (
    resultRound: number,
    status: DocumentStatus,
    config: ModelConfig,
    sourcePath: string,
    outputPath: string,
  ) => Promise<void>;
  completeSuccessfulRoundUi: (input: CompleteSuccessfulRoundUiInput) => Promise<DocumentStatus>;
  finalizeCompletedRound: (input: FinalizeCompletedRoundInput) => Promise<DocumentStatus>;
};

export function createRunRoundCompletionHandlers(
  deps: RunRoundHandlersDeps,
  progress: RunRoundProgressHandlers,
): RunRoundCompletionHandlers {
  const failure = createRunRoundFailureCompletionHandlers(deps, progress);
  const success = createRunRoundSuccessCompletionHandlers(deps);
  return {
    ...failure,
    ...success,
  };
}
