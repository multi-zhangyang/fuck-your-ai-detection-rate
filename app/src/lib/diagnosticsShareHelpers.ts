import type { EnvironmentDiagnostics } from "@/types/app";
import { buildShareableDiagnosticsCore } from "@/lib/diagnosticsShareCoreHelpers";
import { buildShareableDiagnosticsRuns } from "@/lib/diagnosticsShareRunHelpers";

export function buildShareableDiagnostics(value: EnvironmentDiagnostics) {
  return {
    ...buildShareableDiagnosticsCore(value),
    ...buildShareableDiagnosticsRuns(value),
  };
}
