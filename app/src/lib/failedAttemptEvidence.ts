import type {
  FailedAttemptEvidence,
  FailedAttemptGuardCategory,
  FailedAttemptIssueCode,
} from "@/types/app";

export const FAILED_ATTEMPT_EVIDENCE_SCHEMA = "fyadr.failed-attempt-evidence" as const;
export const FAILED_ATTEMPT_EVIDENCE_VERSION = 1 as const;
export const FAILED_ATTEMPT_PRIVACY_NOTICE = "失败正文与原始错误未保存。";

const GUARD_CATEGORY_LABELS: Record<FailedAttemptGuardCategory, string> = {
  structure: "结构完整性门禁",
  factual: "事实与关系门禁",
  readability: "学术可读性门禁",
  style: "写作结构门禁",
  provider: "模型服务",
  local_validation: "本地发布门禁",
};

const ISSUE_CODE_LABELS: Record<FailedAttemptIssueCode, string> = {
  structure_placeholder_preservation: "结构占位符未完整保留",
  format_anchor_preservation: "Word 局部格式锚点未完整保留",
  paragraph_structure_preservation: "段落结构未完整保留",
  citation_preservation: "引用标记未完整保留",
  number_preservation: "数字或数值关系未完整保留",
  term_preservation: "受保护术语未完整保留",
  language_stability: "输出语言发生异常漂移",
  factual_relation_preservation: "事实、关系或顺序未稳定保留",
  factual_scope_qualifier_changed: "事实范围限定词发生新增、删除或类型变化",
  repetition_stability: "候选引入或放大重复内容",
  length_stability: "候选长度变化超出安全范围",
  sentence_surface_stability: "句面结构残缺或不完整",
  academic_register_stability: "候选引入非学术语域表达",
  academic_collocation_stability: "候选引入学术搭配冲突",
  predicate_completeness: "候选谓语结构不完整",
  machine_style_drift: "候选新增机械化写作模式",
  answer_style_rejected: "候选包含回答式包装或禁用格式",
  empty_output: "模型未返回可用正文",
  provider_auth: "模型服务鉴权失败",
  provider_rate_limit: "模型服务触发频率限制",
  provider_timeout: "模型服务响应超时",
  provider_network: "模型服务网络连接失败",
  provider_server: "模型服务端暂时异常",
  provider_client_configuration: "模型连接配置无效",
  provider_failure: "模型服务调用失败",
  reasoning_content_suppressed: "模型仅返回了已隔离的思考内容",
  validation_rejected_unspecified: "候选未通过本地发布校验",
};

const GUARD_CATEGORIES = new Set<FailedAttemptGuardCategory>(
  Object.keys(GUARD_CATEGORY_LABELS) as FailedAttemptGuardCategory[],
);
const ISSUE_CODES = new Set<FailedAttemptIssueCode>(
  Object.keys(ISSUE_CODE_LABELS) as FailedAttemptIssueCode[],
);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

type FailureEvidenceCarrier = {
  failedAttempts?: unknown;
  guardCategory?: unknown;
  issueCodes?: unknown;
  fallbackGuardCategory?: unknown;
  fallbackIssueCodes?: unknown;
  rerunFallbackGuardCategory?: unknown;
  rerunFallbackIssueCodes?: unknown;
};

export type FailedAttemptDisplaySummary = {
  guardCategory: FailedAttemptGuardCategory;
  guardLabel: string;
  issueCodes: FailedAttemptIssueCode[];
  reasonLabels: string[];
  detail: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeGuardCategory(value: unknown): FailedAttemptGuardCategory | null {
  return typeof value === "string" && GUARD_CATEGORIES.has(value as FailedAttemptGuardCategory)
    ? value as FailedAttemptGuardCategory
    : null;
}

function normalizeIssueCodes(value: unknown, strict: boolean): FailedAttemptIssueCode[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) return null;
  const normalized: FailedAttemptIssueCode[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !ISSUE_CODES.has(item as FailedAttemptIssueCode)) {
      if (strict) return null;
      continue;
    }
    const code = item as FailedAttemptIssueCode;
    if (normalized.includes(code)) {
      if (strict) return null;
      continue;
    }
    normalized.push(code);
  }
  return normalized.length ? normalized : null;
}

/**
 * Validate the v1 contract and return a metadata-only projection. Extra keys
 * are intentionally ignored, so even a forged response cannot carry provider
 * prose into components through this object.
 */
