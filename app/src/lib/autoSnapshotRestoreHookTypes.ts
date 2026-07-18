import type { MutableRefObject } from "react";

import type { AutoSnapshotLoadedSnapshot } from "@/lib/autoSnapshotRestoreSessionHelpers";
import type {
  DocumentStatus,
  HistoryDocumentSummary,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export type UseAutoSnapshotRestoreInput = {
  documentStatus: DocumentStatus | null;
  currentRunToken: string | null;
  currentBatchRerunToken: string | null;
  taskPhase: string;
  activeCompareChunkCount?: number;
  autoSnapshotRestoreKeyRef: MutableRefObject<string>;
  latestModelConfigRef: MutableRefObject<ModelConfig | null>;
  modelConfig: ModelConfig;
  historyItems: HistoryDocumentSummary[];
  promptOptions: PromptOption[];
  promptWorkflows: PromptWorkflow[];
  setModelConfig: (config: ModelConfig) => void;
  setNotice: (message: string) => void;
  setRuntimeStep: (step: string) => void;
  refreshDocumentState: (sourcePath: string, config?: ModelConfig) => Promise<DocumentStatus>;
  loadLatestRoundSnapshot: (
    status: DocumentStatus,
    config: ModelConfig,
    options?: {
      historyItems?: HistoryDocumentSummary[];
      historyItem?: HistoryDocumentSummary | null;
      allowProfileFallback?: boolean;
    },
  ) => Promise<AutoSnapshotLoadedSnapshot | null | undefined | void>;
};
