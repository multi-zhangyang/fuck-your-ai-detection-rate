import { type ReactNode, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileOutput, Layers2, ScanText, ShieldCheck, SplitSquareHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DetectionReportMatch, ExportResult, OutputPreview, ReviewDecision, RoundCompareData, RoundQualitySummary, RoundResult } from "@/types/app";

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

type Props = {
  result: RoundResult | null;
  preview: OutputPreview | null;
  compareData: RoundCompareData | null;
  exportResult: ExportResult | null;
  busy: boolean;
  detectionMatchesByChunk?: Record<string, DetectionReportMatch[]>;
  reviewDecisions: Record<string, ReviewDecision>;
  onReviewDecisionChange: (chunkId: string, decision: ReviewDecision) => void;
  onRerunChunk: (chunkId: string, userFeedback?: string) => void;
  onRerunRiskyChunks: () => void;
  onExportReviewedTxt: () => void;
  onExportReviewedDocx: () => void;
  onExportTxt: () => void;
  onExportDocx: () => void;
};

export function ResultCard({ result, preview, compareData, exportResult, busy, detectionMatchesByChunk = {}, reviewDecisions, onReviewDecisionChange, onRerunChunk, onRerunRiskyChunks, onExportReviewedTxt, onExportReviewedDocx, onExportTxt, onExportDocx }: Props) {
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

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        {result || compareData?.chunks.length ? (
          <>
            <RewriteDiffPanel data={compareData} busy={busy} detectionMatchesByChunk={detectionMatchesByChunk} reviewDecisions={reviewDecisions} onReviewDecisionChange={onReviewDecisionChange} onRerunChunk={onRerunChunk} />

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

function RewriteDiffPanel({ data, busy, detectionMatchesByChunk, reviewDecisions, onReviewDecisionChange, onRerunChunk }: { data: RoundCompareData | null; busy: boolean; detectionMatchesByChunk: Record<string, DetectionReportMatch[]>; reviewDecisions: Record<string, ReviewDecision>; onReviewDecisionChange: (chunkId: string, decision: ReviewDecision) => void; onRerunChunk: (chunkId: string, userFeedback?: string) => void }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const chunkRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const restoredKeyRef = useRef("");
  const previousChunkCountRef = useRef(0);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [focusedReviewIndex, setFocusedReviewIndex] = useState(-1);

  const allChunks = data?.chunks ?? [];
  const reviewChunkIds = allChunks
    .filter((chunk) => isReviewChunk(chunk, detectionMatchesByChunk[chunk.chunkId] ?? []))
    .map((chunk) => chunk.chunkId);
  const reviewChunkIdSet = new Set(reviewChunkIds);
  const shownChunks = reviewOnly ? allChunks.filter((chunk) => reviewChunkIdSet.has(chunk.chunkId)) : allChunks;
  const focusedChunkId = focusedReviewIndex >= 0 ? reviewChunkIds[focusedReviewIndex] : "";
  const baseScrollKey = data ? data.outputPath || `${data.docId}-${data.round}` : "empty";
  const scrollKey = `${baseScrollKey}:${reviewOnly ? "review" : "all"}`;
  const chunkCount = shownChunks.length;

  useEffect(() => {
    if (focusedReviewIndex >= reviewChunkIds.length) {
      setFocusedReviewIndex(reviewChunkIds.length ? reviewChunkIds.length - 1 : -1);
    }
  }, [focusedReviewIndex, reviewChunkIds.length]);

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
    if (!reviewOnly) {
      node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
      diffScrollPositions.set(scrollKey, node.scrollHeight);
    }
    previousChunkCountRef.current = chunkCount;
  }, [chunkCount, reviewOnly, scrollKey]);

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
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-background/75 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <SplitSquareHorizontal className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-foreground">{T.diff}</h3>
        <div className="mt-2 text-sm text-muted-foreground">{T.noDiff}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-3xl border border-border/70 bg-background/75 p-4 shadow-soft">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <SplitSquareHorizontal className="h-4 w-4 text-primary" />
          {T.diff}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{data?.chunkCount ?? allChunks.length} {T.chunks}</Badge>
          <Badge variant={reviewChunkIds.length ? "warning" : "success"}>{T.reviewChunks} {reviewChunkIds.length}</Badge>
          <Badge variant="secondary">{reviewOnly ? T.reviewOnly : T.shown} {shownChunks.length}</Badge>
          <Button size="sm" variant={reviewOnly ? "default" : "outline"} onClick={() => setReviewOnly((value) => !value)} disabled={!reviewChunkIds.length && !reviewOnly}>
            {reviewOnly ? T.showAll : T.reviewOnly}
          </Button>
          <Button size="sm" variant="outline" onClick={() => jumpToReviewChunk("previous")} disabled={!reviewChunkIds.length}>{T.previousReview}</Button>
          <Button size="sm" variant="outline" onClick={() => jumpToReviewChunk("next")} disabled={!reviewChunkIds.length}>{T.nextReview}</Button>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={(event) => diffScrollPositions.set(scrollKey, event.currentTarget.scrollTop)}
        className="min-h-0 flex-1 overflow-y-auto pr-3"
      >
        <div className="grid gap-4">
          {shownChunks.length ? shownChunks.map((chunk) => {
            const detectionMatches = detectionMatchesByChunk[chunk.chunkId] ?? [];
            const needsReview = reviewChunkIdSet.has(chunk.chunkId);
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
                className={`grid gap-4 rounded-3xl border p-4 transition xl:grid-cols-2 ${needsReview ? "border-amber-200 bg-amber-50/35" : "border-border/70 bg-muted/30"} ${focusedChunkId === chunk.chunkId ? "ring-2 ring-amber-300 ring-offset-2" : ""}`}
              >
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
                <TextPane title={T.source} text={chunk.inputText} />
                <TextPane title={T.rewrite} text={chunk.outputText} tone="rewrite" />
                <div className="xl:col-span-2">
                  <ChunkQualityBar chunk={chunk} busy={busy} decision={reviewDecisions[chunk.chunkId] ?? "rewrite"} onDecisionChange={(decision) => onReviewDecisionChange(chunk.chunkId, decision)} onRerun={(userFeedback) => onRerunChunk(chunk.chunkId, userFeedback)} />
                </div>
              </div>
            );
          }) : (
            <div className="rounded-3xl border border-dashed border-border bg-white/80 p-8 text-center">
              <div className="text-base font-semibold text-foreground">{T.noReviewChunks}</div>
              <div className="mt-2 text-sm text-muted-foreground">{T.noReviewHint}</div>
              <Button className="mt-4" size="sm" variant="outline" onClick={() => setReviewOnly(false)}>{T.showAll}</Button>
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
          />
          <AuditStep
            title="保护区审计"
            ok={auditPassed}
            count={result?.auditIssueCount ?? 0}
            path={result?.auditPath}
            text="核对保护区文本、表格结构和导出回填边界。"
          />
          <AuditStep
            title="排版预检"
            ok={preflightPassed}
            count={result?.preflightIssueCount ?? 0}
            path={result?.preflightPath}
            text="检查学校规范样式、段落行距和导出前风险。"
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

function AuditStep({ title, ok, count, path, text }: { title: string; ok: boolean; count: number; path?: string; text: string }) {
  return (
    <div className={`rounded-2xl border p-3 ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{title}</div>
        <Badge variant={ok ? "success" : "warning"}>{count} 问题</Badge>
      </div>
      <div className="mt-1 text-xs leading-5 opacity-80">{text}</div>
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
  const selectedBaseDecision = getReviewDecisionMode(decision);
  const isConfirmed = isReviewDecisionConfirmed(decision);
  const rejectedCandidates = chunk.rejectedCandidates ?? [];
  const decisionLabel = selectedBaseDecision === "custom" ? T.customChoice : selectedBaseDecision === "rewrite" ? T.useRewrite : T.useSource;
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
      {needsReview ? (
        <div className="grid gap-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-amber-950 lg:grid-cols-[1fr_1fr_1.2fr]">
          {isSourceFallback ? (
            <div className="rounded-xl border border-amber-300 bg-white/70 p-2 leading-5 lg:col-span-3">
              <span className="font-semibold">{T.sourceFallback}：</span>
              {T.sourceFallbackHint}
              {chunk.fallbackError ? <span className="ml-1 opacity-80">{chunk.fallbackError}</span> : null}
            </div>
          ) : null}
          {rejectedCandidates.length ? (
            <details className="rounded-xl border border-sky-200 bg-sky-50/85 p-3 text-sky-950 lg:col-span-3" open={isSourceFallback}>
              <summary className="cursor-pointer select-none font-semibold">
                {T.rejectedCandidate}（{rejectedCandidates.length}）
              </summary>
              <div className="mt-2 text-[11px] leading-5 opacity-80">{T.rejectedCandidateHint}</div>
              <div className="mt-3 grid gap-3">
                {rejectedCandidates.map((candidate, index) => {
                  const candidateKey = `${candidate.attempt ?? "?"}-${candidate.candidate ?? index}`;
                  const canAdopt = Boolean(candidate.outputText?.trim()) && !candidate.truncated;
                  return (
                    <div key={candidateKey} className="rounded-2xl border border-sky-200 bg-white/90 p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">尝试 {candidate.attempt ?? "-"} / 候选 {candidate.candidate ?? index + 1}</Badge>
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
                          variant={selectedBaseDecision === "custom" && typeof decision === "object" && decision.text === candidate.outputText ? "default" : "outline"}
                          disabled={!canAdopt}
                          onClick={() => onDecisionChange({
                            mode: "custom",
                            text: candidate.outputText,
                            source: "rejected_candidate",
                            attempt: candidate.attempt,
                            candidate: candidate.candidate,
                            error: candidate.error,
                          })}
                        >
                          {T.adoptCandidate}
                        </Button>
                      </div>
                      <div className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950/95 p-3 text-xs leading-6 text-slate-50">
                        {candidate.outputText}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}
          <div>
            <div className="mb-1 font-semibold">{zh(0x95ee, 0x9898, 0x8bca, 0x65ad)}</div>
            {reasons.length ? reasons.slice(0, 3).map((reason, index) => (
              <div key={`${reason.code}-${index}`} className="leading-5">- {reason.message || formatChunkFlag(reason.code)}</div>
            )) : <div>{zh(0x7cfb, 0x7edf, 0x5df2, 0x6807, 0x8bb0, 0x6b64, 0x5757, 0x9700, 0x5ba1, 0x9605, 0xff0c, 0x5efa, 0x8bae, 0x5b9a, 0x5411, 0x91cd, 0x8dd1, 0x6216, 0x4eba, 0x5de5, 0x786e, 0x8ba4, 0x3002)}</div>}
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
              className="min-h-20 w-full resize-none rounded-xl border border-amber-200 bg-white/85 px-3 py-2 text-xs text-foreground outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
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
