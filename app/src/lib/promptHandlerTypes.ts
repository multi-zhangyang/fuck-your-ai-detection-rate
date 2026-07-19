import type {
  DocumentStatus,
  HistoryDocumentSummary,
  ModelConfig,
  PromptId,
  PromptOption,
  PromptPreviewResponse,
  PromptDeleteResult,
  PromptSaveResult,
  PromptWorkflow,
} from "@/types/app";
import type { ConfirmDialogOptions } from "@/lib/uiTypes";
import type { PromptRouteRequestRef } from "@/lib/promptRouteRequestGeneration";

export type ApplyPromptRouteSwitchInput = {
  nextConfig: ModelConfig;
  loadingRuntimeStep: string;
  successRuntimeStep: (loadedSnapshot: boolean) => string;
  failureRuntimeStep: string;
};

export type PromptHandlersDeps = {
  promptRouteRequestRef?: PromptRouteRequestRef;
  service: {
    getPromptPreviews: () => Promise<PromptPreviewResponse>;
    updatePromptMeta: (promptId: PromptId, payload: { label: string; description?: string }) => Promise<PromptSaveResult>;
    savePrompt: (promptId: PromptId, content: string) => Promise<PromptSaveResult>;
    restoreDefaultPrompt: (promptId: PromptId) => Promise<PromptSaveResult>;
    createPrompt: (payload: { label: string; description?: string; content: string }) => Promise<PromptSaveResult>;
    deletePrompt: (promptId: PromptId) => Promise<PromptDeleteResult>;
    updatePromptWorkflow: (
      workflowId: PromptWorkflow["id"],
      payload: Pick<PromptWorkflow, "label" | "description" | "defaultSequence" | "sequenceLimit">,
    ) => Promise<{ promptDir: string; workflows: PromptWorkflow[] }>;
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
  refreshHistoryList: (options?: { shouldCommit?: () => boolean }) => Promise<HistoryDocumentSummary[]>;
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
  persistActivePromptRoute: (config: ModelConfig) => void;
  refreshPromptPreviews: (options?: { silent?: boolean }) => Promise<PromptPreviewResponse | null>;
  applyPromptSaveResult: (result: PromptSaveResult) => void;
  handleSavePromptDraft: (
    promptId: PromptId,
    payload: { label: string; description?: string; content: string; contentDirty: boolean; metaDirty: boolean },
  ) => Promise<void>;
  handleRestoreDefaultPrompt: (promptId: PromptId) => Promise<void>;
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
    payload: Pick<PromptWorkflow, "label" | "description" | "defaultSequence" | "sequenceLimit">,
  ) => Promise<void>;
  reloadDocumentAfterPromptRouteSwitch: (
    nextConfig: ModelConfig,
    options?: { shouldCommit?: () => boolean },
  ) => Promise<boolean>;
  applyPromptRouteSwitch: (input: ApplyPromptRouteSwitchInput) => Promise<void>;
  handlePromptProfileChange: (promptProfile: ModelConfig["promptProfile"]) => Promise<void>;
  handlePromptSequenceChange: (promptSequence: PromptId[]) => Promise<void>;
};
