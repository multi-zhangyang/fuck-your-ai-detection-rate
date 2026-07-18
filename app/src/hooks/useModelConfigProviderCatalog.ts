import { useRef, useState } from "react";

import { createModelConfigProviderCatalogHandlers } from "@/lib/modelConfigProviderCatalogHandlers";
import type { ModelCatalogResult, ModelConfig } from "@/types/app";

export function useModelConfigProviderCatalog(input: {
  value: ModelConfig;
  onChange: (value: ModelConfig) => void;
  onSave: (nextValue?: ModelConfig, testValue?: ModelConfig) => void;
  onListModelsForConfig: (config: ModelConfig, signal?: AbortSignal) => Promise<ModelCatalogResult | null>;
}) {
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [providerCatalogBusy, setProviderCatalogBusy] = useState<Partial<Record<string, boolean>>>({});
  const [providerCatalogErrors, setProviderCatalogErrors] = useState<Partial<Record<string, string>>>({});
  const providerCatalogAbortRef = useRef<AbortController | null>(null);
  const valueRef = useRef(input.value);
  valueRef.current = input.value;
  const selectedProviderIdRef = useRef(selectedProviderId);
  selectedProviderIdRef.current = selectedProviderId;

  const handlers = createModelConfigProviderCatalogHandlers({
    getValue: () => valueRef.current,
    onChange: input.onChange,
    onSave: input.onSave,
    onListModelsForConfig: input.onListModelsForConfig,
    getSelectedProviderId: () => selectedProviderIdRef.current,
    setSelectedProviderId,
    setProviderCatalogBusy,
    setProviderCatalogErrors,
    getAbortController: () => providerCatalogAbortRef.current,
    setAbortController: (controller) => {
      providerCatalogAbortRef.current = controller;
    },
  });

  const providerCatalogRunning = Object.values(providerCatalogBusy).some(Boolean);

  return {
    selectedProviderId,
    setSelectedProviderId,
    providerCatalogBusy,
    providerCatalogErrors,
    providerCatalogRunning,
    ...handlers,
  };
}
