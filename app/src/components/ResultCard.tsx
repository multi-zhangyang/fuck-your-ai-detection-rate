import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Download, FileOutput, RotateCcw, SplitSquareHorizontal } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CustomReviewDecision, DetectionReportMatch, ExportResult, OutputPreview, ReviewDecision, RoundCompareData, RoundResult } from "@/types/app";

const T = {
  noResult: "还没有结果",
  liveRunning: "运行中",
  checkpointIncomplete: "断点未完成",
  diff: "改写对照",
  showAll: "显示全部",
  noReviewChunks: "暂无需处理块",
  failedChunks: "重跑失败",
  noFailedChunks: "暂无重跑失败块",
  highRisk: "高风险",
  noHighRiskChunks: "暂无高风险块",
  changedChunks: "新增/删除",
  numberRisk: "数字风险",
  citationRisk: "引用风险",
  rerunFailure: "重跑失败",
  source: "原文",
  rewrite: "改写",
  highRiskRewrite: "高风险改写",
  risk: "表达提示",
  needsReview: "需处理",
  stable: "稳定",
  expansion: "扩写比",
  citationMissing: "引用缺失",
  protectedTokens: "结构锁定",
  useRewrite: "采用改写",
  useSource: "保留原文",
  defaultChoice: "默认采用",
  confirmedChoice: "已确认",
  rerunRisky: "重跑需处理",
  rerunStrategy: "策略",
  reviewReason: "原因",
  targetedRerun: "定向重跑",
  feedbackPlaceholder: "补充重跑要求（可选）",
  lastFeedback: "上次意见",
  sourceFallback: "保留原文",
  customChoice: "人工修改",
};

const diffScrollPositions = new Map<string, number>();

export type DiffFilterMode = "all" | "review" | "highRisk" | "failed";
export type DiffFocusRequest = {
  filterMode: DiffFilterMode;
  chunkId?: string;
  nonce: number;
};

type RerunFailure = {
  chunkId: string;
  error: string;
  failedAttempts?: RoundCompareData["chunks"][number]["failedAttempts"];
  rerunStatus?: string;
  rerunFallbackMode?: string;
  rerunFallbackError?: string;
  quality?: RoundCompareData["chunks"][number]["quality"];
};

type Props = {
  result: RoundResult | null;
  preview: OutputPreview | null;
  compareData: RoundCompareData | null;
  exportResult: ExportResult | null;
  busy: boolean;
  rerunFailures?: RerunFailure[];
  detectionMatchesByChunk?: Record<string, DetectionReportMatch[]>;
  diffFocusRequest?: DiffFocusRequest | null;
  reviewDecisions: Record<string, ReviewDecision>;
  onReviewDecisionChange: (chunkId: string, decision: ReviewDecision) => void;
  onRerunChunk: (chunkId: string, userFeedback?: string) => void;
  onRerunRiskyChunks: () => void;
  batchRerunRunning?: boolean;
  batchRerunStatusText?: string;
  onCancelBatchRerun?: () => void;
  onExportTxt: () => void;
  onExportDocx: () => void;
  roundRunning?: boolean;
  checkpointPending?: boolean;
};

export function ResultCard({ result, compareData, busy, reviewDecisions, onRerunRiskyChunks, batchRerunRunning = false, batchRerunStatusText = "", onCancelBatchRerun, onExportTxt, onExportDocx, roundRunning = false, checkpointPending = false }: Props) {
  const hasOutput = Boolean(result || compareData?.chunks.length);
  const outputReady = Boolean((result?.outputPath || compareData?.outputPath) && !checkpointPending);
  return (
    <Card className={cn("flex h-auto min-h-[8rem] w-full shrink-0 flex-col overflow-hidden border-border bg-card shadow-sm", hasOutput && "min-h-0")}>
      <CardHeader className="shrink-0 border-b border-border bg-card px-5 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">输出与导出</CardTitle>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-visible px-5 pb-4 pt-3">
        {batchRerunRunning ? (
          <Alert variant="destructive" className="shrink-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <AlertTitle>批量重跑进行中</AlertTitle>
                <AlertDescription className="text-xs font-semibold opacity-85">
                  {batchRerunStatusText || "正在处理需重跑块；已完成的块会实时保留。"}
                </AlertDescription>
              </div>
              <Button size="sm" variant="destructive" onClick={onCancelBatchRerun}>停止重跑</Button>
            </div>
          </Alert>
        ) : null}
        {hasOutput ? (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button className="h-11 min-w-40 px-4" onClick={onExportDocx} disabled={!outputReady || busy}>
                <Download data-icon="inline-start" />
                导出 Word
              </Button>
              <Button className="h-11 min-w-28 px-4" variant="outline" onClick={onExportTxt} disabled={!outputReady || busy}>
                <Download data-icon="inline-start" />
                TXT
              </Button>
              <Button className="h-11 min-w-40 px-4" variant="outline" onClick={onRerunRiskyChunks} disabled={!outputReady || !compareData?.chunks.some((chunk) => chunk.quality?.needsReview && !isReviewDecisionConfirmed(reviewDecisions[chunk.chunkId] ?? "rewrite")) || busy}>
                {T.rerunRisky}
              </Button>
            </div>

            {!result ? <LiveHint running={roundRunning} /> : null}
          </>
        ) : (
          <Empty className="min-h-0 flex-1 border bg-background/70">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileOutput />
                </EmptyMedia>
                <EmptyTitle>{T.noResult}</EmptyTitle>
              </EmptyHeader>
            </Empty>
        )}
      </CardContent>
    </Card>
  );
}

