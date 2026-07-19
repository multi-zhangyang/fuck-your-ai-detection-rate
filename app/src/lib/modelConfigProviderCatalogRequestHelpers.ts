export type ProviderCatalogRequestHandle = {
  generation: number;
  abortController: AbortController;
  providerIds: string[];
};

export type ProviderCatalogRequestRegistry = {
  nextGeneration: number;
  latestGeneration: number;
  activeRequests: Map<number, ProviderCatalogRequestHandle>;
};

export function createProviderCatalogRequestRegistry(): ProviderCatalogRequestRegistry {
  return {
    nextGeneration: 0,
    latestGeneration: 0,
    activeRequests: new Map<number, ProviderCatalogRequestHandle>(),
  };
}

export function beginProviderCatalogRequest(
  registry: ProviderCatalogRequestRegistry,
  providerIds: string[] = [],
): ProviderCatalogRequestHandle {
  for (const request of registry.activeRequests.values()) {
    if (!request.abortController.signal.aborted) {
      request.abortController.abort("fyadr-provider-catalog-replaced");
    }
  }
  const abortController = new AbortController();
  const generation = ++registry.nextGeneration;
  const handle = {
    generation,
    abortController,
    providerIds: [...new Set(providerIds)],
  };
  registry.latestGeneration = generation;
  registry.activeRequests.set(generation, handle);
  return handle;
}

export function finishProviderCatalogRequest(
  registry: ProviderCatalogRequestRegistry,
  handle: ProviderCatalogRequestHandle,
) {
  registry.activeRequests.delete(handle.generation);
}

export function isProviderCatalogRequestCurrent(
  registry: ProviderCatalogRequestRegistry,
  handle: ProviderCatalogRequestHandle,
): boolean {
  return registry.activeRequests.get(handle.generation) === handle
    && registry.latestGeneration === handle.generation
    && !handle.abortController.signal.aborted;
}

export function isProviderCatalogRequestLatest(
  registry: ProviderCatalogRequestRegistry,
  handle: ProviderCatalogRequestHandle,
): boolean {
  return registry.activeRequests.get(handle.generation) === handle
    && registry.latestGeneration === handle.generation;
}

export function stopProviderCatalogRequests(registry: ProviderCatalogRequestRegistry) {
  for (const request of registry.activeRequests.values()) {
    if (!request.abortController.signal.aborted) {
      request.abortController.abort("fyadr-user-cancel");
    }
  }
}

export function getActiveProviderCatalogIds(registry: ProviderCatalogRequestRegistry): Set<string> {
  const providerIds = new Set<string>();
  for (const request of registry.activeRequests.values()) {
    for (const providerId of request.providerIds) providerIds.add(providerId);
  }
  return providerIds;
}
