export type RoundModelConfig = {
  enabled: boolean;
  providerId?: string;
  providerName?: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  apiType: "chat_completions" | "responses";
  temperature?: number;
  requestTimeoutSeconds?: number;
  maxRetries?: number;
  rateLimitWindowMinutes?: number;
  rateLimitMaxRequests?: number;
};

export type ModelProviderConfig = {
  id: string;
  name: string;
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  apiType: "chat_completions" | "responses";
  temperature?: number;
  requestTimeoutSeconds?: number;
  maxRetries?: number;
  rateLimitWindowMinutes?: number;
  rateLimitMaxRequests?: number;
  models?: string[];
  defaultModel?: string;
  updatedAt?: string;
};

export type FormatParserModelRoute = {
  providerId: string;
  model?: string;
};

export type PromptId = "prewrite" | "classical" | "round1" | "round2";
export type PromptProfile = "cn" | "cn_prewrite" | "cn_custom";

export type ModelConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  apiType: "chat_completions" | "responses";
  temperature: number;
  offlineMode: boolean;
  promptProfile: PromptProfile;
  promptSequence: PromptId[];
  rewriteCandidateMode?: "economy" | "quality";
  requestTimeoutSeconds: number;
  maxRetries: number;
  modelProviders?: ModelProviderConfig[];
  roundModels?: Record<string, RoundModelConfig>;
};

export type ModelCatalogItem = {
  id: string;
  ownedBy?: string;
  created?: number | null;
};

export type ModelCatalogResult = {
  ok: boolean;
  offlineMode: boolean;
  message: string;
  endpoint: string;
  status?: number;
  total: number;
  models: ModelCatalogItem[];
};

export type EnvironmentCheck = {
  key: string;
  label: string;
  ok: boolean;
  level: "success" | "warning" | "error" | "info" | string;
  message: string;
};

export type EnvironmentPathSummary = {
  key: string;
  label: string;
  path: string;
  exists: boolean;
  writable: boolean;
  fileCount: number;
  sizeBytes: number;
};

export type TaskStateStoreSummary = {
  path: string;
  fileCount: number;
  sizeBytes: number;
  runRoundCount: number;
  batchRerunCount: number;
  activeSnapshotCount: number;
  staleCount: number;
  retentionHours: number;
  oldestUpdatedAt?: string;
  newestUpdatedAt?: string;
};

export type TaskStateCleanupResult = {
  ok: boolean;
  mode: "expired" | "completed" | "all" | string;
  maxAgeHours: number;
  deletedCount: number;
  deletedBytes: number;
  deletedFiles: string[];
  failedFiles: Array<{ file: string; message: string }>;
  skippedActiveCount: number;
  before: TaskStateStoreSummary;
  after: TaskStateStoreSummary;
};

export type EnvironmentDiagnostics = {
  ok: boolean;
  createdAt: string;
  workspace: string;
  activeRunCount: number;
  checks: EnvironmentCheck[];
  paths: EnvironmentPathSummary[];
  activeRuns: RunRoundStatus[];
  activeBatchRerunCount?: number;
  activeBatchReruns?: BatchRerunStatus[];
  recentRunCount?: number;
  recentRuns?: RunRoundStatus[];
  recentBatchRerunCount?: number;
  recentBatchReruns?: BatchRerunStatus[];
  taskStateStore?: TaskStateStoreSummary;
  config: {
    path: string;
    exists: boolean;
    offlineMode: boolean;
    hasBaseUrl: boolean;
    hasApiKey: boolean;
    model: string;
    apiType: string;
    promptProfile: string;
    promptSequence: string[];
    rewriteCandidateMode?: "economy" | "quality" | string;
    requestTimeoutSeconds?: number;
    maxRetries?: number;
    providerCount: number;
    enabledProviderCount: number;
    customRoundCount: number;
  };
  runtime: {
    pythonVersion: string;
    pythonExecutable: string;
    platform: string;
    nodeExecutable: string;
    npmExecutable: string;
  };
};

