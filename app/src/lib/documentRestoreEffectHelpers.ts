import { planDocumentRestoreBootstrap } from "@/lib/documentRestoreBootstrap";
import { buildRestoredDocumentLoadingRuntimeStep } from "@/lib/documentRestoreHelpers";
import { runDocumentRestoreSession, type DocumentRestoreSessionDeps } from "@/lib/documentRestoreSessionHelpers";
import type { TaskPhase } from "@/lib/taskState";
import type {
  DocumentStatus,
  HistoryDocumentSummary,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export type DocumentRestoreEffectInput = {
  modelConfigReady: boolean;
  historyListReady: boolean;
  restoredDocument: boolean;
  documentStatus: DocumentStatus | null;
  historyItems: HistoryDocumentSummary[];
  modelConfig: ModelConfig;
  promptOptions: PromptOption[];
  promptWorkflows: PromptWorkflow[];
};

export function shouldStartDocumentRestore(input: DocumentRestoreEffectInput): boolean {
  return Boolean(input.modelConfigReady && input.historyListReady && !input.restoredDocument && !input.documentStatus);
}

export function planDocumentRestoreEffectStart(input: {
  historyItems: HistoryDocumentSummary[];
  modelConfig: ModelConfig;
  promptOptions: PromptOption[];
  promptWorkflows: PromptWorkflow[];
}): {
  kind: "skip" | "run";
  nextConfig?: ModelConfig;
  shouldSyncConfig?: boolean;
  sourcePath?: string;
} {
  const plan = planDocumentRestoreBootstrap(input);
  if (plan.kind === "skip") {
    return { kind: "skip" };
  }
  return {
    kind: "run",
    nextConfig: plan.nextConfig,
    shouldSyncConfig: plan.shouldSyncConfig,
    sourcePath: plan.sourcePath,
  };
}

export function beginDocumentRestoreTask(input: {
  beginTask: (
    phase: TaskPhase,
    options?: { globalBusy?: boolean; clearMessages?: boolean; runtimeStep?: string },
  ) => number;
}): number {
  return input.beginTask("restoring-document", {
    clearMessages: false,
    runtimeStep: buildRestoredDocumentLoadingRuntimeStep(),
  });
}

export async function executeDocumentRestoreSession(
  deps: DocumentRestoreSessionDeps,
): Promise<void> {
  await runDocumentRestoreSession(deps);
}
