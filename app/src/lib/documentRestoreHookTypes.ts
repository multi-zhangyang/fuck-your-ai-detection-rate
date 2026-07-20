import type { MutableRefObject } from "react";

import type { TaskPhase } from "@/lib/taskState";
import type {
  DocumentStatus,
  HistoryDocumentSummary,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";
import type { HistoryListRefreshResult } from "@/lib/historyHandlerInputTypes";

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
  refreshDocumentState: (
    sourcePath: string,
    config?: ModelConfig,
    options?: { shouldCommit?: () => boolean },
  ) => Promise<DocumentStatus>;
  refreshHistoryList: (options?: { shouldCommit?: () => boolean }) => Promise<HistoryListRefreshResult>;
  clearLoadedRoundSnapshot: () => void;
  loadLatestRoundSnapshot: (
    status: DocumentStatus,
    config: ModelConfig,
    options?: {
      historyItems?: HistoryDocumentSummary[];
      allowProfileFallback?: boolean;
      shouldCommit?: () => boolean;
    },
  ) => Promise<unknown>;
};
