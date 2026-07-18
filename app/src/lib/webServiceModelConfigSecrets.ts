import type { ModelConfig } from "@/types/app";
import { readStorageValue, writeStorageValue } from "@/lib/safeStorage";

export const SAVED_SECRET_PLACEHOLDER = "__FYADR_SAVED_SECRET__";
const MODEL_CONFIG_BACKUP_KEY = "fyadr.modelConfig.backup";

export function sanitizeSecret(value: unknown): string {
  return typeof value === "string" && value.trim() ? SAVED_SECRET_PLACEHOLDER : "";
}

export function hasVisibleSecret(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "" && value.trim() !== SAVED_SECRET_PLACEHOLDER;
}

export function sanitizeModelConfigSecrets<T extends Partial<ModelConfig>>(config: T): T {
  const sanitized = {
    ...config,
    apiKey: sanitizeSecret(config.apiKey),
    modelProviders: config.modelProviders?.map((provider) => ({
      ...provider,
      apiKey: sanitizeSecret(provider.apiKey),
    })),
    roundModels: config.roundModels
      ? Object.fromEntries(
          Object.entries(config.roundModels).map(([key, route]) => [
            key,
            {
              ...route,
              apiKey: sanitizeSecret(route.apiKey),
            },
          ]),
        )
      : config.roundModels,
  };
  return sanitized as T;
}

export function restoreVisibleSecrets(base: ModelConfig, source: ModelConfig): ModelConfig {
  const restored: ModelConfig = {
    ...base,
    apiKey: hasVisibleSecret(source.apiKey) ? source.apiKey : base.apiKey,
    modelProviders: base.modelProviders?.map((provider) => {
      const sourceProvider = source.modelProviders?.find((item) => item.id === provider.id || item.name === provider.name);
      return {
        ...provider,
        apiKey: hasVisibleSecret(sourceProvider?.apiKey) ? sourceProvider?.apiKey ?? provider.apiKey : provider.apiKey,
      };
    }),
    roundModels: base.roundModels
      ? Object.fromEntries(
          Object.entries(base.roundModels).map(([key, route]) => {
            const sourceRoute = source.roundModels?.[key];
            return [
              key,
              {
                ...route,
                apiKey: hasVisibleSecret(sourceRoute?.apiKey) ? sourceRoute?.apiKey ?? route.apiKey : route.apiKey,
              },
            ];
          }),
        )
      : base.roundModels,
  };
  return restored;
}

export function readModelConfigBackup(): Partial<ModelConfig> {
  try {
    const raw = readStorageValue(MODEL_CONFIG_BACKUP_KEY);
    return raw ? sanitizeModelConfigSecrets(JSON.parse(raw) as Partial<ModelConfig>) : {};
  } catch {
    return {};
  }
}

export function writeModelConfigBackup(config: ModelConfig): void {
  try {
    writeStorageValue(MODEL_CONFIG_BACKUP_KEY, JSON.stringify(sanitizeModelConfigSecrets(config)));
  } catch {
    // Ignore local backup failures; backend config remains authoritative.
  }
}
