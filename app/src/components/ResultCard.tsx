import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileOutput, RotateCcw, ShieldAlert, SplitSquareHorizontal } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DetectionReportMatch, ExportResult, OutputPreview, ReviewDecision, RoundCompareData, RoundResult } from "@/types/app";

const T = {
  result: "结果",
  donePrefix: "第",
  doneSuffix: "轮完成",
  waiting: "等待执行",
  title: "输出与导出",
  limit: "上限",
  input: "输入",
  output: "输出",
  paragraph: "段落",
  noResult: "还没有结果",
  noResultHint: "执行一轮后可查看差异并导出。",
  liveRunning: "运行中",
  liveHint: "每完成一个块就会追加到这里。",
  diff: "改写对照",
  noDiff: "暂无对照数据。",
  chunks: "块",
  shown: "全部显示",
  reviewOnly: "只看需处理",
  showAll: "显示全部",
  reviewChunks: "需处理",
  noReviewChunks: "暂无需处理块",
  noReviewHint: "当前轮次没有被硬校验或外部报告标记的块。",
  failedChunks: "重跑失败",
  failedOnly: "只看失败",
  noFailedChunks: "暂无重跑失败块",
  candidateChunks: "候选输出",
  candidateOnly: "只看候选",
  noCandidateChunks: "暂无候选输出块",
  changedChunks: "新增/删除",
  changedOnly: "只看增删",
  noChangedChunks: "暂无新增/删除块",
  numberRisk: "数字风险",
  numberRiskOnly: "只看数字风险",
  noNumberRiskChunks: "暂无数字风险块",
  citationRisk: "引用风险",
  citationRiskOnly: "只看引用风险",
  noCitationRiskChunks: "暂无引用风险块",
  filterEmptyHint: "当前筛选下没有命中的块，可切回全部继续查看。",
  rerunFailure: "重跑失败",
  rerunFailureHint: "该块上次重跑没有通过，可补充意见后单块重跑。",
  rerunFailureSummary: "部分块没有通过硬校验，系统已保留旧内容，不会自动污染导出。",
  viewFailedChunks: "查看失败块",
  viewCandidateChunks: "查看候选块",
  source: "原文",
  rewrite: "改写",
  safety: "导出安全",
  auditPassed: "审计通过",
  waitDocx: "等待 Word 导出",
  fingerprint: "文本指纹",
  checked: "已校验",
  pending: "待导出",
  protectedArea: "保护区",
  zeroIssue: "0 问题",
  waitAudit: "待审计",
  scope: "排版范围",
  bodyOnly: "仅正文",
  contentLockedStyle: "内容锁定+样式",
  newDoc: "新文档",
  quality: "改写检查",
  notDetector: "本地启发式检查，不是外部平台分数",
  splitParagraph: "拆分段落",
  retry: "结构重试",
  citation: "引用保护",
  rhythm: "句式节奏",
  risk: "表达提示",
  noRisk: "暂未发现明显表达提示",
  styleCard: "风格提示卡",
  globalStyle: "全局风格",
  exportGuard: "导出硬审计",
  formatPreflight: "排版预检",
  needsReview: "需处理",
  stable: "稳定",
  expansion: "扩写比",
  citationMissing: "引用缺失",
  protectedTokens: "结构锁定",
  useRewrite: "采用改写",
  useSource: "保留原文",
  currentChoice: "当前采用",
  defaultChoice: "默认采用",
  confirmedChoice: "已确认",
  rerunChunk: "重跑此块",
  rerunRisky: "重跑需处理",
  rerunStrategy: "策略",
  reviewReason: "原因",
  targetedRerun: "定向重跑",
  feedbackPlaceholder: "补充重跑要求（可选）",
  lastFeedback: "上次意见",
  sourceFallback: "保留原文",
  rejectedCandidate: "候选已拦截",
  rejectedNeedsHuman: "需人工介入",
  adoptRejected: "采用此改写",
  adoptedRejected: "已采用",
  adoptAllRejected: "采用全部候选",
  safeText: "安全文本",
  customChoice: "人工候选",
  fallback: "安全兜底",
};

