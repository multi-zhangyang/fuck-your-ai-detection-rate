export type Protocol = "chat_completions" | "responses";
export type ChunkPreset = "fine" | "standard" | "long";
export type ModelProvider = "custom" | "deepseek";
export type ReasoningEffort = "auto" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelProfile {
  id: string;
  provider: ModelProvider;
  builtIn: boolean;
  name: string;
  baseUrl: string;
  apiKey: string;
  hasApiKey?: boolean;
  apiKeyPreview?: string;
  model: string;
  protocol: Protocol;
  reasoningEffort: ReasoningEffort;
  temperature: number | null;
  connectTimeoutSeconds: number;
  firstEventTimeoutSeconds: number;
  idleTimeoutSeconds: number;
  maxRetries: number;
  knownModels?: string[];
  configured?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  builtIn: boolean;
  readOnly: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PromptPlan {
  id: string;
  name: string;
  description: string;
  templateIds: string[];
  builtIn: boolean;
  readOnly: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CoreSettings {
  schemaVersion: number;
  defaultModelProfileId: string;
  defaultPromptPlanId: string;
  modelProfiles: ModelProfile[];
  promptTemplates: PromptTemplate[];
  promptPlans: PromptPlan[];
  preferences: {
    rewriteConcurrency: number;
    protectedTerms: string[];
    chunkPreset: ChunkPreset;
    singleTemplateRounds: number;
  };
}

export interface DocumentParagraph {
  id: string;
  order: number;
  text: string;
  styleId: string;
  styleName?: string;
  outlineLevel?: number | null;
  safe: boolean;
  exclusionReason: string;
  protectionReason?: string;
  suggestedSelected?: boolean;
  suggestionReason?: "body_text" | "before_body_start" | "structural_style" | string;
  selected: boolean;
}

export interface ProtectionReasonSummary {
  reason: string;
  label: string;
  count: number;
}

export interface ProtectionMapSection {
  key: string;
  state: "editable" | "available" | "locked";
  editable: boolean;
  selectable: boolean;
  reason: string;
  label: string;
  startUnit: number;
  endUnit: number;
  count: number;
  samples: string[];
}

export interface ProtectionMapUnit {
  unitIndex: number;
  paragraphId: string;
  state: "editable" | "available" | "locked";
  editable: boolean;
  selectable: boolean;
  reason: string;
  label: string;
  text: string;
  styleId: string;
  styleName: string;
  order: number | null;
}

export interface DocumentProtectionMap {
  available: boolean;
  message: string;
  summary: {
    totalUnits: number;
    editableUnits: number;
    protectedUnits: number;
    availableUnits: number;
    lockedUnits: number;
    tableUnits: number;
    protectionReasons: ProtectionReasonSummary[];
  };
  sections: ProtectionMapSection[];
  units: ProtectionMapUnit[];
}

export interface CoreDocument {
  id: string;
  name: string;
  kind: "docx" | "txt";
  sourceSize: number;
  paragraphs: DocumentParagraph[];
  scopeConfirmed: boolean;
  requiresRangeConfirmation: boolean;
  latestRunId: string;
  suggestionBasis?: "toc_field" | "section_heading" | "structure_unclear" | string;
  suggestionMessage?: string;
  suggestionStartBodyChildIndex?: number | null;
  selectedCount: number;
  safeCount: number;
  excludedCount: number;
  protectionMap: DocumentProtectionMap;
  hasDigitalSignature?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RewriteWarning {
  category: string;
  label: string;
  removed: string[];
  added: string[];
  message: string;
}

export type ChunkStatus = "pending" | "running" | "completed" | "paused" | "cancelled";

export interface RunChunk {
  id: string;
  paragraphId: string;
  partIndex: number;
  partCount: number;
  status: ChunkStatus;
  stepIndex: number;
  originalText: string;
  finalText: string;
  joinerBefore: string;
  boundaryBefore: "start" | "sentence" | "line_break" | "whitespace" | "clause" | "hard" | "direct" | string;
  streamText: string;
  revision: number;
  error: string;
}

export type ReviewChoice = "rewrite" | "original" | "manual";

export interface RunParagraph {
  paragraphId: string;
  order: number;
  originalText: string;
  rewrittenText: string;
  partialText: string;
  complete: boolean;
  status: ChunkStatus;
  error: string;
  warnings: RewriteWarning[];
  warningCheckError?: string;
  decision: { decision: ReviewChoice; text: string };
  chunkIds: string[];
}

export interface CoreRun {
  id: string;
  documentId: string;
  status: "queued" | "running" | "cancelling" | "paused" | "cancelled" | "completed";
  message: string;
  progress: {
    completed: number;
    total: number;
    percent: number;
    completedChunks: number;
    totalChunks: number;
  };
  snapshot: {
    document: { id: string; name: string; kind: "docx" | "txt"; selectedParagraphIds: string[] };
    modelProfile: ModelProfile;
    promptPlan: { id: string; name: string; steps: Array<{ templateId: string; name: string }> };
    chunking: {
      preset: ChunkPreset;
      limits: Record<string, { keep: number; target: number; hard: number; minTail: number }>;
    };
    repeatCount: number;
    concurrency: number;
    protectedTerms: string[];
  };
  chunks: RunChunk[];
  paragraphs: RunParagraph[];
  formatAudit?: FormatAudit | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
}

export interface FormatAudit {
  passed: boolean;
  status: "passed" | "warning";
  forceExported: boolean;
  message: string;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
}

export interface RunEvent {
  id: number;
  type: string;
  at: string;
  chunkId?: string;
  stepIndex?: number;
  revision?: number;
  text?: string;
  status?: string;
  message?: string;
}

export interface RecentDocument {
  id: string;
  name: string;
  kind: "docx" | "txt";
  latestRunId: string;
  latestRunStatus?: CoreRun["status"] | "";
  latestRunProgress?: { completed: number; total: number };
  canResume?: boolean;
  canExport?: boolean;
  selectedCount: number;
  safeCount: number;
  excludedCount: number;
  createdAt: string;
  updatedAt: string;
  lastExportAt?: string;
}

export interface WarningSummary {
  count: number;
  categories: Record<string, number>;
  warnings: Array<RewriteWarning & { paragraphId: string }>;
  message: string;
  formatAudit?: FormatAudit;
  incompleteParagraphIds?: string[];
  requires?: {
    acknowledgeWarnings: boolean;
    forceFormatRisk: boolean;
    useOriginalForIncomplete: boolean;
  };
}
