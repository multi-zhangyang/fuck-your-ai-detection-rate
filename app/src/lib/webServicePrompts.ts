import { webServicePromptCoreApi } from "@/lib/webServicePromptCoreApi";
import { webServicePromptWorkflowApi } from "@/lib/webServicePromptWorkflowApi";

export const webServicePromptsApi = {
  ...webServicePromptCoreApi,
  ...webServicePromptWorkflowApi,
};
