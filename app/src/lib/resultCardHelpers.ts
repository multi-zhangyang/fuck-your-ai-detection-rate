export type { ExportHealthBadgeVariant, ExportHealthSection } from "@/lib/resultCardExportHealthHelpers";

export {
  buildExportHealthSection,
  formatExportIssueSample,
  getExportIssueVariant,
  formatExportIssueCount,
} from "@/lib/resultCardExportHealthHelpers";

export {
  isReviewChunk,
  getLatestFailedAttempt,
  isHardValidationFallbackChunk,
  isHighRiskFailedOutputChunk,
  getDefaultReviewDecisionForChunk,
  getReviewDecisionMode,
  getDecisionDisplayOutput,
  isReviewDecisionConfirmed,
  isFailedOutputDecision,
} from "@/lib/resultCardReviewHelpers";

export {
  hasTokenDifference,
  hasChunkTextChange,
  extractNumberTokens,
  extractCitationTokens,
  uniqueTokens,
  findMissingTokens,
  normalizeDiffText,
  compactFeedbackText,
  getRiskReasonText,
  formatChunkFlag,
  formatRerunStrategy,
  formatProtectedTypes,
  hasChunkNumberRisk,
  hasChunkCitationRisk,
  getDiffFilterEmptyState,
  getChunkReviewReasons,
  DIFF_STREAM_LABEL,
} from "@/lib/resultCardRiskHelpers";
