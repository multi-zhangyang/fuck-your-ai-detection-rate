import type {
  RunRoundFinishHandlers,
  RunRoundHandlersDeps,
  RunRoundProgressHandlers,
} from "@/lib/runRoundHandlerTypes";
import { createRunRoundSessionAwaitHandlers } from "@/lib/runRoundSessionAwaitHandlers";
import { createRunRoundSessionStartHandlers } from "@/lib/runRoundSessionStartHandlers";

export type RunRoundSessionHandlers = ReturnType<typeof createRunRoundSessionHandlers>;

export function createRunRoundSessionHandlers(
  deps: RunRoundHandlersDeps,
  progress: RunRoundProgressHandlers,
  finish: RunRoundFinishHandlers,
) {
  return {
    ...createRunRoundSessionStartHandlers(deps, progress),
    ...createRunRoundSessionAwaitHandlers(deps, finish),
  };
}
