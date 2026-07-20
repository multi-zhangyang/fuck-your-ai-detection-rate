export type RoundModelConfig = {
  enabled: boolean;
  providerId?: string;
  providerName?: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  apiType: "chat_completions" | "responses";
  streaming?: boolean;
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
  streaming?: boolean;
  temperature?: number;
  requestTimeoutSeconds?: number;
  maxRetries?: number;
  rateLimitWindowMinutes?: number;
  rateLimitMaxRequests?: number;
  models?: string[];
  defaultModel?: string;
  updatedAt?: string;
};

export type PromptId = string;
export type PromptProfile = string;

export type PromptOption = {
  id: PromptId;
  label: string;
  description?: string;
  fileName?: string;
  relativePath?: string;
  builtIn?: boolean;
  editable?: boolean;
  defaultAvailable?: boolean;
};

export type PromptWorkflow = {
  id: PromptProfile;
  label: string;
  description?: string;
  defaultSequence: PromptId[];
  customizable: boolean;
  sequenceLimit: number;
  roundLimit?: number;
  chunkMetric?: "char" | "word" | string;
  legacy?: boolean;
  visible?: boolean;
};

export type PromptPreviewItem = {
  id: PromptId;
  label: string;
  description: string;
  fileName: string;
  relativePath: string;
  sizeBytes: number;
  updatedAt: string;
  content: string;
  builtIn?: boolean;
  editable?: boolean;
  defaultAvailable?: boolean;
  backupPath?: string | null;
};

export type PromptPreviewResponse = {
  ok: boolean;
  promptDir: string;
  items: PromptPreviewItem[];
  workflows?: PromptWorkflow[];
};

export type PromptSaveResult = {
  ok: boolean;
  promptDir: string;
  item: PromptPreviewItem;
};

export type PromptDeleteResult = {
  ok: boolean;
  promptDir: string;
  deletedId: PromptId;
  backupPath?: string | null;
  items: PromptPreviewItem[];
  workflows?: PromptWorkflow[];
};

export type PromptWorkflowSaveResult = {
  ok: boolean;
  promptDir: string;
  workflows: PromptWorkflow[];
};

export type PromptBackupItem = {
  fileName: string;
  relativePath: string;
  sizeBytes: number;
  createdAt: string;
  content: string;
};

export type PromptBackupsResult = {
  ok: boolean;
  items: PromptBackupItem[];
};

export type ModelConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  apiType: "chat_completions" | "responses";
  streaming: boolean;
  temperature: number;
  promptProfile: PromptProfile;
  promptSequence: PromptId[];
  requestTimeoutSeconds: number;
  maxRetries: number;
  rewriteConcurrency: number;
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
  completedCount?: number;
  interruptedCount?: number;
  invalidCount?: number;
  tempFileCount?: number;
  activeTempCount?: number;
  staleTempCount?: number;
  staleActiveTempCount?: number;
  retentionHours: number;
  tempRetentionHours?: number;
  oldestUpdatedAt?: string;
  newestUpdatedAt?: string;
  readiness?: Record<string, unknown>;
};

export type TaskSummaryItem = Record<string, unknown> & {
  runId: string;
  taskType: "run-round" | "batch-rerun" | string;
  taskGroup: "active" | "recent" | string;
  targetPath: string;
  active: boolean;
  status: string;
  completed: boolean;
  cancelRequested?: boolean;
  restoredFromDisk?: boolean;
  persistedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  sortAt?: string;
};

export type TaskStateCleanupResult = {
  ok: boolean;
  mode: "expired" | "completed" | "all" | string;
  maxAgeHours: number;
  deletedCount: number;
  deletedSnapshotCount?: number;
  deletedTempCount?: number;
  deletedInvalidCount?: number;
  deletedBytes: number;
  deletedFiles: string[];
  deletedTempFiles?: string[];
  deletedInvalidFiles?: string[];
  failedFiles: Array<{ file: string; message: string }>;
  skippedActiveCount: number;
  skippedActiveTempCount?: number;
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
  taskCount?: number;
  tasks?: TaskSummaryItem[];
  recentTaskCount?: number;
  recentTasks?: TaskSummaryItem[];
  taskStateStore?: TaskStateStoreSummary;
  historyDatabase?: HistoryDatabaseMaintenanceSummary;
  config: {
    path: string;
    exists: boolean;
    hasBaseUrl: boolean;
    hasApiKey: boolean;
    model: string;
    apiType: string;
    promptProfile: string;
    promptSequence: string[];
    rewriteConcurrency?: number;
    maxRewriteConcurrency?: number;
    requestTimeoutSeconds?: number;
    effectiveRewriteTimeoutSeconds?: number;
    maxRetries?: number;
    providerCount: number;
    enabledProviderCount: number;
    customRoundCount: number;
  };
  runtime: {
    pythonVersion: string;
    pythonExecutable: string;
    platform: string;
  };
};

export type BackendRuntimeInfo = {
  ok: boolean;
  service: string;
  createdAt: string;
  maxRewriteConcurrency?: number;
};

export type RoundProgress = {
  phase: string;
  round: number;
  roundModel?: RoundResult["roundModel"];
  currentChunk?: number;
  totalChunks?: number;
  completedChunks?: number;
  activeChunks?: number;
  queuedChunks?: number;
  concurrency?: number;
  configuredConcurrency?: number;
  requestTimeoutSeconds?: number;
  configuredRequestTimeoutSeconds?: number;
  failedChunks?: number;
  estimatedApiCalls?: number;
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
  streamChars?: number;
  streamEventCount?: number;
  streamDone?: boolean;
  finalTextChars?: number;
  reasoningSuppressed?: boolean;
  providerContentStored?: boolean;
  error?: string;
  errorCategory?: string;
  statusCode?: number | string;
  retryable?: boolean;
  attempts?: number | string;
  maxAttempts?: number | string;
  nextAttempt?: number | string;
  cooldownSeconds?: number | string;
  retryAfterSeconds?: number | string;
  configuredMaxRetries?: number | string;
  providerMessage?: string;
  autoRetryEligible?: boolean;
  retryDelaySeconds?: number;
  maxAutoRetries?: number;
  nextRoundDelaySeconds?: number;
};