export function DiffReviewCard({ result, compareData, busy, rerunFailures = [], detectionMatchesByChunk = {}, diffFocusRequest = null, reviewDecisions, onReviewDecisionChange, onRerunChunk, onRerunRiskyChunks, batchRerunRunning = false, batchRerunStatusText = "", onCancelBatchRerun }: Pick<Props, "result" | "compareData" | "busy" | "rerunFailures" | "detectionMatchesByChunk" | "diffFocusRequest" | "reviewDecisions" | "onReviewDecisionChange" | "onRerunChunk" | "onRerunRiskyChunks" | "batchRerunRunning" | "batchRerunStatusText" | "onCancelBatchRerun">) {
  return (
    <Card className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-border bg-card shadow-sm">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 pb-4 pt-3">
        {batchRerunRunning ? (
          <Alert variant="destructive" className="shrink-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <AlertTitle>批量重跑进行中</AlertTitle>
                <AlertDescription className="text-xs font-semibold opacity-85">
                  {batchRerunStatusText || "正在处理需重跑块；已完成的块会实时保留。"}
                </AlertDescription>
              </div>
              <Button size="sm" variant="destructive" onClick={onCancelBatchRerun}>停止重跑</Button>
            </div>
          </Alert>
        ) : null}
        <RewriteDiffPanel data={compareData} busy={busy} rerunFailures={rerunFailures} detectionMatchesByChunk={detectionMatchesByChunk} diffFocusRequest={diffFocusRequest} reviewDecisions={reviewDecisions} onReviewDecisionChange={onReviewDecisionChange} onRerunChunk={onRerunChunk} />
      </CardContent>
    </Card>
  );
}

