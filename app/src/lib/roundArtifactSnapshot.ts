import type {
  OutputPreview,
  ReviewDecision,
  RoundArtifactSnapshot,
  RoundArtifactSnapshotIdentity,
} from "@/types/app";

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const LEGACY_COMPARE_REVISION_RE = /^sha256:[0-9a-f]{64}$/;

type JsonObject = Record<string, unknown>;

export class RoundArtifactSnapshotValidationError extends Error {
  readonly code = "invalid_round_artifact_snapshot";
  readonly field: string;

  constructor(field: string, message: string) {
    super(`轮次快照无效（${field}）：${message}`);
    this.name = "RoundArtifactSnapshotValidationError";
    this.field = field;
  }
}

function fail(field: string, message: string): never {
  throw new RoundArtifactSnapshotValidationError(field, message);
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requireObject(value: unknown, field: string): JsonObject {
  if (!isJsonObject(value)) fail(field, "必须是对象");
  return value;
}

function requireString(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== "string") fail(field, "必须是字符串");
  if (!allowEmpty && !value.trim()) fail(field, "不能为空");
  return value;
}

function requireInteger(value: unknown, field: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    fail(field, `必须是大于或等于 ${minimum} 的安全整数`);
  }
  return Number(value);
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") fail(field, "必须是布尔值");
  return value;
}

function requireSha256(value: unknown, field: string): string {
  const digest = requireString(value, field);
  if (!SHA256_HEX_RE.test(digest)) fail(field, "必须是 64 位小写 SHA-256 十六进制摘要");
  return digest;
}

function requireNullableSha256(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requireSha256(value, field);
}

function requireCompareRevision(value: unknown, field: string): string {
  const revision = requireString(value, field);
  if (revision !== revision.trim()) fail(field, "不能包含首尾空白");
  if (revision.startsWith("sha256:") && !LEGACY_COMPARE_REVISION_RE.test(revision)) {
    fail(field, "legacy revision 必须是 sha256: 加 64 位小写十六进制摘要");
  }
  return revision;
}