export type RoundProgress = {
  phase: string;
  round: number;
  roundModel?: RoundResult["roundModel"];
  currentChunk?: number;
  totalChunks?: number;
  completedChunks?: number;
  rewriteCandidateMode?: "economy" | "quality";
  candidateMaxPerChunk?: number;
  estimatedApiCalls?: number;
  twoCandidateChunkCount?: number;
  chunkId?: string;
  nextChunkId?: string;
  nextChunkIndex?: number;
  remainingChunks?: number;
  resumeStage?: string;
  resumeActionLabel?: string;
  resumeExplanation?: string;
  paragraphIndex?: number;
  chunkIndex?: number;
  paragraphCount?: number;
  inputPath?: string;
  outputPath?: string;
  checkpointPath?: string;
  compareInputText?: string;
  compareOutputText?: string;
  error?: string;
};

export type RoundCompareChunk = {
  chunkId: string;
  paragraphIndex: number;
  chunkIndex: number;
  inputText: string;
  outputText: string;
  inputCharCount?: number;
  inputWordCount?: number;
  outputCharCount?: number;
  outputWordCount?: number;
  fallbackMode?: "source";
  fallbackReason?: string;
  fallbackError?: string;
  fallbackAttempts?: number;
  fallbackAt?: string;
  rejectedCandidates?: Array<{
    attempt?: number;
    candidate?: number;
    outputText: string;
    outputCharCount?: number;
    truncated?: boolean;
    error?: string;
  }>;
  rerunAt?: string;
  rerunMode?: string;
  rerunStrategy?: string[];
  rerunAdvice?: string[];
  rerunPromptNote?: string;
  rerunStyleCard?: string;
  rerunGlobalStyleProfile?: GlobalStyleProfile;
  rerunUserFeedback?: string;
  quality?: {
    expansionRatio?: number;
    missingCitationCount?: number;
    missingCitations?: string[];
    machineLikeRiskCount?: number;
    machineLikeRisks?: MachineLikeRisk[];
    reviewReasons?: MachineLikeRisk[];
    rewriteAdvice?: string[];
    protectedTokenCount?: number;
    protectedTokenTypes?: Record<string, number>;
    flags?: string[];
    advisoryFlags?: string[];
    needsReview?: boolean;
  };
};

export type ParagraphSplitSummary = {
  paragraphCount: number;
  chunkCount: number;
  splitParagraphCount: number;
  keptParagraphCount: number;
  reasons?: Record<string, number>;
};

export type MachineLikeRisk = {
  code: string;
  level: "low" | "medium" | "high" | string;
  message: string;
  evidence?: unknown;
};

export type StyleCountItem = {
  text: string;
  count: number;
};

export type GlobalStyleProfile = {
  version?: number;
  label?: string;
  chunkCount?: number;
  sentenceStats?: { count?: number; avg?: number; min?: number; max?: number; variance?: number };
  riskCodes?: string[];
  topConnectors?: StyleCountItem[];
  topTemplatePhrases?: StyleCountItem[];
  topEnglishConnectors?: StyleCountItem[];
  topEnglishTemplatePhrases?: StyleCountItem[];
  repeatedOpenings?: StyleCountItem[];
};

export type CustomReviewDecision = {
  mode: "custom";
  text: string;
  source?: "rejected_candidate" | "manual" | string;
  attempt?: number;
  candidate?: number;
  error?: string;
};

