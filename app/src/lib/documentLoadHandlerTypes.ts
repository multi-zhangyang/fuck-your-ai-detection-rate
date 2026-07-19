import type { AppService } from "@/lib/appService";
import type { TaskPhase } from "@/lib/taskState";
import type {
  DocumentStatus,
  EnvironmentDiagnostics,
  HistoryDocumentSummary,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export type TaskTicket = number;
export type { TaskPhase } from "@/lib/taskState";

export type OptionalUiFeedback = {
  notice?: string;
  setError?: string;
  runtimeStep?: string;
  clearMessages?: boolean;
};

export type DocumentLoadHandlersDeps = {
  service: AppService;
  getModelConfig: () => ModelConfig;
  getDocumentStatus: () => DocumentStatus | null;
  getPromptOptions: () => PromptOption[];
  getPromptWorkflows: () => PromptWorkflow[];
  getLatestModelConfig: () => ModelConfig | null;
  setDiagnostics: (
    value: EnvironmentDiagnostics | null | ((current: EnvironmentDiagnostics | null) => EnvironmentDiagnostics | null),
  ) => void;
  setHistoryPanelOpen: (open: boolean) => void;
  setError: (error: string) => void;
  setNotice: (notice: string) => void;
  setRuntimeStep: (step: string) => void;
  beginTask: (kind: TaskPhase, options?: { runtimeStep?: string; globalBusy?: boolean; clearMessages?: boolean }) => TaskTicket;
  finishTask: (ticket: TaskTicket) => void;
  transitionTask: (ticket: number, phase: TaskPhase, options?: { globalBusy?: boolean; runtimeStep?: string }) => boolean;
  applyErrorRuntimeStep: (error: unknown, fallback: string) => void;
  applyOptionalUiFeedback: (feedback: OptionalUiFeedback) => void;
  clearAutoSnapshotSuppression: () => void;
  clearPendingAutoActionForManualContextChange: () => void;
  clearDocumentDerivedState: () => void;
  refreshDocumentState: (
    sourcePath: string,
    config?: ModelConfig,
    options?: { shouldCommit?: () => boolean },
  ) => Promise<DocumentStatus>;
  refreshHistoryList: (options?: { shouldCommit?: () => boolean }) => Promise<HistoryDocumentSummary[]>;
};
