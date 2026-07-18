import { createHistoryCoreHandlers } from "@/lib/historyCoreHandlers";
import { createHistoryDeleteHandlers } from "@/lib/historyDeleteHandlers";
import type { HistoryHandlersDeps } from "@/lib/historyHandlerTypes";

export type {
  ExecuteHistoryDeleteInput,
  HistoryCoreHandlers,
  HistoryDeleteHandlers,
  HistoryDocumentLoadFeedback,
  HistoryHandlersDeps,
  HistoryRouteStatusResult,
  LoadLatestRoundSnapshotOptions,
  LoadedHistorySnapshotLike,
  OptionalUiFeedback,
  ResyncHistoryDocumentRouteInput,
  TaskTicket,
} from "@/lib/historyHandlerTypes";

export function createHistoryHandlers(deps: HistoryHandlersDeps) {
  const core = createHistoryCoreHandlers(deps);
  const del = createHistoryDeleteHandlers(deps, core);
  return {
    ...core,
    ...del,
  };
}
