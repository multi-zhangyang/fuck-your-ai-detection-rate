import type { ModelConfig, ModelProviderConfig } from "@/types/app";

export function buildProviderModelsPatch(
  provider: ModelProviderConfig,
  modelIds: string[],
  nowIso = new Date().toISOString(),
): Partial<ModelProviderConfig> {
  return {
    models: modelIds,
    defaultModel: provider.defaultModel || modelIds[0] || "",
    updatedAt: nowIso,
  };
}

export function applyProviderModelPatches(
  providers: ModelProviderConfig[],
  patches: Map<string, Partial<ModelProviderConfig>> | Record<string, Partial<ModelProviderConfig>>,
): ModelProviderConfig[] {
  const patchMap = patches instanceof Map ? patches : new Map(Object.entries(patches));
  return providers.map((provider) => {
    const patch = patchMap.get(provider.id);
    if (!patch) return provider;
    return {
      ...provider,
      ...patch,
      // Catalog refreshes may be based on an older provider snapshot.  Keep a
      // non-empty default selected/edited since then; only fill an empty field
      // from the returned catalog.
      ...(provider.defaultModel ? { defaultModel: provider.defaultModel } : {}),
    };
  });
}

export function mergeSavedModelConfig(saved: ModelConfig, nextConfig: ModelConfig): ModelConfig {
  return {
    ...saved,
    ...nextConfig,
    roundModels: { ...(saved.roundModels ?? {}), ...(nextConfig.roundModels ?? {}) },
  };
}

function modelConfigValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === undefined || right === undefined) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function reconcileSavedModelConfig(
  submitted: ModelConfig,
  saved: ModelConfig,
  latest: ModelConfig,
): ModelConfig {
  const reconciled = { ...saved };
  for (const key of Object.keys(latest) as Array<keyof ModelConfig>) {
    if (!modelConfigValueEqual(latest[key], submitted[key])) {
      // The user changed this field after submission.  A late save response is
      // an acknowledgement of the submitted value, not authority to replace
      // the newer local edit.
      Object.assign(reconciled, { [key]: latest[key] });
    }
  }
  return reconciled;
}

export function getEnabledProviders(providers: ModelProviderConfig[] | undefined): ModelProviderConfig[] {
  return (providers ?? []).filter((provider) => provider.enabled !== false);
}

export function getProviderConnectionIssue(provider: ModelProviderConfig): string | null {
  if (!provider.baseUrl.trim() || !provider.apiKey.trim()) {
    return `${provider.name || provider.id}：连接信息不完整`;
  }
  return null;
}

export function pickDefaultModelFromCatalog(currentModel: string, modelIds: string[]): string {
  if (currentModel.trim()) {
    return currentModel;
  }
  return modelIds[0] || currentModel;
}
