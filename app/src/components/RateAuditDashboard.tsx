import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { deriveRateAuditStrategyExecutionState } from "@/lib/rateAuditStrategyExecution";
import { cn } from "@/lib/utils";
import type {
  RateAuditDimensionDelta,
  RateAuditPlateau,
  RateAuditReport,
  RateAuditStage,
  RateAuditStrategyPlan,
} from "@/types/app";

function pointChangeLabel(change: number): string {
  if (change < 0) return `${change} 点`;
  if (change > 0) return `+${change} 点`;
  return "持平";
}

function trendMeta(trend: string) {
  if (trend === "improved") {
    return { label: "信号减少", variant: "success" as const, className: "text-status-success" };
  }
  if (trend === "regressed") {
    return { label: "信号增加", variant: "warning" as const, className: "text-status-warning" };
  }
  return { label: "持平", variant: "outline" as const, className: "text-muted-foreground" };
}

function RateAuditLoading() {
  return (
    <div className="grid gap-4" aria-label="正在生成降检诊断" aria-busy="true">
      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
          <Skeleton className="h-20 sm:col-span-2" />
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-56" />
    </div>
  );
}

function RateAuditUnavailable({ error, onRefresh }: { error: string; onRefresh: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>降检诊断暂不可用</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{error || "没有拿到可用的诊断数据。"}</span>
        <Button type="button" variant="outlineDanger" size="sm" onClick={onRefresh}>
          <RefreshCw data-icon="inline-start" />
          重新诊断
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function AuditStat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn(
        "mt-2 text-2xl font-semibold tracking-tight",
        tone === "success" && "text-status-success",
        tone === "warning" && "text-status-warning",
      )}>
        {value}
      </div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</div>
    </div>
  );
}

function StageCard({ stage, maxPoints, current }: { stage: RateAuditStage; maxPoints: number; current: boolean }) {
  const width = stage.riskPoints > 0 ? Math.max(8, Math.round((stage.riskPoints / maxPoints) * 100)) : 0;
  return (
    <div className={cn(
      "min-w-[11rem] flex-1 rounded-xl border p-4",
      current ? "border-foreground/25 bg-foreground/[0.035] shadow-sm" : "border-border bg-card",
    )}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold">{stage.label}</span>
        {current ? <Badge variant="outline">当前</Badge> : null}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <span className="text-2xl font-semibold tracking-tight">{stage.riskPoints}</span>
        <span className="pb-0.5 text-[11px] text-muted-foreground">{stage.riskCount} 项信号</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className={cn("h-full rounded-full", stage.highRiskCount ? "bg-warning" : "bg-foreground/55")}
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        {stage.metrics.sentenceCount} 句 · {stage.metrics.paragraphCount} 段
        {stage.truncated ? " · 已按上限截断" : ""}
      </div>
    </div>
  );
}

function DimensionRow({ item }: { item: RateAuditDimensionDelta }) {
  const meta = trendMeta(item.trend);
  return (
    <div className="grid gap-3 rounded-xl border border-border bg-muted/25 p-3.5 sm:grid-cols-[minmax(9rem,1fr)_auto_auto] sm:items-center">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{item.label}</div>
        <div className="mt-1 text-xs text-muted-foreground">原文 {item.beforeRiskPoints} → 当前 {item.afterRiskPoints} 点</div>
      </div>
      <div className={cn("text-sm font-semibold tabular-nums", meta.className)}>{pointChangeLabel(item.riskPointChange)}</div>
      <Badge variant={meta.variant}>{meta.label}</Badge>
    </div>
  );
}

