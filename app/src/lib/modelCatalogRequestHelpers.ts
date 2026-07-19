export type ModelCatalogRequestHandle = {
  controller: AbortController;
  generation: number;
};

export type ModelCatalogRequestRegistry = {
  nextGeneration: number;
  latestGeneration: number;
  activeRequests: Map<AbortController, ModelCatalogRequestHandle>;
};

export function createModelCatalogRequestRegistry(): ModelCatalogRequestRegistry {
  return {
    nextGeneration: 0,
    latestGeneration: 0,
    activeRequests: new Map<AbortController, ModelCatalogRequestHandle>(),
  };
}

export function beginModelCatalogRequest(registry: ModelCatalogRequestRegistry): ModelCatalogRequestHandle {
  for (const request of registry.activeRequests.values()) {
    if (!request.controller.signal.aborted) request.controller.abort("fyadr-request-replaced");
  }
  const controller = new AbortController();
  const handle = {
    controller,
    generation: ++registry.nextGeneration,
  };
  registry.latestGeneration = handle.generation;
  registry.activeRequests.set(controller, handle);
  return handle;
}

export function finishModelCatalogRequest(
  registry: ModelCatalogRequestRegistry,
  controller: AbortController,
) {
  registry.activeRequests.delete(controller);
}

export function isModelCatalogRequestCurrent(
  registry: ModelCatalogRequestRegistry,
  controller: AbortController,
): boolean {
  const request = registry.activeRequests.get(controller);
  return Boolean(
    request
    && !controller.signal.aborted
    && request.generation === registry.latestGeneration,
  );
}

export function isModelCatalogRequestLatest(
  registry: ModelCatalogRequestRegistry,
  controller: AbortController,
): boolean {
  const request = registry.activeRequests.get(controller);
  return Boolean(request && request.generation === registry.latestGeneration);
}

export function latestActiveModelCatalogController(
  registry: ModelCatalogRequestRegistry,
): AbortController | null {
  const requests = [...registry.activeRequests.values()];
  return requests.length ? requests[requests.length - 1].controller : null;
}

export function stopModelCatalogRequests(registry: ModelCatalogRequestRegistry) {
  for (const request of registry.activeRequests.values()) {
    if (!request.controller.signal.aborted) request.controller.abort("fyadr-user-cancel");
  }
}

export function invalidateModelCatalogRequests(registry: ModelCatalogRequestRegistry, reason = "fyadr-request-invalidated") {
  for (const request of registry.activeRequests.values()) {
    if (!request.controller.signal.aborted) request.controller.abort(reason);
  }
  // Advance the generation without creating a new network request.  Late
  // completions from the old endpoint are therefore unable to clear a newer
  // validation error or repopulate its catalog.
  registry.latestGeneration = ++registry.nextGeneration;
}
