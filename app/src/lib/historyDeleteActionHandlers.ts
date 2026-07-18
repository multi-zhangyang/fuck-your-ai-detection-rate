import { createHistoryDeleteApplyHandlers } from "@/lib/historyDeleteApplyHandlers";
import { createHistoryDeletePreviewHandlers } from "@/lib/historyDeletePreviewHandlers";
import type {
  HistoryCoreHandlers,
  HistoryHandlersDeps,
} from "@/lib/historyHandlerTypes";

export function createHistoryDeleteActionHandlers(
  deps: HistoryHandlersDeps,
  core: HistoryCoreHandlers,
) {
  const apply = createHistoryDeleteApplyHandlers(deps, core);
  const preview = createHistoryDeletePreviewHandlers(deps, apply.applyHistoryDeleteSuccess);
  return {
    ...apply,
    ...preview,
  };
}
