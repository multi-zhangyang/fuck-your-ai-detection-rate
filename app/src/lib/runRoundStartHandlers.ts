import type {
  RunRoundFinishHandlers,
  RunRoundHandlersDeps,
  RunRoundProgressHandlers,
} from "@/lib/runRoundHandlerTypes";
import type { RunRoundStartHandlers } from "@/lib/runRoundStartHandlerTypes";
import type { RunRoundPrepareHandlers } from "@/lib/runRoundPrepareHandlers";
import { createRunRoundExecuteHandlers } from "@/lib/runRoundExecuteHandlers";
import { createRunRoundSessionHandlers } from "@/lib/runRoundSessionHandlers";

export type { RunRoundStartHandlers } from "@/lib/runRoundStartHandlerTypes";

export function createRunRoundStartHandlers(
  deps: RunRoundHandlersDeps,
  progress: RunRoundProgressHandlers,
  finish: RunRoundFinishHandlers,
  prepare: RunRoundPrepareHandlers,
): RunRoundStartHandlers {
  const session = createRunRoundSessionHandlers(deps, progress, finish);
  const execute = createRunRoundExecuteHandlers(deps, finish, prepare, session);
  return {
    ...session,
    ...execute,
  };
}
