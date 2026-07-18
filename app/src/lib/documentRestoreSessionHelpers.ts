import { applyDocumentRestoreFailure } from "@/lib/documentRestoreSessionFailureHelpers";
import { runDocumentRestoreSuccessPath } from "@/lib/documentRestoreSessionSuccessHelpers";
import type {
  DocumentStatus,
  HistoryDocumentSummary,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export type DocumentRestoreSessionDeps = {
  sourcePath: string;
  nextConfig: ModelConfig;
  promptOptions: PromptOption[];
  promptWorkflows: PromptWorkflow[];
  taskTicket: number;
  taskTicketRef: { current: number };
  refreshDocumentState: (sourcePath: string, config?: ModelConfig) => Promise<DocumentStatus>;
  refreshHistoryList: () => Promise<HistoryDocumentSummary[]>;
  clearLoadedRoundSnapshot: () => void;
  loadLatestRoundSnapshot: (
    status: DocumentStatus,
    config: ModelConfig,
    options?: {
      historyItems?: HistoryDocumentSummary[];
      allowProfileFallback?: boolean;
    },
  ) => Promise<unknown>;
  setModelConfig: (config: ModelConfig) => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  setRuntimeStep: (step: string) => void;
  finishTaskRef: { current: (ticket: number) => void };
};

export async function runDocumentRestoreSession(deps: DocumentRestoreSessionDeps): Promise<void> {
  try {
    await runDocumentRestoreSuccessPath(deps);
  } catch (appError) {
    applyDocumentRestoreFailure({
      appError,
      taskTicket: deps.taskTicket,
      taskTicketRef: deps.taskTicketRef,
      setError: deps.setError,
      setNotice: deps.setNotice,
      setRuntimeStep: deps.setRuntimeStep,
    });
  } finally {
    deps.finishTaskRef.current(deps.taskTicket);
  }
}
