import type { AutoRunHandlersDeps } from "@/lib/autoRunHandlerTypes";
import { createAutoRunClearHandlers } from "@/lib/autoRunClearHandlers";
import { createAutoRunPerformHandlers } from "@/lib/autoRunPerformHandlers";
import { createAutoRunScheduleHandlers } from "@/lib/autoRunScheduleHandlers";

export type {
  AutoRunClearHandlers,
  AutoRunHandlersDeps,
  AutoRunPerformHandlers,
  AutoRunScheduleHandlers,
  OptionalUiFeedback,
  RefreshStatusAfterFailedRoundInput,
  ScheduleAutoRetryInput,
} from "@/lib/autoRunHandlerTypes";

export function createAutoRunHandlers(deps: AutoRunHandlersDeps) {
  const clear = createAutoRunClearHandlers(deps);
  const schedule = createAutoRunScheduleHandlers(deps);
  const perform = createAutoRunPerformHandlers(deps, clear);
  return {
    ...clear,
    ...schedule,
    ...perform,
  };
}
