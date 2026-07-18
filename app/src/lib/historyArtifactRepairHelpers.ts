export function planHistoryDatabaseRepairFeedback(input: {
  ok: boolean;
  beforeIssueCount?: number | null;
  afterIssueCount?: number | null;
  error?: string | null;
}): {
  error?: string;
  notice: string;
  runtimeStep: string;
} {
  const beforeIssues = input.beforeIssueCount ?? 0;
  const afterIssues = input.afterIssueCount ?? 0;
  const fixedText = beforeIssues ? `处理 ${beforeIssues} 个索引问题` : "索引已重新对齐";
  const afterText = afterIssues ? `仍有 ${afterIssues} 个提示待确认` : "当前索引健康";
  return {
    error: input.ok ? undefined : (input.error || "历史索引修复后仍有问题，请查看缺失资产。"),
    notice: `历史索引已修复：${fixedText}，${afterText}。修复只重建索引，不会删除正文或导出文件。`,
    runtimeStep: input.ok ? "历史索引修复完成" : "历史索引仍需检查",
  };
}

export function planHistoryDatabaseRepairFailureRuntimeStep(): string {
  return "历史索引修复失败";
}

export function planHistoryDatabaseRepairLoadingRuntimeStep(): string {
  return "正在修复历史索引。";
}

export function buildProtectedHistoryArtifactPaths(input: {
  sourcePath?: string | null;
  outputPath?: string | null;
  compareOutputPath?: string | null;
  exportPath?: string | null;
}): string[] {
  const protectedPaths: string[] = [];
  if (input.sourcePath) {
    protectedPaths.push(input.sourcePath);
  }
  if (input.outputPath) {
    protectedPaths.push(input.outputPath);
  }
  if (input.compareOutputPath) {
    protectedPaths.push(input.compareOutputPath);
  }
  if (input.exportPath) {
    protectedPaths.push(input.exportPath);
  }
  return Array.from(new Set(protectedPaths));
}
