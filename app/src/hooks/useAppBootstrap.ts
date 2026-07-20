import { useEffect, useRef } from "react";

import type { AppService } from "@/lib/appService";
import { bootstrapAppConfig } from "@/lib/appBootstrapConfigHelpers";
import { bootstrapAppHistories } from "@/lib/appBootstrapHistoryHelpers";
import type { PromptPreviewRequestRegistry } from "@/lib/promptPreviewRequestGeneration";
import type {
  HistoryArtifactQueryResponse,
  HistoryDocumentSummary,
  ModelConfig,
  PromptPreviewResponse,
} from "@/types/app";

type UseAppBootstrapInput = {
  service: AppService;
  setError: (message: string) => void;
  setModelConfig: (config: ModelConfig) => void;
  setModelConfigReady: (ready: boolean) => void;
  modelConfigRevisionRef: { current: number };
  setPromptPreviews: (previews: PromptPreviewResponse) => void;
  setPromptPreviewBusy: (busy: boolean) => void;
  promptPreviewRequestRegistry: PromptPreviewRequestRegistry;
  refreshModelCatalog: (
    config?: ModelConfig,
    options?: { silent?: boolean },
  ) => Promise<unknown>;
  setHistoryItems: (items: HistoryDocumentSummary[]) => void;
  setHistoryArtifactQuery: (query: HistoryArtifactQueryResponse | null) => void;
  setHistoryListReady: (ready: boolean) => void;
};

export function useAppBootstrap(input: UseAppBootstrapInput) {
  const {
    service,
    setError,
    setModelConfig,
    setModelConfigReady,
    modelConfigRevisionRef,
    setPromptPreviews,
    setPromptPreviewBusy,
    promptPreviewRequestRegistry,
    refreshModelCatalog,
    setHistoryItems,
    setHistoryArtifactQuery,
    setHistoryListReady,
  } = input;

  const refreshModelCatalogRef = useRef(refreshModelCatalog);
  refreshModelCatalogRef.current = refreshModelCatalog;

  useEffect(() => {
    let cancelled = false;
    void bootstrapAppConfig({
      service,
      cancelled: () => cancelled,
      setError,
      setModelConfig,
      setModelConfigReady,
      setPromptPreviews,
      setPromptPreviewBusy,
      promptPreviewRequestRegistry,
      shouldCommitModelConfig: () => modelConfigRevisionRef.current === 0,
      refreshModelCatalog: (...args) => refreshModelCatalogRef.current(...args),
    });
    return () => {
      cancelled = true;
    };
  }, [
    service,
    setError,
    setModelConfig,
    setModelConfigReady,
    modelConfigRevisionRef,
    setPromptPreviews,
    setPromptPreviewBusy,
    promptPreviewRequestRegistry,
  ]);

  useEffect(() => {
    let cancelled = false;
    void bootstrapAppHistories({
      service,
      cancelled: () => cancelled,
      setError,
      setHistoryItems,
      setHistoryArtifactQuery,
      setHistoryListReady,
    });
    return () => {
      cancelled = true;
    };
  }, [service, setError, setHistoryItems, setHistoryArtifactQuery, setHistoryListReady]);

}
