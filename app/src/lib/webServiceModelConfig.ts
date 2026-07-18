import type { ModelConfig } from "@/types/app";
import { ACTIVE_PROMPT_PROFILE, DEFAULT_PROMPT_SEQUENCE } from "@/lib/promptRegistry";
import {
  readModelConfigBackup,
  restoreVisibleSecrets,
  sanitizeModelConfigSecrets,
  writeModelConfigBackup,
  SAVED_SECRET_PLACEHOLDER,
  sanitizeSecret,
  hasVisibleSecret,
} from "@/lib/webServiceModelConfigSecrets";

export {
  SAVED_SECRET_PLACEHOLDER,
  sanitizeSecret,
  hasVisibleSecret,
  sanitizeModelConfigSecrets,
  restoreVisibleSecrets,
  readModelConfigBackup,
  writeModelConfigBackup,
};

export const MAX_REWRITE_CONCURRENCY = 16;

export const defaultModelConfig: ModelConfig = {
  baseUrl: "",
  apiKey: "",
  model: "",
  apiType: "chat_completions",
  streaming: true,
  temperature: 0.7,
  promptProfile: ACTIVE_PROMPT_PROFILE,
  promptSequence: DEFAULT_PROMPT_SEQUENCE,
  requestTimeoutSeconds: 600,
  maxRetries: 3,
  rewriteConcurrency: 2,
};

export function mergeModelConfig(...configs: Array<Partial<ModelConfig> | undefined>): ModelConfig {
  const merged = configs.reduce<Partial<ModelConfig>>((current, item) => ({ ...current, ...(item ?? {}) }), { ...defaultModelConfig });
  const roundModels = configs.reduce<Record<string, NonNullable<ModelConfig["roundModels"]>[string]>>((current, item) => ({
    ...current,
    ...((item?.roundModels ?? {}) as NonNullable<ModelConfig["roundModels"]>),
  }), {});
  const promptSequence = Array.isArray(merged.promptSequence) && merged.promptSequence.length
    ? merged.promptSequence
    : defaultModelConfig.promptSequence;
  const rewriteConcurrency = Math.max(1, Math.min(MAX_REWRITE_CONCURRENCY, Number(merged.rewriteConcurrency ?? defaultModelConfig.rewriteConcurrency) || defaultModelConfig.rewriteConcurrency));
  const streaming = typeof merged.streaming === "boolean"
    ? merged.streaming
    : defaultModelConfig.streaming;
  return { ...defaultModelConfig, ...merged, streaming, promptSequence, rewriteConcurrency, roundModels };
}