export type RunAutomationHint = {
  kind: "retry" | "next-round" | string;
  eligible: boolean;
  delaySeconds?: number;
  maxAttempts?: number;
};

export type RerunDimensionDirection = {
  dimensionId?: string;
  direction?: string;
  primaryMetric?: string;
  secondaryMetric?: string;
  before?: number;
  after?: number;
  ok?: boolean;
  satisfied?: boolean;
  note?: string;
  riskCodesBefore?: string[];
  riskCodesAfter?: string[];
  structureDirection?: {
    effective?: boolean;
    concentration?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type DeterministicLexicalRetentionProxy = {
  name?: string;
  score: number;
  minimumScore: number;
  sourceCoverage: number;
  outputPrecision: number;
  lengthSimilarity: number;
  usesEmbedding: false;
  usesModel: false;
  claimsSemanticEquivalence: false;
  isAiDetector: false;
  claimsDetectionRate: false;
};

export type AcademicReadabilityDeltaEvidence = {
  schema: "fyadr.academic-readability-delta";
  schemaVersion: 1;
  ok: boolean;
  issueCodes: string[];
};

export type SourceRelativePatternDeltaRow = {
  kind: "opening_family" | "sentence_skeleton";
  inputCount: number;
  outputCount: number;
  introducedCount: number;
  documentBeforeCount: number | null;
  documentAfterCount: number | null;
  documentIntroducedCount: number | null;
  familyId?: string;
  patternSha256?: string;
};

export type SourceRelativePatternDeltaSummary = {
  introducedPatternCount: number;
  blockingPatternCount: number;
  maxIntroducedCount: number;
  maxDocumentAfterCount: number;
  issueCodes: string[];
  patterns: SourceRelativePatternDeltaRow[];
};

export type SourceRelativeStyleDeltaEvidence = {
  schema: "fyadr.source-relative-style-delta";
  schemaVersion: 1;
  ready: boolean;
  passed: boolean;
  contextScope: "document" | "local" | "invalid";
  binding: {
    sourceProfileSha256: string;
    baselineTextSha256: string;
    candidateTextSha256: string;
  };
  openingFamilyDelta: SourceRelativePatternDeltaSummary;
  sentenceSkeletonDelta: SourceRelativePatternDeltaSummary;
  sentenceBoundaryDelta: {
    inputSentenceCount: number;
    outputSentenceCount: number;
    inputShortSentenceCount: number;
    outputShortSentenceCount: number;
    collapseCount: number;
    fragmentIncrease: number;
    collapsed: boolean;
    fragmented: boolean;
    issueCodes: string[];
  };
  blockingIssueCodes: string[];
  advisoryIssueCodes: string[];
  claims: {
    providerIndependent: true;
    deltaOnly: true;
    heuristicOnly: true;
    storesInputText: false;
    storesOutputText: false;
    storesMatchedText: false;
    isAiDetector: false;
    claimsAuthorshipDetection: false;
    claimsDetectionRate: false;
    claimsSemanticEquivalence: false;
  };
};

export type SourceRelativeDocumentPatternRow = {
  kind: "opening_family" | "sentence_skeleton";
  baselineCount: number;
  resultCount: number;
  introducedCount: number;
  familyId?: string;
  patternSha256?: string;
};

export type SourceRelativeDocumentDeltaEvidence = {
  schema: "fyadr.source-relative-document-style-delta";
  schemaVersion: 1;
  ready: true;
  passed: boolean;
  binding: {
    chunkCount: number;
    baselineProfileSha256: string;
    resultProfileSha256: string;
    baselineChunksSha256: string;
    resultChunksSha256: string;
  };
  openingFamilyDelta: {
    introducedPatternCount: number;
    blockingPatternCount: number;
    maxIntroducedCount: number;
    maxResultCount: number;
    issueCodes: string[];
    patterns: SourceRelativeDocumentPatternRow[];
  };
  sentenceSkeletonDelta: {
    introducedPatternCount: number;
    blockingPatternCount: number;
    maxIntroducedCount: number;
    maxResultCount: number;
    issueCodes: string[];
    patterns: SourceRelativeDocumentPatternRow[];
  };
  blockingIssueCodes: string[];
  advisoryIssueCodes: string[];
  claims: {
    providerIndependent: true;
    deltaOnly: true;
    heuristicOnly: true;
    storesInputText: false;
    storesOutputText: false;
    storesMatchedText: false;
    preservesChunkBoundaries: true;
    isAiDetector: false;
    claimsAuthorshipDetection: false;
    claimsDetectionRate: false;
    claimsSemanticEquivalence: false;
  };
};

export type CandidateSelectionCandidate = {
  candidateId: string;
  origin: "baseline" | "model";
  attempt: number;
  textSha256: string;
  charCount: number;
  changedFromBaseline: boolean;
  hardValid: boolean;
  hardValidationIssueCodes: string[];
  academicReadabilityDelta?: AcademicReadabilityDeltaEvidence;
  readabilityGuardPassed?: boolean;
  readabilityIssueCodes?: string[];
  sourceRelativeStyleDelta: SourceRelativeStyleDeltaEvidence;
  sourceRelativeStyleGuardPassed: boolean;
  factualGuardPassed: boolean;
  factualIssueCodes: string[];
  deterministicLexicalRetentionProxy: DeterministicLexicalRetentionProxy;
  sameDimensionDirection: RerunDimensionDirection;
  stylePenalty: number | null;
  safetyEligible: boolean;
  rejectionReasonCodes: string[];
};

export type ChunkCandidateSelection = {
  schema: "fyadr.chunk-candidate-selection";
  schemaVersion: 2;
  decision: "generated_selected" | "preserved_baseline" | "hard_failure_preserved_baseline";
  publishedRewrite: boolean;
  runFailed: boolean;
  selectedCandidateId: string;
  selectedOrigin: "baseline" | "model";
  selectedTextSha256: string;
  resultTextSha256: string;
  publishedTextSha256?: string;
  selectedCharCount: number;
  resultCharCount: number;
  publishedCharCount?: number;
  postprocessApplied: boolean;
  resultSourceRelativeStyleDelta: SourceRelativeStyleDeltaEvidence;
  reasonCodes: string[];
  modelAttemptCount: number;
  conditionalRetryCount: number;
  candidateLimit: number;
  modelAttemptLimit: number;
  retentionAssessment: {
    name?: string;
    usesEmbedding: false;
    usesModel: false;
    claimsSemanticEquivalence: false;
    isAiDetector: false;
    claimsDetectionRate: false;
  };
  candidates: CandidateSelectionCandidate[];
  documentArbitration?: {
    decision: "baseline_preserved";
    reasonCode: "document_pattern_delta_accumulation_blocked";
    rejectedDocumentDelta: SourceRelativeDocumentDeltaEvidence;
  };
};

export type FailedAttemptGuardCategory =
  | "structure"
  | "factual"
  | "readability"
  | "style"
  | "provider"
  | "local_validation";

export type FailedAttemptIssueCode =
  | "structure_placeholder_preservation"
  | "format_anchor_preservation"
  | "paragraph_structure_preservation"
  | "citation_preservation"
  | "number_preservation"
  | "term_preservation"
  | "language_stability"
  | "factual_relation_preservation"
  | "factual_scope_qualifier_changed"
  | "repetition_stability"
  | "length_stability"
  | "sentence_surface_stability"
  | "academic_register_stability"
  | "academic_collocation_stability"
  | "predicate_completeness"
  | "machine_style_drift"
  | "answer_style_rejected"
  | "empty_output"
  | "provider_auth"
  | "provider_rate_limit"
  | "provider_timeout"
  | "provider_network"
  | "provider_server"
  | "provider_client_configuration"
  | "provider_failure"
  | "reasoning_content_suppressed"
  | "validation_rejected_unspecified";

/**
 * Text-free failed-candidate evidence. Failed provider output, raw errors and
 * reasoning content are deliberately absent from this public contract.
 */
export type FailedAttemptEvidence = {
  schema: "fyadr.failed-attempt-evidence";
  schemaVersion: 1;
  attempt: number | null;
  outputCharCount: number;
  outputTextSha256: string;
  truncated: boolean;
  guardCategory: FailedAttemptGuardCategory;
  issueCodes: FailedAttemptIssueCode[];
  textStored: false;
  errorStored: false;
  reasoningSuppressed: true;
  providerContentStored: false;
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
  fallbackGuardCategory?: FailedAttemptGuardCategory;
  fallbackIssueCodes?: FailedAttemptIssueCode[];
  fallbackErrorStored?: false;
  fallbackAttempts?: number;
  fallbackAt?: string;
  failedAttempts?: FailedAttemptEvidence[];
  rerunAt?: string;
  rerunMode?: string;
  rerunStatus?: string;
  rerunNonConvergedReason?: string;
  rerunAttemptCount?: number;
  rerunSelectedScore?: number;
  rerunDimensionConverged?: boolean;
  rerunDimensionConvergeDirections?: RerunDimensionDirection[];
  rerunFallbackMode?: string;
  rerunFallbackGuardCategory?: FailedAttemptGuardCategory;
  rerunFallbackIssueCodes?: FailedAttemptIssueCode[];
  rerunFallbackErrorStored?: false;
  rerunStrategy?: string[];
  rerunAdvice?: string[];
  rerunPromptStored?: false;
  rerunUserFeedbackPresent?: boolean;
  rerunUserFeedbackCharCount?: number;
  rerunUserFeedbackSha256?: string;
  rerunDefaultDecision?: "source" | "rewrite";
  rateAuditStrategyReviewRequired?: boolean;
  rateAuditStrategyPlanDigest?: string;
  rateAuditStrategyPromptId?: string;
  rateAuditStrategyEvaluatorDimensionId?: string;
  rateAuditStrategyInputSource?: string;
  rateAuditStrategyEffectiveInputSha256?: string;
  candidateSelection?: ChunkCandidateSelection;
  quality?: {
    expansionRatio?: number;
    missingCitationCount?: number;
    missingCitations?: string[];
    introducedColloquialPhraseCount?: number;
    introducedColloquialPhrases?: string[];
    academicRegisterDrift?: boolean;
    styleValidationIssueCount?: number;
    styleValidationIssues?: MachineLikeRisk[];
    machineLikeRiskCount?: number;
    machineLikeRisks?: MachineLikeRisk[];
    reviewReasons?: MachineLikeRisk[];
    rewriteAdvice?: string[];
    protectedTokenCount?: number;
    protectedTokenTypes?: Record<string, number>;
    flags?: string[];
    advisoryFlags?: string[];
    needsReview?: boolean;
    styleMetrics?: {
      sentenceCount?: number;
      sentenceVariance?: number;
      burstinessRatio?: number;
      passiveDensity?: number;
      chengyuDensity?: number;
      connectorDensity?: number;
      paragraphCount?: number;
      paragraphLengthCv?: number;
      adjacentParagraphUniformity?: number;
    };
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

export type RateAuditRisk = {
  code: string;
  level: "low" | "medium" | "high" | string;
  message: string;
  points: number;
  dimensionId: string;
};

export type RateAuditDimension = {
  id: string;
  label: string;
  description: string;
  action: string;
  riskCount: number;
  highRiskCount: number;
  riskPoints: number;
  status: "clear" | "watch" | "focus" | string;
  riskCodes: string[];
};

export type RateAuditMetrics = {
  language: string;
  charCount: number;
  sentenceCount: number;
  paragraphCount: number;
  sentenceLengthVariation: number;
  burstinessRatio: number;
  shortSentenceRate: number;
  connectorDensity: number;
  templateDensity: number;
  abstractPaddingDensity: number;
  passiveDensity: number;
  chengyuDensity: number;
  nestedNumberDensity: number;
  colonParallelDensity: number;
  structureConcentration: number;
  paragraphLengthCv: number;
  adjacentParagraphUniformity: number;
};

export type RateAuditStage = {
  id: string;
  label: string;
  round: number | null;
  originalCharCount: number;
  analyzedCharCount: number;
  truncated: boolean;
  riskCount: number;
  highRiskCount: number;
  riskPoints: number;
  risks: RateAuditRisk[];
  dimensions: RateAuditDimension[];
  metrics: RateAuditMetrics;
};

export type RateAuditDimensionDelta = {
  id: string;
  label: string;
  beforeRiskPoints: number;
  afterRiskPoints: number;
  riskPointChange: number;
  trend: "improved" | "regressed" | "stable" | string;
};

export type RateAuditDelta = {
  beforeRiskPoints: number;
  afterRiskPoints: number;
  riskPointChange: number;
  beforeRiskCount: number;
  afterRiskCount: number;
  relativeRiskChangePercent: number | null;
  improvedDimensionCount: number;
  regressedDimensionCount: number;
  stableDimensionCount: number;
  dimensions: RateAuditDimensionDelta[];
};

export type RateAuditHotspot = {
  chunkId: string;
  paragraphIndex: number;
  chunkIndex: number;
  excerpt: string;
  riskCount: number;
  highRiskCount: number;
  riskPoints: number;
  dimensionIds: string[];
  risks: RateAuditRisk[];
};

export type RateAuditRecommendation = {
  dimensionId: string;
  label: string;
  priority: "low" | "medium" | "high" | string;
  trend: "improved" | "regressed" | "stable" | string;
  riskCount: number;
  highRiskCount?: number;
  riskPoints: number;
  reason: string;
  action: string;
  targetChunkIds: string[];
  repairPromptId?: string;
  evaluatorDimensionId?: string;
  primaryMetric?: string;
  secondaryMetric?: string;
  directionEvaluator?: string;
  targetScope?: string;
  maxAttempts?: number;
  plateauPolicy?: string;
  canExecute?: boolean;
  manualReviewReason?: string;
};

export type RateAuditBlockingManualDimension = {
  dimensionId: string;
  label: string;
  trend: "improved" | "regressed" | "stable" | string;
  riskCount: number;
  highRiskCount: number;
  riskPoints: number;
  targetScope: string;
  targetChunkIds: string[];
  targetChunkCount: number;
  manualReviewReason: string;
  action: string;
};

export type RateAuditExecutableQueueItem = {
  dimensionId: string;
  label: string;
  priority: "low" | "medium" | "high" | string;
  trend: "improved" | "regressed" | "stable" | string;
  riskCount: number;
  highRiskCount: number;
  riskPoints: number;
  repairPromptId: string;
  evaluatorDimensionId: string;
  primaryMetric: string;
  targetScope: string;
  maxAttempts: number;
  plateauPolicy: string;
  targetChunkIds: string[];
  targetChunkCount: number;
};

export type RateAuditPlateau = {
  reached: boolean;
  reason: string;
  hardStop: boolean;
  dimensionId: string;
  targetChunkIds: string[];
  targetChunkCount: number;
  attemptLimit: number;
  preservedPreviousText: boolean;
  manualReviewRequired: boolean;
};

export type DocumentEditContractIssue = {
  code: string;
  severity: "error" | "warning" | string;
  message: string;
  [key: string]: unknown;
};

export type DocumentEditContract = {
  version: number;
  policy: string;
  stage: string;
  createdAt: string;
  sourceKind: string;
  sourcePath: string;
  sourceSha256: string;
  snapshotPath: string;
  snapshotVersion: number;
  snapshotCurrent: boolean;
  scopeDigest: string;
  formatDigest: string;
  formatLockPolicy: string;
  formatLockApplicable: boolean;
  formatLockReady: boolean;
  scopeReady: boolean;
  editableUnitCount: number;
  protectedUnitCount: number;
  headingCount: number;
  protectedHeadingCount: number;
  editableHeadingCount: number;
  semanticRangeCount: number;
  bookmarkRangeCount: number;
  commentRangeCount: number;
  semanticRangeTopologyValid: boolean;
  semanticRangeIssueCount: number;
  semanticRangeIssueCodes: string[];
  semanticRangeAnchorUnitCount: number;
  protectedSemanticRangeAnchorUnitCount: number;
  editableSemanticRangeAnchorUnitCount: number;
  semanticRangeCoveredUnitCount: number;
  protectedSemanticRangeCoveredUnitCount: number;
  editableSemanticRangeCoveredUnitCount: number;
  bookmarkRangeInteriorUnitCount: number;
  protectedBookmarkRangeInteriorUnitCount: number;
  editableBookmarkRangeInteriorUnitCount: number;
  semanticPointReferenceUnitCount: number;
  protectedSemanticPointReferenceUnitCount: number;
  editableSemanticPointReferenceUnitCount: number;
  modelInputUnitCount: number;
  modelInputMatchesEditableUnits: boolean;
  extractedTextPath: string;
  extractedTextMatchesEditableUnits: boolean;
  bodyMapPresent: boolean;
  bodyMapReady: boolean;
  scopeDiagnosticsOk: boolean;
  exportPath: string;
  exportSha256: string;
  exportEvidence: Record<string, unknown>;
  ready: boolean;
  issueCount: number;
  warningCount: number;
  issues: DocumentEditContractIssue[];
  truncatedIssues: number;
  reportPath?: string;
};

export type RateAuditStrategyPlan = {
  version: number;
  decision: "blocked" | "stop" | "targeted_rerun" | "next_dimension" | string;
  label: string;
  recommendedPromptId: string;
  currentPromptId: string;
  nextPromptId: string;
  dimensionId: string;
  dimensionLabel: string;
  dimensionRegistryVersion?: number;
  repairPromptId?: string;
  evaluatorDimensionId?: string;
  primaryMetric?: string;
  secondaryMetric?: string;
  directionEvaluator?: string;
  targetScope?: string;
  maxAttempts?: number;
  plateauPolicy?: string;
  dimensionCanExecute?: boolean;
  manualReviewReason?: string;
  promptSelectionSource?: string;
  progressEvidenceDimensionId?: string;
  progressEvidenceEvaluatorDimensionId?: string;
  progressEvidenceTrend?: "improved" | "regressed" | "stable" | string;
  progressEvidenceAfterRiskPoints?: number;
  progressEvidenceReady?: boolean;
  progressEvidenceSource?: "bound_dimension" | "prewrite_global_delta" | "none" | string;
  blockingManualDimensions: RateAuditBlockingManualDimension[];
  blockingManualDimensionCount: number;
  executableQueue: RateAuditExecutableQueueItem[];
  executableQueueCount: number;
  selectedExecutableDimensionId: string;
  manualReviewRequired: boolean;
  manualReviewStillRequired: boolean;
  hardStop: boolean;
  plateauReached: boolean;
  plateauReason: string;
  plateauDimensionId?: string;
  plateauTargetChunkIds?: string[];
  plateauTargetChunkCount?: number;
  plateauAttemptLimit?: number;
  reason: string;
  action: string;
  targetChunkIds: string[];
  targetChunkCount: number;
  contentContractReady: boolean;
  scopeContractReady: boolean;
  formatContractReady: boolean;
  canExecute: boolean;
};

export type RateAuditReadiness = {
  status: "ready" | "attention" | "blocked" | string;
  strategyDecisionReady: boolean;
  contentContractReady: boolean;
  scopeContractReady: boolean;
  formatContractReady: boolean;
  runReady: boolean;
  preExportReady: boolean;
  blockedReason: string;
};

export type RateAuditStrategyBinding = {
  version: number;
  ready: boolean;
  compareRevision: string;
  sourceSha256: string;
  scopeDigest: string;
  formatDigest: string;
  dimensionId: string;
  recommendedPromptId: string;
  targetChunkIds: string[];
  planDigest: string;
  effectiveTextSha256?: string;
  reviewRevision?: string;
  contentRevision?: string;
  artifactSnapshotDigest?: string;
  outputSha256?: string;
  compareSha256?: string;
  promptSha256?: string;
  blockedReason: string;
};

export type PreviousRoundRevisionBinding = {
  expectedPreviousCompareRevision: string;
  expectedPreviousReviewRevision: string;
  expectedPreviousContentRevision: string;
  expectedPreviousArtifactSnapshotDigest: string;
  expectedPreviousEffectiveTextSha256: string;
};

export type RateAuditStrategyExecutionRequest = {
  sourcePath: string;
  outputPath: string;
  dimensionId: string;
  recommendedPromptId: string;
  compareRevision: string;
  scopeDigest: string;
  formatDigest: string;
  sourceSha256: string;
  targetChunkIds: string[];
  planDigest: string;
};

export type RateAuditReport = {
  version: number;
  label: string;
  isAiDetector: false;
  disclaimer: string;
  createdAt: string;
  sourcePath: string;
  currentOutputPath: string;
  sourceOnly: boolean;
  stageCount: number;
  baseline: RateAuditStage;
  current: RateAuditStage;
  stages: RateAuditStage[];
  delta: RateAuditDelta;
  hotspotCount: number;
  hotspots: RateAuditHotspot[];
  recommendations: RateAuditRecommendation[];
  strategyPlan: RateAuditStrategyPlan;
  plateau: RateAuditPlateau;
  strategyBinding: RateAuditStrategyBinding | null;
  contentContract: DocumentEditContract | null;
  readiness: RateAuditReadiness;
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
  source?: "failed_output" | "manual" | string;
  confirmed?: boolean;
  attempt?: number;
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
  automation?: RunAutomationHint | null;
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
  lastErrorDetails?: Record<string, unknown>;
  updatedAt: string;
  validationEventCount: number;
  message: string;
  activeRun?: RunRoundStatus | null;
};

export type ReviewDecision = "rewrite" | "source" | "rewrite_confirmed" | "source_confirmed" | CustomReviewDecision;

export type ReviewDecisionsResult = {
  path: string;
  decisions: Record<string, ReviewDecision>;
  updatedAt?: string;
  compareRevision?: string;
  currentCompareRevision?: string;
  reviewBaseCompareRevision?: string;
  reviewLinkReady?: boolean;
  reviewLinkStatus?: "linked" | "legacy_unversioned" | "none" | string;
};

export type RoundQualitySummary = {
  label?: string;
  isAiDetector?: boolean;
  hardValidationRules?: string[];
  reviewRules?: string[];
  paragraphSplitSummary?: ParagraphSplitSummary;
  validationRetryCount?: number;
  sourceFallbackCount?: number;
  sourceFallbackChunkIds?: string[];
  validationEventCount?: number;
  citationInputCount?: number;
  citationOutputCount?: number;
  protectedTokenCount?: number;
  protectedTokenTypes?: Record<string, number>;
  introducedTemplatePhraseCount?: number;
  introducedTemplatePhrases?: string[];
  introducedColloquialPhraseCount?: number;
  introducedColloquialPhrases?: string[];
  styleValidationIssueCount?: number;
  styleValidationIssues?: MachineLikeRisk[];
  styleCardVersion?: number;
  styleCardChunkCount?: number;
  styleCardChunkIds?: string[];
  estimatedApiCalls?: number;
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
  requestTimeoutSeconds?: number | null;
  maxRetries?: number | null;
  rateLimitWindowMinutes?: number | null;
  rateLimitMaxRequests?: number | null;
  rewriteConcurrency?: number | null;
  promptProfile?: PromptProfile | string;
  promptSequence?: PromptId[] | string[];
  estimatedApiCalls?: number | null;
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
  updatedAt?: string | null;
  reviewUpdatedAt?: string | null;
  compareRevision?: string;
  sourceRelativeDocumentDelta?: SourceRelativeDocumentDeltaEvidence;
  chunks: RoundCompareChunk[];
};

export type RerunChunkResult = {
  chunk: RoundCompareChunk;
  compare: RoundCompareData;
  outputPath: string;
  comparePath: string;
  preservedExisting?: boolean;
  candidateSelectionAttempt?: ChunkCandidateSelection;
};

export type BatchRerunTarget = {
  chunkId: string;
  userFeedback?: string;
};

export type BatchRerunFailure = {
  chunkId: string;
  error: string;
  guardCategory?: FailedAttemptGuardCategory;
  issueCodes?: FailedAttemptIssueCode[];
  errorStored?: false;
  reasoningSuppressed?: true;
  providerContentStored?: false;
  failedAttempts?: NonNullable<RoundCompareChunk["failedAttempts"]>;
  rerunStatus?: string;
  rerunFallbackMode?: string;
  rerunFallbackGuardCategory?: FailedAttemptGuardCategory;
  rerunFallbackIssueCodes?: FailedAttemptIssueCode[];
  rerunFallbackErrorStored?: false;
  quality?: RoundCompareChunk["quality"];
  scopeKey?: string;
};

export type BatchRerunResult = {
  ok: boolean;
  runId?: string;
  outputPath: string;
  comparePath: string;
  compare?: RoundCompareData;
  successChunkIds?: string[];
  preservedAttempts?: Array<{
    chunkId: string;
    candidateSelectionAttempt: ChunkCandidateSelection;
  }>;
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
  preservedAttempts?: BatchRerunResult["preservedAttempts"];
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
  plannedRounds?: number;
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
  structuralRole?: string;
  structuralRoleLabel?: string;
  editEligibility?: "eligible" | "protected" | string;
  eligibilityReasonCodes?: string[];
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
    structuralRolePolicyVersion?: number;
    structuralInventoryVersion?: number;
    ambiguousUnits?: number;
    roleCounts?: Record<string, number>;
    semanticRangeCount: number;
    bookmarkRangeCount?: number;
    commentRangeCount?: number;
    bookmarkRangeInteriorUnits?: number;
    editableBookmarkRangeInteriorUnits?: number;
    commentRangeInteriorUnits?: number;
    semanticRangeTopologyValid: boolean;
    semanticRangeCoveredUnits: number;
    protectionReasons: ProtectionReasonSummary[];
  };
  sections: ProtectionMapSection[];
};

export type ScopeDiagnosticUnitFlags = {
  abstractStart?: boolean;
  bodyStart?: boolean;
  acknowledgementHeading?: boolean;
  bookmarkRangeInterior?: boolean;
  commentRangeInterior?: boolean;
  referencesHeading?: boolean;
  referenceEntry?: boolean;
  backMatterHeading?: boolean;
  tocHeading?: boolean;
  tocEntry?: boolean;
  heading?: boolean;
  numberedBodyItem?: boolean;
  keywordLine?: boolean;
  caption?: boolean;
  note?: boolean;
  formula?: boolean;
  templateInstruction?: boolean;
  semanticRangeCovered?: boolean;
};

export type ScopeDiagnosticUnit = {
  unitIndex: number;
  target?: Record<string, unknown>;
  targetKind: string;
  styleName: string;
  editable: boolean;
  protectReason: string;
  structuralRole?: string;
  editEligibility?: string;
  editEligibilityEvidenceDigest?: string;
  editEligibilityReasonCodes?: string[];
  presentationSignals?: Record<string, unknown>;
  textLength: number;
  textPreview: string;
  hasFieldCode: boolean;
  hasDrawing: boolean;
  hasMath?: boolean;
  hasComplexInline?: boolean;
  hasNumbering: boolean;
  numberingLevel?: number | null;
  outlineLevel?: number | null;
  formatAnchorCount?: number;
  formatAnchorAmbiguous?: boolean;
  hasSemanticRangeAnchor?: boolean;
  insideSemanticRange?: boolean;
  hasBookmarkRangeAnchor?: boolean;
  hasCommentRangeAnchor?: boolean;
  insideBookmarkRange?: boolean;
  insideCommentRange?: boolean;
  hasSemanticPointReference?: boolean;
  flags: ScopeDiagnosticUnitFlags;
};

export type ScopeDiagnosticIssue = {
  code: string;
  severity: "error" | "warning" | "info" | string;
  message: string;
  unit?: ScopeDiagnosticUnit;
};

export type ScopeDiagnosticSummary = {
  startIndex?: number | null;
  startReason?: string;
  startUnit?: ScopeDiagnosticUnit | null;
  endIndex?: number | null;
  endReason?: string;
  endUnit?: ScopeDiagnosticUnit | null;
  acknowledgementIndex?: number | null;
  acknowledgementUnit?: ScopeDiagnosticUnit | null;
  postAcknowledgementBoundaryIndex?: number | null;
  postAcknowledgementBoundaryUnit?: ScopeDiagnosticUnit | null;
};

export type DocumentScopeDiagnostics = {
  available: boolean;
  ok: boolean;
  version?: number;
  sourcePath: string;
  sourceKind: string;
  snapshotPath?: string;
  path?: string;
  message: string;
  totalTextUnitCount: number;
  editableUnitCount: number;
  protectedUnitCount: number;
  semanticRangeCount: number;
  bookmarkRangeCount?: number;
  commentRangeCount?: number;
  semanticRangeTopologyValid: boolean;
  semanticRangeIssueCount: number;
  semanticRangeIssueCodes: string[];
  semanticRangeCoveredUnitCount: number;
  editableSemanticRangeCoveredUnitCount: number;
  bookmarkRangeInteriorUnitCount?: number;
  editableBookmarkRangeInteriorUnitCount?: number;
  commentRangeInteriorUnitCount?: number;
  editableCommentRangeInteriorUnitCount?: number;
  semanticRangeAnchorUnitCount?: number;
  editableSemanticRangeAnchorUnitCount?: number;
  bookmarkRangeAnchorUnitCount?: number;
  commentRangeAnchorUnitCount?: number;
  structuralRolePolicyVersion?: number;
  structuralInventoryVersion?: number;
  protectedStructuralUnitCount?: number;
  protectedTableParagraphCount?: number;
  templateInstructionUnitCount?: number;
  editableTemplateInstructionUnitCount?: number;
  reasonCounts: Record<string, number>;
  scope: ScopeDiagnosticSummary;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  issues: ScopeDiagnosticIssue[];
  truncatedIssues?: number;
  units: ScopeDiagnosticUnit[];
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

export type HistoryExportSelection = {
  docId: string;
  sourcePath: string;
  round: number;
  outputPath: string;
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
  failedFiles?: Array<{ path: string; message: string }>;
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

export type HistoryArtifactGovernanceMode = "missing" | "current" | "large";

export type HistoryArtifactQueryKind = "sources" | "intermediate" | "exports" | "reports" | "external";

export type HistoryArtifactQueryFilters = {
  docId?: string;
  roundNumber?: number | null;
  kind?: HistoryArtifactQueryKind | HistoryArtifactQueryKind[];
  kinds?: HistoryArtifactQueryKind[];
  exists?: boolean | "existing" | "missing" | "all";
  minBytes?: number | null;
  maxBytes?: number | null;
  pathContains?: string;
  limit?: number;
  offset?: number;
};

export type HistoryArtifactQueryItem = {
  path: string;
  absolutePath: string;
  kind: HistoryArtifactQueryKind;
  exists: boolean;
  bytes: number;
  modifiedAt: string;
  documentCount: number;
  roundCount: number;
  docIds: string[];
  roles: string[];
  firstTimestamp: string;
  lastTimestamp: string;
};

export type HistoryArtifactQueryResponse = {
  ok: boolean;
  source: "sqlite" | string;
  filters: HistoryArtifactQueryFilters & {
    docId?: string;
    roundNumber?: number | null;
    kinds?: HistoryArtifactQueryKind[];
    limit?: number;
    offset?: number;
  };
  items: HistoryArtifactQueryItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  stats: HistoryArtifactStats;
  error?: string;
};

export type HistoryDatabaseIssue = {
  code: string;
  severity: "error" | "warning" | "info" | string;
  message: string;
  repairable?: boolean;
  recommendedAction?: string;
  details?: Record<string, unknown>;
};

export type HistoryDatabaseCheckResult = {
  ok: boolean;
  checkedAt?: string;
  path?: string;
  status?: Record<string, unknown>;
  expectedCounts?: Record<string, number> | null;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  repairableIssueCount?: number;
  issues: HistoryDatabaseIssue[];
  error?: string;
};

export type HistoryDatabaseRepairResult = {
  ok: boolean;
  repairedAt?: string;
  path?: string;
  before?: HistoryDatabaseCheckResult;
  after?: HistoryDatabaseCheckResult;
  rebuild?: Record<string, unknown>;
  error?: string;
};

export type HistoryOrphanArtifactFile = {
  path: string;
  relativePath: string;
  kind: "sources" | "intermediate" | "exports" | "reports" | "external";
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

export type HistoryDatabaseStorageStats = {
  exists?: boolean;
  fileSizeBytes?: number;
  pageSizeBytes?: number;
  pageCount?: number;
  freePageCount?: number;
  freeBytes?: number;
  freeRatio?: number;
  estimatedPageBytes?: number;
  error?: string;
};

export type HistoryDatabaseIndexStatus = {
  path?: string;
  exists?: boolean;
  schemaVersion?: number;
  documentCount?: number;
  roundCount?: number;
  artifactCount?: number;
  artifactRefCount?: number;
  missingArtifactCount?: number;
  existingBytes?: number;
  recordsHash?: string;
  syncedAt?: string;
  migrationCount?: number;
  appliedMigrations?: string[];
};

export type HistoryDatabaseReadiness = {
  ok?: boolean;
  reason?: string;
  checkedAt?: string;
  actions?: string[];
  action?: string;
  cached?: boolean;
  compactEnabled?: boolean;
  error?: string;
  compactError?: string;
};

export type HistoryDatabaseMaintenanceCounters = {
  deleteEventCount?: number;
  deletedRowCount?: number;
  deletedFileCount?: number;
  lastDeleteAt?: string;
  lastCompactAt?: string;
  lastCompactReason?: string;
};

export type HistoryDatabaseCompactionAdvice = {
  shouldCompact?: boolean;
  reasons?: string[];
  thresholds?: {
    deleteEventCount?: number;
    deletedRowCount?: number;
    freeBytes?: number;
    freeRatio?: number;
  };
};

export type HistoryDatabaseBackupEntry = {
  path: string;
  name: string;
  sizeBytes: number;
  modifiedAt: string;
  validation?: HistoryDatabaseCheckResult;
  ok?: boolean;
};

export type HistoryDatabaseMaintenanceSummary = {
  ok: boolean;
  path?: string;
  status?: HistoryDatabaseIndexStatus;
  storage?: HistoryDatabaseStorageStats;
  counters?: HistoryDatabaseMaintenanceCounters;
  policy?: HistoryDatabaseCompactionAdvice;
  backupDir?: string;
  backupCount?: number;
  latestBackup?: HistoryDatabaseBackupEntry | null;
  readiness?: HistoryDatabaseReadiness;
  error?: string;
};

export type HistoryDatabaseBackupListResult = {
  ok: boolean;
  backupDir?: string;
  total: number;
  items: HistoryDatabaseBackupEntry[];
};

export type HistoryDatabaseBackupResult = {
  ok: boolean;
  createdAt?: string;
  reason?: string;
  path?: string;
  backupDir?: string;
  sourcePath?: string;
  sizeBytes?: number;
  sourceStatus?: Record<string, unknown>;
  validation?: HistoryDatabaseCheckResult;
  prunedBackups?: string[];
  backupCount?: number;
  error?: string;
};

export type HistoryDatabaseCompactResult = {
  ok: boolean;
  compactedAt?: string;
  reason?: string;
  path?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  beforeSizeBytes?: number;
  afterSizeBytes?: number;
  savedBytes?: number;
  backup?: HistoryDatabaseBackupResult | null;
  validation?: HistoryDatabaseCheckResult;
  error?: string;
};

export type HistoryDatabaseRecoveryReconciliation = {
  source: string;
  action: string;
  jsonExisted: boolean;
  jsonValid: boolean;
  jsonRecordsHash: string;
  jsonDocumentCount: number;
  jsonRoundCount: number;
  jsonGenerationChangedDuringRecovery: boolean;
  recoveredRecordsHash: string;
  recoveredDocumentCount: number;
  recoveredRoundCount: number;
};

export type HistoryDatabaseRecoverResult = {
  ok: boolean;
  recoveredAt?: string;
  path?: string;
  backupPath?: string;
  backupDir?: string;
  sourceValidation?: HistoryDatabaseCheckResult;
  preRecoveryBackup?: HistoryDatabaseBackupResult | null;
  rawCurrentBackup?: string;
  after?: Record<string, unknown>;
  validation?: HistoryDatabaseCheckResult;
  recoveredBackupAfter?: Record<string, unknown> | null;
  recoveredBackupValidation?: HistoryDatabaseCheckResult | null;
  jsonReconciliationRebuild?: Record<string, unknown>;
  jsonReconciliationValidation?: HistoryDatabaseCheckResult;
  jsonReconciliationAttemptCount?: number;
  reconciliation?: HistoryDatabaseRecoveryReconciliation;
  errorCode?: string;
  error?: string;
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

export type ExportFailureDetails = {
  stage?: string;
  label?: string;
  message: string;
  reportPath?: string;
  issueCount?: number;
  warningCount?: number;
  samples?: ExportIssueSample[];
};

export type ExportResult = {
  format: "txt" | "docx";
  path: string;
  /** Identity of the immutable round generation certified by this export. */
  outputPath?: string;
  docId?: string;
  round?: number;
  compareRevision?: string;
  contentRevision?: string;
  artifactSnapshotDigest?: string;
  evidenceVersion?: number;
  overallStatus?: "passed" | "failed" | "unknown";
  certification?: "plain_uncertified" | "unknown";
  sourceKind?: "original_docx" | "generated_docx" | "plain_text" | "unknown";
  contentContractStatus?: "passed" | "failed" | "unknown" | "not_applicable";
  formatLockStatus?: "passed" | "failed" | "unknown" | "not_applicable";
  checksPerformed?: string[];
  exportAttemptId?: string;
  artifactSha256?: string;
  evidenceManifestPath?: string;
  layoutMode?: string;
  paragraphSource?: string;
  formatMode?: string;
  formatScope?: string;
  validationPath?: string;
  auditPath?: string;
  auditIssueCount?: number;
  ooxmlAuditPath?: string;
  ooxmlAuditIssueCount?: number;
  formatLockPath?: string;
  formatLockIssueCount?: number;
  formatLockEditableChecked?: number;
  contentContractPath?: string;
  contentContractReady?: boolean;
  contentContractIssueCount?: number;
  editableUnitCount?: number;
  protectedUnitCount?: number;
  protectedHeadingCount?: number;
  editableHeadingCount?: number;
  semanticRangeCount?: number;
  bookmarkRangeCount?: number;
  commentRangeCount?: number;
  semanticRangeTopologyValid?: boolean;
  semanticRangeIssueCount?: number;
  semanticRangeAnchorUnitCount?: number;
  protectedSemanticRangeAnchorUnitCount?: number;
  editableSemanticRangeAnchorUnitCount?: number;
  semanticRangeCoveredUnitCount?: number;
  protectedSemanticRangeCoveredUnitCount?: number;
  editableSemanticRangeCoveredUnitCount?: number;
  bookmarkRangeInteriorUnitCount?: number;
  editableBookmarkRangeInteriorUnitCount?: number;
  modelInputMatchesEditableUnits?: boolean;
  guardPath?: string;
  guardIssueCount?: number;
  guardWarningCount?: number;
  guardIssueSamples?: ExportIssueSample[];
  auditIssueSamples?: ExportIssueSample[];
  ooxmlAuditIssueSamples?: ExportIssueSample[];
};

export type ExportRoundOptions = {
  expectedDocId: string;
  expectedRound: number;
  expectedCompareRevision: string;
  expectedContentRevision: string;
  expectedArtifactSnapshotDigest: string;
};

export type OutputPreview = {
  path: string;
  text: string;
  truncated: boolean;
  totalChars: number;
  previewChars: number;
};

export type RoundArtifactSnapshotIdentity = {
  outputPath: string;
  docId: string;
  round: number;
};

export type RoundArtifactSnapshotReview = ReviewDecisionsResult & {
  outputPath: string;
  docId: string;
  round: number;
  updatedAt: string;
  compareRevision: string;
  currentCompareRevision: string;
  reviewBaseCompareRevision: string;
  reviewLinkReady: true;
  reviewLinkStatus: "linked" | "legacy_unversioned" | "none";
};

/**
 * One revision-consistent view of every mutable artifact that defines a round.
 * `effectivePreview` is canonical even when the raw output/body-map materialized
 * artifacts are explicitly reported as stale.
 */
export type RoundArtifactSnapshot = RoundArtifactSnapshotIdentity & {
  version: 1;
  materializationSource: "review_materialized_compare";
  compare: RoundCompareData & { compareRevision: string };
  review: RoundArtifactSnapshotReview;
  effectivePreview: OutputPreview;
  compareRevision: string;
  reviewRevision: string;
  contentRevision: string;
  artifactSnapshotDigest: string;
  compareSha256: string;
  reviewSha256: string | null;
  effectiveTextSha256: string;
  outputSha256: string;
  bodyMapSha256: string | null;
  manifestSha256: string | null;
  rawOutputMatchesEffective: boolean;
  bodyMapMatchesEffective: boolean | null;
};

export type RoundArtifactSnapshotReadOptions = {
  maxChars?: number;
  signal?: AbortSignal;
};