const diffScrollPositions = new Map<string, number>();

type RejectedCandidate = NonNullable<RoundCompareData["chunks"][number]["rejectedCandidates"]>[number];
type CandidateInspection = {
  issues: string[];
  warnings: string[];
};
export type DiffFilterMode = "all" | "review" | "failed" | "candidate" | "changed" | "number" | "citation";
export type DiffFocusRequest = {
  filterMode: DiffFilterMode;
  chunkId?: string;
  nonce: number;
};

type RerunFailure = {
  chunkId: string;
  error: string;
  rejectedCandidates?: NonNullable<RoundCompareData["chunks"][number]["rejectedCandidates"]>;
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
  candidateAdoptableCount?: number;
  onAdoptAllCandidates?: () => void;
  onExportTxt: () => void;
  onExportDocx: () => void;
};

export function ResultCard({ result, compareData, busy, onRerunRiskyChunks, batchRerunRunning = false, batchRerunStatusText = "", onCancelBatchRerun, candidateAdoptableCount = 0, onAdoptAllCandidates, onExportTxt, onExportDocx }: Props) {
  const hasOutput = Boolean(result || compareData?.chunks.length);
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
            <div className="grid shrink-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Button className="h-11 justify-start px-4" onClick={onExportDocx} disabled={!result || busy}>
                <Download data-icon="inline-start" />
                导出 Word
              </Button>
              <Button className="h-11 justify-start px-4" variant="outline" onClick={onExportTxt} disabled={!result || busy}>
                <Download data-icon="inline-start" />
                TXT
              </Button>
              <Button className="h-11 justify-start px-4" variant="outline" onClick={onAdoptAllCandidates} disabled={!candidateAdoptableCount || busy}>
                <CheckCircle2 data-icon="inline-start" />
                {T.adoptAllRejected}
                {candidateAdoptableCount ? <Badge variant="secondary" className="ml-auto">{candidateAdoptableCount}</Badge> : null}
              </Button>
              <Button className="h-11 justify-start px-4" variant="outline" onClick={onRerunRiskyChunks} disabled={!result || !compareData?.chunks.some((chunk) => chunk.quality?.needsReview) || busy}>
                {T.rerunRisky}
              </Button>
            </div>

            {!result ? <LiveHint /> : null}
          </>
        ) : (
          <Empty className="min-h-0 flex-1 border bg-background/70">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileOutput />
              </EmptyMedia>
              <EmptyTitle>{T.noResult}</EmptyTitle>
              <EmptyDescription>{T.noResultHint}</EmptyDescription>
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
  const previousCandidateCountRef = useRef(0);
  const handledDiffFocusNonceRef = useRef<number | null>(null);
  const [filterMode, setFilterMode] = useState<DiffFilterMode>("all");
  const [focusedReviewIndex, setFocusedReviewIndex] = useState(-1);

  const allChunks = data?.chunks ?? [];
  const rerunFailureByChunk = new Map(rerunFailures.map((failure) => [failure.chunkId, failure]));
  const failureCandidateChunkIdSet = new Set(rerunFailures.filter((failure) => (failure.rejectedCandidates?.length ?? 0) > 0).map((failure) => failure.chunkId));
  const failedChunkIds = allChunks.filter((chunk) => rerunFailureByChunk.has(chunk.chunkId)).map((chunk) => chunk.chunkId);
  const failedChunkIdSet = new Set(failedChunkIds);
  const candidateChunkIds = allChunks.filter((chunk) => (chunk.rejectedCandidates?.length ?? 0) > 0 || failureCandidateChunkIdSet.has(chunk.chunkId)).map((chunk) => chunk.chunkId);
  const candidateChunkIdSet = new Set(candidateChunkIds);
  const changedChunkIds = allChunks.filter((chunk) => hasChunkTextChange(chunk, getDisplayRejectedCandidates(chunk, rerunFailureByChunk.get(chunk.chunkId)))).map((chunk) => chunk.chunkId);
  const changedChunkIdSet = new Set(changedChunkIds);
  const numberRiskChunkIds = allChunks.filter((chunk) => hasChunkNumberRisk(chunk, getDisplayRejectedCandidates(chunk, rerunFailureByChunk.get(chunk.chunkId)))).map((chunk) => chunk.chunkId);
  const numberRiskChunkIdSet = new Set(numberRiskChunkIds);
  const citationRiskChunkIds = allChunks.filter((chunk) => hasChunkCitationRisk(chunk, getDisplayRejectedCandidates(chunk, rerunFailureByChunk.get(chunk.chunkId)))).map((chunk) => chunk.chunkId);
  const citationRiskChunkIdSet = new Set(citationRiskChunkIds);
  const reviewChunkIds = allChunks
    .filter((chunk) => isReviewChunk(chunk, detectionMatchesByChunk[chunk.chunkId] ?? []) || rerunFailureByChunk.has(chunk.chunkId) || candidateChunkIdSet.has(chunk.chunkId))
    .map((chunk) => chunk.chunkId);
  const reviewChunkIdSet = new Set(reviewChunkIds);
  const shownChunks = filterMode === "failed"
    ? allChunks.filter((chunk) => failedChunkIdSet.has(chunk.chunkId))
    : filterMode === "candidate"
      ? allChunks.filter((chunk) => candidateChunkIdSet.has(chunk.chunkId))
    : filterMode === "changed"
      ? allChunks.filter((chunk) => changedChunkIdSet.has(chunk.chunkId))
    : filterMode === "number"
      ? allChunks.filter((chunk) => numberRiskChunkIdSet.has(chunk.chunkId))
    : filterMode === "citation"
      ? allChunks.filter((chunk) => citationRiskChunkIdSet.has(chunk.chunkId))
    : filterMode === "review"
      ? allChunks.filter((chunk) => reviewChunkIdSet.has(chunk.chunkId))
      : allChunks;
  const focusedChunkId = focusedReviewIndex >= 0 ? reviewChunkIds[focusedReviewIndex] : "";
  const baseScrollKey = data ? data.outputPath || `${data.docId}-${data.round}` : "empty";
  const scrollKey = `${baseScrollKey}:${filterMode}`;
  const chunkCount = shownChunks.length;
  const shownLabel = getDiffFilterLabel(filterMode);
  const emptyState = getDiffFilterEmptyState(filterMode);
  const getFirstChunkIdForMode = (mode: DiffFilterMode) => {
    if (mode === "failed") return failedChunkIds[0] ?? "";
    if (mode === "candidate") return candidateChunkIds[0] ?? "";
    if (mode === "changed") return changedChunkIds[0] ?? "";
    if (mode === "number") return numberRiskChunkIds[0] ?? "";
    if (mode === "citation") return citationRiskChunkIds[0] ?? "";
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
    const previousCandidateCount = previousCandidateCountRef.current;
    if (failedChunkIds.length > previousFailedCount) {
      setFilterMode("failed");
      setFocusedReviewIndex(-1);
    } else if (candidateChunkIds.length > previousCandidateCount && failedChunkIds.length === 0) {
      setFilterMode("candidate");
      setFocusedReviewIndex(-1);
    } else if (failedChunkIds.length === 0 && filterMode === "failed") {
      setFilterMode("all");
    } else if (candidateChunkIds.length === 0 && filterMode === "candidate") {
      setFilterMode("all");
    } else if (changedChunkIds.length === 0 && filterMode === "changed") {
      setFilterMode("all");
    } else if (numberRiskChunkIds.length === 0 && filterMode === "number") {
      setFilterMode("all");
    } else if (citationRiskChunkIds.length === 0 && filterMode === "citation") {
      setFilterMode("all");
    }
    previousFailedCountRef.current = failedChunkIds.length;
    previousCandidateCountRef.current = candidateChunkIds.length;
  }, [candidateChunkIds.length, changedChunkIds.length, citationRiskChunkIds.length, failedChunkIds.length, filterMode, numberRiskChunkIds.length]);

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
          <EmptyDescription>{T.noDiff}</EmptyDescription>
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
            <ToggleGroupItem value="failed" aria-label="只看失败" disabled={!failedChunkIds.length}>失败 {failedChunkIds.length}</ToggleGroupItem>
            <ToggleGroupItem value="candidate" aria-label="只看候选" disabled={!candidateChunkIds.length}>候选 {candidateChunkIds.length}</ToggleGroupItem>
          </ToggleGroup>
          <Badge variant="secondary" className="ml-auto">{shownLabel}</Badge>
        </div>
      </div>
      {failedChunkIds.length ? (
        <Alert variant="destructive" className="mx-3 mt-3 shrink-0">
          <AlertTitle>{T.failedChunks} {failedChunkIds.length}</AlertTitle>
          <AlertDescription>{T.rerunFailureSummary}</AlertDescription>
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
            const failureRejectedCandidates = rerunFailure?.rejectedCandidates ?? [];
            const displayChunk = failureRejectedCandidates.length && !(chunk.rejectedCandidates?.length)
              ? { ...chunk, rejectedCandidates: failureRejectedCandidates }
              : chunk;
            const needsReview = reviewChunkIdSet.has(chunk.chunkId);
            const hasChangedText = changedChunkIdSet.has(chunk.chunkId);
            const hasNumberRisk = numberRiskChunkIdSet.has(chunk.chunkId);
            const hasCitationRisk = citationRiskChunkIdSet.has(chunk.chunkId);
            const hasRejectedCandidate = (displayChunk.rejectedCandidates?.length ?? 0) > 0;
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
            const decision = reviewDecisions[chunk.chunkId] ?? "rewrite";
            const latestRejectedCandidate = getLatestRejectedCandidate(displayChunk.rejectedCandidates ?? []);
            const displayOutput = getDecisionDisplayOutput(chunk, decision, latestRejectedCandidate);
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
                    : hasRejectedCandidate || needsReview
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
                      <span className="ml-2 opacity-80">{T.rerunFailureHint}</span>
                      {failureRejectedCandidates.length ? <span className="ml-2 font-medium">已保留 {failureRejectedCandidates.length} 个模型候选，可在下方处理。</span> : null}
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
                {hasChangedText || hasNumberRisk || hasCitationRisk ? (
                  <div className="xl:col-span-2 flex flex-wrap items-center gap-2 text-xs">
                    {hasChangedText ? <Badge variant="secondary">{T.changedChunks}</Badge> : null}
                    {hasNumberRisk ? <Badge variant="warning">{T.numberRisk}</Badge> : null}
                    {hasCitationRisk ? <Badge variant="warning">{T.citationRisk}</Badge> : null}
                  </div>
                ) : null}
                <TextPane title={T.source} text={chunk.inputText} />
                <TextPane title={displayOutput.title} text={displayOutput.text} tone="rewrite" />
                <div className="xl:col-span-2 min-w-0">
                  <ChunkQualityBar chunk={displayChunk} busy={busy} decision={decision} latestRejectedCandidate={latestRejectedCandidate} forceNeedsReview={needsReview} reviewReasonHints={reviewReasonHints} onDecisionChange={(decision) => onReviewDecisionChange(chunk.chunkId, decision)} onRerun={(userFeedback) => onRerunChunk(chunk.chunkId, userFeedback)} />
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
                <EmptyDescription>{emptyState.hint}</EmptyDescription>
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
  const hasLocalReview = Boolean(chunk.quality?.needsReview) || chunk.fallbackMode === "source" || flags.includes("source_fallback");
  const hasReportReview = detectionMatches.some((match) => match.confidence === "strong" || match.confidence === "review");
  return hasLocalReview || hasReportReview;
}

function getDiffFilterLabel(mode: DiffFilterMode): string {
  if (mode === "failed") return T.failedOnly;
  if (mode === "candidate") return T.candidateOnly;
  if (mode === "changed") return T.changedChunks;
  if (mode === "number") return T.numberRisk;
  if (mode === "citation") return T.citationRisk;
  if (mode === "review") return T.reviewOnly;
  return T.shown;
}

function getDiffFilterEmptyState(mode: DiffFilterMode): { title: string; hint: string } {
  if (mode === "failed") return { title: T.noFailedChunks, hint: T.filterEmptyHint };
  if (mode === "candidate") return { title: T.noCandidateChunks, hint: T.filterEmptyHint };
  if (mode === "changed") return { title: T.noChangedChunks, hint: T.filterEmptyHint };
  if (mode === "number") return { title: T.noNumberRiskChunks, hint: T.filterEmptyHint };
  if (mode === "citation") return { title: T.noCitationRiskChunks, hint: T.filterEmptyHint };
  return { title: T.noReviewChunks, hint: T.noReviewHint };
}

function getDisplayRejectedCandidates(chunk: RoundCompareData["chunks"][number], rerunFailure?: RerunFailure): NonNullable<RoundCompareData["chunks"][number]["rejectedCandidates"]> {
  if (chunk.rejectedCandidates?.length) {
    return chunk.rejectedCandidates;
  }
  return rerunFailure?.rejectedCandidates ?? [];
}

function hasTokenDifference(sourceText: string, outputText: string, extractor: (text: string) => string[]): boolean {
  const sourceTokens = extractor(sourceText);
  const outputTokens = extractor(outputText);
  return findMissingTokens(sourceTokens, outputTokens).length > 0 || findMissingTokens(outputTokens, sourceTokens).length > 0;
}

function hasChunkTextChange(chunk: RoundCompareData["chunks"][number], candidates: RejectedCandidate[]): boolean {
  const inputText = normalizeDiffText(chunk.inputText);
  if (normalizeDiffText(chunk.outputText) !== inputText) {
    return true;
  }
  return candidates.some((candidate) => normalizeDiffText(candidate.outputText ?? "") !== inputText);
}

function hasChunkNumberRisk(chunk: RoundCompareData["chunks"][number], candidates: RejectedCandidate[]): boolean {
  if (hasTokenDifference(chunk.inputText, chunk.outputText, extractNumberTokens)) {
    return true;
  }
  return candidates.some((candidate) => hasTokenDifference(chunk.inputText, candidate.outputText ?? "", extractNumberTokens));
}

function hasChunkCitationRisk(chunk: RoundCompareData["chunks"][number], candidates: RejectedCandidate[]): boolean {
  if ((chunk.quality?.missingCitationCount ?? 0) > 0 || hasTokenDifference(chunk.inputText, chunk.outputText, extractCitationTokens)) {
    return true;
  }
  return candidates.some((candidate) => hasTokenDifference(chunk.inputText, candidate.outputText ?? "", extractCitationTokens));
}

function TextPane({ title, text, tone = "source" }: { title: string; text: string; tone?: "source" | "rewrite" }) {
  return (
    <div className={cn("min-w-0 overflow-hidden rounded-lg border border-border p-3", tone === "rewrite" ? "bg-muted/40" : "bg-background")}>
      <div className={cn("mb-2 text-xs font-semibold text-muted-foreground", tone === "rewrite" && "text-foreground")}>{title}</div>
      <div className="max-h-[min(58vh,42rem)] min-h-[8rem] overflow-auto whitespace-pre-wrap break-words pr-2 text-sm leading-7 text-foreground">{text}</div>
    </div>
  );
}

function LiveHint() {
  return (
    <Alert className="shrink-0">
      <AlertTitle>{T.liveRunning}</AlertTitle>
      <AlertDescription>{T.liveHint}</AlertDescription>
    </Alert>
  );
}

function getReviewDecisionMode(decision: ReviewDecision): "rewrite" | "source" | "custom" {
  if (typeof decision === "object" && decision?.mode === "custom") return "custom";
  return decision === "source" || decision === "source_confirmed" ? "source" : "rewrite";
}

function getLatestRejectedCandidate(candidates: RejectedCandidate[]): RejectedCandidate | null {
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (candidate?.outputText?.trim()) return candidate;
  }
  return null;
}

