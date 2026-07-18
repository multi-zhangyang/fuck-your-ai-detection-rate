import type { TaskPhase } from "@/lib/taskState";
import type {
  DocumentStatus,
  ModelCatalogResult,
  ModelConfig,
  ModelProviderConfig,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export type TaskTicket = number;

export type CollectProviderModelPatchesInput = {
  enabledProviders: ModelProviderConfig[];
  providers: ModelProviderConfig[];
  abortController: AbortController;
};

export type OptionalUiFeedback = {
  notice?: string;
  runtimeStep?: string;
  errorMessage?: string;
  setError?: string;
  error?: string;
  clearMessages?: boolean;
};

export type ModelCatalogHandlersDeps = {
  service: {
    listModels: (config: ModelConfig, signal?: AbortSignal) => Promise<ModelCatalogResult>;
    saveModelConfig: (config: ModelConfig) => Promise<ModelConfig>;
    testModelConnection: (config: ModelConfig) => Promise<{ apiType?: string | null; endpoint?: string | null }>;
  };
  getModelConfig: () => ModelConfig;
  getDocumentStatus: () => DocumentStatus | null;
  getPromptOptions: () => PromptOption[];
  getPromptWorkflows: () => PromptWorkflow[];
  getModelCatalogAbortRef: () => AbortController | null;
  setModelCatalogAbortRef: (controller: AbortController | null) => void;
  setModelConfig: (config: ModelConfig) => void;
  setModelCatalog: (catalog: ModelCatalogResult | null) => void;
  setModelCatalogBusy: (busy: boolean) => void;
  setModelCatalogError: (error: string) => void;
  setNotice: (notice: string) => void;
  setRuntimeStep: (step: string) => void;
  beginTask: (kind: TaskPhase, options?: { runtimeStep?: string; globalBusy?: boolean; clearMessages?: boolean }) => TaskTicket;
  finishTask: (ticket: TaskTicket) => void;
  applyErrorRuntimeStep: (error: unknown, fallback: string) => void;
  applyOptionalUiFeedback: (feedback: OptionalUiFeedback) => void;
  refreshDocumentState: (sourcePath: string, config?: ModelConfig) => Promise<DocumentStatus>;
};

export type ModelCatalogListHandlers = {
  beginCancelableModelCatalogRequest: () => AbortController;
  clearCancelableModelCatalogRequest: (controller: AbortController) => void;
  handleCancelModelCatalogRequest: () => void;
  fetchAndApplyModelCatalog: (config: ModelConfig, silent: boolean) => Promise<ModelCatalogResult | null>;
  refreshModelCatalog: (config?: ModelConfig, options?: { silent?: boolean }) => Promise<ModelCatalogResult | null>;
  listModelsForConfig: (config: ModelConfig, signal?: AbortSignal) => Promise<ModelCatalogResult | null>;
};

export type ModelCatalogProviderHandlers = {
  beginProviderModelsTask: (runtimeStep: string) => { taskTicket: number; abortController: AbortController };
  finishProviderModelsTask: (input: { abortController: AbortController; taskTicket: number }) => void;
  applyProviderModelsRequestFailure: (
    abortController: AbortController,
    appError: unknown,
    mode: "batch" | "single",
  ) => void;
  collectProviderModelPatches: (input: CollectProviderModelPatchesInput) => Promise<{
    providerPatches: Map<string, Partial<ModelProviderConfig>>;
    failures: string[];
  }>;
  saveModelConfigWithProviderPatches: (
    providerPatches: Map<string, Partial<ModelProviderConfig>>,
    providers?: ModelProviderConfig[],
  ) => Promise<ModelConfig>;
  handleRefreshAllProviderModels: () => Promise<void>;
  refreshSingleProviderModels: (provider: ModelProviderConfig) => Promise<void>;
  handleRefreshProviderModels: (providerId: string) => Promise<void>;
};

export type ModelCatalogConfigHandlers = {
  persistNormalizedModelConfig: (configToSave: ModelConfig, testConfig?: ModelConfig) => Promise<ModelConfig>;
  applySavedModelConfig: (mergedSaved: ModelConfig) => Promise<void>;
  handleSaveModelConfig: (nextConfig?: ModelConfig, testConfig?: ModelConfig) => Promise<void>;
  handleTestConnection: () => Promise<void>;
};
