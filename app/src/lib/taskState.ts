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
const RUNNING_PHASES = new Set<TaskPhase>(["running-round", "canceling-run"]);

const TASK_PHASE_LABELS: Record<TaskPhase, string> = {
  "batch-rerunning": "批量重跑",
  "canceling-batch-rerun": "停止重跑",
  idle: "就绪",
  "restoring-document": "恢复文档",
  "loading-history": "载入历史",
  "deleting-history": "清理记录",
  "saving-config": "保存配置",
  "testing-config": "测试连接",
  "loading-models": "读取模型",
  diagnosing: "环境自检",
  "parsing-format": "解析规范",
  "applying-format": "应用规范",
  "picking-document": "选择文档",
  "uploading-document": "载入文档",
  "picking-report": "选择报告",
  "parsing-report": "解析报告",
  "running-round": "运行轮次",
  "canceling-run": "中断中",
  "resetting-round": "放弃进度",
  exporting: "导出文件",
  "rerunning-chunk": "重跑块",
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
