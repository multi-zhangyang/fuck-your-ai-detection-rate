import type { AppService, PickedDocument } from "@/lib/appService";
import type {
  DocumentHistory,
  DocumentProtectionMap,
  DocumentScopeDiagnostics,
  DocumentStatus,
  ModelConfig,
  RateAuditReport,
  RateAuditStrategyExecutionRequest,
} from "@/types/app";
import {
  assertFileSize,
  pickSingleFile,
} from "@/lib/webServiceFiles";
import {
  buildUnavailableScopeDiagnostics,
  isEndpointCompatibilityError,
} from "@/lib/webServiceCompat";
import { requestJson } from "@/lib/webServiceHttp";

export const webServiceDocumentsApi = {
  async pickInputFile(): Promise<PickedDocument | null> {
    const file = await pickSingleFile(".txt,.docx");
    if (!file) {
      return null;
    }
    assertFileSize(file, "Document");
    const requestBody = new FormData();
    requestBody.append("file", file, file.name);
    return requestJson<PickedDocument>("/api/upload-document", {
      method: "POST",
      body: requestBody,
    });
  },

  async getDocumentStatus(sourcePath: string, modelConfig: ModelConfig): Promise<DocumentStatus> {
    const promptSequenceQuery = modelConfig.promptSequence?.length
      ? `&promptSequence=${encodeURIComponent(modelConfig.promptSequence.join(","))}`
      : "";
    return requestJson<DocumentStatus>(
      `/api/document-status?sourcePath=${encodeURIComponent(sourcePath)}&promptProfile=${encodeURIComponent(modelConfig.promptProfile)}${promptSequenceQuery}`,
    );
  },

  async getDocumentHistory(sourcePath: string): Promise<DocumentHistory> {
    return requestJson<DocumentHistory>(`/api/document-history?sourcePath=${encodeURIComponent(sourcePath)}`);
  },

  async getDocumentProtectionMap(sourcePath: string): Promise<DocumentProtectionMap> {
    return requestJson<DocumentProtectionMap>(`/api/document-protection-map?sourcePath=${encodeURIComponent(sourcePath)}`);
  },

  async getDocumentScopeDiagnostics(sourcePath: string): Promise<DocumentScopeDiagnostics> {
    try {
      return await requestJson<DocumentScopeDiagnostics>(`/api/document-scope-diagnostics?sourcePath=${encodeURIComponent(sourcePath)}`);
    } catch (error) {
      return buildUnavailableScopeDiagnostics(
        sourcePath,
        isEndpointCompatibilityError(error)
          ? "当前后端未提供正文边界诊断接口，已跳过非阻断诊断；重启本地 Web 服务后可恢复完整诊断。"
          : "正文边界诊断暂不可用，已跳过非阻断诊断；正文保护与导出仍按后端保护图执行。",
      );
    }
  },

  async getRateAudit(sourcePath: string, outputPath?: string): Promise<RateAuditReport> {
    const params = new URLSearchParams({ sourcePath });
    if (outputPath?.trim()) {
      params.set("outputPath", outputPath.trim());
    }
    return requestJson<RateAuditReport>(`/api/rate-audit?${params.toString()}`);
  },

  async startRateAuditStrategy(
    strategy: RateAuditStrategyExecutionRequest,
    modelConfig: ModelConfig,
  ): Promise<string> {
    const result = await requestJson<{ runId: string; alreadyActive?: boolean }>("/api/rate-audit/execute", {
      method: "POST",
      body: JSON.stringify({ ...strategy, modelConfig }),
    });
    const runId = String(result.runId || "").trim();
    if (!runId) {
      throw new Error("降检策略任务没有返回可追踪的任务编号。");
    }
    return runId;
  },
};
