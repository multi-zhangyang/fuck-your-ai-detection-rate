import {
  buildDiagnosticsFailureSnapshot,
  planDiagnosticsFailureFeedback,
  planDiagnosticsSuccessFeedback,
  planTaskStateSnapshotCleanupSuccessFeedback,
} from "@/lib/diagnosticsHelpers";
import { stringifyError } from "@/lib/errorText";
import type { DocumentLoadHandlersDeps } from "@/lib/documentLoadHandlerTypes";
import type { EnvironmentDiagnostics } from "@/types/app";

const requestGenerationBySetter = new WeakMap<object, number>();

function beginDiagnosticsRequest(key: object): number {
  const generation = (requestGenerationBySetter.get(key) ?? 0) + 1;
  requestGenerationBySetter.set(key, generation);
  return generation;
}

function isCurrentDiagnosticsRequest(key: object, generation: number): boolean {
  return requestGenerationBySetter.get(key) === generation;
}

export function createDocumentDiagnosticsHandlers(deps: DocumentLoadHandlersDeps) {
  async function refreshDiagnostics(options: { silent?: boolean } = {}) {
    const silent = Boolean(options.silent);
    const requestKey = deps.setDiagnostics as unknown as object;
    const generation = beginDiagnosticsRequest(requestKey);
    const taskTicket = silent ? 0 : deps.beginTask("diagnosing", { runtimeStep: "正在执行启动诊断。" });
    try {
      const result = await deps.service.getHealth();
      if (isCurrentDiagnosticsRequest(requestKey, generation)) {
        deps.setDiagnostics(result);
        if (!silent) deps.applyOptionalUiFeedback(planDiagnosticsSuccessFeedback(result));
      }
      return result;
    } catch (appError) {
      if (isCurrentDiagnosticsRequest(requestKey, generation)) {
        const message = stringifyError(appError);
        deps.setDiagnostics((current) => buildDiagnosticsFailureSnapshot(message, current));
        deps.setError(message);
        deps.setRuntimeStep(planDiagnosticsFailureFeedback().runtimeStep);
      }
      return null;
    } finally {
      if (!silent) deps.finishTask(taskTicket);
    }
  }

  async function handleCleanupTaskStateSnapshots() {
    const taskTicket = deps.beginTask("diagnosing", { runtimeStep: "正在清理过期任务快照。" });
    try {
      const result = await deps.service.cleanupTaskStateSnapshots("expired", 168);
      deps.setDiagnostics((current) => (current ? { ...current, taskStateStore: result.after } : current));
      deps.applyOptionalUiFeedback(planTaskStateSnapshotCleanupSuccessFeedback(result));
      await refreshDiagnostics({ silent: true });
    } catch (appError) {
      deps.applyErrorRuntimeStep(appError, "过期任务快照清理失败");
    } finally {
      deps.finishTask(taskTicket);
    }
  }

  return {
    refreshDiagnostics,
    handleCleanupTaskStateSnapshots,
  };
}
