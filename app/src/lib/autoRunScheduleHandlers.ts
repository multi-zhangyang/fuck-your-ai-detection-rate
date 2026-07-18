import { createAutoRunFailureRefreshHandlers } from "@/lib/autoRunFailureRefreshHandlers";
import { createAutoRunScheduleCoreHandlers } from "@/lib/autoRunScheduleCoreHandlers";
import type {
  AutoRunHandlersDeps,
  AutoRunScheduleHandlers,
} from "@/lib/autoRunHandlerTypes";

export function createAutoRunScheduleHandlers(deps: AutoRunHandlersDeps): AutoRunScheduleHandlers {
  const core = createAutoRunScheduleCoreHandlers(deps);
  const refresh = createAutoRunFailureRefreshHandlers(deps, core.maybeScheduleFailureAutoRetry);
  return {
    ...core,
    ...refresh,
  };
}
