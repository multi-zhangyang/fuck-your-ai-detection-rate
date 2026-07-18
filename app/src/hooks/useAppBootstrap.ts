import { useEffect, useRef } from "react";

import type { AppService } from "@/lib/appService";
import { bootstrapAppConfig } from "@/lib/appBootstrapConfigHelpers";
import { bootstrapAppFormatRules } from "@/lib/appBootstrapFormatHelpers";
import { bootstrapAppHistories } from "@/lib/appBootstrapHistoryHelpers";
import type {
  FormatRules,
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
  setPromptPreviews: (previews: PromptPreviewResponse) => void;
  refreshModelCatalog: (
    config?: ModelConfig,
    options?: { silent?: boolean },
  ) => Promise<unknown>;
  setHistoryItems: (items: HistoryDocumentSummary[]) => void;
  setHistoryArtifactQuery: (query: HistoryArtifactQueryResponse | null) => void;
  setHistoryListReady: (ready: boolean) => void;
  setActiveFormatRules: (rules: FormatRules) => void;
};

export function useAppBootstrap(input: UseAppBootstrapInput) {
  const {
    service,
    setError,
    setModelConfig,
    setModelConfigReady,
    setPromptPreviews,
    refreshModelCatalog,
    setHistoryItems,
    setHistoryArtifactQuery,
    setHistoryListReady,
    setActiveFormatRules,
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
      refreshModelCatalog: (...args) => refreshModelCatalogRef.current(...args),
    });
    return () => {
      cancelled = true;
    };
  }, [service, setError, setModelConfig, setModelConfigReady, setPromptPreviews]);

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

  useEffect(() => {
    let cancelled = false;
    void bootstrapAppFormatRules({
      service,
      cancelled: () => cancelled,
      setActiveFormatRules,
    });
    return () => {
      cancelled = true;
    };
  }, [service, setActiveFormatRules]);
}
