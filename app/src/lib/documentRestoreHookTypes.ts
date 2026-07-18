import type { MutableRefObject } from "react";

import type { TaskPhase } from "@/lib/taskState";
import type {
  DocumentStatus,
  HistoryDocumentSummary,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export type UseDocumentRestoreInput = {
  modelConfigReady: boolean;
  historyListReady: boolean;
  restoredDocumentRef: MutableRefObject<boolean>;
  documentStatus: DocumentStatus | null;
  historyItems: HistoryDocumentSummary[];
  modelConfig: ModelConfig;
  promptOptions: PromptOption[];
  promptWorkflows: PromptWorkflow[];
  taskTicketRef: MutableRefObject<number>;
  setModelConfig: (config: ModelConfig) => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  setRuntimeStep: (step: string) => void;
  beginTask: (
    phase: TaskPhase,
    options?: { globalBusy?: boolean; clearMessages?: boolean; runtimeStep?: string },
  ) => number;
  finishTask: (ticket: number) => void;
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
};