function StrategyPlateauDisclosure({
  plan,
  plateau,
}: {
  plan: RateAuditStrategyPlan;
  plateau: RateAuditPlateau;
}) {
  if (!plan.plateauReached && !plan.hardStop && !plateau.reached && !plateau.hardStop) return null;
  const attemptLimit = Math.max(plan.plateauAttemptLimit || 0, plateau.attemptLimit);
  const targetCount = Math.max(plan.plateauTargetChunkCount || 0, plateau.targetChunkCount);
  const dimensionLabel = plan.dimensionLabel || plan.plateauDimensionId || plateau.dimensionId;

  return (
    <div className="mt-3 rounded-lg border border-warning/30 bg-warning/[0.065] p-3" aria-label="自动策略尝试上限">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xs font-semibold">已达到自动尝试上限</h4>
            <Badge variant="warning">硬停止</Badge>
            {plateau.preservedPreviousText ? <Badge variant="outline">已保留上一版正文</Badge> : null}
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
            系统已硬停止当前自动策略，不会继续调用模型。此前已接受的正文保持不变，后续必须人工复核；只有正文代际发生变化后，才会形成新的绑定计划。
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            {dimensionLabel ? <span className="rounded-md border bg-background/60 px-2 py-1">维度：{dimensionLabel}</span> : null}
            {attemptLimit ? <span className="rounded-md border bg-background/60 px-2 py-1">已达 {attemptLimit} 次上限</span> : null}
            {targetCount ? <span className="rounded-md border bg-background/60 px-2 py-1">涉及 {targetCount} 个目标段落</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function StrategyCoverageDisclosure({ plan }: { plan: RateAuditStrategyPlan }) {
  const executableCount = Math.max(plan.executableQueueCount, plan.executableQueue.length);
  const manualCount = Math.max(plan.blockingManualDimensionCount, plan.blockingManualDimensions.length);
  const hasExecutableQueue = executableCount > 0;
  const hasManualRisk = plan.manualReviewRequired || plan.manualReviewStillRequired || manualCount > 0;
  if (!hasExecutableQueue && !hasManualRisk) return null;

  const selected = plan.executableQueue.find(
    (item) => item.dimensionId === plan.selectedExecutableDimensionId,
  );
  const executableLabels = plan.executableQueue.slice(0, 3).map((item) => item.label).filter(Boolean);
  const manualLabels = plan.blockingManualDimensions.slice(0, 3).map((item) => item.label).filter(Boolean);
  const mixed = hasExecutableQueue && hasManualRisk;

  return (
    <div
      className={cn(
        "mt-3 rounded-lg border p-3",
        hasManualRisk ? "border-warning/25 bg-warning/[0.055]" : "border-border bg-muted/30",
      )}
      aria-label="自动队列与人工复核状态"
    >
      <div className="flex items-start gap-2.5">
        {hasManualRisk ? (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" />
        ) : (
          <Route className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xs font-semibold">
              {mixed ? "自动处理与人工复核并行" : hasManualRisk ? "人工风险仍待确认" : "可执行维度队列"}
            </h4>
            {hasExecutableQueue ? <Badge variant="outline">可执行 {executableCount}</Badge> : null}
            {hasManualRisk ? <Badge variant="warning">{manualCount ? `人工待核 ${manualCount}` : "需人工确认"}</Badge> : null}
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
            {mixed
              ? "可执行维度先处理，但人工风险仍未解除。每次只执行一个已绑定维度；自动候选通过复评分，也不会把人工维度标记为已解决。"
              : hasManualRisk
                ? "这些维度没有可靠的自动同维度评估器，只保留诊断和热区证据；必须人工确认，系统不会借用其他提示词代替判断。"
                : "队列按诊断优先级逐项处理，每次只执行一个已绑定维度；完成并复评分后会重新诊断剩余项。"}
          </p>
          {selected || executableLabels.length || manualLabels.length ? (
            <div className="mt-2 grid gap-1 text-[11px] leading-5 text-muted-foreground">
              {selected ? <p><span className="font-medium text-foreground">本次选择：</span>{selected.label}</p> : null}
              {executableLabels.length ? <p><span className="font-medium text-foreground">自动队列：</span>{executableLabels.join("、")}{executableCount > executableLabels.length ? ` 等 ${executableCount} 项` : ""}</p> : null}
              {manualLabels.length ? <p><span className="font-medium text-foreground">人工待核：</span>{manualLabels.join("、")}{manualCount > manualLabels.length ? ` 等 ${manualCount} 项` : ""}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DualContractGate({
  value,
  onOpenChunk,
  onExecuteStrategy,
  executing,
  executionDisabled,
}: {
  value: RateAuditReport;
  onOpenChunk?: (chunkId: string) => void;
  onExecuteStrategy?: (report: RateAuditReport) => void;
  executing?: boolean;
  executionDisabled?: boolean;
}) {
  const { strategyPlan, contentContract, readiness } = value;
  const strategyExecution = deriveRateAuditStrategyExecutionState(value);
  const blocked = readiness.status === "blocked";
  const strategyAttention = ["targeted_rerun", "manual_review"].includes(strategyPlan.decision);
  const contractReady = Boolean(contentContract?.ready);
  const semanticRangeCount = Math.max(0, Number(contentContract?.semanticRangeCount) || 0);
  const bookmarkRangeCount = Math.max(0, Number(contentContract?.bookmarkRangeCount) || 0);
  const commentRangeCount = Math.max(0, Number(contentContract?.commentRangeCount) || 0);
  const semanticRangeTopologyValid = contentContract?.semanticRangeTopologyValid === true;
  const semanticRangeAnchorUnitCount = Math.max(0, Number(contentContract?.semanticRangeAnchorUnitCount) || 0);
  const editableSemanticRangeAnchorUnitCount = Math.max(0, Number(contentContract?.editableSemanticRangeAnchorUnitCount) || 0);
  const semanticRangeCoveredUnitCount = Math.max(0, Number(contentContract?.semanticRangeCoveredUnitCount) || 0);
  const protectedSemanticRangeCoveredUnitCount = Math.max(0, Number(contentContract?.protectedSemanticRangeCoveredUnitCount) || 0);
  const editableSemanticRangeCoveredUnitCount = Math.max(0, Number(contentContract?.editableSemanticRangeCoveredUnitCount) || 0);
  const bookmarkRangeInteriorUnitCount = Math.max(0, Number(contentContract?.bookmarkRangeInteriorUnitCount) || 0);
  const editableBookmarkRangeInteriorUnitCount = Math.max(0, Number(contentContract?.editableBookmarkRangeInteriorUnitCount) || 0);
  const semanticPointReferenceUnitCount = Math.max(0, Number(contentContract?.semanticPointReferenceUnitCount) || 0);
  const protectedSemanticPointReferenceUnitCount = Math.max(0, Number(contentContract?.protectedSemanticPointReferenceUnitCount) || 0);
  const editableSemanticPointReferenceUnitCount = Math.max(0, Number(contentContract?.editableSemanticPointReferenceUnitCount) || 0);
  const semanticBoundaryCount = Math.max(semanticRangeCoveredUnitCount, semanticRangeAnchorUnitCount) + semanticPointReferenceUnitCount;
  const editableSemanticBoundaryCount = Math.max(editableSemanticRangeCoveredUnitCount, editableSemanticRangeAnchorUnitCount) + editableSemanticPointReferenceUnitCount;
  const semanticBoundaryInvalid = !semanticRangeTopologyValid || editableSemanticBoundaryCount > 0;
  const decisionVariant = blocked ? "danger" : strategyAttention ? "warning" : "success";
  return (
    <Card className={cn("overflow-hidden", blocked ? "border-destructive/30" : "border-border")}>
      <CardHeader className="border-b border-border/70 bg-muted/20 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="vercel-kicker text-muted-foreground">策略与契约</div>
            <CardTitle className="mt-1.5 text-base">降检策略 × 正文与格式硬约束</CardTitle>
          </div>
          <Badge variant={decisionVariant}>{blocked ? "已阻断" : strategyPlan.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 sm:p-5 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4" aria-label="降检策略状态">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">降检策略状态</h3>
                <Badge variant={decisionVariant}>{strategyPlan.label}</Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{strategyPlan.reason}</p>
              {strategyPlan.action ? <p className="mt-2 text-sm leading-6 text-foreground">{strategyPlan.action}</p> : null}
              {strategyPlan.plateauReached || strategyPlan.hardStop || value.plateau.reached || value.plateau.hardStop ? (
                <StrategyPlateauDisclosure plan={strategyPlan} plateau={value.plateau} />
              ) : (
                <StrategyCoverageDisclosure plan={strategyPlan} />
              )}
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                {strategyPlan.dimensionLabel ? <span className="rounded-md border px-2 py-1">维度：{strategyPlan.dimensionLabel}</span> : null}
                {strategyPlan.recommendedPromptId ? <span className="rounded-md border px-2 py-1">提示词：{strategyPlan.recommendedPromptId}</span> : null}
                {strategyPlan.primaryMetric ? <span className="rounded-md border px-2 py-1">复评分：{strategyPlan.primaryMetric}</span> : null}
                {strategyPlan.directionEvaluator === "manual_review" ? <span className="rounded-md border px-2 py-1">评估：人工复核</span> : null}
                {strategyPlan.maxAttempts ? <span className="rounded-md border px-2 py-1">最多 {strategyPlan.maxAttempts} 次</span> : null}
                {strategyPlan.targetChunkCount ? <span className="rounded-md border px-2 py-1">目标：{strategyPlan.targetChunkCount} 段</span> : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {strategyPlan.decision === "targeted_rerun" && onExecuteStrategy ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={!strategyExecution.ready || executing || executionDisabled}
                    onClick={() => onExecuteStrategy(value)}
                  >
                    <RefreshCw className={cn(executing && "animate-spin motion-reduce:animate-none")} data-icon="inline-start" />
                    {executing ? "策略执行中" : "执行定点策略"}
                  </Button>
                ) : null}
                {onOpenChunk && strategyPlan.targetChunkIds[0] ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => onOpenChunk(strategyPlan.targetChunkIds[0])}>
                    打开首个目标段落
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                ) : null}
              </div>
              {strategyPlan.decision === "targeted_rerun" ? (
                <p className={cn(
                  "mt-2 text-[11px] leading-5",
                  strategyExecution.ready ? "text-muted-foreground" : "text-status-warning",
                )}>
                  {strategyExecution.ready
                    ? "只生成通过同维度复评分的修复候选；完成后仍需在 Diff 中确认，不会自动确认导出。"
                    : strategyExecution.reason}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className={cn("rounded-xl border p-4", contractReady ? "border-success/20 bg-success/[0.035]" : "border-destructive/25 bg-destructive/[0.035]")} aria-label="正文与格式契约状态">
          <div className="flex items-start gap-3">
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border", contractReady ? "border-success/20 bg-success/10 text-status-success" : "border-destructive/25 bg-destructive/10 text-destructive")}>
              <ShieldCheck className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">正文范围与格式锁</h3>
                <Badge variant={contractReady ? "success" : "danger"}>{contractReady ? "正文范围已锁定" : "契约未通过"}</Badge>
              </div>
              {contentContract ? (
                <>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {contentContract.formatLockApplicable
                      ? `仅 ${contentContract.editableUnitCount} 个正文单元进入模型；${contentContract.protectedUnitCount} 个保护单元保持原样，导出时执行 OOXML 格式硬校验。`
                      : "TXT 没有 Word 版式层；正文仍使用运行时结构保护，但格式锁不适用。"}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border bg-background/70 p-2"><div className="text-base font-semibold">{contentContract.editableUnitCount}</div><div className="text-[10px] text-muted-foreground">可改正文</div></div>
                    <div className="rounded-lg border bg-background/70 p-2"><div className="text-base font-semibold">{contentContract.protectedHeadingCount}</div><div className="text-[10px] text-muted-foreground">锁定标题</div></div>
                    <div className={cn("rounded-lg border p-2", contentContract.editableHeadingCount ? "border-destructive/30 bg-destructive/5" : "bg-background/70")}><div className="text-base font-semibold">{contentContract.editableHeadingCount}</div><div className="text-[10px] text-muted-foreground">误入标题</div></div>
                  </div>
                  {semanticBoundaryCount > 0 || semanticRangeCount > 0 || bookmarkRangeInteriorUnitCount > 0 || !semanticRangeTopologyValid ? (
                    <div
                      className={cn(
                        "mt-3 rounded-lg border p-2.5 text-[11px] leading-5",
                        semanticBoundaryInvalid
                          ? "border-destructive/25 bg-destructive/[0.035] text-destructive"
                          : "border-border bg-muted/30 text-muted-foreground",
                      )}
                      data-ui-section="content-contract-semantic-boundaries"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {semanticRangeCount ? <Badge variant="outline">范围 {semanticRangeCount} 条</Badge> : null}
                        {bookmarkRangeCount ? <Badge variant="outline">书签 {bookmarkRangeCount}</Badge> : null}
                        {commentRangeCount ? <Badge variant="outline">批注 {commentRangeCount}</Badge> : null}
                        {semanticRangeCoveredUnitCount ? <Badge variant="outline">批注内部冻结 {semanticRangeCoveredUnitCount}</Badge> : null}
                        {editableBookmarkRangeInteriorUnitCount ? <Badge variant="success">书签内安全正文 {editableBookmarkRangeInteriorUnitCount}</Badge> : null}
                        <Badge variant={semanticRangeTopologyValid ? "success" : "danger"}>{semanticRangeTopologyValid ? "范围拓扑有效" : "范围拓扑异常"}</Badge>
                        {semanticPointReferenceUnitCount ? <Badge variant="outline">脚注/尾注/批注落点 {semanticPointReferenceUnitCount}</Badge> : null}
                      </div>
                      <p className="mt-1.5">
                        {!semanticRangeTopologyValid
                          ? "书签/批注范围存在未配对、重复或反序标记，契约已 fail closed 并阻断模型与导出。"
                          : editableSemanticBoundaryCount
                          ? `有 ${editableSemanticBoundaryCount} 个语义引用边界单元误入可编辑范围，契约已阻断模型与导出。`
                          : `跨段批注范围保护 ${protectedSemanticRangeCoveredUnitCount} 个单元，落点保护 ${protectedSemanticPointReferenceUnitCount} 个单元；书签内部 ${bookmarkRangeInteriorUnitCount} 个单元仅在无边界节点且具备正文正证据时可处理（当前 ${editableBookmarkRangeInteriorUnitCount} 个），书签端点保持不动。`}
                      </p>
                    </div>
                  ) : null}
                  {!contractReady ? (
                    <div className="mt-3 grid gap-1.5">
                      {contentContract.issues.filter((item) => item.severity === "error").slice(0, 2).map((item) => (
                        <p key={item.code} className="text-xs leading-5 text-destructive">{item.message}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs font-medium text-status-success">模型输入与冻结正文逐单元一致，标题进入模型数为 0。</p>
                  )}
                </>
              ) : (
                <p className="mt-2 text-xs leading-5 text-destructive">未取得正文范围契约，当前策略不可执行。</p>
              )}
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

export function RateAuditDashboard({
  value,
  loading,
  error,
  onRefresh,
  onOpenChunk,
  onExecuteStrategy,
  strategyExecuting,
  strategyDisabled,
}: {
  value: RateAuditReport | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onOpenChunk?: (chunkId: string) => void;
  onExecuteStrategy?: (report: RateAuditReport) => void;
  strategyExecuting?: boolean;
  strategyDisabled?: boolean;
}) {
  if (loading && !value) return <RateAuditLoading />;
  if (!value) return <RateAuditUnavailable error={error} onRefresh={onRefresh} />;

  const change = value.delta.riskPointChange;
  const improved = change < 0;
  const regressed = change > 0;
  const maxStagePoints = Math.max(1, ...value.stages.map((stage) => stage.riskPoints));
  const currentStageId = value.current.id;

  return (
    <div className="grid gap-4">
      {error ? <RateAuditUnavailable error={error} onRefresh={onRefresh} /> : null}

      <Card className={cn(
        "overflow-hidden",
        improved && "border-success/25",
        regressed && "border-warning/30",
      )}>
        <CardContent className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-start gap-4">
            <div className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl border",
              improved ? "border-success/25 bg-success/10 text-status-success" : regressed ? "border-warning/25 bg-warning/10 text-status-warning" : "border-border bg-muted text-foreground",
            )}>
              {improved ? <TrendingDown className="size-5" /> : regressed ? <TrendingUp className="size-5" /> : <Route className="size-5" />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">离线启发式诊断</Badge>
                <Badge variant={value.current.highRiskCount ? "warning" : "secondary"}>{value.current.riskCount} 项当前信号</Badge>
                {loading ? <Badge variant="outline">刷新中</Badge> : null}
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">降检诊断</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {value.sourceOnly
                  ? "原文基线已经建立。完成一轮处理后，这里会用完全相同的规则展示风险信号增减和问题段落。"
                  : improved
                    ? `相对原文减少 ${Math.abs(change)} 个风险点；继续处理剩余热区即可，不需要为了指标重写已经自然的段落。`
                    : regressed
                      ? `相对原文新增 ${change} 个风险点；优先检查标记为退化的维度和段落，避免继续叠加同类改写。`
                      : "当前风险点与原文持平。请结合维度明细判断哪些段落值得继续处理。"}
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="justify-self-start lg:justify-self-end">
            <RefreshCw className={cn(loading && "animate-spin motion-reduce:animate-none")} data-icon="inline-start" />
            重新诊断
          </Button>
        </CardContent>
      </Card>

      <DualContractGate
        value={value}
        onOpenChunk={onOpenChunk}
        onExecuteStrategy={onExecuteStrategy}
        executing={strategyExecuting}
        executionDisabled={strategyDisabled}
      />

      <section aria-label="降检诊断统计" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AuditStat label="当前风险点" value={String(value.current.riskPoints)} hint="高 3 / 中 2 / 低 1 的可解释计数" tone={value.current.highRiskCount ? "warning" : "neutral"} />
        <AuditStat label="相对原文" value={value.sourceOnly ? "待对比" : pointChangeLabel(change)} hint={value.sourceOnly ? "完成一轮后生成变化" : "负数表示启发式信号减少"} tone={improved ? "success" : regressed ? "warning" : "neutral"} />
        <AuditStat label="改善维度" value={`${value.delta.improvedDimensionCount} / ${value.delta.dimensions.length}`} hint="与原文使用同一规则比较" tone={value.delta.improvedDimensionCount ? "success" : "neutral"} />
        <AuditStat label="问题热区" value={String(value.hotspotCount)} hint="可直接定位到 Diff 的段落" tone={value.hotspotCount ? "warning" : "success"} />
      </section>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">分轮轨迹</CardTitle>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">只比较同一篇论文、同一套规则下的风险点数，不映射第三方检测概率。</p>
            </div>
            <Badge variant="outline">{value.stageCount} 个阶段</Badge>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto pb-5">
          <div className="flex min-w-max gap-3">
            {value.stages.map((stage) => (
              <StageCard key={stage.id} stage={stage} maxPoints={maxStagePoints} current={stage.id === currentStageId} />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">维度变化</CardTitle>
            <p className="text-xs leading-5 text-muted-foreground">先处理相对原文新增的信号；已经改善的维度不建议重复施压。</p>
          </CardHeader>
          <CardContent className="grid gap-2.5">
            {value.delta.dimensions.map((item) => <DimensionRow key={item.id} item={item} />)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="size-4" /> 下一步策略</CardTitle>
            <p className="text-xs leading-5 text-muted-foreground">建议只处理仍命中或相对原文退化的维度。</p>
          </CardHeader>
          <CardContent className="grid gap-3">
            {value.recommendations.map((item, index) => (
              <div key={`${item.dimensionId}-${index}`} className="rounded-xl border border-border bg-muted/25 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{item.label}</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={item.canExecute ? "success" : "outline"}>{item.canExecute ? "可同维度复评分" : "仅人工复核"}</Badge>
                    <Badge variant={item.priority === "high" ? "warning" : item.priority === "medium" ? "secondary" : "outline"}>
                      {item.priority === "high" ? "优先处理" : item.priority === "medium" ? "建议处理" : "人工抽查"}
                    </Badge>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.reason}</p>
                <p className="mt-2 text-sm leading-6 text-foreground">{item.action}</p>
                {item.primaryMetric || item.manualReviewReason ? (
                  <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                    {item.primaryMetric ? `复评分指标：${item.primaryMetric}${item.secondaryMetric ? ` / ${item.secondaryMetric}` : ""}` : item.manualReviewReason}
                  </p>
                ) : null}
                {onOpenChunk && item.targetChunkIds[0] ? (
                  <Button type="button" variant="ghost" size="sm" className="mt-3 px-0" onClick={() => onOpenChunk(item.targetChunkIds[0])}>
                    定位首个段落
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><FileSearch className="size-4" /> 问题段落热区</CardTitle>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">按风险点和严重度排序，最多展示 12 个当前段落。</p>
            </div>
            <Badge variant={value.hotspots.length ? "warning" : "success"}>{value.hotspots.length ? `${value.hotspots.length} 个` : "无明显热区"}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {value.hotspots.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {value.hotspots.map((hotspot) => (
                <div key={hotspot.chunkId} className="flex min-w-0 flex-col rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={hotspot.highRiskCount ? "warning" : "outline"}>段落 {hotspot.paragraphIndex + 1}</Badge>
                    <span className="text-xs font-medium text-muted-foreground">{hotspot.riskPoints} 点 · {hotspot.riskCount} 项</span>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-foreground">{hotspot.excerpt}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {hotspot.risks.slice(0, 3).map((risk) => (
                      <Badge key={risk.code} variant="secondary" title={risk.message}>{risk.message}</Badge>
                    ))}
                  </div>
                  {onOpenChunk && !hotspot.chunkId.startsWith("paragraph-") ? (
                    <Button type="button" variant="outline" size="sm" className="mt-4 self-start" onClick={() => onOpenChunk(hotspot.chunkId)}>
                      打开对应 Diff
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-success/20 bg-success/5 p-4">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-status-success" />
              <div>
                <div className="text-sm font-semibold">当前未识别到明显表达热区</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">不要为了追求更低的统计值继续机械改写，转而检查事实、引用和排版完整性。</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-foreground" />
        <span>{value.disclaimer}</span>
      </div>
    </div>
  );
}
