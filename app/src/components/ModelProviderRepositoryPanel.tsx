import { ModelProviderEditorPanel } from "@/components/ModelProviderEditorPanel";
import { ModelProviderListPanel } from "@/components/ModelProviderListPanel";
import { deriveModelProviderRepositoryState } from "@/lib/modelProviderRepositoryViewModel";
import type { ModelConfig, ModelProviderConfig } from "@/types/app";

type Props = {
  value: ModelConfig;
  busy: boolean;
  selectedProviderId: string;
  providerCatalogBusy: Partial<Record<string, boolean>>;
  providerCatalogErrors: Partial<Record<string, string>>;
  providerCatalogRunning: boolean;
  loadingIconClassName: string;
  onSelectProviderId: (providerId: string) => void;
  onAddProvider: () => void;
  onDeleteProvider: (providerId: string) => void;
  onUpdateProvider: (providerId: string, patch: Partial<ModelProviderConfig>) => void;
  onRefreshProviderCatalog: (provider: ModelProviderConfig) => void;
  onRefreshAllProviderCatalogs: () => void;
  onStopProviderCatalogRequest: () => void;
  onSaveProviderConfig: (provider: ModelProviderConfig) => void;
};

export function ModelProviderRepositoryPanel({
  value,
  busy,
  selectedProviderId,
  providerCatalogBusy,
  providerCatalogErrors,
  providerCatalogRunning,
  loadingIconClassName,
  onSelectProviderId,
  onAddProvider,
  onDeleteProvider,
  onUpdateProvider,
  onRefreshProviderCatalog,
  onRefreshAllProviderCatalogs,
  onStopProviderCatalogRequest,
  onSaveProviderConfig,
}: Props) {
  const {
    providers,
    selectedProvider,
    enabledProviderCount,
  } = deriveModelProviderRepositoryState({ value, selectedProviderId });

  return (
    <div className="grid h-full min-h-0 gap-3 overflow-y-auto pr-1 xl:grid-cols-[280px_minmax(0,1fr)] xl:overflow-hidden xl:pr-0">
      <ModelProviderListPanel
        providers={providers}
        selectedProviderId={selectedProviderId}
        enabledProviderCount={enabledProviderCount}
        busy={busy}
        providerCatalogRunning={providerCatalogRunning}
        loadingIconClassName={loadingIconClassName}
        onSelectProviderId={onSelectProviderId}
        onAddProvider={onAddProvider}
        onRefreshAllProviderCatalogs={onRefreshAllProviderCatalogs}
      />
      <ModelProviderEditorPanel
        value={value}
        busy={busy}
        selectedProvider={selectedProvider}
        providerCatalogBusy={providerCatalogBusy}
        providerCatalogErrors={providerCatalogErrors}
        providerCatalogRunning={providerCatalogRunning}
        loadingIconClassName={loadingIconClassName}
        onAddProvider={onAddProvider}
        onDeleteProvider={onDeleteProvider}
        onUpdateProvider={onUpdateProvider}
        onRefreshProviderCatalog={onRefreshProviderCatalog}
        onStopProviderCatalogRequest={onStopProviderCatalogRequest}
        onSaveProviderConfig={onSaveProviderConfig}
      />
    </div>
  );
}
