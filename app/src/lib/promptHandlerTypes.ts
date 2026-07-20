import type {
  DocumentStatus,
  HistoryDocumentSummary,
  ModelConfig,
  PromptId,
  PromptBackupsResult,
  PromptOption,
  PromptPreviewResponse,
  PromptDeleteResult,
  PromptSaveResult,
  PromptWorkflow,
  PromptWorkflowSaveResult,
} from "@/types/app";
import type { ConfirmDialogOptions } from "@/lib/uiTypes";
import type { PromptRouteRequestRef } from "@/lib/promptRouteRequestGeneration";
import type { PromptPreviewRequestRegistry } from "@/lib/promptPreviewRequestGeneration";
import type { HistoryListRefreshResult } from "@/lib/historyHandlerInputTypes";

export type ApplyPromptRouteSwitchInput = {
  nextConfig: ModelConfig;
  loadingRuntimeStep: string;
  successRuntimeStep: (loadedSnapshot: boolean) => string;
  failureRuntimeStep: string;
};

export type PromptHandlersDeps = {
  promptRouteRequestRef?: PromptRouteRequestRef;
  promptPreviewRequestRegistry?: PromptPreviewRequestRegistry;
  service: {
    getPromptPreviews: () => Promise<PromptPreviewResponse>;
    updatePromptMeta: (promptId: PromptId, payload: { label: string; description?: string }) => Promise<PromptSaveResult>;
    savePrompt: (promptId: PromptId, content: string) => Promise<PromptSaveResult>;
    restoreDefaultPrompt: (promptId: PromptId) => Promise<PromptSaveResult>;
    listPromptBackups: (promptId: PromptId) => Promise<PromptBackupsResult>;
    restorePromptBackup: (promptId: PromptId, relativePath: string) => Promise<PromptSaveResult>;
    createPrompt: (payload: { label: string; description?: string; content: string }) => Promise<PromptSaveResult>;
    deletePrompt: (promptId: PromptId) => Promise<PromptDeleteResult>;
    updatePromptWorkflow: (
      workflowId: PromptWorkflow["id"],
      payload: Pick<PromptWorkflow, "label" | "description" | "defaultSequence" | "sequenceLimit" | "roundLimit">,
    ) => Promise<PromptWorkflowSaveResult>;
  };
  getModelConfig: () => ModelConfig;
  getDocumentStatus: () => DocumentStatus | null;
  getPromptOptions: () => PromptOption[];
  getPromptWorkflows: () => PromptWorkflow[];
  getPromptPreviews: () => PromptPreviewResponse | null;
  getActivePromptPreviewId: () => PromptId;
  setModelConfig: (config: ModelConfig) => void;
  setPromptPreviews: (
    value: PromptPreviewResponse | null | ((current: PromptPreviewResponse | null) => PromptPreviewResponse | null),
  ) => void;
  setPromptPreviewBusy: (busy: boolean) => void;
  setPromptPreviewError: (error: string) => void;
  setActivePromptPreviewId: (id: PromptId | string) => void;
  setError: (error: string) => void;
  setNotice: (notice: string) => void;
  setRuntimeStep: (step: string) => void;
  requestConfirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  applyErrorRuntimeStep: (error: unknown, fallback: string) => void;
  clearAutoSnapshotSuppression: () => void;
  clearPendingAutoActionForManualContextChange: () => void;
  refreshDocumentState: (
    sourcePath: string,
    config?: ModelConfig,
    options?: {
      shouldCommit?: () => boolean;
      promptOptions?: PromptOption[];
      promptWorkflows?: PromptWorkflow[];
    },
  ) => Promise<DocumentStatus>;
  refreshHistoryList: (options?: { shouldCommit?: () => boolean }) => Promise<HistoryListRefreshResult>;
  loadLatestRoundSnapshot: (
    status: DocumentStatus,
    config: ModelConfig,
    options: {
      historyItems?: HistoryDocumentSummary[];
      allowProfileFallback?: boolean;
      shouldCommit?: () => boolean;
      promptOptions?: PromptOption[];
      promptWorkflows?: PromptWorkflow[];
    },
  ) => Promise<unknown>;
};

export type PromptCrudHandlers = {
  runPromptPreviewMutation: <T>(operation: () => Promise<T>) => Promise<T | null>;
  persistActivePromptRoute: (config: ModelConfig) => void;
  refreshPromptPreviews: (options?: { silent?: boolean }) => Promise<PromptPreviewResponse | null>;
  applyPromptSaveResult: (result: PromptSaveResult, options?: { activate?: boolean }) => void;
  handleSavePromptDraft: (
    promptId: PromptId,
    payload: { label: string; description?: string; content: string; contentDirty: boolean; metaDirty: boolean },
  ) => Promise<void>;
  handleRestoreDefaultPrompt: (promptId: PromptId) => Promise<void>;
  handleRestorePromptBackup: (promptId: PromptId, relativePath: string) => Promise<boolean>;
  handleCreatePrompt: (payload: { label: string; description?: string; content: string }) => Promise<void>;
  handleDeletePrompt: (promptId: PromptId) => Promise<void>;
};

export type PromptRouteHandlers = {
  applyUpdatedDefaultPromptWorkflow: (
    workflowId: PromptWorkflow["id"],
    result: { promptDir: string; workflows: PromptWorkflow[] },
    items: NonNullable<PromptPreviewResponse["items"]>,
  ) => Promise<void>;
  handleUpdatePromptWorkflow: (
    workflowId: PromptWorkflow["id"],
    payload: Pick<PromptWorkflow, "label" | "description" | "defaultSequence" | "sequenceLimit" | "roundLimit">,
  ) => Promise<PromptWorkflowSaveResult | null>;
  reloadDocumentAfterPromptRouteSwitch: (
    nextConfig: ModelConfig,
    options?: { shouldCommit?: () => boolean },
  ) => Promise<boolean | null>;
  applyPromptRouteSwitch: (input: ApplyPromptRouteSwitchInput) => Promise<void>;
  handlePromptProfileChange: (promptProfile: ModelConfig["promptProfile"]) => Promise<void>;
  handlePromptSequenceChange: (promptSequence: PromptId[]) => Promise<void>;
};
