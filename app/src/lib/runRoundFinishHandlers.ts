import { createRunRoundCancelHandlers } from "@/lib/runRoundCancelHandlers";
import { createRunRoundCompletionHandlers } from "@/lib/runRoundCompletionHandlers";
import type {
  RunRoundFinishHandlers,
  RunRoundHandlersDeps,
  RunRoundProgressHandlers,
} from "@/lib/runRoundHandlerTypes";
import { createRunRoundResetHandlers } from "@/lib/runRoundResetHandlers";
import { createRunRoundSnapshotHandlers } from "@/lib/runRoundSnapshotHandlers";

export function createRunRoundFinishHandlers(
  deps: RunRoundHandlersDeps,
  progress: RunRoundProgressHandlers,
): RunRoundFinishHandlers {
  const completion = createRunRoundCompletionHandlers(deps, progress);
  const cancel = createRunRoundCancelHandlers(deps);
  const reset = createRunRoundResetHandlers(deps);
  const snapshot = createRunRoundSnapshotHandlers(deps);
  return {
    ...completion,
    ...cancel,
    ...reset,
    ...snapshot,
  };
}