export function normalizeRoundArtifactPath(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

/** Accept canonical absolute paths and their workspace-relative equivalent. */
export function roundArtifactPathsMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const normalizedLeft = normalizeRoundArtifactPath(left);
  const normalizedRight = normalizeRoundArtifactPath(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight
    || normalizedLeft.endsWith(`/${normalizedRight}`)
    || normalizedRight.endsWith(`/${normalizedLeft}`);
}

function requireMatchingPath(
  value: unknown,
  expected: string,
  field: string,
): string {
  const path = requireString(value, field);
  if (!roundArtifactPathsMatch(path, expected)) {
    fail(field, "与轮次 outputPath 不一致");
  }
  return path;
}

function validateReviewDecision(value: unknown, field: string): asserts value is ReviewDecision {
  if (
    value === "rewrite"
    || value === "source"
    || value === "rewrite_confirmed"
    || value === "source_confirmed"
  ) {
    return;
  }
  const decision = requireObject(value, field);
  if (decision.mode !== "custom") fail(`${field}.mode`, "只允许 custom");
  requireString(decision.text, `${field}.text`, true);
  if (decision.confirmed !== undefined && typeof decision.confirmed !== "boolean") {
    fail(`${field}.confirmed`, "必须是布尔值");
  }
  if (decision.attempt !== undefined) requireInteger(decision.attempt, `${field}.attempt`, 0);
  for (const optionalStringField of ["source", "error"] as const) {
    if (decision[optionalStringField] !== undefined) {
      requireString(decision[optionalStringField], `${field}.${optionalStringField}`, true);
    }
  }
}

function validateCompare(
  value: unknown,
  identity: RoundArtifactSnapshotIdentity,
  compareRevision: string,
): JsonObject {
  const compare = requireObject(value, "compare");
  requireInteger(compare.version, "compare.version", 1);
  requireString(compare.docId, "compare.docId");
  requireInteger(compare.round, "compare.round", 1);
  requireMatchingPath(compare.outputPath, identity.outputPath, "compare.outputPath");
  if (compare.docId !== identity.docId) fail("compare.docId", "与顶层 docId 不一致");
  if (compare.round !== identity.round) fail("compare.round", "与顶层 round 不一致");
  requireString(compare.promptProfile, "compare.promptProfile");
  requireString(compare.inputPath, "compare.inputPath");
  requireString(compare.manifestPath, "compare.manifestPath", true);
  requireInteger(compare.paragraphCount, "compare.paragraphCount", 0);
  const chunkCount = requireInteger(compare.chunkCount, "compare.chunkCount", 0);
  if (!Array.isArray(compare.chunks)) fail("compare.chunks", "必须是数组");
  if (compare.chunks.length !== chunkCount) fail("compare.chunkCount", "与 chunks 长度不一致");

  const seenChunkIds = new Set<string>();
  compare.chunks.forEach((candidate, index) => {
    const chunk = requireObject(candidate, `compare.chunks[${index}]`);
    const chunkId = requireString(chunk.chunkId, `compare.chunks[${index}].chunkId`);
    if (seenChunkIds.has(chunkId)) fail(`compare.chunks[${index}].chunkId`, "不能重复");
    seenChunkIds.add(chunkId);
    requireInteger(chunk.paragraphIndex, `compare.chunks[${index}].paragraphIndex`, 0);
    requireInteger(chunk.chunkIndex, `compare.chunks[${index}].chunkIndex`, 0);
    requireString(chunk.inputText, `compare.chunks[${index}].inputText`, true);
    requireString(chunk.outputText, `compare.chunks[${index}].outputText`, true);
  });

  const nestedRevision = requireCompareRevision(compare.compareRevision, "compare.compareRevision");
  if (nestedRevision !== compareRevision) {
    fail("compare.compareRevision", "与顶层 compareRevision 不一致");
  }
  if (compare.updatedAt !== undefined && compare.updatedAt !== null) {
    const updatedAt = requireString(compare.updatedAt, "compare.updatedAt", true);
    if (updatedAt && updatedAt !== compareRevision) {
      fail("compare.updatedAt", "与顶层 compareRevision 不一致");
    }
  }
  if (compare.reviewUpdatedAt !== undefined && compare.reviewUpdatedAt !== null) {
    requireString(compare.reviewUpdatedAt, "compare.reviewUpdatedAt", true);
  }
  return compare;
}

function validateReview(
  value: unknown,
  identity: RoundArtifactSnapshotIdentity,
  compareRevision: string,
  compare: JsonObject,
): JsonObject {
  const review = requireObject(value, "review");
  requireString(review.path, "review.path", true);
  requireMatchingPath(review.outputPath, identity.outputPath, "review.outputPath");
  requireString(review.docId, "review.docId");
  requireInteger(review.round, "review.round", 1);
  if (review.docId !== identity.docId) fail("review.docId", "与顶层 docId 不一致");
  if (review.round !== identity.round) fail("review.round", "与顶层 round 不一致");

  const decisions = requireObject(review.decisions, "review.decisions");
  const chunkIds = new Set(
    (compare.chunks as JsonObject[]).map((chunk) => String(chunk.chunkId)),
  );
  for (const [chunkId, decision] of Object.entries(decisions)) {
    if (!chunkIds.has(chunkId)) fail(`review.decisions.${chunkId}`, "不属于当前 compare");
    validateReviewDecision(decision, `review.decisions.${chunkId}`);
  }

  const aliasRevision = requireCompareRevision(review.compareRevision, "review.compareRevision");
  const currentRevision = requireCompareRevision(
    review.currentCompareRevision,
    "review.currentCompareRevision",
  );
  if (aliasRevision !== compareRevision || currentRevision !== compareRevision) {
    fail("review.currentCompareRevision", "与顶层 compareRevision 链不一致");
  }
  const baseRevision = requireString(
    review.reviewBaseCompareRevision,
    "review.reviewBaseCompareRevision",
    true,
  );
  if (baseRevision) {
    requireCompareRevision(baseRevision, "review.reviewBaseCompareRevision");
  }
  const updatedAt = requireString(review.updatedAt, "review.updatedAt", true);
  if (review.reviewLinkReady !== true) fail("review.reviewLinkReady", "必须明确为 true");

  const linkStatus = requireString(review.reviewLinkStatus, "review.reviewLinkStatus");
  if (!(["linked", "legacy_unversioned", "none"] as const).includes(linkStatus as never)) {
    fail("review.reviewLinkStatus", "必须是 linked、legacy_unversioned 或 none");
  }
  const compareReviewUpdatedAt = typeof compare.reviewUpdatedAt === "string"
    ? compare.reviewUpdatedAt
    : "";
  if (linkStatus === "linked" && (!updatedAt || compareReviewUpdatedAt !== updatedAt)) {
    fail("review.updatedAt", "linked 状态必须与 compare.reviewUpdatedAt 一致");
  }
  if (linkStatus === "none") {
    if (updatedAt || compareReviewUpdatedAt) {
      fail("review.reviewLinkStatus", "none 状态不能携带已联结 revision");
    }
    if (Object.keys(decisions).length > 0) {
      fail("review.decisions", "none 状态不能携带审阅决定");
    }
  }
  return review;
}

function validateEffectivePreview(value: unknown, outputPath: string): OutputPreview {
  const preview = requireObject(value, "effectivePreview");
  requireMatchingPath(preview.path, outputPath, "effectivePreview.path");
  requireString(preview.text, "effectivePreview.text", true);
  const truncated = requireBoolean(preview.truncated, "effectivePreview.truncated");
  const totalChars = requireInteger(preview.totalChars, "effectivePreview.totalChars", 0);
  const previewChars = requireInteger(preview.previewChars, "effectivePreview.previewChars", 0);
  // The backend appends a localized truncation marker, so previewChars may be
  // greater than totalChars for a very small maxChars limit.
  if (truncated ? totalChars === 0 || previewChars === 0 : previewChars !== totalChars) {
    fail("effectivePreview.truncated", "与 previewChars/totalChars 不一致");
  }
  return preview as unknown as OutputPreview;
}

export type RoundArtifactSnapshotValidationOptions = {
  expectedOutputPath?: string;
};

/** Validate an untrusted HTTP payload before it can enter application state. */
export function validateRoundArtifactSnapshot(
  value: unknown,
  options: RoundArtifactSnapshotValidationOptions = {},
): RoundArtifactSnapshot {
  const snapshot = requireObject(value, "snapshot");
  if (snapshot.version !== 1) fail("version", "当前只支持版本 1");
  if (snapshot.materializationSource !== "review_materialized_compare") {
    fail("materializationSource", "必须来自 review_materialized_compare");
  }

  const outputPath = requireString(snapshot.outputPath, "outputPath");
  if (
    options.expectedOutputPath
    && !roundArtifactPathsMatch(outputPath, options.expectedOutputPath)
  ) {
    fail("outputPath", "与请求的 outputPath 不一致");
  }
  const identity: RoundArtifactSnapshotIdentity = {
    outputPath,
    docId: requireString(snapshot.docId, "docId"),
    round: requireInteger(snapshot.round, "round", 1),
  };
  const compareRevision = requireCompareRevision(snapshot.compareRevision, "compareRevision");
  const compare = validateCompare(snapshot.compare, identity, compareRevision);
  const review = validateReview(snapshot.review, identity, compareRevision, compare);
  validateEffectivePreview(snapshot.effectivePreview, outputPath);

  const reviewRevision = requireSha256(snapshot.reviewRevision, "reviewRevision");
  requireSha256(snapshot.contentRevision, "contentRevision");
  requireSha256(snapshot.artifactSnapshotDigest, "artifactSnapshotDigest");
  const compareSha256 = requireSha256(snapshot.compareSha256, "compareSha256");
  const reviewSha256 = requireNullableSha256(snapshot.reviewSha256, "reviewSha256");
  if (
    compareRevision.startsWith("sha256:")
    && compareRevision !== `sha256:${compareSha256}`
  ) {
    fail("compareSha256", "与 legacy compareRevision 不一致");
  }
  const reviewLinkStatus = String(review.reviewLinkStatus);
  if (reviewLinkStatus === "none" ? reviewSha256 !== null : reviewSha256 === null) {
    fail("reviewSha256", "必须与 reviewLinkStatus 的 sidecar 状态一致");
  }
  if (reviewSha256 !== null && reviewSha256 !== reviewRevision) {
    fail("reviewRevision", "必须与 review sidecar 摘要一致");
  }
  requireSha256(snapshot.effectiveTextSha256, "effectiveTextSha256");
  requireSha256(snapshot.outputSha256, "outputSha256");
  const bodyMapSha256 = requireNullableSha256(snapshot.bodyMapSha256, "bodyMapSha256");
  requireNullableSha256(snapshot.manifestSha256, "manifestSha256");
  requireBoolean(snapshot.rawOutputMatchesEffective, "rawOutputMatchesEffective");
  const bodyMapMatchesEffective = snapshot.bodyMapMatchesEffective === null
    ? null
    : requireBoolean(snapshot.bodyMapMatchesEffective, "bodyMapMatchesEffective");
  if ((bodyMapSha256 === null) !== (bodyMapMatchesEffective === null)) {
    fail("bodyMapMatchesEffective", "必须与 bodyMapSha256 的存在状态一致");
  }

  return snapshot as unknown as RoundArtifactSnapshot;
}

export function getRoundArtifactSnapshotIdentity(
  snapshot: Pick<RoundArtifactSnapshot, "outputPath" | "docId" | "round">,
): RoundArtifactSnapshotIdentity {
  return {
    outputPath: snapshot.outputPath,
    docId: snapshot.docId,
    round: snapshot.round,
  };
}

export function roundArtifactSnapshotIdentityMatches(
  left: RoundArtifactSnapshotIdentity | null | undefined,
  right: RoundArtifactSnapshotIdentity | null | undefined,
): boolean {
  return Boolean(
    left
    && right
    && roundArtifactPathsMatch(left.outputPath, right.outputPath)
    && left.docId === right.docId
    && left.round === right.round,
  );
}

export type RoundArtifactSnapshotIntent = {
  epoch: number;
  identity: RoundArtifactSnapshotIdentity;
};

export type RoundArtifactSnapshotIntentRef = {
  current: RoundArtifactSnapshotIntent | null;
};

/** Every request receives a fresh epoch, including refreshes of one identity. */
export function nextRoundArtifactSnapshotIntent(
  current: RoundArtifactSnapshotIntent | null | undefined,
  identity: RoundArtifactSnapshotIdentity,
): RoundArtifactSnapshotIntent {
  const round = requireInteger(identity.round, "intent.identity.round", 1);
  const docId = requireString(identity.docId, "intent.identity.docId");
  const outputPath = requireString(identity.outputPath, "intent.identity.outputPath");
  const priorEpoch = current?.epoch ?? 0;
  if (!Number.isSafeInteger(priorEpoch) || priorEpoch < 0 || priorEpoch >= Number.MAX_SAFE_INTEGER) {
    fail("intent.epoch", "无法继续递增");
  }
  return {
    epoch: priorEpoch + 1,
    identity: { outputPath, docId, round },
  };
}

/**
 * Register a request before any I/O starts.  Keeping this mutation in one
 * helper makes it much harder for a caller to accidentally assign its epoch
 * only after a slow response has already arrived.
 */
export function beginRoundArtifactSnapshotIntent(
  intentRef: RoundArtifactSnapshotIntentRef,
  identity: RoundArtifactSnapshotIdentity,
): RoundArtifactSnapshotIntent {
  const requestIntent = nextRoundArtifactSnapshotIntent(intentRef.current, identity);
  intentRef.current = requestIntent;
  return requestIntent;
}

/** Invalidate every in-flight read when the visible document is cleared/switched. */
export function invalidateRoundArtifactSnapshotIntent(
  intentRef: RoundArtifactSnapshotIntentRef,
): void {
  if (!intentRef.current) return;
  intentRef.current = nextRoundArtifactSnapshotIntent(
    intentRef.current,
    intentRef.current.identity,
  );
}

export function roundArtifactSnapshotRevisionMatches(
  snapshot: Pick<RoundArtifactSnapshot, "compareRevision">,
  expectedCompareRevision: string | null | undefined,
): boolean {
  const expected = String(expectedCompareRevision ?? "").trim();
  return !expected || snapshot.compareRevision === expected;
}

export function canCommitRoundArtifactSnapshot(
  requestIntent: RoundArtifactSnapshotIntent | null | undefined,
  currentIntent: RoundArtifactSnapshotIntent | null | undefined,
  snapshot: RoundArtifactSnapshot,
): boolean {
  return Boolean(
    requestIntent
    && currentIntent
    && requestIntent.epoch === currentIntent.epoch
    && roundArtifactSnapshotIdentityMatches(requestIntent.identity, currentIntent.identity)
    && roundArtifactSnapshotIdentityMatches(
      requestIntent.identity,
      getRoundArtifactSnapshotIdentity(snapshot),
    ),
  );
}

export type RoundArtifactSnapshotCommitGuard =
  | { status: "ready"; snapshot: RoundArtifactSnapshot }
  | { status: "stale" };

export function guardRoundArtifactSnapshotCommit(
  requestIntent: RoundArtifactSnapshotIntent | null | undefined,
  currentIntent: RoundArtifactSnapshotIntent | null | undefined,
  snapshot: RoundArtifactSnapshot,
  options: { expectedCompareRevision?: string | null } = {},
): RoundArtifactSnapshotCommitGuard {
  return canCommitRoundArtifactSnapshot(requestIntent, currentIntent, snapshot)
    && roundArtifactSnapshotRevisionMatches(snapshot, options.expectedCompareRevision)
    ? { status: "ready", snapshot }
    : { status: "stale" };
}

/** Never substitute raw output when its materialized artifact is stale. */
export function selectRoundArtifactEffectivePreview(
  snapshot: RoundArtifactSnapshot,
): OutputPreview {
  return snapshot.effectivePreview;
}
