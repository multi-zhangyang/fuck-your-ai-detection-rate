import { create } from "zustand";

import type {
  DocumentHistory,
  DocumentProtectionMap,
  DocumentScopeDiagnostics,
  DocumentStatus,
  ExportResult,
  HistoryDocumentSummary,
  ModelConfig,
  OutputPreview,
  RoundCompareData,
  RoundProgress,
  RoundResult,
} from "@/types/app";

const defaultModelConfig: ModelConfig = {
  baseUrl: "",
  apiKey: "",
  model: "",
  apiType: "chat_completions",
  temperature: 0.7,
  promptProfile: "cn_custom",
  promptSequence: ["prewrite", "round1", "round2"],
  requestTimeoutSeconds: 600,
  maxRetries: 3,
  modelProviders: [],
  roundModels: {},
};

type AppState = {
  modelConfig: ModelConfig;
  documentStatus: DocumentStatus | null;
  history: DocumentHistory | null;
  protectionMap: DocumentProtectionMap | null;
  scopeDiagnostics: DocumentScopeDiagnostics | null;
  historyItems: HistoryDocumentSummary[];
  historyPanelOpen: boolean;
  roundResult: RoundResult | null;
  progress: RoundProgress | null;
  preview: OutputPreview | null;
  compareData: RoundCompareData | null;
  lastExportResult: ExportResult | null;
  runtimeStep: string;
  notice: string;
  busy: boolean;
  error: string;
  setModelConfig: (config: ModelConfig) => void;
  setDocumentStatus: (status: DocumentStatus | null) => void;
  setHistory: (history: DocumentHistory | null) => void;
  setProtectionMap: (protectionMap: DocumentProtectionMap | null) => void;
  setScopeDiagnostics: (scopeDiagnostics: DocumentScopeDiagnostics | null) => void;
  setHistoryItems: (items: HistoryDocumentSummary[]) => void;
  setHistoryPanelOpen: (open: boolean) => void;
  setRoundResult: (result: RoundResult | null) => void;
  setProgress: (progress: RoundProgress | null) => void;
  setPreview: (preview: OutputPreview | null) => void;
  setCompareData: (compareData: RoundCompareData | null) => void;
  setLastExportResult: (result: ExportResult | null) => void;
  setRuntimeStep: (text: string) => void;
  setNotice: (notice: string) => void;
  setBusy: (busy: boolean) => void;
  setError: (error: string) => void;
};

export const useAppState = create<AppState>((set) => ({
  modelConfig: defaultModelConfig,
  documentStatus: null,
  history: null,
  protectionMap: null,
  scopeDiagnostics: null,
  historyItems: [],
  historyPanelOpen: true,
  roundResult: null,
  progress: null,
  preview: null,
  compareData: null,
  lastExportResult: null,
  runtimeStep: "待命",
  notice: "",
  busy: false,
  error: "",
  setModelConfig: (modelConfig) => set({ modelConfig }),
  setDocumentStatus: (documentStatus) => set({ documentStatus }),
  setHistory: (history) => set({ history }),
  setProtectionMap: (protectionMap) => set({ protectionMap }),
  setScopeDiagnostics: (scopeDiagnostics) => set({ scopeDiagnostics }),
  setHistoryItems: (historyItems) => set({ historyItems }),
  setHistoryPanelOpen: (historyPanelOpen) => set({ historyPanelOpen }),
  setRoundResult: (roundResult) => set({ roundResult }),
  setProgress: (progress) => set({ progress }),
  setPreview: (preview) => set({ preview }),
  setCompareData: (compareData) => set({ compareData }),
  setLastExportResult: (lastExportResult) => set({ lastExportResult }),
  setRuntimeStep: (runtimeStep) => set({ runtimeStep }),
  setNotice: (notice) => set({ notice }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
}));
