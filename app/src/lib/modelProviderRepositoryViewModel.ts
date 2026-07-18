import type { ModelConfig, ModelProviderConfig } from "@/types/app";

export function deriveModelProviderRepositoryState(input: {
  value: ModelConfig;
  selectedProviderId: string;
}) {
  const providers = input.value.modelProviders ?? [];
  const selectedProvider = providers.find((provider) => provider.id === input.selectedProviderId) ?? providers[0] ?? null;
  const enabledProviderCount = providers.filter((provider) => provider.enabled !== false).length;
  return {
    providers,
    selectedProvider,
    enabledProviderCount,
  };
}

export function deriveModelProviderListItemState(provider: ModelProviderConfig, selectedProviderId: string | null | undefined) {
  return {
    active: selectedProviderId === provider.id,
    modelLabel: provider.defaultModel || provider.models?.[0] || "未选择模型",
    modelCount: provider.models?.length ?? 0,
    providerEnabled: provider.enabled !== false,
  };
}
