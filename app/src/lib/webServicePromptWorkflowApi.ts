import type {
  PromptWorkflow,
  PromptWorkflowSaveResult,
  TaskStateCleanupResult,
} from "@/types/app";
import { requestJson } from "@/lib/webServiceHttp";

export const webServicePromptWorkflowApi = {
  async updatePromptWorkflow(workflowId: string, payload: Pick<PromptWorkflow, "label" | "description" | "defaultSequence" | "sequenceLimit">): Promise<PromptWorkflowSaveResult> {
    return requestJson<PromptWorkflowSaveResult>(`/api/prompt-workflows/${encodeURIComponent(workflowId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      timeoutMs: 15_000,
    });
  },

  async cleanupTaskStateSnapshots(mode = "expired", maxAgeHours = 168): Promise<TaskStateCleanupResult> {
    return requestJson<TaskStateCleanupResult>("/api/task-state-snapshots/cleanup", {
      method: "POST",
      body: JSON.stringify({ mode, maxAgeHours }),
    });
  },
};
