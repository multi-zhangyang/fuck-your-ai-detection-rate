import { MAX_REWRITE_CONCURRENCY } from "@/lib/modelRoute";
import type { ModelConfig } from "@/types/app";

function isFiniteNumberInRange(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

export function getModelConfigValidationIssues(
  config: ModelConfig,
  options: { requireConnection?: boolean } = {},
): string[] {
  const issues: string[] = [];
  const baseUrl = String(config.baseUrl ?? "").trim();
  const apiKey = String(config.apiKey ?? "").trim();
  const model = String(config.model ?? "").trim();

  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      if (!(["http:", "https:"] as string[]).includes(parsed.protocol)) {
        issues.push("API 地址必须使用 http 或 https 协议");
      }
    } catch {
      issues.push("API 地址格式无效");
    }
  }

  if (!isFiniteNumberInRange(config.temperature, 0, 2)) {
    issues.push("Temperature 必须在 0 到 2 之间");
  }
  if (!isFiniteNumberInRange(config.requestTimeoutSeconds, 30, 3600)) {
    issues.push("超时秒数必须在 30 到 3600 之间");
  }
  if (!isFiniteNumberInRange(config.maxRetries, 0, 10)) {
    issues.push("最大重试必须在 0 到 10 之间");
  }
  if (!isFiniteNumberInRange(config.rewriteConcurrency, 1, MAX_REWRITE_CONCURRENCY)) {
    issues.push(`轮内并发必须在 1 到 ${MAX_REWRITE_CONCURRENCY} 之间`);
  }

  if (options.requireConnection) {
    if (!baseUrl) issues.push("请填写 API 地址");
    if (!apiKey) issues.push("请填写 API Key");
    if (!model) issues.push("请填写或选择模型");
  }
  return [...new Set(issues)];
}

export function assertModelConfigValid(
  config: ModelConfig,
  options: { requireConnection?: boolean } = {},
) {
  const issues = getModelConfigValidationIssues(config, options);
  if (issues.length) {
    throw new Error(issues[0]);
  }
}
