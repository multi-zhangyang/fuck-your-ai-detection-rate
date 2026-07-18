import { normalizePromptSequence } from "@/lib/promptRegistry";
import type { RoundResetTarget } from "@/lib/documentStatusProgressCopy";
import type { DocumentStatus, ModelConfig, PromptOption, PromptWorkflow } from "@/types/app";

export function buildRoundResetConfirmOptions(resetTarget: RoundResetTarget): {
  title: string;
  description: string;
  details: string[];
  confirmLabel: string;
  cancelLabel: string;
  tone: "warning";
} {
  const targetLabel = resetTarget.mode === "completed"
    ? `第 ${resetTarget.round} 轮结果`
    : `第 ${resetTarget.round} 轮断点进度`;
  return {
    title: `放弃${targetLabel}`,
    description: resetTarget.mode === "completed"
      ? "会删除该轮及后续轮次的结果记录与生成文件；源文档会保留。"
      : "只会清理当前轮已完成的分块缓存；源文档和已完成轮次会保留。",
    details: resetTarget.mode === "completed"
      ? ["后续再次运行时，会从该轮重新开始。", "如果这是第 1 轮，启动按钮会回到开始第 1 轮。"]
      : ["后续再次运行该轮时，会从该轮开头重新生成。", "刷新页面后不会自动载入旧 Diff；需要查看时可从历史记录手动打开。"],
    confirmLabel: "确认放弃",
    cancelLabel: resetTarget.mode === "completed" ? "保留结果" : "保留断点",
    tone: "warning",
  };
}

export function buildRoundResetConfig(
  status: DocumentStatus,
  modelConfig: ModelConfig,
  resetRoundNumber: number,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): {
  resetRoundNumber: number;
  resetPromptProfile: ModelConfig["promptProfile"];
  resetPromptSequence: ModelConfig["promptSequence"];
  resetConfig: ModelConfig;
} {
  const resetPromptProfile = status.promptProfile ?? modelConfig.promptProfile;
  const resetPromptSequence = normalizePromptSequence(
    status.promptSequence ?? modelConfig.promptSequence,
    promptOptions,
    resetPromptProfile,
    promptWorkflows,
  );
  return {
    resetRoundNumber,
    resetPromptProfile,
    resetPromptSequence,
    resetConfig: {
      ...modelConfig,
      promptProfile: resetPromptProfile,
      promptSequence: resetPromptSequence,
    },
  };
}

export type ExecuteRoundResetInput = {
  sourcePath: string;
  resetRoundNumber: number;
  resetPromptProfile: string;
  resetPromptSequence: ModelConfig["promptSequence"];
  resetConfig: ModelConfig;
  resetMode: RoundResetTarget["mode"];
  status: DocumentStatus;
};

export function buildExecuteRoundResetInput(
  status: DocumentStatus,
  modelConfig: ModelConfig,
  resetTarget: RoundResetTarget,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): ExecuteRoundResetInput {
  const {
    resetRoundNumber,
    resetPromptProfile,
    resetPromptSequence,
    resetConfig,
  } = buildRoundResetConfig(status, modelConfig, resetTarget.round, promptOptions, promptWorkflows);
  return {
    sourcePath: status.sourcePath,
    resetRoundNumber,
    resetPromptProfile,
    resetPromptSequence,
    resetConfig,
    resetMode: resetTarget.mode,
    status,
  };
}
