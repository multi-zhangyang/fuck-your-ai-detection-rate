import { compactFeedbackText } from "@/lib/resultCardTokenHelpers";

export function getRiskReasonText(reason: { code?: string; message?: string }): string {
  const codeLabel = reason.code ? formatChunkFlag(reason.code) : "";
  const message = compactFeedbackText(reason.message ?? "", 84);
  if (!message) return codeLabel;
  if (!codeLabel || message.includes(codeLabel)) return message;
  return `${codeLabel}：${message}`;
}

export function formatChunkFlag(flag: string): string {
  if (flag === "academic_register_drift") return "学术语域偏移";
  if (flag === "citation_missing") return "引用保护";
  if (flag === "over_expanded") return "扩写偏多";
  if (flag === "over_compressed") return "压缩偏多";
  if (flag === "machine_like_expression") return "机械表达";
  if (flag === "machine_style_drift") return "表达硬校验";
  if (flag === "template_phrase_drift") return "模板句";
  if (flag === "paragraph_length_symmetry") return "段长齐整";
  if (flag === "source_fallback") return "校验失败";
  if (flag === "targeted_rerun_fallback") return "重跑失败";
  return flag;
}

export function formatRerunStrategy(strategy: string): string {
  if (strategy === "academic-register-repair") return "学术语域修复";
  if (strategy === "machine-style-drift-repair") return "表达漂移修复";
  if (strategy === "de-template-expression") return "去模板化";
  if (strategy === "control-expansion") return "控扩写";
  if (strategy === "restore-detail") return "保细节";
  if (strategy === "citation-repair") return "修引用";
  if (strategy === "general-polish") return "自然化";
  if (strategy === "global-style-card") return "全文风格卡";
  if (strategy === "paragraph-length-vary") return "段长起伏";
  return strategy;
}

export function formatProtectedTypes(types?: Record<string, number>): string {
  if (!types) return "";
  const labels: Record<string, string> = { REF: "引用", CAP: "图表", EQN: "公式", NUM: "数值", TOK: "结构" };
  return Object.entries(types)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${labels[key] ?? key}${count}`)
    .join(" / ");
}