function buildRejectedCandidateDecision(candidate: RejectedCandidate): ReviewDecision {
  return {
    mode: "custom",
    text: candidate.outputText,
    source: "rejected_candidate",
    attempt: candidate.attempt,
    candidate: candidate.candidate,
    error: candidate.error,
  };
}

function isRejectedCandidateAdopted(decision: ReviewDecision, candidate: RejectedCandidate | null): boolean {
  if (!candidate || typeof decision !== "object" || decision?.mode !== "custom") {
    return false;
  }
  const hasSameCandidateMeta = (
    decision.attempt !== undefined
    && candidate.attempt !== undefined
    && decision.candidate !== undefined
    && candidate.candidate !== undefined
    && decision.attempt === candidate.attempt
    && decision.candidate === candidate.candidate
  );
  if (hasSameCandidateMeta) return true;
  return normalizeDiffText(decision.text || "") === normalizeDiffText(candidate.outputText ?? "");
}

function getDecisionDisplayOutput(chunk: RoundCompareData["chunks"][number], decision: ReviewDecision, previewCandidate: RejectedCandidate | null = null): { title: string; text: string } {
  const mode = getReviewDecisionMode(decision);
  if (mode === "custom" && typeof decision === "object") {
    const title = decision.source === "rejected_candidate" ? `${T.rewrite}（${T.adoptedRejected}）` : `${T.rewrite}（${T.customChoice}）`;
    return { title, text: decision.text || chunk.outputText };
  }
  if (mode === "source") {
    return { title: `${T.rewrite}（${T.useSource}）`, text: chunk.inputText };
  }
  if (previewCandidate && decision !== "rewrite_confirmed") {
    return { title: `${T.rewrite}（未采用，需人工介入）`, text: previewCandidate.outputText };
  }
  return { title: T.rewrite, text: chunk.outputText };
}

