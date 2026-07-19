import type { AppService } from "./appService";
import { webServiceDocumentsApi } from "@/lib/webServiceDocuments";
import { webServiceExportApi } from "@/lib/webServiceExport";
import { webServiceHealthApi } from "@/lib/webServiceHealth";
import { webServiceHistoryApi } from "@/lib/webServiceHistoryApi";
import { webServiceModelApi } from "@/lib/webServiceModel";
import { webServicePromptsApi } from "@/lib/webServicePrompts";
import { webServiceRoundsApi } from "@/lib/webServiceRounds";

/** Keep local needle for FE regressions that scan webService.ts. */
const MAX_REWRITE_CONCURRENCY = 16;

export const webService: AppService = {
  ...webServiceHealthApi,
  ...webServicePromptsApi,
  ...webServiceModelApi,
  ...webServiceDocumentsApi,
  ...webServiceHistoryApi,
  ...webServiceRoundsApi,
  ...webServiceExportApi,
};

export { MAX_REWRITE_CONCURRENCY };
