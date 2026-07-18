import type {
  RunRoundFinishHandlers,
  RunRoundHandlersDeps,
  RunRoundProgressHandlers,
} from "@/lib/runRoundHandlerTypes";
import { createRunRoundPrepareHandlers } from "@/lib/runRoundPrepareHandlers";
import { createRunRoundStartHandlers } from "@/lib/runRoundStartHandlers";

export function createRunRoundLaunchHandlers(
  deps: RunRoundHandlersDeps,
  progress: RunRoundProgressHandlers,
  finish: RunRoundFinishHandlers,
) {
  const prepare = createRunRoundPrepareHandlers(deps, progress);
  const start = createRunRoundStartHandlers(deps, progress, finish, prepare);
  return {
    ...prepare,
    ...start,
  };
}
