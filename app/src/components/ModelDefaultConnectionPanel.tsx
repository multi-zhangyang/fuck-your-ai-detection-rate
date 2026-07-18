import { ModelDefaultConnectionActions } from "@/components/ModelDefaultConnectionActions";
import { ModelDefaultConnectionForm } from "@/components/ModelDefaultConnectionForm";
import type { ModelCatalogResult, ModelConfig } from "@/types/app";

type Props = {
  value: ModelConfig;
  busy: boolean;
  modelCatalog: ModelCatalogResult | null;
  modelCatalogBusy: boolean;
  modelCatalogError: string;
  loadingIconClassName: string;
  onChange: (value: ModelConfig) => void;
  onSave: (nextValue?: ModelConfig, testValue?: ModelConfig) => void;
  onTestConnection: () => void;
  onRefreshModels: () => void;
};

export function ModelDefaultConnectionPanel({
  value,
  busy,
  modelCatalog,
  modelCatalogBusy,
  modelCatalogError,
  loadingIconClassName,
  onChange,
  onSave,
  onTestConnection,
  onRefreshModels,
}: Props) {
  return (
    <div className="grid h-full min-h-0 gap-4 overflow-y-auto pr-1 2xl:grid-cols-[minmax(0,1fr)_320px] 2xl:overflow-hidden 2xl:pr-0">
      <ModelDefaultConnectionForm
        value={value}
        modelCatalog={modelCatalog}
        onChange={onChange}
      />
      <ModelDefaultConnectionActions
        value={value}
        busy={busy}
        modelCatalog={modelCatalog}
        modelCatalogBusy={modelCatalogBusy}
        modelCatalogError={modelCatalogError}
        loadingIconClassName={loadingIconClassName}
        onSave={onSave}
        onTestConnection={onTestConnection}
        onRefreshModels={onRefreshModels}
      />
    </div>
  );
}