export type RunRoundStatus = {
  ok: boolean;
  runId: string;
  sourcePath: string;
  status: "running" | "canceling" | "completed" | "failed" | "canceled" | string;
  completed: boolean;
  cancelRequested: boolean;
  eventCount: number;
  lastEvent?: RoundProgress | null;
  result?: RoundResult | null;
  error?: string | null;
  restoredFromDisk?: boolean;
  persistedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RoundProgressStatus = {
  sourcePath: string;
  promptProfile: PromptProfile;
  promptSequence?: PromptId[];
  round: number | null;
  checkpointExists: boolean;
  canResume: boolean;
  completedChunks: number;
  totalChunks: number;
  remainingChunks?: number;
  nextChunkId?: string;
  nextChunkIndex?: number;
  failedChunkId?: string;
  resumeStage?: "continue_chunks" | "finalize_output" | "inspect_checkpoint" | string;
  resumeActionLabel?: string;
  resumeExplanation?: string;
  progressPercent: number;
  checkpointPath: string;
  lastError: string;
  updatedAt: string;
  validationEventCount: number;
  message: string;
  activeRun?: RunRoundStatus | null;
};

export type ReviewDecision = "rewrite" | "source" | "rewrite_confirmed" | "source_confirmed" | CustomReviewDecision;

export type ReviewDecisionsResult = {
  path: string;
  decisions: Record<string, ReviewDecision>;
};

export type RoundQualitySummary = {
  label?: string;
  isAiDetector?: boolean;
  paragraphSplitSummary?: ParagraphSplitSummary;
  validationRetryCount?: number;
  sourceFallbackCount?: number;
  sourceFallbackChunkIds?: string[];
  validationEventCount?: number;
  citationInputCount?: number;
  citationOutputCount?: number;
  protectedTokenCount?: number;
  protectedTokenTypes?: Record<string, number>;
  styleCardVersion?: number;
  styleCardChunkCount?: number;
  styleCardChunkIds?: string[];
  rewriteCandidateMode?: "economy" | "quality";
  candidateMaxPerChunk?: number;
  estimatedApiCalls?: number;
  twoCandidateChunkCount?: number;
  globalStyleProfile?: GlobalStyleProfile;
  machineLikeRiskCount?: number;
  machineLikeRisks?: MachineLikeRisk[];
  sentenceStats?: { count?: number; avg?: number; min?: number; max?: number; variance?: number };
};

export type RunAuditSummary = {
  version?: number;
  providerName?: string;
  model?: string;
  apiType?: "chat_completions" | "responses" | string;
  temperature?: number | null;
  offlineMode?: boolean;
  requestTimeoutSeconds?: number | null;
  maxRetries?: number | null;
  rateLimitWindowMinutes?: number | null;
  rateLimitMaxRequests?: number | null;
  promptProfile?: PromptProfile | string;
  promptSequence?: PromptId[] | string[];
  rewriteCandidateMode?: "economy" | "quality" | string;
  candidateMaxPerChunk?: number | null;
  estimatedApiCalls?: number | null;
  twoCandidateChunkCount?: number | null;
  chunkCount?: number | null;
  paragraphCount?: number | null;
  splitParagraphCount?: number | null;
  validationRetryCount?: number | null;
  sourceFallbackCount?: number | null;
  validationEventCount?: number | null;
  machineLikeRiskCount?: number | null;
  protectedTokenCount?: number | null;
};

export type RoundCompareData = {
  version: number;
  docId: string;
  round: number;
  promptProfile: PromptProfile;
  promptSequence?: PromptId[];
  inputPath: string;
  outputPath: string;
  manifestPath: string;
  paragraphCount: number;
  chunkCount: number;
  paragraphSplitSummary?: ParagraphSplitSummary;
  validationEvents?: Array<Record<string, unknown>>;
  qualitySummary?: RoundQualitySummary;
  updatedAt?: string;
  chunks: RoundCompareChunk[];
};

export type RerunChunkResult = {
  chunk: RoundCompareChunk;
  compare: RoundCompareData;
  outputPath: string;
  comparePath: string;
};

export type BatchRerunTarget = {
  chunkId: string;
  userFeedback?: string;
};

export type BatchRerunFailure = {
  chunkId: string;
  error: string;
  rejectedCandidates?: NonNullable<RoundCompareChunk["rejectedCandidates"]>;
  rerunStatus?: string;
  rerunFallbackMode?: string;
  rerunFallbackError?: string;
  quality?: RoundCompareChunk["quality"];
};

export type BatchRerunResult = {
  ok: boolean;
  runId?: string;
  outputPath: string;
  comparePath: string;
  compare?: RoundCompareData;
  successChunkIds?: string[];
  totalCount: number;
  completedCount: number;
  successCount: number;
  failureCount: number;
  canceled: boolean;
  failures: BatchRerunFailure[];
};

export type BatchRerunStatus = {
  ok: boolean;
  runId: string;
  outputPath: string;
  status: "running" | "canceling" | "completed" | "failed" | "canceled" | string;
  completed: boolean;
  cancelRequested: boolean;
  totalCount: number;
  completedCount: number;
  successCount: number;
  failureCount: number;
  currentIndex: number;
  currentChunkId: string;
  successChunkIds?: string[];
  failures?: BatchRerunFailure[];
  eventCount: number;
  lastEvent?: Record<string, unknown> | null;
  result?: BatchRerunResult | null;
  error?: string | null;
  restoredFromDisk?: boolean;
  persistedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TestConnectionResult = {
  ok: boolean;
  offlineMode: boolean;
  message: string;
  endpoint: string;
  model: string;
  apiType?: "chat_completions" | "responses";
  status?: number;
};

export type DocumentStatus = {
  docId: string;
  promptProfile: PromptProfile;
  promptSequence?: PromptId[];
  sourcePath: string;
  sourceKind: string;
  completedRounds: number[];
  nextRound: number | null;
  maxRounds: number;
  hasNextRound: boolean;
  isComplete: boolean;
  currentInputPath: string;
  currentOutputPath: string;
  manifestPath: string;
  latestOutputPath: string;
  extractedFromDocx: boolean;
};

export type ProtectionReasonSummary = {
  reason: string;
  label: string;
  count: number;
};

export type ProtectionMapSection = {
  key: string;
  editable: boolean;
  reason: string;
  label: string;
  startUnit: number;
  endUnit: number;
  count: number;
  samples: string[];
};

export type DocumentProtectionMap = {
  sourcePath: string;
  sourceKind: string;
  available: boolean;
  message: string;
  snapshotPath?: string;
  summary: {
    totalUnits: number;
    editableUnits: number;
    protectedUnits: number;
    tableUnits: number;
    topLevelParagraphUnits: number;
    protectionReasons: ProtectionReasonSummary[];
  };
  sections: ProtectionMapSection[];
};

export type RoundResult = {
  round: number;
  outputPath: string;
  manifestPath: string;
  comparePath: string;
  qualityPath?: string;
  bodyMapPath?: string;
  validationPath?: string;
  chunkLimit: number;
  inputSegmentCount: number;
  outputSegmentCount: number;
  paragraphCount: number;
  offlineMode: boolean;
  roundModel?: {
    round: number;
    providerId?: string;
    providerName?: string;
    baseUrl: string;
    model: string;
    apiType: "chat_completions" | "responses";
    temperature?: number;
    rateLimitWindowMinutes?: number;
    rateLimitMaxRequests?: number;
    rewriteCandidateMode?: "economy" | "quality";
    routeSource?: "default" | "provider" | "round_snapshot" | string;
  };
  docEntry: Record<string, unknown>;
  roundContext: Record<string, unknown>;
  qualitySummary?: RoundQualitySummary;
  runAudit?: RunAuditSummary;
};

export type HistoryRound = {
  round: number;
  prompt: string;
  promptProfile: PromptProfile;
  promptSequence?: PromptId[];
  inputPath: string;
  outputPath: string;
  manifestPath: string;
  comparePath: string;
  qualityPath?: string;
  bodyMapPath?: string;
  validationPath?: string;
  qualitySummary?: RoundQualitySummary;
  runAudit?: RunAuditSummary;
  scoreTotal: number | null;
  chunkLimit: number | null;
  inputSegmentCount: number | null;
  outputSegmentCount: number | null;
  timestamp: string;
  artifactStats?: HistoryArtifactStats;
};

export type DocumentHistory = {
  docId: string;
  sourcePath: string;
  artifactStats?: HistoryArtifactStats;
  rounds: HistoryRound[];
};

export type HistoryDocumentSummary = {
  docId: string;
  sourcePath: string;
  originPath: string;
  completedRounds: number[];
  latestOutputPath: string;
  lastTimestamp: string;
  artifactStats?: HistoryArtifactStats;
  rounds: HistoryRound[];
};

export type HistoryListResponse = {
  items: HistoryDocumentSummary[];
  total: number;
};

export type DeleteHistoryResult = {
  docId: string;
  mode?: HistoryDeleteMode;
  affectedRounds?: number[];
  deletedRounds: number[];
  remainingRounds: number[];
  removedDocument: boolean;
  deletedFiles: string[];
  deletedFileStats?: HistoryArtifactStats;
  promptProfile?: PromptProfile;
  promptSequence?: PromptId[];
};

export type HistoryArtifactStats = {
  total: number;
  existing: number;
  intermediate: number;
  exports: number;
  reports: number;
  sources?: number;
  external: number;
  missing: number;
  bytes: number;
};

export type HistoryOrphanArtifactFile = {
  path: string;
  relativePath: string;
  kind: "intermediate" | "exports" | "reports" | "external";
  bytes: number;
  modifiedAt: string;
};

export type HistoryOrphanKindStats = Record<"sources" | "intermediate" | "exports" | "reports", {
  files: number;
  bytes: number;
}>;

export type HistoryOrphanScanResult = {
  scannedAt: string;
  rootDir: string;
  scanDirs: Record<string, string>;
  protectedPaths: string[];
  referencedStats: HistoryArtifactStats;
  orphanStats: HistoryArtifactStats;
  orphanKindStats: HistoryOrphanKindStats;
  orphanFiles: HistoryOrphanArtifactFile[];
  hasMore: boolean;
  totalOrphanFiles: number;
};

export type HistoryOrphanDeleteResult = {
  deletedFiles: string[];
  deletedFileStats: HistoryArtifactStats;
  failedFiles: Array<{ path: string; message: string }>;
  before: HistoryOrphanScanResult;
  after: HistoryOrphanScanResult;
};

export type HistoryDeleteImpactFile = {
  path: string;
  relativePath: string;
  kind: string;
  exists: boolean;
  bytes: number;
};

export type HistoryDeleteImpact = {
  docId: string;
  mode: HistoryDeleteMode;
  fromRound?: number | null;
  promptProfile?: PromptProfile | null;
  promptSequence?: PromptId[];
  affectedRounds: number[];
  willDeleteRounds: boolean;
  willRemoveDocument: boolean;
  willDeleteSource: boolean;
  sourceOwnedByProject: boolean;
  sourcePath: string;
  fileStats: HistoryArtifactStats;
  candidateStats: HistoryArtifactStats;
  files: HistoryDeleteImpactFile[];
  hasMoreFiles: boolean;
  warnings: string[];
};

export type HistoryDeleteMode = "records_and_artifacts" | "records_artifacts_and_source" | "records_only" | "exports_only";

export type DeleteHistoryOptions = {
  fromRound?: number;
  promptProfile?: PromptProfile;
  promptSequence?: PromptId[];
  mode?: HistoryDeleteMode;
};

export type ExportIssueSample = {
  code?: string;
  severity?: string;
  message: string;
  location?: string;
  sample?: string;
};

export type ExportResult = {
  format: "txt" | "docx";
  path: string;
  layoutMode?: string;
  paragraphSource?: string;
  formatMode?: string;
  formatScope?: string;
  contentLockedStyleCount?: number;
  tableStyleCount?: number;
  tableBorderCount?: number;
  validationPath?: string;
  auditPath?: string;
  auditIssueCount?: number;
  preflightPath?: string;
  preflightIssueCount?: number;
  guardPath?: string;
  guardIssueCount?: number;
  guardIssueSamples?: ExportIssueSample[];
  auditIssueSamples?: ExportIssueSample[];
  preflightIssueSamples?: ExportIssueSample[];
};

export type FormatRules = {
  version: number;
  schoolName?: string;
  sourceSummary?: string;
  page?: Record<string, unknown>;
  styles: Record<string, Record<string, unknown>>;
  styleMeta?: Record<string, { sourceText?: string; confidence?: number; isInferred?: boolean }>;
  quality?: {
    deterministicHits?: number;
    warningCount?: number;
    warnings?: string[];
    suggestions?: string[];
    requiredRoles?: string[];
    explicitRoles?: string[];
    inheritedRoles?: string[];
    defaultRoles?: string[];
    inferredRoles?: string[];
    missingSourceRoles?: string[];
    lowConfidenceRoles?: string[];
    explicitCoveragePercent?: number;
    usableCoveragePercent?: number;
  };
  notes?: string[];
};

export type FormatRulesResult = {
  ok: boolean;
  path: string;
  rules: FormatRules;
};

export type OutputPreview = {
  path: string;
  text: string;
  truncated: boolean;
  totalChars: number;
  previewChars: number;
};

export type DetectionRiskBucket = {
  words: number;
  percentage: number;
};

export type DetectionReportProvider = "speedai" | "paperpass";

export type DetectionReportSegment = {
  index: number;
  content: string;
  matchText?: string;
  probability: number;
  riskLevel: string;
  charCount: number;
  page?: number;
  markerY?: number;
  sourceProvider?: string;
};

export type DetectionReport = {
  provider?: string;
  providerLabel?: string;
  sourcePath: string;
  pageCount: number;
  summary: {
    title: string;
    author: string;
    reportId: string;
    checkedAt: string;
    model: string;
    totalWords: number | null;
    overallRiskProbability: number | null;
    weightedOverallRiskProbability?: number | null;
    segmentCount?: number | null;
    checkedScopeNotes?: string[];
    riskBuckets: {
      high: DetectionRiskBucket | null;
      medium: DetectionRiskBucket | null;
      low: DetectionRiskBucket | null;
      none: DetectionRiskBucket | null;
      unchecked?: DetectionRiskBucket | null;
    };
  };
  segments: DetectionReportSegment[];
};

export type DetectionReportMatch = {
  segment: DetectionReportSegment;
  chunkId: string;
  score: number;
  confidence: "strong" | "review" | "weak";
  label: string;
  reason: string;
  evidence: {
    directScore: number;
    windowScore: number;
    directFragmentScore: number;
    windowFragmentScore: number;
    runnerUpScore: number;
    scoreGap: number;
    matchedAnchors: string[];
    matchedFragments: string[];
  };
};

export type ExperimentRecordInput = {
  id?: string;
  docId?: string;
  sourcePath?: string;
  outputPath?: string;
  round?: number | null;
  promptProfile?: string;
  promptSequence?: string[];
  strategy?: string;
  model?: string;
  providerName?: string;
  roundModel?: RoundResult["roundModel"] | null;
  speedaiBefore?: number | null;
  speedaiAfter?: number | null;
  paperpassBefore?: number | null;
  paperpassAfter?: number | null;
  reportProvider?: string;
  reportOverall?: number | null;
  reportPath?: string;
  chunkCount?: number | null;
  reviewChunkCount?: number | null;
  machineLikeRiskCount?: number | null;
  rewriteCandidateMode?: "economy" | "quality" | string;
  estimatedApiCalls?: number | null;
  validationRetryCount?: number | null;
  sourceFallbackCount?: number | null;
  guardIssueCount?: number | null;
  preflightIssueCount?: number | null;
  auditIssueCount?: number | null;
  notes?: string;
};

export type ExperimentRecord = ExperimentRecordInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
  speedaiDelta?: number | null;
  paperpassDelta?: number | null;
};

export type ExperimentListResponse = {
  items: ExperimentRecord[];
  total: number;
  path: string;
};

export type ExperimentSaveResult = {
  ok: boolean;
  record: ExperimentRecord;
  path: string;
};

export type ExperimentDeleteResult = {
  ok: boolean;
  deleted: boolean;
  id: string;
  total: number;
  path: string;
};
