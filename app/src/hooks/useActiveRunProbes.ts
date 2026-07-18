import type { MutableRefObject } from "react";

import type { AppService } from "@/lib/appService";
import { useActiveBatchRerunProbeEffect } from "@/hooks/useActiveBatchRerunProbeEffect";
import { useActiveRunProbeEffect } from "@/hooks/useActiveRunProbeEffect";
import type { EnvironmentDiagnostics } from "@/types/app";

type ActiveRun = EnvironmentDiagnostics["activeRuns"][number];
type ActiveBatchRerun = NonNullable<EnvironmentDiagnostics["activeBatchReruns"]>[number];

type UseActiveRunProbesInput = {
  service: AppService;
  documentSourcePath?: string | null;
  currentRunToken: string | null;
  currentBatchRerunToken: string | null;
  attachedRunTokenRef: MutableRefObject<string | null>;
  batchRerunSessionRef: MutableRefObject<unknown>;
  taskPhase: string;
  roundResultOutputPath?: string | null;
  activeCompareOutputPath?: string | null;
  setDiagnostics: (diagnostics: EnvironmentDiagnostics) => void;
  attachActiveRun: (activeRun: ActiveRun) => void | Promise<void>;
  attachActiveBatchRerun: (activeBatch: ActiveBatchRerun) => void | Promise<void>;
};

export function useActiveRunProbes(input: UseActiveRunProbesInput) {
  useActiveRunProbeEffect({
    service: input.service,
    documentSourcePath: input.documentSourcePath,
    currentRunToken: input.currentRunToken,
    attachedRunTokenRef: input.attachedRunTokenRef,
    setDiagnostics: input.setDiagnostics,
    attachActiveRun: input.attachActiveRun,
  });
  useActiveBatchRerunProbeEffect({
    service: input.service,
    currentRunToken: input.currentRunToken,
    currentBatchRerunToken: input.currentBatchRerunToken,
    batchRerunSessionRef: input.batchRerunSessionRef,
    taskPhase: input.taskPhase,
    roundResultOutputPath: input.roundResultOutputPath,
    activeCompareOutputPath: input.activeCompareOutputPath,
    setDiagnostics: input.setDiagnostics,
    attachActiveBatchRerun: input.attachActiveBatchRerun,
  });
}