function RewriteDiffPanel({ data, busy, rerunFailures, detectionMatchesByChunk, diffFocusRequest, reviewDecisions, onReviewDecisionChange, onRerunChunk }: { data: RoundCompareData | null; busy: boolean; rerunFailures: RerunFailure[]; detectionMatchesByChunk: Record<string, DetectionReportMatch[]>; diffFocusRequest: DiffFocusRequest | null; reviewDecisions: Record<string, ReviewDecision>; onReviewDecisionChange: (chunkId: string, decision: ReviewDecision) => void; onRerunChunk: (chunkId: string, userFeedback?: string) => void }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const chunkRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const restoredKeyRef = useRef("");
  const previousChunkCountRef = useRef(0);
  const previousFailedCountRef = useRef(0);
  const handledDiffFocusNonceRef = useRef<number | null>(null);
  const [filterMode, setFilterMode] = useState<DiffFilterMode>("all");
  const [focusedReviewIndex, setFocusedReviewIndex] = useState(-1);

  const allChunks = data?.chunks ?? [];
  const rerunFailureByChunk = new Map(rerunFailures.map((failure) => [failure.chunkId, failure]));
  const failedChunkIds = allChunks.filter((chunk) => rerunFailureByChunk.has(chunk.chunkId) && !isReviewDecisionConfirmed(reviewDecisions[chunk.chunkId] ?? getDefaultReviewDecisionForChunk(chunk))).map((chunk) => chunk.chunkId);
  const failedChunkIdSet = new Set(failedChunkIds);
  const highRiskChunkIds = allChunks
    .filter((chunk) => !failedChunkIdSet.has(chunk.chunkId) && isHighRiskFailedOutputChunk(chunk) && !isReviewDecisionConfirmed(reviewDecisions[chunk.chunkId] ?? getDefaultReviewDecisionForChunk(chunk)))
    .map((chunk) => chunk.chunkId);
  const highRiskChunkIdSet = new Set(highRiskChunkIds);
  const changedChunkIds = allChunks.filter((chunk) => hasChunkTextChange(chunk)).map((chunk) => chunk.chunkId);
  const changedChunkIdSet = new Set(changedChunkIds);
  const numberRiskChunkIds = allChunks.filter((chunk) => hasChunkNumberRisk(chunk)).map((chunk) => chunk.chunkId);
  const numberRiskChunkIdSet = new Set(numberRiskChunkIds);
  const citationRiskChunkIds = allChunks.filter((chunk) => hasChunkCitationRisk(chunk)).map((chunk) => chunk.chunkId);
  const citationRiskChunkIdSet = new Set(citationRiskChunkIds);
  const reviewChunkIds = allChunks
    .filter((chunk) => !failedChunkIdSet.has(chunk.chunkId) && !highRiskChunkIdSet.has(chunk.chunkId) && !isReviewDecisionConfirmed(reviewDecisions[chunk.chunkId] ?? getDefaultReviewDecisionForChunk(chunk)) && isReviewChunk(chunk, detectionMatchesByChunk[chunk.chunkId] ?? []))
    .map((chunk) => chunk.chunkId);
  const reviewChunkIdSet = new Set(reviewChunkIds);
  const shownChunks = filterMode === "failed"
    ? allChunks.filter((chunk) => failedChunkIdSet.has(chunk.chunkId))
    : filterMode === "highRisk"
      ? allChunks.filter((chunk) => highRiskChunkIdSet.has(chunk.chunkId))
    : filterMode === "review"
      ? allChunks.filter((chunk) => reviewChunkIdSet.has(chunk.chunkId))
      : allChunks;
  const focusedChunkId = focusedReviewIndex >= 0 ? reviewChunkIds[focusedReviewIndex] : "";
  const baseScrollKey = data ? data.outputPath || `${data.docId}-${data.round}` : "empty";
  const scrollKey = `${baseScrollKey}:${filterMode}`;
  const chunkCount = shownChunks.length;
  const emptyState = getDiffFilterEmptyState(filterMode);
  const getFirstChunkIdForMode = (mode: DiffFilterMode) => {
    if (mode === "failed") return failedChunkIds[0] ?? "";
    if (mode === "highRisk") return highRiskChunkIds[0] ?? "";
    if (mode === "review") return reviewChunkIds[0] ?? "";
    return shownChunks[0]?.chunkId ?? allChunks[0]?.chunkId ?? "";
  };

  useEffect(() => {
    if (focusedReviewIndex >= reviewChunkIds.length) {
      setFocusedReviewIndex(reviewChunkIds.length ? reviewChunkIds.length - 1 : -1);
    }
  }, [focusedReviewIndex, reviewChunkIds.length]);

  useEffect(() => {
    const previousFailedCount = previousFailedCountRef.current;
    if (failedChunkIds.length > previousFailedCount) {
      setFilterMode("failed");
      setFocusedReviewIndex(-1);
    } else if (failedChunkIds.length === 0 && filterMode === "failed") {
      setFilterMode("all");
    } else if (highRiskChunkIds.length === 0 && filterMode === "highRisk") {
      setFilterMode("all");
    }
    previousFailedCountRef.current = failedChunkIds.length;
  }, [failedChunkIds.length, filterMode, highRiskChunkIds.length]);

  useEffect(() => {
    if (!diffFocusRequest || !allChunks.length) {
      return;
    }
    setFilterMode(diffFocusRequest.filterMode);
    setFocusedReviewIndex(-1);
  }, [allChunks.length, diffFocusRequest?.filterMode, diffFocusRequest?.nonce]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node || !shownChunks.length) {
      return;
    }
    const savedTop = diffScrollPositions.get(scrollKey) ?? 0;
    if (restoredKeyRef.current !== scrollKey) {
      node.scrollTop = savedTop;
      restoredKeyRef.current = scrollKey;
      previousChunkCountRef.current = chunkCount;
      return;
    }
  }, [chunkCount, shownChunks.length, scrollKey]);

  useEffect(() => {
    const node = scrollRef.current;
    const previousCount = previousChunkCountRef.current;
    if (!node || restoredKeyRef.current !== scrollKey || chunkCount <= previousCount) {
      previousChunkCountRef.current = chunkCount;
      return;
    }
    if (filterMode === "all") {
      node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
      diffScrollPositions.set(scrollKey, node.scrollHeight);
    }
    previousChunkCountRef.current = chunkCount;
  }, [chunkCount, filterMode, scrollKey]);

  useLayoutEffect(() => {
    if (!diffFocusRequest || diffFocusRequest.filterMode !== filterMode) {
      return;
    }
    if (handledDiffFocusNonceRef.current === diffFocusRequest.nonce) {
      return;
    }
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    handledDiffFocusNonceRef.current = diffFocusRequest.nonce;
    const frame = window.requestAnimationFrame(() => {
      const targetId = diffFocusRequest.chunkId || getFirstChunkIdForMode(diffFocusRequest.filterMode);
      const targetNode = targetId ? chunkRefs.current[targetId] : null;
      if (targetNode) {
        targetNode.scrollIntoView({ behavior: "smooth", block: "start" });
        const reviewIndex = reviewChunkIds.indexOf(targetId);
        setFocusedReviewIndex(reviewIndex);
        return;
      }
      node.scrollTo({ top: 0, behavior: "smooth" });
      diffScrollPositions.set(scrollKey, 0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chunkCount, diffFocusRequest?.chunkId, diffFocusRequest?.filterMode, diffFocusRequest?.nonce, filterMode, reviewChunkIds, scrollKey]);

  useEffect(() => {
    return () => {
      const node = scrollRef.current;
      if (node) {
        diffScrollPositions.set(scrollKey, node.scrollTop);
      }
    };
  }, [scrollKey]);

  if (!allChunks.length) {
    return (
      <Empty className="min-h-0 flex-1 border bg-background/70">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SplitSquareHorizontal />
                </EmptyMedia>
                <EmptyTitle>{T.diff}</EmptyTitle>
              </EmptyHeader>
            </Empty>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="sticky top-0 z-20 shrink-0 border-b border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2 overflow-x-auto overflow-y-hidden pb-1">
          <span className="flex items-center gap-2 text-sm font-black text-foreground">
            <SplitSquareHorizontal className="size-4 text-primary" />
            {T.diff}
          </span>
          <Badge variant="outline">{shownChunks.length}/{data?.chunkCount ?? allChunks.length}</Badge>
          {numberRiskChunkIds.length ? <Badge variant="warning">{T.numberRisk} {numberRiskChunkIds.length}</Badge> : null}
          {citationRiskChunkIds.length ? <Badge variant="warning">{T.citationRisk} {citationRiskChunkIds.length}</Badge> : null}
          <ToggleGroup
            type="single"
            value={filterMode}
            onValueChange={(value) => value && setFilterMode(value as DiffFilterMode)}
            className="justify-start"
          >
            <ToggleGroupItem value="all" aria-label="显示全部">全部</ToggleGroupItem>
            <ToggleGroupItem value="review" aria-label="只看需处理" disabled={!reviewChunkIds.length}>需处理 {reviewChunkIds.length}</ToggleGroupItem>
            <ToggleGroupItem value="highRisk" aria-label="只看高风险" disabled={!highRiskChunkIds.length}>高风险 {highRiskChunkIds.length}</ToggleGroupItem>
            {failedChunkIds.length ? <ToggleGroupItem value="failed" aria-label="只看失败">失败 {failedChunkIds.length}</ToggleGroupItem> : null}
          </ToggleGroup>
        </div>
      </div>
      {failedChunkIds.length ? (
        <Alert variant="destructive" className="mx-3 mt-3 shrink-0">
          <AlertTitle>{T.failedChunks} {failedChunkIds.length}</AlertTitle>
        </Alert>
      ) : null}
      <div
        ref={scrollRef}
        onScroll={(event) => diffScrollPositions.set(scrollKey, event.currentTarget.scrollTop)}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-muted/40 p-4 pr-3"
      >
        <div className="grid gap-4">
          {shownChunks.length ? shownChunks.map((chunk) => {
            const detectionMatches = detectionMatchesByChunk[chunk.chunkId] ?? [];
            const rerunFailure = rerunFailureByChunk.get(chunk.chunkId);
            const needsReview = reviewChunkIdSet.has(chunk.chunkId);
            const hasChangedText = changedChunkIdSet.has(chunk.chunkId);
            const hasNumberRisk = numberRiskChunkIdSet.has(chunk.chunkId);
            const hasCitationRisk = citationRiskChunkIdSet.has(chunk.chunkId);
            const hasHighRiskFailedOutput = highRiskChunkIdSet.has(chunk.chunkId);
            const strongMatches = detectionMatches.filter((match) => match.confidence === "strong");
            const reviewMatches = detectionMatches.filter((match) => match.confidence === "review");
            const matchTone = strongMatches.length ? "strong" : reviewMatches.length ? "review" : "weak";
            const matchTitle = matchTone === "strong" ? "外部报告强命中" : matchTone === "review" ? "外部报告疑似命中" : "外部报告仅参考";
            const matchClassName = matchTone === "strong"
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : matchTone === "review"
                ? "border-primary/20 bg-muted/60 text-foreground"
                : "border-border bg-muted/50 text-muted-foreground";
            const reviewReasonHints = detectionMatches
              .filter((match) => match.confidence === "strong" || match.confidence === "review")
              .map((match) => match.reason || `${match.label} ${match.segment.probability}%`);
            const decision = reviewDecisions[chunk.chunkId] ?? getDefaultReviewDecisionForChunk(chunk);
            const displayOutput = getDecisionDisplayOutput(chunk, decision);
            return (
              <div
                key={chunk.chunkId}
                ref={(node) => {
                  chunkRefs.current[chunk.chunkId] = node;
                }}
                className={cn(
                  "grid min-w-0 gap-4 overflow-hidden rounded-lg border p-4 transition xl:grid-cols-2",
                  rerunFailure
                    ? "border-destructive/30 bg-destructive/5"
                    : hasHighRiskFailedOutput
                      ? "border-destructive/40 bg-destructive/5"
                    : needsReview
                      ? "border-primary/20 bg-muted/60"
                      : "border-border/70 bg-muted/30",
                  focusedChunkId === chunk.chunkId && "ring-2 ring-primary/25 ring-offset-2",
                )}
              >
                {rerunFailure ? (
                  <Alert variant="destructive" className="xl:col-span-2 py-3 text-xs leading-5">
                    <AlertTitle>{T.rerunFailure}</AlertTitle>
                    <AlertDescription className="text-xs">
                      <span>{rerunFailure.error}</span>
                    </AlertDescription>
                  </Alert>
                ) : null}
                {detectionMatches.length ? (
                  <div className={`xl:col-span-2 flex min-w-0 flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs ${matchClassName}`}>
                    <span className="font-semibold">{matchTitle}</span>
                    {detectionMatches.slice(0, 3).map((match) => (
                      <Badge key={`${match.segment.index}-${match.confidence}`} variant={match.confidence === "strong" ? "success" : match.confidence === "review" ? "warning" : "outline"}>
                        #{match.segment.index} {match.segment.probability}% · {match.label} {Math.round(match.score * 100)}%
                      </Badge>
                    ))}
                    {detectionMatches[0]?.reason ? <span className="basis-full text-[11px] opacity-80">{detectionMatches[0].reason}</span> : null}
                    {detectionMatches[0]?.evidence.matchedFragments?.[0] ? (
                    <span className="basis-full break-all rounded-md bg-muted px-2 py-1 text-[11px] opacity-80">
                        命中句段：{detectionMatches[0].evidence.matchedFragments[0]}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {hasHighRiskFailedOutput ? (
                  <Alert variant="destructive" className="xl:col-span-2 py-3 text-xs leading-5">
                    <AlertTitle>{T.highRiskRewrite}</AlertTitle>
                    <AlertDescription className="text-xs">
                      未过硬校验，默认保留原文。确认采用后才会导出此改写。
                    </AlertDescription>
                  </Alert>
                ) : null}
                {hasChangedText || hasNumberRisk || hasCitationRisk ? (
                  <div className="xl:col-span-2 flex flex-wrap items-center gap-2 text-xs">
                    {hasChangedText ? <Badge variant="secondary">{T.changedChunks}</Badge> : null}
                    {hasNumberRisk ? <Badge variant="warning">{T.numberRisk}</Badge> : null}
                    {hasCitationRisk ? <Badge variant="warning">{T.citationRisk}</Badge> : null}
                  </div>
                ) : null}
                <TextPane title={T.source} text={chunk.inputText} />
                <TextPane title={displayOutput.title} text={displayOutput.text} tone={displayOutput.tone} />
                <div className="xl:col-span-2 min-w-0">
                  <ChunkQualityBar chunk={chunk} busy={busy} decision={decision} forceNeedsReview={needsReview} reviewReasonHints={reviewReasonHints} onDecisionChange={(decision) => onReviewDecisionChange(chunk.chunkId, decision)} onRerun={(userFeedback) => onRerunChunk(chunk.chunkId, userFeedback)} />
                </div>
              </div>
            );
          }) : (
            <Empty className="border bg-background">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SplitSquareHorizontal />
                </EmptyMedia>
                <EmptyTitle>{emptyState.title}</EmptyTitle>
              </EmptyHeader>
              <Button size="sm" variant="outline" onClick={() => setFilterMode("all")}>{T.showAll}</Button>
            </Empty>
          )}
        </div>
      </div>
    </div>
  );
}

function isReviewChunk(chunk: RoundCompareData["chunks"][number], detectionMatches: DetectionReportMatch[]): boolean {
  const flags = chunk.quality?.flags ?? [];
  const hasLocalReview = Boolean(chunk.quality?.needsReview) || isHardValidationFallbackChunk(chunk);
  const hasReportReview = detectionMatches.some((match) => match.confidence === "strong" || match.confidence === "review");
  return hasLocalReview || hasReportReview;
}

function getDiffFilterEmptyState(mode: DiffFilterMode): { title: string } {
  if (mode === "failed") return { title: T.noFailedChunks };
  if (mode === "highRisk") return { title: T.noHighRiskChunks };
  return { title: T.noReviewChunks };
}

function getLatestFailedAttempt(chunk: RoundCompareData["chunks"][number]): NonNullable<RoundCompareData["chunks"][number]["failedAttempts"]>[number] | null {
  const attempts = (chunk.failedAttempts ?? []).filter((attempt) => typeof attempt?.outputText === "string" && attempt.outputText.trim());
  return attempts.length ? attempts[attempts.length - 1] : null;
}

function isHardValidationFallbackChunk(chunk: RoundCompareData["chunks"][number]): boolean {
  const flags = chunk.quality?.flags ?? [];
  return Boolean(
    chunk.fallbackMode === "source"
    || flags.includes("source_fallback")
    || flags.includes("targeted_rerun_fallback")
    || chunk.rerunStatus === "fallback"
    || chunk.rerunFallbackMode,
  );
}

function isHighRiskFailedOutputChunk(chunk: RoundCompareData["chunks"][number]): boolean {
  return Boolean(isHardValidationFallbackChunk(chunk) && getLatestFailedAttempt(chunk));
}

function getDefaultReviewDecisionForChunk(chunk: RoundCompareData["chunks"][number]): ReviewDecision {
  return isHighRiskFailedOutputChunk(chunk) ? "source" : "rewrite";
}

function hasTokenDifference(sourceText: string, outputText: string, extractor: (text: string) => string[]): boolean {
  const sourceTokens = extractor(sourceText);
  const outputTokens = extractor(outputText);
  return findMissingTokens(sourceTokens, outputTokens).length > 0 || findMissingTokens(outputTokens, sourceTokens).length > 0;
}

function hasChunkTextChange(chunk: RoundCompareData["chunks"][number]): boolean {
  const inputText = normalizeDiffText(chunk.inputText);
  return normalizeDiffText(chunk.outputText) !== inputText;
}

function hasChunkNumberRisk(chunk: RoundCompareData["chunks"][number]): boolean {
  return hasTokenDifference(chunk.inputText, chunk.outputText, extractNumberTokens);
}

function hasChunkCitationRisk(chunk: RoundCompareData["chunks"][number]): boolean {
  return (chunk.quality?.missingCitationCount ?? 0) > 0 || hasTokenDifference(chunk.inputText, chunk.outputText, extractCitationTokens);
}

function TextPane({ title, text, tone = "source" }: { title: string; text: string; tone?: "source" | "rewrite" | "danger" }) {
  return (
    <div className={cn(
      "min-w-0 overflow-hidden rounded-lg border p-3",
      tone === "danger"
        ? "border-destructive/30 bg-destructive/5"
        : tone === "rewrite"
          ? "border-border bg-muted/40"
          : "border-border bg-background",
    )}>
      <div className={cn("mb-2 text-xs font-semibold text-muted-foreground", tone === "rewrite" && "text-foreground", tone === "danger" && "text-destructive")}>{title}</div>
      <div className="max-h-[min(58vh,42rem)] min-h-[8rem] overflow-auto whitespace-pre-wrap break-words pr-2 text-sm leading-7 text-foreground">{text}</div>
    </div>
  );
}

function LiveHint({ running }: { running: boolean }) {
  return (
    <Alert className="shrink-0">
      <AlertTitle>{running ? T.liveRunning : T.checkpointIncomplete}</AlertTitle>
    </Alert>
  );
}

function getReviewDecisionMode(decision: ReviewDecision): "rewrite" | "source" | "custom" {
  if (isFailedOutputDecision(decision)) return "rewrite";
  if (typeof decision === "object" && decision?.mode === "custom") return "custom";
  return decision === "source" || decision === "source_confirmed" ? "source" : "rewrite";
}

function getDecisionDisplayOutput(chunk: RoundCompareData["chunks"][number], decision: ReviewDecision): { title: string; text: string; tone: "rewrite" | "danger" } {
  const failedAttempt = getLatestFailedAttempt(chunk);
  if (failedAttempt && isHighRiskFailedOutputChunk(chunk)) {
    if (isFailedOutputDecision(decision) && isReviewDecisionConfirmed(decision)) {
      return { title: `${T.rewrite}（${T.highRisk}已采用）`, text: decision.text || failedAttempt.outputText, tone: "danger" };
    }
    return { title: `${T.rewrite}（${T.highRisk}）`, text: failedAttempt.outputText, tone: "danger" };
  }
  const mode = getReviewDecisionMode(decision);
  if (mode === "custom" && typeof decision === "object" && isReviewDecisionConfirmed(decision)) {
    const title = `${T.rewrite}（${T.customChoice}）`;
    return { title, text: decision.text || chunk.outputText, tone: "rewrite" };
  }
  if (mode === "source") {
    return { title: `${T.rewrite}（${T.useSource}）`, text: chunk.inputText, tone: "rewrite" };
  }
  return { title: T.rewrite, text: chunk.outputText, tone: "rewrite" };
}

function isReviewDecisionConfirmed(decision: ReviewDecision): boolean {
  if (typeof decision === "object") {
    return isFailedOutputDecision(decision) ? decision.confirmed === true : true;
  }
  return decision === "rewrite_confirmed" || decision === "source_confirmed";
}

function isFailedOutputDecision(decision: ReviewDecision): decision is CustomReviewDecision & { source: "failed_output" } {
  return typeof decision === "object" && decision.source === "failed_output";
}

function extractNumberTokens(text: string): string[] {
  return [...text.matchAll(/(?:^|[^\w.])(\d+(?:\.\d+)?%?)/g)].map((match) => match[1]).filter(Boolean);
}

function extractCitationTokens(text: string): string[] {
  const bracketCitations = text.match(/\[[\d,\-\s]+]/g) ?? [];
  const authorYearCitations = text.match(/[（(][^（）()]{0,24}\d{4}[a-z]?[^（）()]{0,24}[）)]/gi) ?? [];
  return [...bracketCitations, ...authorYearCitations];
}

function uniqueTokens(tokens: string[]): string[] {
  return [...new Set(tokens.map((token) => token.replace(/\s+/g, "").trim()).filter(Boolean))];
}

function findMissingTokens(sourceTokens: string[], outputTokens: string[]): string[] {
  const outputSet = new Set(uniqueTokens(outputTokens));
  return uniqueTokens(sourceTokens).filter((token) => !outputSet.has(token));
}

function normalizeDiffText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function compactFeedbackText(text: string, maxLength = 220): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

function getRiskReasonText(reason: { code?: string; message?: string }): string {
  const codeLabel = reason.code ? formatChunkFlag(reason.code) : "";
  const message = compactFeedbackText(reason.message ?? "", 84);
  if (!message) return codeLabel;
  if (!codeLabel || message.includes(codeLabel)) return message;
  return `${codeLabel}：${message}`;
}

function getChunkReviewReasons(chunk: RoundCompareData["chunks"][number], extraReasons: string[] = []): string[] {
  const quality = chunk.quality;
  const flags = quality?.flags ?? [];
  const reasons: string[] = extraReasons.map((reason) => compactFeedbackText(reason, 84)).filter(Boolean);

  if (chunk.fallbackMode === "source" || flags.includes("source_fallback")) {
    reasons.push("模型输出未过硬校验，已保留原文");
  }
  if (chunk.rerunStatus === "fallback" || flags.includes("targeted_rerun_fallback")) {
    reasons.push("定向重跑未过硬校验");
  }
  for (const reason of quality?.reviewReasons ?? []) {
    const text = getRiskReasonText(reason);
    if (text) reasons.push(text);
  }
  for (const risk of quality?.machineLikeRisks ?? []) {
    const text = getRiskReasonText(risk);
    if (text) reasons.push(text);
  }
  if ((quality?.missingCitationCount ?? 0) > 0) {
    reasons.push(`缺少引用 ${quality?.missingCitationCount}`);
  }
  for (const flag of flags) {
    if (flag === "source_fallback" || flag === "targeted_rerun_fallback") continue;
    reasons.push(formatChunkFlag(flag));
  }
  if (!reasons.length && quality?.needsReview) {
    reasons.push("本块未通过本地质量校验");
  }
  return reasons.filter((item, index, list) => item && list.indexOf(item) === index).slice(0, 5);
}

function ChunkQualityBar({ chunk, busy, decision, forceNeedsReview = false, reviewReasonHints = [], onDecisionChange, onRerun }: { chunk: RoundCompareData["chunks"][number]; busy: boolean; decision: ReviewDecision; forceNeedsReview?: boolean; reviewReasonHints?: string[]; onDecisionChange: (decision: ReviewDecision) => void; onRerun: (userFeedback?: string) => void }) {
  const quality = chunk.quality;
  const qualityNeedsReview = Boolean(quality?.needsReview);
  const flags = quality?.flags ?? [];
  const advisoryFlags = quality?.advisoryFlags ?? [];
  const isSourceFallback = chunk.fallbackMode === "source" || flags.includes("source_fallback");
  const isTargetedFallback = flags.includes("targeted_rerun_fallback") || chunk.rerunStatus === "fallback" || Boolean(chunk.rerunFallbackMode);
  const isValidationFallback = isSourceFallback || isTargetedFallback;
  const failedAttempt = getLatestFailedAttempt(chunk);
  const isHighRiskFailedOutput = Boolean(isValidationFallback && failedAttempt);
  const [feedback, setFeedback] = useState("");
  const selectedBaseDecision = getReviewDecisionMode(decision);
  const isConfirmed = isReviewDecisionConfirmed(decision);
  const reviewToolsVisible = !isConfirmed && (qualityNeedsReview || isValidationFallback);
  const reviewReasons = isHighRiskFailedOutput ? [] : getChunkReviewReasons(chunk, reviewReasonHints);
  const visibleFlags = isHighRiskFailedOutput ? flags.filter((flag) => flag !== "source_fallback" && flag !== "targeted_rerun_fallback") : flags;
  const decisionLabel = selectedBaseDecision === "custom" ? T.customChoice : selectedBaseDecision === "rewrite" ? T.useRewrite : T.useSource;
  const needsReview = !isConfirmed && (forceNeedsReview || qualityNeedsReview);
  const adoptRewrite = () => {
    if (isHighRiskFailedOutput && failedAttempt) {
      onDecisionChange({
        mode: "custom",
        text: failedAttempt.outputText,
        source: "failed_output",
        confirmed: true,
        attempt: failedAttempt.attempt,
        error: failedAttempt.error,
      });
      return;
    }
    onDecisionChange("rewrite_confirmed");
  };
  return (
    <div className={cn(
      "flex min-w-0 flex-col gap-3 rounded-md border px-3 py-3 text-xs text-muted-foreground",
      isHighRiskFailedOutput ? "border-destructive/30 bg-destructive/5" : "border-border/60 bg-background",
    )}>
      <div className="flex flex-wrap items-center gap-2">
        {isHighRiskFailedOutput ? <Badge variant="danger">{T.highRisk}</Badge> : null}
        {!isHighRiskFailedOutput ? <Badge variant={needsReview ? "warning" : "success"}>{needsReview ? T.needsReview : T.stable}</Badge> : null}
        {!isHighRiskFailedOutput && isValidationFallback ? <Badge variant="warning">{T.sourceFallback}</Badge> : null}
        <span>{T.expansion} {quality?.expansionRatio ?? "-"}</span>
        <span>{T.protectedTokens} {quality?.protectedTokenCount ?? 0}</span>
        {formatProtectedTypes(quality?.protectedTokenTypes) ? <span>{formatProtectedTypes(quality?.protectedTokenTypes)}</span> : null}
        <span>{T.citationMissing} {quality?.missingCitationCount ?? 0}</span>
        {chunk.rerunStrategy?.length ? <span>{T.rerunStrategy} {chunk.rerunStrategy.map(formatRerunStrategy).join(" / ")}</span> : null}
        {visibleFlags.slice(0, 3).map((flag) => <Badge key={flag} variant="outline">{formatChunkFlag(flag)}</Badge>)}
        {!needsReview && advisoryFlags.length ? <Badge variant="outline">{T.risk} {advisoryFlags.slice(0, 2).map(formatChunkFlag).join(" / ")}</Badge> : null}
        <Badge variant={isConfirmed ? "success" : "secondary"}>{isConfirmed ? T.confirmedChoice : T.defaultChoice}：{decisionLabel}</Badge>
      </div>
      {reviewReasons.length ? (
        <div className="flex flex-wrap items-center gap-1 rounded-md bg-muted/50 px-2 py-2">
          <span className="font-medium text-foreground">{T.reviewReason}：</span>
          {reviewReasons.map((reason) => (
            <Badge key={reason} variant="outline" className="max-w-full whitespace-normal text-left">
              {reason}
            </Badge>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-2">
        <Button size="sm" variant={selectedBaseDecision === "rewrite" && isConfirmed ? "default" : isHighRiskFailedOutput ? "outlineDanger" : "outline"} onClick={adoptRewrite}>{isConfirmed && selectedBaseDecision === "rewrite" ? `${T.confirmedChoice}${T.useRewrite}` : T.useRewrite}</Button>
        <Button size="sm" variant={selectedBaseDecision === "source" && isConfirmed ? "default" : "outline"} onClick={() => onDecisionChange("source_confirmed")}>{isConfirmed && selectedBaseDecision === "source" ? `${T.confirmedChoice}${T.useSource}` : T.useSource}</Button>
        <Button size="sm" variant="outline" onClick={() => onRerun(feedback)} disabled={busy}>
          <RotateCcw data-icon="inline-start" />
          {T.targetedRerun}
        </Button>
      </div>
      {reviewToolsVisible ? (
        <div className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-muted/40 p-3 text-foreground">
          <div className="flex flex-col gap-2">
            <Textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder={T.feedbackPlaceholder}
              className="min-h-16 resize-none text-xs"
            />
            {chunk.rerunUserFeedback ? <div className="line-clamp-2 text-[11px] opacity-75">{T.lastFeedback}：{chunk.rerunUserFeedback}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatChunkFlag(flag: string): string {
  if (flag === "citation_missing") return "引用保护";
  if (flag === "over_expanded") return "扩写偏多";
  if (flag === "over_compressed") return "压缩偏多";
  if (flag === "machine_like_expression") return "机械表达";
  if (flag === "template_phrase_drift") return "模板句";
  if (flag === "source_fallback") return "安全原文";
  if (flag === "targeted_rerun_fallback") return "重跑保留";
  return flag;
}

function formatRerunStrategy(strategy: string): string {
  if (strategy === "de-template-expression") return "去模板化";
  if (strategy === "control-expansion") return "控扩写";
  if (strategy === "restore-detail") return "保细节";
  if (strategy === "citation-repair") return "修引用";
  if (strategy === "general-polish") return "自然化";
  if (strategy === "global-style-card") return "全文风格卡";
  return strategy;
}

function formatProtectedTypes(types?: Record<string, number>): string {
  if (!types) return "";
  const labels: Record<string, string> = { REF: "引用", CAP: "图表", EQN: "公式", NUM: "数值", TOK: "结构" };
  return Object.entries(types)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${labels[key] ?? key}${count}`)
    .join(" / ");
}
