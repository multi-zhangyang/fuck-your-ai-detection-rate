import { type ReactNode, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileOutput, Layers2, ScanText, ShieldCheck, SplitSquareHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DetectionReportMatch, ExportIssueSample, ExportResult, OutputPreview, ReviewDecision, RoundCompareData, RoundQualitySummary, RoundResult } from "@/types/app";

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
  preview: "文本预览",
  chars: "字",
  noPreview: "暂无预览",
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
  previousReview: "上一处",
  nextReview: "下一处",
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
  reviewedExport: "导出审阅 TXT",
  reviewedWord: "审阅 Word",
  rerunChunk: "重跑此块",
  rerunRisky: "重跑需处理",
  rerunStrategy: "策略",
  systemFeedback: "系统反馈",
  reviewFeedback: "人工补充",
  feedbackPlaceholder: "可选：补充系统没说清的问题，例如这块转折太硬、不要扩写背景、引用放回句尾。",
  lastFeedback: "上次意见",
  sourceFallback: "已安全保留原文",
  sourceFallbackHint: "模型连续输出未通过硬校验，本块没有采用不合格改写。",
  rejectedCandidate: "模型候选输出",
  rejectedCandidateHint: "这些内容被算法拦截，不会自动导出；如果你判断可用，可以手动采用该候选。",
  adoptCandidate: "采用此候选",
  copyCandidate: "复制候选",
  copied: "已复制",
  customChoice: "人工候选",
  fallback: "安全兜底",
};

const zh = (...codes: number[]) => String.fromCharCode(...codes);
const diffScrollPositions = new Map<string, number>();

type RejectedCandidate = NonNullable<RoundCompareData["chunks"][number]["rejectedCandidates"]>[number];
type CandidateInspectionLevel = "safe" | "review" | "danger";
type CandidateInspection = {
  level: CandidateInspectionLevel;
  label: string;
  summary: string;
  lengthRatio: number | null;
  lengthText: string;
  languageText: string;
  numberText: string;
  citationText: string;
  issues: string[];
  warnings: string[];
};
type CandidateDiffKind = "same" | "added" | "removed";
type CandidateDiffSegment = {
  text: string;
  kind: CandidateDiffKind;
};
type CandidateDiffView = {
  sourceSegments: CandidateDiffSegment[];
  candidateSegments: CandidateDiffSegment[];
  tooLarge: boolean;
  sourceTokenCount: number;
  candidateTokenCount: number;
  addedTokenCount: number;
  removedTokenCount: number;
  changeRatio: number;
};
type DiffFilterMode = "all" | "review" | "failed" | "candidate" | "changed" | "number" | "citation";

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
  reviewDecisions: Record<string, ReviewDecision>;
  onReviewDecisionChange: (chunkId: string, decision: ReviewDecision) => void;
  onRerunChunk: (chunkId: string, userFeedback?: string) => void;
  onRerunRiskyChunks: () => void;
  batchRerunRunning?: boolean;
  batchRerunStatusText?: string;
  onCancelBatchRerun?: () => void;
  onExportReviewedTxt: () => void;
  onExportReviewedDocx: () => void;
  onExportTxt: () => void;
  onExportDocx: () => void;
};

