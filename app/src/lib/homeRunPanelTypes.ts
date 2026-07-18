import type { PendingAutoAction } from "@/lib/autoRun";
import type {
  DocumentStatus,
  ModelConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
  RoundCompareData,
  RoundProgress,
  RoundProgressStatus,
} from "@/types/app";

export type HomeRunPanelProps = {
  value: DocumentStatus | null;
  busy: boolean;
  modelConfig: ModelConfig;
  progress: RoundProgress | null;
  roundProgressStatus: RoundProgressStatus | null;
  loadedResultRound: number | null;
  activeCompareData: RoundCompareData | null;
  pendingAutoAction: PendingAutoAction | null;
  promptProfile: ModelConfig["promptProfile"];
  promptSequence: PromptId[];
  promptOptions: PromptOption[];
  promptWorkflows: PromptWorkflow[];
  onPromptProfileChange: (promptProfile: ModelConfig["promptProfile"]) => void;
  onPromptSequenceChange: (promptSequence: PromptId[]) => void | Promise<void>;
  onModelConfigChange: (modelConfig: ModelConfig) => void;
  onSaveModelConfig: (modelConfig: ModelConfig) => void;
  onRefreshAllProviderModels: () => void;
  onRefreshProviderModels: (providerId: string) => void;
  onPickFile: () => void;
  onRunRound: (modelConfig?: ModelConfig) => void;
  onRefreshStatus: () => void;
  onCancelRun: () => void;
  onRejectAutoAction: () => void;
  onResetRound: () => void;
  running: boolean;
};
