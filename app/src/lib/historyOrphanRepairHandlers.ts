import { createHistoryDatabaseMaintenanceHandlers } from "@/lib/historyDatabaseMaintenanceHandlers";
import { createHistoryDatabaseRepairHandlers } from "@/lib/historyDatabaseRepairHandlers";
import { createHistoryOrphanScanHandlers } from "@/lib/historyOrphanScanHandlers";
import type {
  HistoryCoreHandlers,
  HistoryHandlersDeps,
} from "@/lib/historyHandlerTypes";

export function createHistoryOrphanRepairHandlers(
  deps: HistoryHandlersDeps,
  core: HistoryCoreHandlers,
) {
  return {
    ...createHistoryOrphanScanHandlers(deps, core),
    ...createHistoryDatabaseRepairHandlers(deps, core),
    ...createHistoryDatabaseMaintenanceHandlers(deps, core),
  };
}
