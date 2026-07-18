import { formatFileScopeLabel } from "@/lib/formatters";
import type { ExportResult } from "@/types/app";

export function formatExportNotice(result: ExportResult, label?: string): string {
  const parts = [label ? `${label} 已导出 ${result.format.toUpperCase()}` : `已导出 ${result.format.toUpperCase()}`];

  if (result.certification === "plain_uncertified") {
    parts.push("文件生成成功，但不属于 FYADR 认证轮次。");
  }

  if (result.format === "docx") {
    if (result.sourceKind === "original_docx") {
      parts.push("排版策略：原 Word 是唯一格式真相源，只回填冻结范围内的正文文字。");
    } else if (result.sourceKind === "generated_docx") {
      parts.push("当前文件是从纯文本新建的 Word，没有原版式基线；正文契约与原 Word 格式锁不适用。");
    } else {
      parts.push("当前记录缺少导出证据，不能确认是否保留了原 Word 版式。");
    }
    if (["editable_body_only", "body_scope_style_only"].includes(result.formatScope ?? "")) {
      parts.push("改写仅作用于可编辑正文段落，标题、目录、图表、表格和参考文献保持原样。");
    }
    if (result.layoutMode === "body-map-roundtrip") {
      parts.push("已按 DOCX 正文映射回填，多轮改写后也优先保留原始结构。");
    } else if (result.layoutMode === "snapshot-compare-reflow") {
      parts.push("已按原始 Word 结构回填，并基于当前轮次结果重组正文。");
    } else if (result.layoutMode === "snapshot-roundtrip") {
      parts.push("已按原始 Word 结构回填，封面、目录和非正文结构会尽量保留。");
    } else if (result.layoutMode === "plain_text_docx") {
      parts.push("当前导出为新建 Word 文本文件，不包含原始 DOCX 结构回填。");
    }

    if (result.evidenceVersion === 1 && result.overallStatus === "passed") {
      parts.push("版本化导出证据已通过。");
    }

    if (result.validationPath) {
      parts.push("本轮已生成结构校验记录。");
    }
    if (result.guardPath) {
      parts.push(`导出硬审计通过：${result.guardIssueCount ?? 0} 个问题。`);
    }
    if (result.auditPath) {
      parts.push(`保护区审计通过：${result.auditIssueCount ?? 0} 个问题。`);
    }
    if (result.formatMode === "preserve_original" && result.formatLockPath) {
      const lockIssues = result.formatLockIssueCount ?? 0;
      if (lockIssues > 0) {
        parts.push(`格式保真校验发现 ${lockIssues} 个段落版式与原文不一致，请检查对应段落字体或段落格式是否被改动。`);
      } else {
        parts.push(`格式保真校验通过：${result.formatLockEditableChecked ?? 0} 个正文段落版式与原文一致。`);
      }
    }
    if (result.contentContractPath) {
      if (result.contentContractReady && result.editableHeadingCount === 0 && result.modelInputMatchesEditableUnits) {
        parts.push(`正文范围契约通过：${result.editableUnitCount ?? 0} 个正文单元进入模型，${result.protectedHeadingCount ?? 0} 个标题均已锁定。`);
      } else {
        parts.push(`正文范围契约存在 ${result.contentContractIssueCount ?? 0} 个问题，导出不应继续使用。`);
      }
    }
  }

  parts.push(`文件：${formatFileScopeLabel(result.path)}`);
  return parts.join(" ");
}