export function normalizeFailedAttemptEvidence(value: unknown): FailedAttemptEvidence | null {
  const record = asRecord(value);
  if (!record) return null;
  if (
    record.schema !== FAILED_ATTEMPT_EVIDENCE_SCHEMA
    || record.schemaVersion !== FAILED_ATTEMPT_EVIDENCE_VERSION
    || record.textStored !== false
    || record.errorStored !== false
    || record.reasoningSuppressed !== true
    || record.providerContentStored !== false
  ) {
    return null;
  }
  const attempt = record.attempt;
  if (attempt !== null && (!Number.isInteger(attempt) || Number(attempt) < 0 || Number(attempt) > 10_000)) {
    return null;
  }
  if (
    !Number.isInteger(record.outputCharCount)
    || Number(record.outputCharCount) < 0
    || Number(record.outputCharCount) > 2_000_000_000
    || typeof record.outputTextSha256 !== "string"
    || (record.outputTextSha256 !== "" && !SHA256_PATTERN.test(record.outputTextSha256))
    || (Number(record.outputCharCount) > 0 && !SHA256_PATTERN.test(record.outputTextSha256))
    || typeof record.truncated !== "boolean"
  ) {
    return null;
  }
  const guardCategory = normalizeGuardCategory(record.guardCategory);
  const issueCodes = normalizeIssueCodes(record.issueCodes, true);
  if (!guardCategory || !issueCodes) return null;
  return {
    schema: FAILED_ATTEMPT_EVIDENCE_SCHEMA,
    schemaVersion: FAILED_ATTEMPT_EVIDENCE_VERSION,
    attempt: attempt as number | null,
    outputCharCount: Number(record.outputCharCount),
    outputTextSha256: record.outputTextSha256,
    truncated: record.truncated,
    guardCategory,
    issueCodes,
    textStored: false,
    errorStored: false,
    reasoningSuppressed: true,
    providerContentStored: false,
  };
}

export function normalizeFailedAttemptEvidenceList(value: unknown): FailedAttemptEvidence[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-4)
    .map(normalizeFailedAttemptEvidence)
    .filter((item): item is FailedAttemptEvidence => Boolean(item));
}

export function getLatestFailedAttemptEvidence(value: unknown): FailedAttemptEvidence | null {
  const attempts = normalizeFailedAttemptEvidenceList(value);
  return attempts.length ? attempts[attempts.length - 1] : null;
}

function buildSummary(
  guardCategory: FailedAttemptGuardCategory,
  issueCodes: FailedAttemptIssueCode[],
): FailedAttemptDisplaySummary {
  const guardLabel = GUARD_CATEGORY_LABELS[guardCategory];
  const reasonLabels = issueCodes.map((code) => ISSUE_CODE_LABELS[code]);
  return {
    guardCategory,
    guardLabel,
    issueCodes,
    reasonLabels,
    detail: `${guardLabel}：${reasonLabels.join("；")}。${FAILED_ATTEMPT_PRIVACY_NOTICE}`,
  };
}

function summaryFromStableFields(
  guardCategory: unknown,
  issueCodes: unknown,
): FailedAttemptDisplaySummary | null {
  const normalizedCategory = normalizeGuardCategory(guardCategory);
  const normalizedCodes = normalizeIssueCodes(issueCodes, false);
  if (!normalizedCategory || !normalizedCodes) return null;
  return buildSummary(normalizedCategory, normalizedCodes);
}

export function normalizeFailedAttemptReasonFields(
  guardCategory: unknown,
  issueCodes: unknown,
): Pick<FailedAttemptDisplaySummary, "guardCategory" | "issueCodes"> | null {
  const summary = summaryFromStableFields(guardCategory, issueCodes);
  return summary
    ? { guardCategory: summary.guardCategory, issueCodes: summary.issueCodes }
    : null;
}

export function summarizeFailedAttemptEvidence(value: FailureEvidenceCarrier | null | undefined): FailedAttemptDisplaySummary | null {
  if (!value) return null;
  const latest = getLatestFailedAttemptEvidence(value.failedAttempts);
  if (latest) return buildSummary(latest.guardCategory, latest.issueCodes);
  return summaryFromStableFields(value.guardCategory, value.issueCodes)
    ?? summaryFromStableFields(value.rerunFallbackGuardCategory, value.rerunFallbackIssueCodes)
    ?? summaryFromStableFields(value.fallbackGuardCategory, value.fallbackIssueCodes);
}

export function formatFailedAttemptEvidence(
  value: FailureEvidenceCarrier | null | undefined,
  fallback = `候选未通过发布门禁。${FAILED_ATTEMPT_PRIVACY_NOTICE}`,
): string {
  return summarizeFailedAttemptEvidence(value)?.detail ?? fallback;
}

export function hasFailedAttemptEvidence(value: FailureEvidenceCarrier | null | undefined): boolean {
  return summarizeFailedAttemptEvidence(value) !== null;
}
