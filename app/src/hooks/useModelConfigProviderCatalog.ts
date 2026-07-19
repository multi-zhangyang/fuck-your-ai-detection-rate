import { useEffect, useRef, useState } from "react";

import { createModelConfigProviderCatalogHandlers } from "@/lib/modelConfigProviderCatalogHandlers";
import { createProviderCatalogRequestRegistry } from "@/lib/modelConfigProviderMutationHandlers";
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
  const providerCatalogRequestRegistryRef = useRef(createProviderCatalogRequestRegistry());
  useEffect(() => () => {
    const registry = providerCatalogRequestRegistryRef.current;
    for (const request of registry.activeRequests.values()) {
      if (!request.abortController.signal.aborted) request.abortController.abort("fyadr-view-unmounted");
    }
  }, []);
  const valueRef = useRef(input.value);
  valueRef.current = input.value;
  function applyValue(nextValue: ModelConfig) {
    // Keep async catalog handlers on the same latest value immediately, before
    // React commits the parent state update.  This is what makes delete/add/edit
    // safe even when a deferred request resolves in the same microtask.
    valueRef.current = nextValue;
    input.onChange(nextValue);
  }
  const providers = input.value.modelProviders ?? [];
  const effectiveSelectedProviderId = providers.some((provider) => provider.id === selectedProviderId)
    ? selectedProviderId
    : providers[0]?.id ?? "";
  const selectedProviderIdRef = useRef(selectedProviderId);
  selectedProviderIdRef.current = effectiveSelectedProviderId;

  const handlers = createModelConfigProviderCatalogHandlers({
    getValue: () => valueRef.current,
    onChange: applyValue,
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
    getRequestRegistry: () => providerCatalogRequestRegistryRef.current,
  });

  const providerCatalogRunning = Object.values(providerCatalogBusy).some(Boolean);

  return {
    selectedProviderId: effectiveSelectedProviderId,
    setSelectedProviderId,
    providerCatalogBusy,
    providerCatalogErrors,
    providerCatalogRunning,
    ...handlers,
  };
}
