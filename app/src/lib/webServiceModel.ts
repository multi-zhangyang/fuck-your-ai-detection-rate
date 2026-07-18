import type {
  ModelCatalogResult,
  ModelConfig,
  TestConnectionResult,
} from "@/types/app";
import {
  defaultModelConfig,
  mergeModelConfig,
  readModelConfigBackup,
  restoreVisibleSecrets,
  sanitizeModelConfigSecrets,
  writeModelConfigBackup,
} from "@/lib/webServiceModelConfig";
import { requestJson } from "@/lib/webServiceHttp";

export const webServiceModelApi = {
  async loadModelConfig(): Promise<ModelConfig> {
    const backup = readModelConfigBackup();
    const config = await requestJson<Partial<ModelConfig>>("/api/model-config");
    const merged = mergeModelConfig(backup, config);
    writeModelConfigBackup(merged);
    return merged;
  },

  async saveModelConfig(config: ModelConfig): Promise<ModelConfig> {
    const payload = mergeModelConfig(readModelConfigBackup(), config);
    writeModelConfigBackup(payload);
    const saved = await requestJson<Partial<ModelConfig>>("/api/model-config", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const merged = restoreVisibleSecrets(mergeModelConfig(saved), payload);
    writeModelConfigBackup(merged);
    return merged;
  },

  async listModels(config: ModelConfig, signal?: AbortSignal): Promise<ModelCatalogResult> {
    return requestJson<ModelCatalogResult>("/api/list-models", {
      method: "POST",
      body: JSON.stringify(config),
      signal,
    });
  },

  async testModelConnection(config: ModelConfig): Promise<TestConnectionResult> {
    return requestJson<TestConnectionResult>("/api/test-connection", {
      method: "POST",
      body: JSON.stringify(config),
    });
  },
};
