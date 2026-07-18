import type { BackendRuntimeInfo, EnvironmentDiagnostics } from "@/types/app";
import { requestJson } from "@/lib/webServiceHttp";

export const webServiceHealthApi = {
  async getBackendRuntime(): Promise<BackendRuntimeInfo> {
    return requestJson<BackendRuntimeInfo>("/api/ping", { timeoutMs: 3_000 });
  },

  async getHealth(): Promise<EnvironmentDiagnostics> {
    return requestJson<EnvironmentDiagnostics>("/api/health");
  },
};
