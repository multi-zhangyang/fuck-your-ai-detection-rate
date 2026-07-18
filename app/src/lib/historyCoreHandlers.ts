import { createHistoryDocumentLoadHandlers } from "@/lib/historyDocumentLoadHandlers";
import type { HistoryCoreHandlers, HistoryHandlersDeps } from "@/lib/historyHandlerTypes";
import { createHistoryListGovernanceHandlers } from "@/lib/historyListGovernanceHandlers";

export function createHistoryCoreHandlers(deps: HistoryHandlersDeps): HistoryCoreHandlers {
  const list = createHistoryListGovernanceHandlers(deps);
  const load = createHistoryDocumentLoadHandlers(deps, list);
  return {
    ...list,
    ...load,
  };
}
