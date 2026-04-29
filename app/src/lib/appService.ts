import type {
  DeleteHistoryResult,
  DeleteHistoryOptions,
  DetectionReport,
  DetectionReportProvider,
  DocumentHistory,
  DocumentProtectionMap,
  DocumentStatus,
  EnvironmentDiagnostics,
  ExportResult,
  BatchRerunResult,
  BatchRerunStatus,
  BatchRerunTarget,
  ExperimentDeleteResult,
  ExperimentListResponse,
  ExperimentRecordInput,
  ExperimentSaveResult,
  FormatRules,
  FormatRulesResult,
  HistoryDeleteImpact,
  HistoryOrphanDeleteResult,
  HistoryOrphanScanResult,
  HistoryListResponse,
  ModelCatalogResult,
  ModelConfig,
  OutputPreview,
  RoundCompareData,
  RoundProgress,
  RoundProgressStatus,
  ReviewDecision,
  ReviewDecisionsResult,
  RerunChunkResult,
  RunRoundStatus,
  RoundResult,
  TaskStateCleanupResult,
  TestConnectionResult,
} from "../types/app";

export type PickedDocument = {
  sourcePath: string;
  filename: string;
};

export interface AppService {
  getHealth(): Promise<EnvironmentDiagnostics>;
  cleanupTaskStateSnapshots(mode?: "expired" | "completed" | "all", maxAgeHours?: number): Promise<TaskStateCleanupResult>;
  loadModelConfig(): Promise<ModelConfig>;
  saveModelConfig(config: ModelConfig): Promise<ModelConfig>;
  listModels(config: ModelConfig): Promise<ModelCatalogResult>;
  testModelConnection(config: ModelConfig): Promise<TestConnectionResult>;
  pickInputFile(): Promise<PickedDocument | null>;
  pickDetectionReport(providerHint?: DetectionReportProvider): Promise<DetectionReport | null>;
  getDocumentStatus(sourcePath: string, modelConfig: ModelConfig): Promise<DocumentStatus>;
  getDocumentHistory(sourcePath: string): Promise<DocumentHistory>;
  getDocumentProtectionMap(sourcePath: string): Promise<DocumentProtectionMap>;
  listDocumentHistories(): Promise<HistoryListResponse>;
  deleteDocumentHistory(
    docId: string,
    options?: DeleteHistoryOptions,
  ): Promise<DeleteHistoryResult>;
  previewDocumentHistoryDelete(
    docId: string,
    options?: DeleteHistoryOptions,
  ): Promise<HistoryDeleteImpact>;
  scanHistoryOrphans(protectedPaths?: string[]): Promise<HistoryOrphanScanResult>;
  deleteHistoryOrphans(protectedPaths?: string[]): Promise<HistoryOrphanDeleteResult>;
  startRunRound(sourcePath: string, modelConfig: ModelConfig): Promise<string | null>;
  getRunRoundStatus(runToken: string): Promise<RunRoundStatus>;
  cancelRunRound(runToken: string): Promise<void>;
  getRoundProgressStatus(sourcePath: string, promptProfile: ModelConfig["promptProfile"], roundNumber?: number | null, promptSequence?: ModelConfig["promptSequence"]): Promise<RoundProgressStatus>;
  resetRoundProgress(sourcePath: string, promptProfile: ModelConfig["promptProfile"], roundNumber: number, promptSequence?: ModelConfig["promptSequence"]): Promise<void>;
  awaitRunRound(sourcePath: string, modelConfig: ModelConfig, runToken?: string | null): Promise<RoundResult>;
  listenRoundProgress(onProgress: (payload: RoundProgress) => void, runToken?: string | null): Promise<() => void>;
  readOutput(outputPath: string, maxChars?: number): Promise<OutputPreview>;
  readCompare(outputPath: string): Promise<RoundCompareData>;
  loadReviewDecisions(outputPath: string): Promise<ReviewDecisionsResult>;
  saveReviewDecisions(outputPath: string, decisions: Record<string, ReviewDecision>): Promise<ReviewDecisionsResult>;
  rerunChunk(outputPath: string, chunkId: string, modelConfig: ModelConfig, userFeedback?: string): Promise<RerunChunkResult>;
  startBatchRerun(outputPath: string, targets: BatchRerunTarget[], modelConfig: ModelConfig): Promise<string>;
  getBatchRerunStatus(runToken: string): Promise<BatchRerunStatus>;
  cancelBatchRerun(runToken: string): Promise<void>;
  exportRound(outputPath: string, targetFormat: "txt" | "docx"): Promise<ExportResult>;
  exportReviewedRound(outputPath: string, targetFormat: "txt" | "docx", decisions: Record<string, ReviewDecision>): Promise<ExportResult>;
  listExperimentRecords(docId?: string): Promise<ExperimentListResponse>;
  saveExperimentRecord(record: ExperimentRecordInput): Promise<ExperimentSaveResult>;
  deleteExperimentRecord(id: string): Promise<ExperimentDeleteResult>;
  loadFormatRules(): Promise<FormatRules>;
  parseFormatRules(text: string, modelConfig: ModelConfig, signal?: AbortSignal): Promise<FormatRulesResult>;
  activateFormatRules(rules: FormatRules): Promise<FormatRulesResult>;
  resetFormatRules(): Promise<FormatRulesResult>;
}