export function ResultCard({ result, preview, compareData, exportResult, busy, rerunFailures = [], detectionMatchesByChunk = {}, reviewDecisions, onReviewDecisionChange, onRerunChunk, onRerunRiskyChunks, batchRerunRunning = false, batchRerunStatusText = "", onCancelBatchRerun, onExportReviewedTxt, onExportReviewedDocx, onExportTxt, onExportDocx }: Props) {
  const deferredPreviewText = useDeferredValue(preview?.text ?? "");
  const qualitySummary = result?.qualitySummary ?? compareData?.qualitySummary ?? null;

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="shrink-0 pb-3">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{T.result}</Badge>
              {result ? <Badge variant="success">{T.donePrefix} {result.round} {T.doneSuffix}</Badge> : <Badge variant="outline">{T.waiting}</Badge>}
            </div>
            <CardTitle className="text-xl">{T.title}</CardTitle>
          </div>
          <div className="flex flex-wrap gap-2">
            {batchRerunRunning ? (
              <Button variant="destructive" onClick={onCancelBatchRerun}>
                停止重跑
              </Button>
            ) : null}
            <Button variant="outline" onClick={onExportTxt} disabled={!result || busy}>
              <Download className="h-4 w-4" />
              TXT
            </Button>
            <Button variant="outline" onClick={onRerunRiskyChunks} disabled={!result || !compareData?.chunks.some((chunk) => chunk.quality?.needsReview) || busy}>
              {T.rerunRisky}
            </Button>
            <Button variant="outline" onClick={onExportReviewedTxt} disabled={!result || !compareData?.chunks.length || busy}>
              <Download className="h-4 w-4" />
              {T.reviewedExport}
            </Button>
            <Button onClick={onExportReviewedDocx} disabled={!result || !compareData?.chunks.length || busy}>
              <Download className="h-4 w-4" />
              {T.reviewedWord}
            </Button>
            <Button onClick={onExportDocx} disabled={!result || busy}>
              <Download className="h-4 w-4" />
              Word
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {batchRerunRunning ? (
          <div className="shrink-0 rounded-3xl border border-red-100 bg-red-50 p-4 text-sm leading-6 text-red-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-black">批量重跑进行中</div>
                <div className="mt-1 text-xs font-semibold opacity-85">{batchRerunStatusText || "正在处理需重跑块；已完成的块会实时保留。"}</div>
              </div>
              <Button size="sm" variant="destructive" onClick={onCancelBatchRerun}>停止重跑</Button>
            </div>
          </div>
        ) : null}
        {result || compareData?.chunks.length ? (
          <>
            <RewriteDiffPanel data={compareData} busy={busy} rerunFailures={rerunFailures} detectionMatchesByChunk={detectionMatchesByChunk} reviewDecisions={reviewDecisions} onReviewDecisionChange={onReviewDecisionChange} onRerunChunk={onRerunChunk} />

            {result ? <details className="group shrink-0 rounded-3xl border border-border/70 bg-background/75">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground">
                <span>{"统计与导出安全"}</span>
                <span className="text-xs text-muted-foreground group-open:hidden">{"展开"}</span>
                <span className="hidden text-xs text-muted-foreground group-open:inline">{"收起"}</span>
              </summary>
              <div className="space-y-4 border-t border-border/70 p-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <MetricCard icon={<Layers2 className="h-4 w-4" />} label={T.limit} value={String(result.chunkLimit)} />
                  <MetricCard icon={<ScanText className="h-4 w-4" />} label={T.input} value={String(result.inputSegmentCount)} />
                  <MetricCard icon={<ScanText className="h-4 w-4" />} label={T.output} value={String(result.outputSegmentCount)} />
                  <MetricCard icon={<FileOutput className="h-4 w-4" />} label={T.paragraph} value={String(result.paragraphCount)} />
                </div>
                <QualityReport result={result} compareData={compareData} qualitySummary={qualitySummary} />
                <ExportSafetyReport result={exportResult} />
              </div>
            </details> : <LiveHint />}

            {result ? <details className="group shrink-0 rounded-3xl border border-border/70 bg-background/75">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground">
                <span>{T.preview}</span>
                {preview ? <Badge variant="outline">{preview.previewChars}/{preview.totalChars} {T.chars}</Badge> : null}
              </summary>
              <div className="border-t border-border/70 p-4">
                <ScrollArea className="h-72 rounded-2xl bg-muted/40 p-4">
                  <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">{deferredPreviewText || T.noPreview}</pre>
                </ScrollArea>
              </div>
            </details> : null}
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-background/70 p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FileOutput className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">{T.noResult}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{T.noResultHint}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RewriteDiffPanel({ data, busy, rerunFailures, detectionMatchesByChunk, reviewDecisions, onReviewDecisionChange, onRerunChunk }: { data: RoundCompareData | null; busy: boolean; rerunFailures: RerunFailure[]; detectionMatchesByChunk: Record<string, DetectionReportMatch[]>; reviewDecisions: Record<string, ReviewDecision>; onReviewDecisionChange: (chunkId: string, decision: ReviewDecision) => void; onRerunChunk: (chunkId: string, userFeedback?: string) => void }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const chunkRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const restoredKeyRef = useRef("");
  const previousChunkCountRef = useRef(0);
  const previousFailedCountRef = useRef(0);
  const previousCandidateCountRef = useRef(0);
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

  useEffect(() => {
    return () => {
      const node = scrollRef.current;
      if (node) {
        diffScrollPositions.set(scrollKey, node.scrollTop);
      }
    };
  }, [scrollKey]);

  const jumpToReviewChunk = (direction: "previous" | "next") => {
    const node = scrollRef.current;
    if (!node || !reviewChunkIds.length) {
      return;
    }
    const threshold = node.scrollTop + (direction === "next" ? 24 : -24);
    let targetIndex = -1;
    if (direction === "next") {
      targetIndex = reviewChunkIds.findIndex((chunkId) => (chunkRefs.current[chunkId]?.offsetTop ?? Number.POSITIVE_INFINITY) > threshold);
      if (targetIndex < 0) targetIndex = 0;
    } else {
      for (let index = reviewChunkIds.length - 1; index >= 0; index -= 1) {
        const offsetTop = chunkRefs.current[reviewChunkIds[index]]?.offsetTop ?? Number.NEGATIVE_INFINITY;
        if (offsetTop < threshold) {
          targetIndex = index;
          break;
        }
      }
      if (targetIndex < 0) targetIndex = reviewChunkIds.length - 1;
    }
    const targetId = reviewChunkIds[targetIndex];
    const targetNode = chunkRefs.current[targetId];
    if (targetNode) {
      targetNode.scrollIntoView({ behavior: "smooth", block: "start" });
      setFocusedReviewIndex(targetIndex);
    }
  };

  if (!allChunks.length) {
    return (
      <div className="fy-empty-state flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <SplitSquareHorizontal className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-foreground">{T.diff}</h3>
        <div className="mt-2 text-sm text-muted-foreground">{T.noDiff}</div>
      </div>
    );
  }

  return (
    <div className="fy-panel flex min-h-[28rem] flex-[1_0_28rem] flex-col p-4">
      <div className="mb-4 shrink-0 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <SplitSquareHorizontal className="h-4 w-4 text-primary" />
            {T.diff}
          </div>
          <Badge variant="secondary">{shownLabel} {shownChunks.length}</Badge>
        </div>
        <div className="fy-inline-toolbar">
          <Badge variant="outline">{data?.chunkCount ?? allChunks.length} {T.chunks}</Badge>
          <Badge variant={reviewChunkIds.length ? "warning" : "success"}>{T.reviewChunks} {reviewChunkIds.length}</Badge>
          <Badge variant={failedChunkIds.length ? "warning" : "outline"}>{T.failedChunks} {failedChunkIds.length}</Badge>
          <Badge variant={candidateChunkIds.length ? "outline" : "secondary"}>{T.candidateChunks} {candidateChunkIds.length}</Badge>
          <Badge variant={numberRiskChunkIds.length ? "warning" : "outline"}>{T.numberRisk} {numberRiskChunkIds.length}</Badge>
          <Badge variant={citationRiskChunkIds.length ? "warning" : "outline"}>{T.citationRisk} {citationRiskChunkIds.length}</Badge>
          <Button size="sm" variant={filterMode === "review" ? "default" : "outline"} onClick={() => setFilterMode((value) => value === "review" ? "all" : "review")} disabled={!reviewChunkIds.length && filterMode !== "review"}>
            {filterMode === "review" ? T.showAll : T.reviewOnly}
          </Button>
          <Button size="sm" variant={filterMode === "failed" ? "default" : "outline"} onClick={() => setFilterMode((value) => value === "failed" ? "all" : "failed")} disabled={!failedChunkIds.length && filterMode !== "failed"}>
            {filterMode === "failed" ? T.showAll : T.failedOnly}
          </Button>
          <Button size="sm" variant={filterMode === "candidate" ? "default" : "outline"} onClick={() => setFilterMode((value) => value === "candidate" ? "all" : "candidate")} disabled={!candidateChunkIds.length && filterMode !== "candidate"}>
            {filterMode === "candidate" ? T.showAll : T.candidateOnly}
          </Button>
          <Button size="sm" variant={filterMode === "changed" ? "default" : "outline"} onClick={() => setFilterMode((value) => value === "changed" ? "all" : "changed")} disabled={!changedChunkIds.length && filterMode !== "changed"}>
            {filterMode === "changed" ? T.showAll : T.changedChunks}
          </Button>
          <Button size="sm" variant={filterMode === "number" ? "default" : "outline"} onClick={() => setFilterMode((value) => value === "number" ? "all" : "number")} disabled={!numberRiskChunkIds.length && filterMode !== "number"}>
            {filterMode === "number" ? T.showAll : T.numberRisk}
          </Button>
          <Button size="sm" variant={filterMode === "citation" ? "default" : "outline"} onClick={() => setFilterMode((value) => value === "citation" ? "all" : "citation")} disabled={!citationRiskChunkIds.length && filterMode !== "citation"}>
            {filterMode === "citation" ? T.showAll : T.citationRisk}
          </Button>
          <Button size="sm" variant="outline" onClick={() => jumpToReviewChunk("previous")} disabled={!reviewChunkIds.length}>{T.previousReview}</Button>
          <Button size="sm" variant="outline" onClick={() => jumpToReviewChunk("next")} disabled={!reviewChunkIds.length}>{T.nextReview}</Button>
        </div>
      </div>
      {failedChunkIds.length ? (
        <div className="fy-callout fy-tone-danger mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="font-semibold">{T.failedChunks} {failedChunkIds.length}：</span>
            <span>{T.rerunFailureSummary}</span>
          </div>
          <Button size="sm" variant={filterMode === "failed" ? "destructive" : "outline"} onClick={() => setFilterMode(filterMode === "failed" ? "all" : "failed")}>
            {filterMode === "failed" ? T.showAll : T.viewFailedChunks}
          </Button>
        </div>
      ) : null}
      {candidateChunkIds.length ? (
        <div className="fy-callout mb-4 flex flex-wrap items-center justify-between gap-3 border-sky-200 bg-sky-50 text-sky-800">
          <div className="min-w-0 flex-1">
            <span className="font-semibold">{T.candidateChunks} {candidateChunkIds.length}：</span>
            <span>{T.rejectedCandidateHint}</span>
          </div>
          <Button size="sm" variant={filterMode === "candidate" ? "default" : "outline"} onClick={() => setFilterMode(filterMode === "candidate" ? "all" : "candidate")}>
            {filterMode === "candidate" ? T.showAll : T.viewCandidateChunks}
          </Button>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        onScroll={(event) => diffScrollPositions.set(scrollKey, event.currentTarget.scrollTop)}
        className="min-h-0 flex-1 overflow-y-auto pr-3"
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
              ? "border-red-200 bg-red-50 text-red-800"
              : matchTone === "review"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-slate-200 bg-slate-50 text-slate-600";
            return (
              <div
                key={chunk.chunkId}
                ref={(node) => {
                  chunkRefs.current[chunk.chunkId] = node;
                }}
                className={`grid gap-4 rounded-3xl border p-4 transition xl:grid-cols-2 ${rerunFailure ? "border-red-200 bg-red-50/40" : hasRejectedCandidate ? "border-sky-200 bg-sky-50/35" : needsReview ? "border-amber-200 bg-amber-50/35" : "border-border/70 bg-muted/30"} ${focusedChunkId === chunk.chunkId ? "ring-2 ring-amber-300 ring-offset-2" : ""}`}
              >
                {rerunFailure ? (
                  <div className="xl:col-span-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">
                    <span className="font-semibold">{T.rerunFailure}：</span>
                    <span>{rerunFailure.error}</span>
                    <span className="ml-2 opacity-80">{T.rerunFailureHint}</span>
                    {failureRejectedCandidates.length ? <span className="ml-2 font-medium">已保留 {failureRejectedCandidates.length} 个模型候选，可在下方展开查看。</span> : null}
                  </div>
                ) : null}
                {detectionMatches.length ? (
                  <div className={`xl:col-span-2 flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2 text-xs ${matchClassName}`}>
                    <span className="font-semibold">{matchTitle}</span>
                    {detectionMatches.slice(0, 3).map((match) => (
                      <Badge key={`${match.segment.index}-${match.confidence}`} variant={match.confidence === "strong" ? "success" : match.confidence === "review" ? "warning" : "outline"}>
                        #{match.segment.index} {match.segment.probability}% · {match.label} {Math.round(match.score * 100)}%
                      </Badge>
                    ))}
                    {detectionMatches[0]?.reason ? <span className="basis-full text-[11px] opacity-80">{detectionMatches[0].reason}</span> : null}
                    {detectionMatches[0]?.evidence.matchedFragments?.[0] ? (
                    <span className="basis-full break-all rounded-xl bg-white/70 px-2 py-1 text-[11px] opacity-80">
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
                <TextPane title={T.rewrite} text={chunk.outputText} tone="rewrite" />
                <div className="xl:col-span-2">
                  <ChunkQualityBar chunk={displayChunk} busy={busy} decision={reviewDecisions[chunk.chunkId] ?? "rewrite"} onDecisionChange={(decision) => onReviewDecisionChange(chunk.chunkId, decision)} onRerun={(userFeedback) => onRerunChunk(chunk.chunkId, userFeedback)} />
                </div>
              </div>
            );
          }) : (
            <div className="rounded-3xl border border-dashed border-border bg-white/80 p-8 text-center">
              <div className="text-base font-semibold text-foreground">{emptyState.title}</div>
              <div className="mt-2 text-sm text-muted-foreground">{emptyState.hint}</div>
              <Button className="mt-4" size="sm" variant="outline" onClick={() => setFilterMode("all")}>{T.showAll}</Button>
            </div>
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
    <div className={tone === "rewrite" ? "rounded-2xl bg-emerald-50 p-3" : "rounded-2xl bg-white p-3"}>
      <div className={tone === "rewrite" ? "mb-2 text-xs font-semibold text-emerald-700" : "mb-2 text-xs font-semibold text-slate-500"}>{title}</div>
      <div className="max-h-[42vh] overflow-auto whitespace-pre-wrap pr-2 text-sm leading-7 text-foreground">{text}</div>
    </div>
  );
}

function ExportSafetyReport({ result }: { result: ExportResult | null }) {
  const isDocx = result?.format === "docx";
  const guardPassed = isDocx && Boolean(result.guardPath) && (result.guardIssueCount ?? 0) === 0;
  const auditPassed = isDocx && Boolean(result.auditPath) && (result.auditIssueCount ?? 0) === 0;
  const preflightPassed = isDocx && (result.preflightIssueCount ?? 0) === 0;
  const allPassed = guardPassed && auditPassed && preflightPassed;
  return (
    <div className="rounded-3xl border border-border/70 bg-background/75 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {T.safety}
        </div>
        {allPassed ? <Badge variant="success">Word 导出检查通过</Badge> : <Badge variant={isDocx ? "warning" : "outline"}>{isDocx ? "需要查看检查结果" : T.waitDocx}</Badge>}
      </div>
      {!isDocx ? (
        <div className="mb-3 rounded-2xl border border-dashed border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
          导出 Word 后，这里会显示硬审计、保护区审计和排版预检。TXT 导出不触发 Word 排版检查。
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-5">
        <SafetyItem label={T.fingerprint} value={isDocx ? T.checked : T.pending} ok={isDocx} />
        <SafetyItem label={T.exportGuard} value={isDocx ? `${result?.guardIssueCount ?? 0} 问题` : T.pending} ok={guardPassed} />
        <SafetyItem label={T.protectedArea} value={isDocx ? `${result?.auditIssueCount ?? 0} 问题` : T.waitAudit} ok={auditPassed} />
        <SafetyItem label={T.scope} value={formatScopeLabel(result?.formatScope, isDocx)} ok={isDocx} />
        <SafetyItem label={T.formatPreflight} value={isDocx ? `${result?.preflightIssueCount ?? 0} 问题` : T.pending} ok={preflightPassed} />
      </div>
      {isDocx ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          <AuditStep
            title="硬审计"
            ok={guardPassed}
            count={result?.guardIssueCount ?? 0}
            path={result?.guardPath}
            text="阻止目录、表格、参考文献、保护区内容被误改。"
            samples={result?.guardIssueSamples}
          />
          <AuditStep
            title="保护区审计"
            ok={auditPassed}
            count={result?.auditIssueCount ?? 0}
            path={result?.auditPath}
            text="核对保护区文本、表格结构和导出回填边界。"
            samples={result?.auditIssueSamples}
          />
          <AuditStep
            title="排版预检"
            ok={preflightPassed}
            count={result?.preflightIssueCount ?? 0}
            path={result?.preflightPath}
            text="检查学校规范样式、段落行距和导出前风险。"
            samples={result?.preflightIssueSamples}
          />
        </div>
      ) : null}
      {isDocx && ((result?.contentLockedStyleCount ?? 0) > 0 || (result?.tableStyleCount ?? 0) > 0) ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          保护区样式 {result?.contentLockedStyleCount ?? 0} 段；表格样式 {result?.tableStyleCount ?? 0} 段；三线表 {result?.tableBorderCount ?? 0} 个。
        </div>
      ) : null}
    </div>
  );
}

function AuditStep({ title, ok, count, path, text, samples = [] }: { title: string; ok: boolean; count: number; path?: string; text: string; samples?: ExportIssueSample[] }) {
  return (
    <div className={`rounded-2xl border p-3 ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{title}</div>
        <Badge variant={ok ? "success" : "warning"}>{count} 问题</Badge>
      </div>
      <div className="mt-1 text-xs leading-5 opacity-80">{text}</div>
      {samples.length ? (
        <div className="mt-2 space-y-1">
          {samples.slice(0, 3).map((sample, index) => (
            <div key={`${sample.code ?? "issue"}-${index}`} className="rounded-xl bg-white/70 px-2 py-1 text-[11px] leading-5">
              <div className="flex flex-wrap items-center gap-1 font-semibold">
                {sample.code ? <span>{sample.code}</span> : null}
                {sample.location ? <span className="opacity-70">{sample.location}</span> : null}
              </div>
              <div>{sample.message}</div>
              {sample.sample ? <div className="line-clamp-2 opacity-70">{sample.sample}</div> : null}
            </div>
          ))}
        </div>
      ) : count > 0 ? (
        <div className="mt-2 rounded-xl bg-white/70 px-2 py-1 text-[11px] leading-5 opacity-75">打开报告文件可查看详细问题。</div>
      ) : null}
      {path ? <div className="mt-2 truncate text-[11px] opacity-75">{formatArtifactLabel("报告", path)}</div> : null}
    </div>
  );
}

function formatArtifactLabel(label: string, path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const filename = parts[parts.length - 1] || path;
  return `${label} · ${filename}`;
}

function formatScopeLabel(scope: string | undefined, isDocx: boolean): string {
  if (!isDocx) return T.pending;
  if (scope === "editable_body_only") return T.bodyOnly;
  if (scope === "content_locked_style_allowed") return T.contentLockedStyle;
  return T.newDoc;
}

function LiveHint() {
  return (
    <div className="shrink-0 rounded-3xl border border-primary/15 bg-primary/5 p-4 text-sm text-primary">
      <div className="font-semibold">{T.liveRunning}</div>
      <div className="mt-1 opacity-80">{T.liveHint}</div>
    </div>
  );
}

function getReviewDecisionMode(decision: ReviewDecision): "rewrite" | "source" | "custom" {
  if (typeof decision === "object" && decision?.mode === "custom") return "custom";
  return decision === "source" || decision === "source_confirmed" ? "source" : "rewrite";
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

function isLatinLikeChar(char: string): boolean {
  return /[A-Za-z0-9_.%+\-/]/.test(char);
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

function tokenizeCandidateDiff(text: string): string[] {
  const normalized = normalizeDiffText(text);
  const tokens: string[] = [];
  let buffer = "";
  const flushBuffer = () => {
    if (buffer) {
      tokens.push(buffer);
      buffer = "";
    }
  };
  for (const char of normalized) {
    if (/\s/.test(char)) {
      flushBuffer();
      if (tokens[tokens.length - 1] !== " ") {
        tokens.push(" ");
      }
      continue;
    }
    const code = char.charCodeAt(0);
    if (isCjkCode(code)) {
      flushBuffer();
      tokens.push(char);
      continue;
    }
    if (isLatinLikeChar(char)) {
      buffer += char;
      continue;
    }
    flushBuffer();
    tokens.push(char);
  }
  flushBuffer();
  return tokens.filter((token, index, list) => token !== " " || (index > 0 && index < list.length - 1));
}

function mergeDiffSegments(segments: CandidateDiffSegment[]): CandidateDiffSegment[] {
  const merged: CandidateDiffSegment[] = [];
  for (const segment of segments) {
    if (!segment.text) continue;
    const previous = merged[merged.length - 1];
    if (previous && previous.kind === segment.kind) {
      previous.text += segment.text;
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}

function buildCandidateDiffView(sourceText: string, candidateText: string): CandidateDiffView {
  const sourceTokens = tokenizeCandidateDiff(sourceText);
  const candidateTokens = tokenizeCandidateDiff(candidateText);
  const maxTokenCount = 900;
  const maxCellCount = 420000;
  const tooLarge = sourceTokens.length > maxTokenCount || candidateTokens.length > maxTokenCount || sourceTokens.length * candidateTokens.length > maxCellCount;
  if (tooLarge) {
    return {
      sourceSegments: [{ text: normalizeDiffText(sourceText), kind: "same" }],
      candidateSegments: [{ text: normalizeDiffText(candidateText), kind: "same" }],
      tooLarge: true,
      sourceTokenCount: sourceTokens.length,
      candidateTokenCount: candidateTokens.length,
      addedTokenCount: 0,
      removedTokenCount: 0,
      changeRatio: 0,
    };
  }

  const sourceLength = sourceTokens.length;
  const candidateLength = candidateTokens.length;
  const table = Array.from({ length: sourceLength + 1 }, () => new Uint16Array(candidateLength + 1));
  for (let sourceIndex = sourceLength - 1; sourceIndex >= 0; sourceIndex -= 1) {
    for (let candidateIndex = candidateLength - 1; candidateIndex >= 0; candidateIndex -= 1) {
      table[sourceIndex][candidateIndex] = sourceTokens[sourceIndex] === candidateTokens[candidateIndex]
        ? table[sourceIndex + 1][candidateIndex + 1] + 1
        : Math.max(table[sourceIndex + 1][candidateIndex], table[sourceIndex][candidateIndex + 1]);
    }
  }

  const sourceSegments: CandidateDiffSegment[] = [];
  const candidateSegments: CandidateDiffSegment[] = [];
  let addedTokenCount = 0;
  let removedTokenCount = 0;
  let sourceIndex = 0;
  let candidateIndex = 0;
  while (sourceIndex < sourceLength || candidateIndex < candidateLength) {
    if (sourceIndex < sourceLength && candidateIndex < candidateLength && sourceTokens[sourceIndex] === candidateTokens[candidateIndex]) {
      sourceSegments.push({ text: sourceTokens[sourceIndex], kind: "same" });
      candidateSegments.push({ text: candidateTokens[candidateIndex], kind: "same" });
      sourceIndex += 1;
      candidateIndex += 1;
    } else if (candidateIndex < candidateLength && (sourceIndex >= sourceLength || table[sourceIndex][candidateIndex + 1] >= table[sourceIndex + 1][candidateIndex])) {
      candidateSegments.push({ text: candidateTokens[candidateIndex], kind: "added" });
      addedTokenCount += candidateTokens[candidateIndex].trim() ? 1 : 0;
      candidateIndex += 1;
    } else if (sourceIndex < sourceLength) {
      sourceSegments.push({ text: sourceTokens[sourceIndex], kind: "removed" });
      removedTokenCount += sourceTokens[sourceIndex].trim() ? 1 : 0;
      sourceIndex += 1;
    }
  }

  const baseTokenCount = Math.max(1, Math.max(sourceTokens.filter((token) => token.trim()).length, candidateTokens.filter((token) => token.trim()).length));
  return {
    sourceSegments: mergeDiffSegments(sourceSegments),
    candidateSegments: mergeDiffSegments(candidateSegments),
    tooLarge: false,
    sourceTokenCount: sourceTokens.length,
    candidateTokenCount: candidateTokens.length,
    addedTokenCount,
    removedTokenCount,
    changeRatio: (addedTokenCount + removedTokenCount) / baseTokenCount,
  };
}

function formatDiffRatio(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function compactFeedbackText(text: string, maxLength = 220): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

function buildCandidateRerunFeedback(inspection: CandidateInspection, candidate: RejectedCandidate): string {
  const findings = [...inspection.issues, ...inspection.warnings].slice(0, 6);
  const lines = [
    "请重新改写本块，重点修复上一候选暴露的问题：",
    ...(findings.length ? findings : ["候选未通过硬校验，请保持原事实顺序、数字、引用和语言不变。"]).map((item) => `- ${item}`),
  ];
  if (candidate.error) {
    lines.push(`- 算法拦截信息：${compactFeedbackText(candidate.error)}`);
  }
  lines.push("要求：不要直接复用上一候选；只调整表达，不改变事实、顺序、数字、引用和语言。");
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

  const level: CandidateInspectionLevel = issues.length ? "danger" : warnings.length ? "review" : "safe";
  return {
    level,
    label: level === "danger" ? "不建议直接采用" : level === "review" ? "需要人工核对" : "可重点查看",
    summary: level === "danger"
      ? "该候选触发硬风险，除非你确认算法误判，否则建议补充反馈后重跑。"
      : level === "review"
        ? "该候选没有明显硬伤，但采用前需要核对数字、引用或长度。"
        : "该候选未发现明显硬伤，可与原文对照后人工采用。",
    lengthRatio,
    lengthText: lengthRatio === null ? "长度 - " : `长度 ${(lengthRatio * 100).toFixed(0)}%`,
    languageText: sourceLanguage === outputLanguage || sourceLanguage === "mixed" || outputLanguage === "mixed" ? "语言一致" : "语言变化",
    numberText: missingNumbers.length || addedNumbers.length ? `数字差异 ${missingNumbers.length + addedNumbers.length}` : "数字稳定",
    citationText: missingCitations.length ? `引用缺失 ${missingCitations.length}` : "引用稳定",
    issues,
    warnings,
  };
}

function CandidateInspectionPanel({ inspection }: { inspection: CandidateInspection }) {
  const toneClass = inspection.level === "danger"
    ? "border-red-200 bg-red-50 text-red-900"
    : inspection.level === "review"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";
  const badgeVariant = inspection.level === "safe" ? "success" : inspection.level === "review" ? "warning" : "outline";
  return (
    <div className={`mb-3 rounded-xl border p-3 text-[11px] leading-5 ${toneClass}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant={badgeVariant}>候选体检</Badge>
        <span className="font-semibold">{inspection.summary}</span>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        <Badge variant="outline">{inspection.lengthText}</Badge>
        <Badge variant="outline">{inspection.languageText}</Badge>
        <Badge variant="outline">{inspection.numberText}</Badge>
        <Badge variant="outline">{inspection.citationText}</Badge>
      </div>
      {inspection.issues.length || inspection.warnings.length ? (
        <div className="grid gap-1">
          {inspection.issues.slice(0, 4).map((item) => <div key={`issue-${item}`}>- {item}</div>)}
          {inspection.warnings.slice(0, 3).map((item) => <div key={`warning-${item}`}>- {item}</div>)}
        </div>
      ) : null}
    </div>
  );
}

function CandidateDiffPanel({ sourceText, candidateText }: { sourceText: string; candidateText: string }) {
  const diff = buildCandidateDiffView(sourceText, candidateText);
  const changedTokenCount = diff.addedTokenCount + diff.removedTokenCount;
  return (
    <details className="mb-3 rounded-xl border border-slate-200 bg-slate-50/90 p-3 text-slate-900" open={!diff.tooLarge && changedTokenCount > 0}>
      <summary className="cursor-pointer select-none">
        <span className="inline-flex flex-wrap items-center gap-2 text-[11px]">
          <Badge variant="outline">差异审稿</Badge>
          {diff.tooLarge ? (
            <span>文本较长，已保留完整候选，建议重点看体检项与原文。</span>
          ) : (
            <>
              <Badge variant="outline">新增 {diff.addedTokenCount}</Badge>
              <Badge variant="outline">删除 {diff.removedTokenCount}</Badge>
              <Badge variant={diff.changeRatio > 0.45 ? "warning" : "outline"}>改动 {formatDiffRatio(diff.changeRatio)}</Badge>
            </>
          )}
        </span>
      </summary>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <CandidateDiffPane title="原文删减视图" segments={diff.sourceSegments} focusKind="removed" />
        <CandidateDiffPane title="候选新增视图" segments={diff.candidateSegments} focusKind="added" />
      </div>
    </details>
  );
}

function CandidateDiffPane({ title, segments, focusKind }: { title: string; segments: CandidateDiffSegment[]; focusKind: CandidateDiffKind }) {
  return (
    <div className="fy-section rounded-xl p-3">
      <div className="mb-2 text-[11px] font-semibold text-slate-600">{title}</div>
      <div className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-slate-800">
        {segments.length ? segments.map((segment, index) => (
          <span key={`${segment.kind}-${index}`} className={getCandidateDiffSegmentClass(segment.kind, focusKind)}>
            {segment.text}
          </span>
        )) : <span className="text-slate-400">暂无文本</span>}
      </div>
    </div>
  );
}

function getCandidateDiffSegmentClass(kind: CandidateDiffKind, focusKind: CandidateDiffKind): string {
  if (kind === "added") {
    return "rounded bg-emerald-100 px-0.5 font-medium text-emerald-900";
  }
  if (kind === "removed") {
    return "rounded bg-red-100 px-0.5 font-medium text-red-900 line-through decoration-red-500";
  }
  return focusKind === "removed" ? "text-slate-700" : "text-slate-800";
}

function ChunkQualityBar({ chunk, busy, decision, onDecisionChange, onRerun }: { chunk: RoundCompareData["chunks"][number]; busy: boolean; decision: ReviewDecision; onDecisionChange: (decision: ReviewDecision) => void; onRerun: (userFeedback?: string) => void }) {
  const quality = chunk.quality;
  const needsReview = Boolean(quality?.needsReview);
  const flags = quality?.flags ?? [];
  const advisoryFlags = quality?.advisoryFlags ?? [];
  const reasons = quality?.reviewReasons ?? quality?.machineLikeRisks ?? [];
  const advice = chunk.rerunAdvice?.length ? chunk.rerunAdvice : quality?.rewriteAdvice ?? [];
  const isSourceFallback = chunk.fallbackMode === "source" || flags.includes("source_fallback");
  const [feedback, setFeedback] = useState("");
  const [copiedCandidateKey, setCopiedCandidateKey] = useState("");
  const [pendingAdoptCandidateKey, setPendingAdoptCandidateKey] = useState("");
  const selectedBaseDecision = getReviewDecisionMode(decision);
  const isConfirmed = isReviewDecisionConfirmed(decision);
  const rejectedCandidates = chunk.rejectedCandidates ?? [];
  const reviewToolsVisible = needsReview || rejectedCandidates.length > 0;
  const decisionLabel = selectedBaseDecision === "custom" ? T.customChoice : selectedBaseDecision === "rewrite" ? T.useRewrite : T.useSource;
  function adoptRejectedCandidate(candidate: RejectedCandidate, inspection: CandidateInspection, candidateKey: string) {
    if (!candidate.outputText?.trim() || candidate.truncated) {
      return;
    }
    if (inspection.level !== "safe" && pendingAdoptCandidateKey !== candidateKey) {
      setPendingAdoptCandidateKey(candidateKey);
      setFeedback(buildCandidateRerunFeedback(inspection, candidate));
      return;
    }
    setPendingAdoptCandidateKey("");
    onDecisionChange({
      mode: "custom",
      text: candidate.outputText,
      source: "rejected_candidate",
      attempt: candidate.attempt,
      candidate: candidate.candidate,
      error: candidate.error,
    });
  }
  return (
    <div className="space-y-2 rounded-2xl border border-border/60 bg-white/75 px-3 py-2 text-xs text-muted-foreground">
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
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant={selectedBaseDecision === "rewrite" && isConfirmed ? "default" : "outline"} onClick={() => onDecisionChange("rewrite_confirmed")}>{isConfirmed && selectedBaseDecision === "rewrite" ? `${T.confirmedChoice}${T.useRewrite}` : T.useRewrite}</Button>
          <Button size="sm" variant={selectedBaseDecision === "source" && isConfirmed ? "default" : "outline"} onClick={() => onDecisionChange("source_confirmed")}>{isConfirmed && selectedBaseDecision === "source" ? `${T.confirmedChoice}${T.useSource}` : T.useSource}</Button>
          <Button size="sm" variant="outline" onClick={() => onRerun(feedback)} disabled={busy}>{zh(0x5b9a, 0x5411, 0x91cd, 0x8dd1)}</Button>
        </div>
      </div>
      {rejectedCandidates.length ? (
        <details className="rounded-xl border border-sky-200 bg-sky-50/85 p-3 text-sky-950" open={isSourceFallback || !needsReview}>
          <summary className="cursor-pointer select-none font-semibold">
            {T.rejectedCandidate}（{rejectedCandidates.length}）
          </summary>
          <div className="mt-2 text-[11px] leading-5 opacity-80">{T.rejectedCandidateHint}</div>
          <div className="mt-3 grid gap-3">
            {rejectedCandidates.map((candidate, index) => {
              const candidateKey = `${candidate.attempt ?? "?"}-${candidate.candidate ?? index}`;
              const inspection = inspectRejectedCandidate(chunk.inputText, candidate);
              const canAdopt = Boolean(candidate.outputText?.trim()) && !candidate.truncated;
              const needsAdoptConfirm = inspection.level !== "safe";
              const isPendingAdopt = pendingAdoptCandidateKey === candidateKey;
              const candidateFeedback = buildCandidateRerunFeedback(inspection, candidate);
              return (
                <div key={candidateKey} className="rounded-2xl border border-sky-200 bg-white/90 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">尝试 {candidate.attempt ?? "-"} / 候选 {candidate.candidate ?? index + 1}</Badge>
                    <Badge variant={inspection.level === "safe" ? "success" : inspection.level === "review" ? "warning" : "outline"}>{inspection.label}</Badge>
                    {candidate.truncated ? <Badge variant="warning">内容过长已截断</Badge> : null}
                    {candidate.error ? <span className="min-w-0 flex-1 truncate text-[11px] opacity-75">{candidate.error}</span> : null}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard?.writeText(candidate.outputText ?? "");
                        setCopiedCandidateKey(candidateKey);
                      }}
                    >
                      {copiedCandidateKey === candidateKey ? T.copied : T.copyCandidate}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setFeedback(candidateFeedback);
                        setPendingAdoptCandidateKey(candidateKey);
                      }}
                    >
                      生成重跑意见
                    </Button>
                    <Button
                      size="sm"
                      variant={selectedBaseDecision === "custom" && typeof decision === "object" && decision.text === candidate.outputText ? "default" : isPendingAdopt ? "destructive" : "outline"}
                      disabled={!canAdopt}
                      onClick={() => adoptRejectedCandidate(candidate, inspection, candidateKey)}
                    >
                      {needsAdoptConfirm && !isPendingAdopt ? "先确认风险" : isPendingAdopt ? "确认采用候选" : T.adoptCandidate}
                    </Button>
                  </div>
                  {isPendingAdopt ? (
                    <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-900">
                      已把候选体检问题写入下方反馈框。若要继续使用该候选，请再次点击“确认采用候选”；否则建议直接定向重跑。
                    </div>
                  ) : null}
                  <CandidateInspectionPanel inspection={inspection} />
                  <CandidateDiffPanel sourceText={chunk.inputText} candidateText={candidate.outputText ?? ""} />
                  <div className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950/95 p-3 text-xs leading-6 text-slate-50">
                    {candidate.outputText}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
      {reviewToolsVisible ? (
        <div className="grid gap-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-amber-950 lg:grid-cols-[1fr_1fr_1.2fr]">
          {isSourceFallback ? (
            <div className="rounded-xl border border-amber-300 bg-white/70 p-2 leading-5 lg:col-span-3">
              <span className="font-semibold">{T.sourceFallback}：</span>
              {T.sourceFallbackHint}
              {chunk.fallbackError ? <span className="ml-1 opacity-80">{chunk.fallbackError}</span> : null}
            </div>
          ) : null}
          <div>
            <div className="mb-1 font-semibold">{zh(0x95ee, 0x9898, 0x8bca, 0x65ad)}</div>
            {reasons.length ? reasons.slice(0, 3).map((reason, index) => (
              <div key={`${reason.code}-${index}`} className="leading-5">- {reason.message || formatChunkFlag(reason.code)}</div>
            )) : <div>{rejectedCandidates.length ? "候选输出需要人工判断，可生成反馈后重跑，或二次确认后采用。" : zh(0x7cfb, 0x7edf, 0x5df2, 0x6807, 0x8bb0, 0x6b64, 0x5757, 0x9700, 0x5ba1, 0x9605, 0xff0c, 0x5efa, 0x8bae, 0x5b9a, 0x5411, 0x91cd, 0x8dd1, 0x6216, 0x4eba, 0x5de5, 0x786e, 0x8ba4, 0x3002)}</div>}
          </div>
          <div>
            <div className="mb-1 font-semibold">{T.systemFeedback}</div>
            {advice.length ? advice.slice(0, 3).map((item, index) => <div key={index} className="leading-5">- {item}</div>) : <div>{zh(0x91cd, 0x8dd1, 0x4f1a, 0x81ea, 0x52a8, 0x643a, 0x5e26, 0x5f53, 0x524d, 0x98ce, 0x9669, 0x6807, 0x7b7e, 0x4e0e, 0x4fdd, 0x62a4, 0x533a, 0x7ea6, 0x675f, 0x3002)}</div>}
          </div>
          <div className="space-y-2">
            <div className="font-semibold">{T.reviewFeedback}</div>
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder={T.feedbackPlaceholder}
                    className="min-h-20 w-full resize-none rounded-xl border border-amber-200 bg-white/90 px-3 py-2 text-xs text-foreground outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
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

function QualityReport({ result, compareData, qualitySummary }: { result: RoundResult | null; compareData: RoundCompareData | null; qualitySummary: RoundQualitySummary | null }) {
  const splitSummary = qualitySummary?.paragraphSplitSummary ?? compareData?.paragraphSplitSummary;
  const citationInput = qualitySummary?.citationInputCount ?? 0;
  const citationOutput = qualitySummary?.citationOutputCount ?? 0;
  const citationOk = citationOutput >= citationInput;
  const risks = qualitySummary?.machineLikeRisks ?? [];
  const sentenceStats = qualitySummary?.sentenceStats;
  const styleProfile = qualitySummary?.globalStyleProfile;
  const topStyleItems = [
    ...(styleProfile?.topConnectors ?? []),
    ...(styleProfile?.topTemplatePhrases ?? []),
    ...(styleProfile?.repeatedOpenings ?? []),
  ].slice(0, 5);

  return (
    <div className="rounded-3xl border border-border/70 bg-background/75 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ScanText className="h-4 w-4 text-primary" />
          {T.quality}
        </div>
        <Badge variant="outline">{T.notDetector}</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-6">
        <SafetyItem label={T.splitParagraph} value={`${splitSummary?.splitParagraphCount ?? 0}/${splitSummary?.paragraphCount ?? result?.paragraphCount ?? 0}`} ok />
        <SafetyItem label={T.retry} value={`${qualitySummary?.validationRetryCount ?? 0} 块`} ok={(qualitySummary?.validationRetryCount ?? 0) === 0} />
        <SafetyItem label={T.fallback} value={`${qualitySummary?.sourceFallbackCount ?? 0} 块`} ok={(qualitySummary?.sourceFallbackCount ?? 0) === 0} />
        <SafetyItem label={T.citation} value={`${citationOutput}/${citationInput}`} ok={citationOk} />
        <SafetyItem label={T.rhythm} value={sentenceStats?.count ? `均长 ${sentenceStats.avg ?? 0}` : "待生成"} ok />
        <SafetyItem label={T.styleCard} value={`${qualitySummary?.styleCardChunkCount ?? 0} 块`} ok />
      </div>
      {topStyleItems.length ? (
        <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/80 p-3 text-xs leading-5 text-blue-900">
          <div className="mb-1 font-semibold">{T.globalStyle}</div>
          <div className="flex flex-wrap gap-2">
            {topStyleItems.map((item) => (
              <Badge key={`${item.text}-${item.count}`} variant="outline">{item.text} × {item.count}</Badge>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-3 rounded-2xl border border-border/70 bg-white/80 p-3">
        <div className="mb-2 text-xs font-semibold text-muted-foreground">{T.risk}</div>
        {risks.length ? (
          <div className="grid gap-2">
            {risks.slice(0, 3).map((risk) => (
              <div key={risk.code} className="flex items-start justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <span>{risk.message}</span>
                <Badge variant={risk.level === "high" ? "warning" : "outline"}>{risk.level}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">{T.noRisk}</div>
        )}
      </div>
      {result?.qualityPath ? <div className="mt-3 truncate text-xs text-muted-foreground">{formatArtifactLabel("改写检查", result.qualityPath)}</div> : null}
    </div>
  );
}

function SafetyItem({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-white/80 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className={ok ? "h-4 w-4 text-emerald-600" : "h-4 w-4 text-slate-400"} />
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
