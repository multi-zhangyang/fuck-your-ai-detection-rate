import { createHistoryDeleteActionHandlers } from "@/lib/historyDeleteActionHandlers";
import { createHistoryOrphanRepairHandlers } from "@/lib/historyOrphanRepairHandlers";
import type {
  HistoryCoreHandlers,
  HistoryDeleteHandlers,
  HistoryHandlersDeps,
} from "@/lib/historyHandlerTypes";

export function createHistoryDeleteHandlers(
  deps: HistoryHandlersDeps,
  core: HistoryCoreHandlers,
): HistoryDeleteHandlers {
  return {
    ...createHistoryDeleteActionHandlers(deps, core),
    ...createHistoryOrphanRepairHandlers(deps, core),
  };
}
