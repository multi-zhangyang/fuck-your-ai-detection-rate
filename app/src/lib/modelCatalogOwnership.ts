import type { ModelCatalogResult, ModelConfig } from "@/types/app";

const MODEL_CATALOG_CONNECTION_IDENTITY = Symbol("fyadr-model-catalog-connection");

type OwnedModelCatalog = ModelCatalogResult & {
  [MODEL_CATALOG_CONNECTION_IDENTITY]?: string;
};

export function modelCatalogConnectionIdentity(config: ModelConfig): string {
  return JSON.stringify([config.baseUrl.trim(), config.apiKey.trim(), config.apiType]);
}

export function bindModelCatalogToConfig(
  catalog: ModelCatalogResult,
  config: ModelConfig,
): ModelCatalogResult {
  return Object.assign({}, catalog, {
    [MODEL_CATALOG_CONNECTION_IDENTITY]: modelCatalogConnectionIdentity(config),
  });
}

export function modelCatalogBelongsToConfig(
  catalog: ModelCatalogResult | null,
  config: ModelConfig,
): boolean {
  if (!catalog) return true;
  const owner = (catalog as OwnedModelCatalog)[MODEL_CATALOG_CONNECTION_IDENTITY];
  // Untagged catalogs are accepted for compatibility with callers outside the
  // web handler.  Every catalog loaded by the App is tagged before commit.
  return owner === undefined || owner === modelCatalogConnectionIdentity(config);
}
