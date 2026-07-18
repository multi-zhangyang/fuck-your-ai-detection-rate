import { roundCheckpointMatchesDocument } from "@/lib/documentPaths";
import {
  buildExportCheckpointBlockedNotice,
  buildExportMissingOutputNotice,
  resolveExportOutputPath,
} from "@/lib/exportHelpers";
import type { ExportHandlersDeps } from "@/lib/exportHandlers";

export function resolveCurrentExportOutputPath(deps: ExportHandlersDeps) {
  if (roundCheckpointMatchesDocument(
    deps.getRoundProgressStatus(),
    deps.getDocumentStatus(),
    deps.getPromptOptions(),
    deps.getPromptWorkflows(),
  )) {
    deps.setNotice(buildExportCheckpointBlockedNotice());
    return null;
  }
  const outputPath = resolveExportOutputPath({
    roundResultOutputPath: deps.getRoundResult()?.outputPath,
    compareOutputPath: deps.getActiveCompareData()?.outputPath,
  });
  if (!outputPath) {
    deps.setNotice(buildExportMissingOutputNotice());
    return null;
  }
  return outputPath;
}
