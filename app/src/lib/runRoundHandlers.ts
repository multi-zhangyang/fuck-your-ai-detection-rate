import { createRunRoundAttachHandlers } from "@/lib/runRoundAttachHandlers";
import { createRunRoundFinishHandlers } from "@/lib/runRoundFinishHandlers";
import type { RunRoundHandlersDeps } from "@/lib/runRoundHandlerTypes";
import { createRunRoundLaunchHandlers } from "@/lib/runRoundLaunchHandlers";
import { createRunRoundProgressHandlers } from "@/lib/runRoundProgressHandlers";

export type {
  ApplySelectedRoundSnapshotInput,
  AttachRoundProgressListenerInput,
  AwaitAttachedActiveRunInput,
  AwaitStartedRunRoundInput,
  ClassifiedRunFailure,
  CompleteSuccessfulRoundUiInput,
  ExecuteRoundResetInput,
  FinalizeCompletedRoundInput,
  FinalizeFailedRoundInput,
  LoadLatestRoundSnapshotOptions,
  OptionalUiFeedback,
  PrepareRunLaunchInput,
  PrepareRunLaunchResult,
  ReadyRunLaunchPrepared,
  RunRoundFinishHandlers,
  RunRoundHandlersDeps,
  RunRoundProgressHandlers,
  SeedAndListenAttachedRunInput,
  StartAndListenRunRoundInput,
  StartAndListenRunRoundResult,
  StartedRunRoundHandle,
  TaskPhase,
  TaskTicket,
} from "@/lib/runRoundHandlerTypes";

export function createRunRoundHandlers(deps: RunRoundHandlersDeps) {
  const progress = createRunRoundProgressHandlers(deps);
  const finish = createRunRoundFinishHandlers(deps, progress);
  const launch = createRunRoundLaunchHandlers(deps, progress, finish);
  const attach = createRunRoundAttachHandlers(deps, progress, finish);

  return {
    ...progress,
    ...finish,
    ...launch,
    ...attach,
  };
}
