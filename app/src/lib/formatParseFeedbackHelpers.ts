import type { FormatRules } from "@/types/app";

export function getFormatParserTimeoutSeconds(requestTimeoutSeconds: number | undefined): number {
  return Math.max(300, Math.min(1800, Number(requestTimeoutSeconds || 300)));
}

export function hasFormatParseFallbackWarning(rules: FormatRules | null | undefined): boolean {
  return Boolean(rules?.quality?.warnings?.find((item) => item.includes("AI 结构化解析未完成")));
}

export function buildFormatParseSuccessFeedback(rules: FormatRules): {
  notice: string;
  runtimeStep: string;
} {
  if (hasFormatParseFallbackWarning(rules)) {
    return {
      notice: "AI 解析未完成，已用本地规则抽取待确认对照。请复核后保存。",
      runtimeStep: "学校规范对照已用本地规则兜底生成，待确认",
    };
  }
  return {
    notice: `学校规范对照已解析：${rules.schoolName || "自定义规范"}。请确认后保存。`,
    runtimeStep: "学校规范对照待确认",
  };
}

export function buildFormatParseAbortFeedback(): {
  notice: string;
  runtimeStep: string;
} {
  return {
    notice: "已停止本次学校规范解析。",
    runtimeStep: "学校规范对照解析已停止，可换模型、改文本后重新解析",
  };
}

export function buildFormatParseFailureRuntimeStep(): string {
  return "学校规范对照解析已停止，可换用更快的 JSON 模型或稍后重试";
}

export function buildFormatParseBusyNotice(): string {
  return "学校规范正在解析中；如需换模型或修改内容，请先停止当前解析。";
}

export function buildFormatDefaultRulesLoadingRuntimeStep(): string {
  return "正在载入默认学校规范对照。";
}

export function buildFormatDefaultRulesSuccessFeedback(): {
  notice: string;
  runtimeStep: string;
} {
  return {
    notice: "未填写学校模板说明，已使用内置默认规范作为诊断对照；不会改动原 Word。",
    runtimeStep: "默认学校规范对照已载入",
  };
}

export function buildFormatDefaultRulesFailureRuntimeStep(): string {
  return "载入默认学校规范对照失败";
}

export function buildFormatParseLoadingRuntimeStep(parserTimeoutSeconds: number): string {
  return `正在解析学校格式说明，超过约 ${parserTimeoutSeconds} 秒会自动回退到本地规则抽取。`;
}

export function planFormatDefaultRulesApply(rules: FormatRules): {
  activeRules: FormatRules;
  pendingRules: null;
  feedback: { notice: string; runtimeStep: string };
} {
  return {
    activeRules: rules,
    pendingRules: null,
    feedback: buildFormatDefaultRulesSuccessFeedback(),
  };
}

export function planFormatParsePendingApply(rules: FormatRules): {
  pendingRules: FormatRules;
  feedback: { notice: string; runtimeStep: string };
} {
  return {
    pendingRules: rules,
    feedback: buildFormatParseSuccessFeedback(rules),
  };
}
