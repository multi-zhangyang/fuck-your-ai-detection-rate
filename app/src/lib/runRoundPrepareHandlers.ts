import type {
  RunRoundHandlersDeps,
  RunRoundProgressHandlers,
} from "@/lib/runRoundHandlerTypes";
import {
  createRunRoundConfigPrepareHandlers,
  type RunRoundConfigPrepareHandlers,
} from "@/lib/runRoundConfigPrepareHandlers";
import {
  createRunRoundLaunchPrepareHandlers,
  type RunRoundLaunchPrepareHandlers,
} from "@/lib/runRoundLaunchPrepareHandlers";

export type RunRoundPrepareHandlers = RunRoundConfigPrepareHandlers & RunRoundLaunchPrepareHandlers;

export function createRunRoundPrepareHandlers(
  deps: RunRoundHandlersDeps,
  progress: RunRoundProgressHandlers,
): RunRoundPrepareHandlers {
  const config = createRunRoundConfigPrepareHandlers(deps);
  const launch = createRunRoundLaunchPrepareHandlers(deps, progress, config);
  return {
    ...config,
    ...launch,
  };
}
