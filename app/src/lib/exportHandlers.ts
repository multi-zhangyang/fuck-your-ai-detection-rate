import type { AppService } from "@/lib/appService";
import { executeExportRound, handleExportCurrent } from "@/lib/exportExecuteHandlers";
import { resolveCurrentExportOutputPath } from "@/lib/exportResolveHandlers";
import type { TaskPhase } from "@/lib/taskState";
import type { ConfirmDialogOptions } from "@/lib/uiTypes";
import type {
  DocumentStatus,
  ExportFailureDetails,
  ExportResult,
  PromptOption,
  PromptWorkflow,
  RoundCompareData,
  RoundProgressStatus,
  RoundResult,
} from "@/types/app";

type TaskTicket = number;

export type ExportHandlersDeps = {
  service: AppService;
  getDocumentStatus: () => DocumentStatus | null;
  getRoundProgressStatus: () => RoundProgressStatus | null;
  getRoundResult: () => RoundResult | null;
  getActiveCompareData: () => RoundCompareData | null;
  getLastExportResult: () => ExportResult | null;
  getPromptOptions: () => PromptOption[];
  getPromptWorkflows: () => PromptWorkflow[];
  setLastExportResult: (result: ExportResult | null) => void;
  setLastExportFailure: (failure: ExportFailureDetails | null) => void;
  setError: (error: string) => void;
  setNotice: (notice: string) => void;
  setRuntimeStep: (step: string) => void;
  beginTask: (kind: TaskPhase, options?: { runtimeStep?: string; globalBusy?: boolean; clearMessages?: boolean }) => TaskTicket;
  finishTask: (ticket: TaskTicket) => void;
  flushReviewDecisionSaves: (outputPath: string) => Promise<boolean>;
  requestConfirm: (options: ConfirmDialogOptions) => Promise<boolean>;
};

export function createExportHandlers(deps: ExportHandlersDeps) {
  return {
    resolveCurrentExportOutputPath: () => resolveCurrentExportOutputPath(deps),
    executeExportRound: (outputPath: string, format: "txt" | "docx") => executeExportRound(deps, outputPath, format),
    handleExportCurrent: (format: "txt" | "docx") => handleExportCurrent(deps, format),
  };
}
