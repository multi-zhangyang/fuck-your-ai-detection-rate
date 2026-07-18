import { sameWorkspacePath } from "@/lib/documentPaths";
import type { EnvironmentDiagnostics } from "@/types/app";

type ActiveRun = EnvironmentDiagnostics["activeRuns"][number];
type ActiveBatchRerun = NonNullable<EnvironmentDiagnostics["activeBatchReruns"]>[number];

export function findActiveRunForSource(
  result: EnvironmentDiagnostics,
  sourcePath: string,
): ActiveRun | undefined {
  return result.activeRuns.find((item) => sameWorkspacePath(item.sourcePath, sourcePath));
}

export function findActiveBatchRerunForOutput(
  result: EnvironmentDiagnostics,
  outputPath: string,
): ActiveBatchRerun | undefined {
  return (result.activeBatchReruns ?? []).find((item) => sameWorkspacePath(item.outputPath, outputPath));
}

export function shouldProbeActiveBatchRerun(input: {
  outputPath?: string | null;
  currentBatchRerunToken: string | null;
  hasBatchRerunSession: boolean;
  currentRunToken: string | null;
  taskPhase: string;
}): boolean {
  return Boolean(
    input.outputPath
    && !input.currentBatchRerunToken
    && !input.hasBatchRerunSession
    && !input.currentRunToken
    && input.taskPhase === "idle",
  );
}
