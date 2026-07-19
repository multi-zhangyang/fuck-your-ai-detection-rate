import { stringifyError } from "@/lib/errorText";
import { extractExportFailure } from "@/lib/exportFailureHelpers";

export function formatExportError(error: unknown): string {
  const exportFailure = extractExportFailure(error);
  if (exportFailure) {
    const label = exportFailure.label || "导出检查";
    const issueText = exportFailure.issueCount ? `${exportFailure.issueCount} 个问题` : "";
    const firstSample = exportFailure.samples?.[0]?.message || "";
    return ["导出已拦截", label, issueText, firstSample].filter(Boolean).join("：");
  }
  const message = stringifyError(error);
  if (message.includes("Output file does not exist") || message.includes("No such file or directory")) {
    return "导出失败：这条历史记录指向的项目输出文件已经不存在。请在历史记录里修复索引或清理缺失资产；如果这是当前文档，就重新执行对应轮次。";
  }
  if (message.includes("Output path must stay under allowed workspace directories") || message.includes("Output file must stay under allowed workspace directories")) {
    return "导出被拦截：输出路径不在项目生成目录内。请从历史记录重新切换到该文档，或重新执行轮次后再导出。";
  }
  if (message.includes("Output path is not a file")) {
    return "导出失败：输出路径不是文件。请清理这条异常历史记录后重新执行轮次。";
  }
  if (message.includes("Permission denied") || message.includes("Access is denied") || message.includes("另一个程序正在使用")) {
    return "导出失败：目标文件可能被 Word 或系统占用。请关闭已打开的导出文件后再试。";
  }
  if (message.includes("当前轮次正文段落数与原始 Word 快照不一致")) {
    return `${message} 请先回到历史记录确认当前轮次，必要时回滚本轮后重跑。`;
  }
  if (message.includes("审计发现保护区内容发生变化")) {
    return `${message} 系统已经阻止下载，避免目录、表格、参考文献或其他保护区被误改。请查看生成的 audit.json 报告，或回滚后重新执行当前轮次。`;
  }
  if (message.includes("排版规则意外改变了文档文本内容")) {
    return `${message} 系统已经阻止下载。请回滚本轮并重新执行；如果问题持续，请查看生成的 audit.json 报告。`;
  }
  return message;
}
