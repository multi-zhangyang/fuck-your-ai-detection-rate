export {
  downloadBlob,
  decodeHeaderValue,
  decodeHeaderJson,
  parseExportIssueSamples,
  extractDownloadFilename,
} from "@/lib/webServiceExportHeaders";

import type { ExportResult, ExportRoundOptions } from "@/types/app";
import { exportResponseToResult } from "@/lib/webServiceExportResult";
import { fetchWithFriendlyError } from "@/lib/webServiceHttp";

export { exportResponseToResult } from "@/lib/webServiceExportResult";

export const webServiceExportApi = {
  async exportRound(
    outputPath: string,
    targetFormat: "txt" | "docx",
    options?: ExportRoundOptions,
  ): Promise<ExportResult> {
    const response = await fetchWithFriendlyError(
      "/api/export-round",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputPath, targetFormat, ...options }),
      },
    );
    return exportResponseToResult(response, targetFormat, {
      outputPath,
      ...options,
    });
  },
};
