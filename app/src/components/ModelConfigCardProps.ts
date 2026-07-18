import type { ModelCatalogResult, ModelConfig } from "@/types/app";

export type ModelConfigCardProps = {
  value: ModelConfig;
  busy: boolean;
  modelCatalog: ModelCatalogResult | null;
  modelCatalogBusy: boolean;
  modelCatalogError: string;
  onChange: (value: ModelConfig) => void;
  onSave: (nextValue?: ModelConfig, testValue?: ModelConfig) => void;
  onTestConnection: () => void;
  onRefreshModels: () => void;
  onListModelsForConfig: (config: ModelConfig, signal?: AbortSignal) => Promise<ModelCatalogResult | null>;
};
