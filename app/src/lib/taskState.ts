export type TaskPhase =
  | "idle"
  | "restoring-document"
  | "loading-history"
  | "deleting-history"
  | "saving-config"
  | "testing-config"
  | "loading-models"
  | "diagnosing"
  | "parsing-format"
  | "applying-format"
  | "picking-document"
  | "uploading-document"
  | "picking-report"
  | "parsing-report"
  | "running-round"
  | "canceling-run"
  | "resetting-round"
  | "exporting"
  | "rerunning-chunk"
  | "batch-rerunning"
  | "canceling-batch-rerun";

const NON_BLOCKING_PHASES = new Set<TaskPhase>(["idle", "picking-document", "picking-report"]);
const RUNNING_PHASES = new Set<TaskPhase>(["running-round", "canceling-run", "batch-rerunning", "canceling-batch-rerun"]);

const TASK_PHASE_LABELS: Record<TaskPhase, string> = {
  "batch-rerunning": "正在优化",
  "canceling-batch-rerun": "正在停止",
  idle: "就绪",
  "restoring-document": "准备文档",
  "loading-history": "整理历史",
  "deleting-history": "整理历史",
  "saving-config": "准备模型",
  "testing-config": "准备模型",
  "loading-models": "准备模型",
  diagnosing: "系统自检",
  "parsing-format": "处理规范",
  "applying-format": "处理规范",
  "picking-document": "准备文档",
  "uploading-document": "准备文档",
  "picking-report": "处理报告",
  "parsing-report": "处理报告",
  "running-round": "正在改写",
  "canceling-run": "正在停止",
  "resetting-round": "整理进度",
  exporting: "导出文件",
  "rerunning-chunk": "正在优化",
};

export function getTaskPhaseLabel(phase: TaskPhase): string {
  return TASK_PHASE_LABELS[phase] ?? TASK_PHASE_LABELS.idle;
}

export function isTaskBlocking(phase: TaskPhase): boolean {
  return !NON_BLOCKING_PHASES.has(phase);
}

export function isTaskRunningPhase(phase: TaskPhase): boolean {
  return RUNNING_PHASES.has(phase);
}