function isReviewDecisionConfirmed(decision: ReviewDecision): boolean {
  return typeof decision === "object" || decision === "rewrite_confirmed" || decision === "source_confirmed";
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function countCjkChars(text: string): number {
  return [...text].filter((char) => {
    const code = char.charCodeAt(0);
    return isCjkCode(code);
  }).length;
}

function isCjkCode(code: number): boolean {
  return code >= 0x3400 && code <= 0x9fff;
}

function countVisibleChars(text: string): number {
  return text.replace(/\s+/g, "").length;
}

function classifyLanguage(text: string): "cn" | "en" | "mixed" {
  const cjk = countCjkChars(text);
  const latin = countMatches(text, /[A-Za-z]/g);
  const total = cjk + latin;
  if (total < 8) return "mixed";
  if (cjk / total >= 0.45) return "cn";
  if (latin / total >= 0.65) return "en";
  return "mixed";
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

function getLineUnitCount(text: string): number {
  const units = text.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  return Math.max(1, units.length);
}

function hasTemplateMarker(text: string): boolean {
  return /^(修改后|改写后|润色后|说明|以下是|Here is|Here are)[:：\s]/i.test(text.trim()) || /作为(?:一个|一名)?AI|as an ai/i.test(text);
}

function normalizeDiffText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function compactFeedbackText(text: string, maxLength = 220): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

function getRejectedCandidateReasons(sourceText: string, candidates: RejectedCandidate[]): string[] {
  const reasons = candidates
    .flatMap((candidate) => {
      const inspection = inspectRejectedCandidate(sourceText, candidate);
      return [...inspection.issues, ...inspection.warnings];
    })
    .filter((item, index, list) => item && list.indexOf(item) === index)
    .slice(0, 4);
  return reasons.length ? reasons : ["候选未通过校验"];
}

function buildRejectedCandidatesRerunFeedback(sourceText: string, candidates: RejectedCandidate[]): string {
  const findings = getRejectedCandidateReasons(sourceText, candidates);
  const lines = [
    "重跑要求：",
    ...findings.map((item) => `- ${item}`),
  ];
  lines.push("不要复用被拦截候选，只调整表达。");
  return lines.join("\n");
}

function inspectRejectedCandidate(sourceText: string, candidate: RejectedCandidate): CandidateInspection {
  const outputText = candidate.outputText ?? "";
  const sourceLength = countVisibleChars(sourceText);
  const outputLength = countVisibleChars(outputText);
  const lengthRatio = sourceLength > 0 ? outputLength / sourceLength : null;
  const sourceLanguage = classifyLanguage(sourceText);
  const outputLanguage = classifyLanguage(outputText);
  const sourceNumbers = extractNumberTokens(sourceText);
  const outputNumbers = extractNumberTokens(outputText);
  const sourceCitations = extractCitationTokens(sourceText);
  const outputCitations = extractCitationTokens(outputText);
  const missingNumbers = findMissingTokens(sourceNumbers, outputNumbers);
  const addedNumbers = findMissingTokens(outputNumbers, sourceNumbers);
  const missingCitations = findMissingTokens(sourceCitations, outputCitations);
  const issues: string[] = [];
  const warnings: string[] = [];
  const errorText = String(candidate.error ?? "");

  if (!outputText.trim()) issues.push("候选为空，不能采用");
  if (candidate.truncated) issues.push("候选被截断，不能直接采用");
  if (lengthRatio !== null && (lengthRatio < 0.65 || lengthRatio > 1.45)) issues.push("长度偏离明显");
  else if (lengthRatio !== null && (lengthRatio < 0.8 || lengthRatio > 1.25)) warnings.push("长度略有偏离");
  if (sourceLanguage === "en" && outputLanguage === "cn") issues.push("英文段落被改成中文");
  if (sourceLanguage === "cn" && outputLanguage === "en") issues.push("中文段落被改成英文");
  if (getLineUnitCount(outputText) > Math.max(1, getLineUnitCount(sourceText) + 1)) issues.push("候选出现额外断行");
  if (hasTemplateMarker(outputText)) issues.push("候选带有说明性前后缀");
  if (missingCitations.length) issues.push(`缺少引用 ${missingCitations.slice(0, 3).join("、")}`);
  if (missingNumbers.length || addedNumbers.length) warnings.push("数字或指标需要核对");
  if (/entity_order_changed|factual order|item-value bindings/i.test(errorText)) issues.push("事实顺序或键值绑定被算法拦截");
  else if (/citation|reference|引用/i.test(errorText)) issues.push("引用保护被算法拦截");
  else if (/language|英文|中文/i.test(errorText)) issues.push("语言一致性被算法拦截");
  else if (errorText && !issues.length) warnings.push("候选未通过硬校验");

  return {
    issues,
    warnings,
  };
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

function ChunkQualityBar({ chunk, busy, decision, latestRejectedCandidate = null, forceNeedsReview = false, reviewReasonHints = [], onDecisionChange, onRerun }: { chunk: RoundCompareData["chunks"][number]; busy: boolean; decision: ReviewDecision; latestRejectedCandidate?: RejectedCandidate | null; forceNeedsReview?: boolean; reviewReasonHints?: string[]; onDecisionChange: (decision: ReviewDecision) => void; onRerun: (userFeedback?: string) => void }) {
  const quality = chunk.quality;
  const qualityNeedsReview = Boolean(quality?.needsReview);
  const needsReview = forceNeedsReview || qualityNeedsReview;
  const flags = quality?.flags ?? [];
  const advisoryFlags = quality?.advisoryFlags ?? [];
  const isSourceFallback = chunk.fallbackMode === "source" || flags.includes("source_fallback");
  const [feedback, setFeedback] = useState("");
  const selectedBaseDecision = getReviewDecisionMode(decision);
  const isConfirmed = isReviewDecisionConfirmed(decision);
  const rejectedCandidates = chunk.rejectedCandidates ?? [];
  const reviewToolsVisible = qualityNeedsReview || isSourceFallback;
  const reviewReasons = getChunkReviewReasons(chunk, reviewReasonHints);
  const candidateFeedback = rejectedCandidates.length ? buildRejectedCandidatesRerunFeedback(chunk.inputText, rejectedCandidates) : "";
  const candidateReasons = rejectedCandidates.length ? getRejectedCandidateReasons(chunk.inputText, rejectedCandidates) : [];
  const candidateAdopted = isRejectedCandidateAdopted(decision, latestRejectedCandidate);
  const isPreviewingRejectedCandidate = Boolean(latestRejectedCandidate && !candidateAdopted && selectedBaseDecision === "rewrite" && !isConfirmed);
  const decisionLabel = candidateAdopted ? T.adoptedRejected : isPreviewingRejectedCandidate ? T.safeText : selectedBaseDecision === "custom" ? T.customChoice : selectedBaseDecision === "rewrite" ? T.useRewrite : T.useSource;
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-md border border-border/60 bg-background px-3 py-3 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={needsReview ? "warning" : "success"}>{needsReview ? T.needsReview : T.stable}</Badge>
        {isSourceFallback ? <Badge variant="warning">{T.sourceFallback}</Badge> : null}
        <span>{T.expansion} {quality?.expansionRatio ?? "-"}</span>
        <span>{T.protectedTokens} {quality?.protectedTokenCount ?? 0}</span>
        {formatProtectedTypes(quality?.protectedTokenTypes) ? <span>{formatProtectedTypes(quality?.protectedTokenTypes)}</span> : null}
        <span>{T.citationMissing} {quality?.missingCitationCount ?? 0}</span>
        {chunk.rerunStrategy?.length ? <span>{T.rerunStrategy} {chunk.rerunStrategy.map(formatRerunStrategy).join(" / ")}</span> : null}
        {flags.slice(0, 3).map((flag) => <Badge key={flag} variant="outline">{formatChunkFlag(flag)}</Badge>)}
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
        <Button size="sm" variant={selectedBaseDecision === "rewrite" && isConfirmed ? "default" : "outline"} onClick={() => onDecisionChange("rewrite_confirmed")}>{isConfirmed && selectedBaseDecision === "rewrite" ? `${T.confirmedChoice}${T.useRewrite}` : T.useRewrite}</Button>
        <Button size="sm" variant={selectedBaseDecision === "source" && isConfirmed ? "default" : "outline"} onClick={() => onDecisionChange("source_confirmed")}>{isConfirmed && selectedBaseDecision === "source" ? `${T.confirmedChoice}${T.useSource}` : T.useSource}</Button>
        <Button size="sm" variant="outline" onClick={() => onRerun(feedback)} disabled={busy}>
          <RotateCcw data-icon="inline-start" />
          {T.targetedRerun}
        </Button>
      </div>
      {rejectedCandidates.length ? (
        <Alert className="border-border bg-muted/40 text-foreground">
          <ShieldAlert />
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <AlertTitle className="flex flex-wrap items-center gap-2">
                {T.rejectedCandidate}
                <Badge variant="secondary">{rejectedCandidates.length}</Badge>
                <Badge variant={candidateAdopted ? "success" : "warning"}>{candidateAdopted ? T.adoptedRejected : T.rejectedNeedsHuman}</Badge>
              </AlertTitle>
              <AlertDescription className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                <span className="font-medium text-foreground">原因：</span>
                {candidateReasons.map((reason) => (
                  <Badge key={reason} variant="outline" className="max-w-full whitespace-normal text-left">
                    {reason}
                  </Badge>
                ))}
              </AlertDescription>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant={candidateAdopted ? "default" : "outline"}
                onClick={() => latestRejectedCandidate && onDecisionChange(buildRejectedCandidateDecision(latestRejectedCandidate))}
                disabled={busy || !latestRejectedCandidate || candidateAdopted}
              >
                <CheckCircle2 data-icon="inline-start" />
                {candidateAdopted ? T.adoptedRejected : T.adoptRejected}
              </Button>
              <Button
                size="sm"
                onClick={() => onRerun(candidateFeedback)}
                disabled={busy}
              >
                <RotateCcw data-icon="inline-start" />
                重跑
              </Button>
            </div>
          </div>
        </Alert>
      ) : null}
      {reviewToolsVisible ? (
        <div className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-muted/40 p-3 text-foreground">
          {isSourceFallback && chunk.fallbackError ? (
            <Alert className="py-2">
              <ShieldAlert />
              <AlertTitle>报错</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                {compactFeedbackText(chunk.fallbackError, 180)}
              </AlertDescription>
            </Alert>
          ) : null}
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
