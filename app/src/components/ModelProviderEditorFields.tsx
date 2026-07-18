import { ModelProviderIdentityFields } from "@/components/ModelProviderIdentityFields";
import { ModelProviderParamFields } from "@/components/ModelProviderParamFields";
import { Separator } from "@/components/ui/separator";
import type { ModelConfig, ModelProviderConfig } from "@/types/app";

export function ModelProviderEditorFields({
  value,
  selectedProvider,
  providerCatalogErrors,
  onUpdateProvider,
}: {
  value: ModelConfig;
  selectedProvider: ModelProviderConfig;
  providerCatalogErrors: Partial<Record<string, string>>;
  onUpdateProvider: (providerId: string, patch: Partial<ModelProviderConfig>) => void;
}) {
  return (
    <>
      <ModelProviderIdentityFields
        selectedProvider={selectedProvider}
        onUpdateProvider={onUpdateProvider}
      />
      <Separator />
      <ModelProviderParamFields
        value={value}
        selectedProvider={selectedProvider}
        providerCatalogErrors={providerCatalogErrors}
        onUpdateProvider={onUpdateProvider}
      />
    </>
  );
}
