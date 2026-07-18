import type { DiffFilterMode } from "@/lib/diffFilterModel";
import type { RuntimeTaskCenterItem } from "@/lib/uiTypes";
import type { WorkbenchView } from "@/lib/workbenchNav";
import type { PendingAutoAction } from "@/lib/autoRunTypes";
import type { TaskPhase } from "@/lib/taskState";
import type {
  BatchRerunFailure,
  DocumentStatus,
  EnvironmentDiagnostics,
  PromptOption,
  PromptWorkflow,
  ReviewDecision,
  RoundCompareData,
  RoundProgress,
  RoundProgressStatus,
} from "@/types/app";

export type RuntimeTaskCenterActions = {
  openTaskTargetView: (view: WorkbenchView) => void;
  openDiffTaskTarget: (filterMode: DiffFilterMode, chunkId?: string) => void;
  rejectPendingAutoAction: (actionId?: string) => void;
  handleCancelRunRound: () => void | Promise<void>;
  handleCancelBatchRerun: () => void | Promise<void>;
  handleCancelFormatRulesParse: () => void;
  handleCancelModelCatalogRequest: () => void;
};

export type RuntimeTaskCenterInput = {
  pendingAutoAction: PendingAutoAction | null;
  currentRunToken: string | null;
  currentBatchRerunToken: string | null;
  runSession: { round?: number | null; cancelRequested?: boolean } | null | undefined;
  batchRerunSession: { label?: string; cancelRequested?: boolean } | null | undefined;
  progress: RoundProgress | null;
  progressPercent: number;
  roundProgressStatus: RoundProgressStatus | null;
  taskPhase: TaskPhase;
  busy: boolean;
  formatParseAbortActive: boolean;
  modelCatalogAbortActive: boolean;
  diagnostics: EnvironmentDiagnostics | null;
  activeCompareData: RoundCompareData | null;
  activeRerunFailures: BatchRerunFailure[];
  reviewDecisions: Record<string, ReviewDecision>;
  error: string;
  documentStatus: DocumentStatus | null;
  promptOptions: PromptOption[];
  promptWorkflows: PromptWorkflow[];
  actions: RuntimeTaskCenterActions;
};

export type { RuntimeTaskCenterItem };
