export function isStaleReviewDecisionSaveError(error: unknown): boolean {
  const candidate = error as {
    status?: unknown;
    payload?: { code?: unknown } | null;
  } | null;
  return candidate?.status === 409 && candidate.payload?.code === "stale_review_decisions";
}

export function isDocumentReleaseGateError(error: unknown): boolean {
  const candidate = error as {
    status?: unknown;
    payload?: { code?: unknown } | null;
  } | null;
  return candidate?.status === 409 && candidate.payload?.code === "document_release_gate_failed";
}

export function isTerminalReviewDecisionSaveError(error: unknown): boolean {
  const candidate = error as {
    status?: unknown;
    payload?: { code?: unknown } | null;
  } | null;
  return isStaleReviewDecisionSaveError(error)
    || isDocumentReleaseGateError(error)
    || (candidate?.status === 428 && candidate.payload?.code === "review_revision_required")
    || (candidate?.status === 409 && candidate.payload?.code === "review_state_inconsistent");
}
