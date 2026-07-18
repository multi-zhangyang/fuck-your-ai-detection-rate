import type { PreviousRoundRevisionBinding } from "@/types/app";

export type RoundInputRevisionGateLaunch = {
  sourcePath: string;
  docId: string;
  nextRound: number;
  parentOutputPath: string;
};

export type RoundInputRevisionGeneration = {
  compareRevision: string;
  reviewRevision: string;
  contentRevision: string;
  artifactSnapshotDigest: string;
  effectiveTextSha256: string;
};

export type RoundInputRevisionParentSnapshot =
  | ({ status: "ready" } & RoundInputRevisionGeneration)
  | { status: "stale" };

export type StartRevisionBoundRoundInput = {
  launch: RoundInputRevisionGateLaunch;
  isCurrent: () => boolean;
  flushReviewDecisionSaves: (outputPath: string) => Promise<boolean>;
  loadParentSnapshot: (
    outputPath: string,
    expectedRound: number,
  ) => Promise<RoundInputRevisionParentSnapshot>;
  approvedParentGeneration?: RoundInputRevisionGeneration;
  startRunRound: (binding?: PreviousRoundRevisionBinding) => Promise<string | null>;
  cancelRunRound: (runToken: string) => Promise<void>;
};

function assertCurrent(input: StartRevisionBoundRoundInput, stage: string): void {
  if (!input.isCurrent()) {
    throw new Error(`${stage}期间论文、轮次或本地任务已经切换，未启动旧轮次。`);
  }
}

function requireParentGeneration(
  snapshot: Extract<RoundInputRevisionParentSnapshot, { status: "ready" }>,
): RoundInputRevisionGeneration {
  const generation: RoundInputRevisionGeneration = {
    compareRevision: String(snapshot.compareRevision || "").trim(),
    reviewRevision: String(snapshot.reviewRevision || "").trim().toLowerCase(),
    contentRevision: String(snapshot.contentRevision || "").trim().toLowerCase(),
    artifactSnapshotDigest: String(snapshot.artifactSnapshotDigest || "").trim().toLowerCase(),
    effectiveTextSha256: String(snapshot.effectiveTextSha256 || "").trim().toLowerCase(),
  };
  if (!generation.compareRevision) {
    throw new Error("父轮快照缺少 compare revision，未启动下一轮模型任务。");
  }
  for (const [field, value] of Object.entries(generation).slice(1)) {
    if (!/^[0-9a-f]{64}$/.test(value)) {
      throw new Error(`父轮快照缺少有效的 ${field}，未启动下一轮模型任务。`);
    }
  }
  return generation;
}

function generationsMatch(
  left: RoundInputRevisionGeneration,
  right: RoundInputRevisionGeneration,
): boolean {
  return left.compareRevision === right.compareRevision
    && left.reviewRevision === right.reviewRevision
    && left.contentRevision === right.contentRevision
    && left.artifactSnapshotDigest === right.artifactSnapshotDigest
    && left.effectiveTextSha256 === right.effectiveTextSha256;
}

function toPreviousRoundBinding(
  generation: RoundInputRevisionGeneration,
): PreviousRoundRevisionBinding {
  return {
    expectedPreviousCompareRevision: generation.compareRevision,
    expectedPreviousReviewRevision: generation.reviewRevision,
    expectedPreviousContentRevision: generation.contentRevision,
    expectedPreviousArtifactSnapshotDigest: generation.artifactSnapshotDigest,
    expectedPreviousEffectiveTextSha256: generation.effectiveTextSha256,
  };
}

export async function resolveExpectedPreviousRevisionBinding(
  input: StartRevisionBoundRoundInput,
): Promise<PreviousRoundRevisionBinding | undefined> {
  assertCurrent(input, "启动检查");
  if (input.launch.nextRound <= 1) return undefined;

  const parentOutputPath = String(input.launch.parentOutputPath || "").trim();
  if (!parentOutputPath) {
    throw new Error("下一轮缺少父轮输出路径，未启动模型任务。");
  }
  if (!await input.flushReviewDecisionSaves(parentOutputPath)) {
    throw new Error("父轮审阅决定尚未成功保存，未启动下一轮模型任务。");
  }
  assertCurrent(input, "保存父轮审阅");

  const parentSnapshot = await input.loadParentSnapshot(
    parentOutputPath,
    input.launch.nextRound - 1,
  );
  assertCurrent(input, "读取父轮快照");
  if (parentSnapshot.status !== "ready") {
    throw new Error("父轮快照读取期间审阅代际已经变化，未启动旧轮次。");
  }
  const generation = requireParentGeneration(parentSnapshot);
  if (
    input.approvedParentGeneration
    && !generationsMatch(generation, input.approvedParentGeneration)
  ) {
    throw new Error("RateAudit 批准的父轮代际已变化，未启动下一轮模型任务。");
  }
  return toPreviousRoundBinding(generation);
}

export async function resolveExpectedPreviousCompareRevision(
  input: StartRevisionBoundRoundInput,
): Promise<string | undefined> {
  return (await resolveExpectedPreviousRevisionBinding(input))?.expectedPreviousCompareRevision;
}

/**
 * The only frontend path that may create a new round task.  It keeps all
 * mutable-parent checks before the POST and detaches/cancels a task if the
 * visible intent changes while the POST itself is in flight.
 */
export async function startRevisionBoundRound(
  input: StartRevisionBoundRoundInput,
): Promise<string> {
  const previousRoundBinding = await resolveExpectedPreviousRevisionBinding(input);
  assertCurrent(input, "提交模型任务");
  const runToken = await input.startRunRound(previousRoundBinding);
  if (!runToken) throw new Error("无法创建运行任务。");
  if (!input.isCurrent()) {
    try {
      await input.cancelRunRound(runToken);
    } catch {
      // The task is already detached from this page.  Server-side task state
      // remains authoritative if cancellation races natural completion.
    }
    throw new Error("模型任务创建期间当前论文已经切换，旧任务已请求停止。");
  }
  return runToken;
}
