import { createBatchRerunActionHandlers } from "@/lib/batchRerunActionHandlers";
import { createBatchRerunCoreHandlers } from "@/lib/batchRerunCoreHandlers";
import type { BatchRerunHandlersDeps } from "@/lib/batchRerunHandlerTypes";

export type {
  BatchRerunActionHandlers,
  BatchRerunCoreHandlers,
  BatchRerunHandlersDeps,
  MaterializeBatchRerunResultState,
  OptionalUiFeedback,
  TaskPhase,
  TaskTicket,
} from "@/lib/batchRerunHandlerTypes";

export function createBatchRerunHandlers(deps: BatchRerunHandlersDeps) {
  const core = createBatchRerunCoreHandlers(deps);
  const actions = createBatchRerunActionHandlers(deps, core);
  return {
    ...core,
    ...actions,
  };
}
