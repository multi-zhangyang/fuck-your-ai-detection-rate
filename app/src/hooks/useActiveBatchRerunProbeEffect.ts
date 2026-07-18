import { useEffect, useRef, type MutableRefObject } from "react";

import type { AppService } from "@/lib/appService";
import {
  findActiveBatchRerunForOutput,
  shouldProbeActiveBatchRerun,
} from "@/lib/activeRunProbeHelpers";
import type { EnvironmentDiagnostics } from "@/types/app";

type ActiveBatchRerun = NonNullable<EnvironmentDiagnostics["activeBatchReruns"]>[number];

export function useActiveBatchRerunProbeEffect(input: {
  service: AppService;
  currentRunToken: string | null;
  currentBatchRerunToken: string | null;
  batchRerunSessionRef: MutableRefObject<unknown>;
  taskPhase: string;
  roundResultOutputPath?: string | null;
  activeCompareOutputPath?: string | null;
  setDiagnostics: (diagnostics: EnvironmentDiagnostics) => void;
  attachActiveBatchRerun: (activeBatch: ActiveBatchRerun) => void | Promise<void>;
}) {
  const attachActiveBatchRerunRef = useRef(input.attachActiveBatchRerun);
  attachActiveBatchRerunRef.current = input.attachActiveBatchRerun;

  useEffect(() => {
    const outputPath = input.roundResultOutputPath ?? input.activeCompareOutputPath;
    if (!shouldProbeActiveBatchRerun({
      outputPath,
      currentBatchRerunToken: input.currentBatchRerunToken,
      hasBatchRerunSession: Boolean(input.batchRerunSessionRef.current),
      currentRunToken: input.currentRunToken,
      taskPhase: input.taskPhase,
    }) || !outputPath) {
      return;
    }
    const probeOutputPath = outputPath;
    let cancelled = false;

    async function probeActiveBatchRerun() {
      try {
        const result = await input.service.getHealth();
        if (cancelled) {
          return;
        }
        input.setDiagnostics(result);
        const activeBatch = findActiveBatchRerunForOutput(result, probeOutputPath);
        if (activeBatch && !cancelled) {
          void attachActiveBatchRerunRef.current(activeBatch);
        }
      } catch {
        // Batch rerun recovery is best-effort; the visible result remains usable.
      }
    }

    void probeActiveBatchRerun();

    return () => {
      cancelled = true;
    };
  }, [
    input.activeCompareOutputPath,
    input.currentBatchRerunToken,
    input.currentRunToken,
    input.roundResultOutputPath,
    input.service,
    input.taskPhase,
    input.batchRerunSessionRef,
    input.setDiagnostics,
  ]);
}
