import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { RateAuditDashboard } from "@/components/RateAuditDashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useRateAudit } from "@/hooks/useRateAudit";
import type { AppService } from "@/lib/appService";
import { deriveExportHealthPanelState } from "@/lib/exportHealthViewModel";
import {
  buildExportRiskMessages,
  buildQualityStats,
} from "@/lib/qualityStats";
import { hasPendingRateAuditStrategyCandidate } from "@/lib/reviewDecisionDefaults";
import { cn } from "@/lib/utils";
import type { ExportResult, RateAuditReport, ReviewDecision, RoundCompareData } from "@/types/app";

function ReportStat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "success" | "warning" | "info";
}) {
  const toneClass = {
    neutral: "text-foreground",
    success: "text-status-success",
    warning: "text-status-warning",
    info: "text-muted-foreground",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn("mt-2 text-3xl font-semibold tracking-normal", toneClass)}>{value}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</div>
    </div>
  );
}

function EmptyQualityReport({ onGoHome }: { onGoHome?: () => void }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl items-center justify-center py-6">
      <Card className="relative w-full overflow-hidden">
        <CardContent className="relative flex flex-col items-center px-6 py-12 text-center sm:px-12 sm:py-16">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-muted text-foreground">
            <ClipboardCheck className="size-7" />
          </div>
          <Badge variant="outline" className="mt-6">降检报告</Badge>
          <h1 className="mt-4 text-balance text-2xl font-semibold tracking-normal sm:text-3xl">尚未载入论文</h1>
          <p className="mt-3 max-w-xl text-pretty text-sm leading-7 text-muted-foreground sm:text-base">
            上传 Word 或 TXT 后，这里会先建立原文诊断基线；完成处理后再展示分轮变化、问题热区与导出完整性。
          </p>
          {onGoHome ? (
            <Button type="button" size="lg" className="mt-7 min-w-44" onClick={onGoHome}>
              返回工作台
              <ArrowRight data-icon="inline-end" />
            </Button>
          ) : null}
          <div className="mt-10 grid w-full max-w-2xl gap-3 text-left sm:grid-cols-3">
            {[
              ["01", "上传文档", "载入 Word 或 TXT"],
              ["02", "完成改写", "生成段落级 Diff"],
              ["03", "检查与导出", "逐项确认风险"],
            ].map(([step, title, hint]) => (
              <div key={step} className="rounded-xl border border-border bg-background p-4">
                <span className="font-mono text-xs font-medium text-muted-foreground">{step}</span>
                <div className="mt-2 text-sm font-semibold">{title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function QualityReportPage({
  service,
  sourcePath,
  outputPath,
  compareData,
  reviewDecisions,
  reviewRevision,
  exportResult,
  onGoHome,
  onOpenChunk,
  onExecuteStrategy,
  strategyExecuting,
  strategyDisabled,
}: {
  service: AppService;
  sourcePath?: string | null;
  outputPath?: string | null;
  compareData: RoundCompareData | null;
  reviewDecisions: Record<string, ReviewDecision>;
  reviewRevision?: string | null;
  exportResult: ExportResult | null;
  onGoHome?: () => void;
  onOpenChunk?: (chunkId: string) => void;
  onExecuteStrategy?: (report: RateAuditReport) => void;
  strategyExecuting?: boolean;
  strategyDisabled?: boolean;
}) {
  const rateAudit = useRateAudit({
    service,
    sourcePath,
    outputPath,
    compareRevision: [compareData?.updatedAt, reviewRevision].filter(Boolean).join("|") || undefined,
  });
  if (!sourcePath && !compareData && !exportResult) {
    return <EmptyQualityReport onGoHome={onGoHome} />;
  }

  const hasRoundChecks = Boolean(compareData || exportResult);
  const stats = buildQualityStats(compareData, exportResult, reviewDecisions);
  const riskMessages = buildExportRiskMessages(compareData, exportResult, reviewDecisions);
  const exportHealth = deriveExportHealthPanelState(exportResult);
  const stable = riskMessages.length === 0;
  const hasPendingStrategyCandidate = hasPendingRateAuditStrategyCandidate(compareData, reviewDecisions);

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-4 pb-4">
      <RateAuditDashboard
        value={rateAudit.value}
        loading={rateAudit.loading}
        error={rateAudit.error}
        onRefresh={() => void rateAudit.refresh()}
        onOpenChunk={onOpenChunk}
        onExecuteStrategy={onExecuteStrategy}
        strategyExecuting={strategyExecuting}
        strategyDisabled={strategyDisabled
          || rateAudit.loading
          || Boolean(rateAudit.error)
          || hasPendingStrategyCandidate}
      />

      {hasRoundChecks ? (
        <>
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-normal">内容与导出完整性</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">降检信号之外，事实保护、引用和 Word 结构仍是不可跳过的硬边界。</p>
            </div>
            {onGoHome ? (
              <Button type="button" variant="outline" size="sm" onClick={onGoHome}>
                返回 Diff 审阅
                <ArrowRight data-icon="inline-end" />
              </Button>
            ) : null}
          </div>

          <section aria-label="内容完整性统计" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ReportStat label="需处理块" value={String(stats.reviewChunkCount)} hint="建议逐段确认的内容" tone={stats.reviewChunkCount ? "warning" : "success"} />
            <ReportStat label="结构锁定" value={String(stats.protectedTokenCount)} hint="已保护的引用、数字与标记" tone="info" />
            <ReportStat label="引用缺失" value={String(stats.missingCitationCount)} hint="可能需要恢复的引用标记" tone={stats.missingCitationCount ? "warning" : "success"} />
            <ReportStat label="表达提示" value={String(stats.machineLikeRiskCount)} hint="需要人工判断的表达特征" tone={stats.machineLikeRiskCount ? "warning" : "neutral"} />
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
            <Card className="overflow-hidden">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-warning/10 text-status-warning"><TriangleAlert className="size-4" /></div>
                    <div>
                      <h3 className="text-base font-semibold">导出前风险</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">只展示当前结果真实产生的检查项</p>
                    </div>
                  </div>
                  <Badge variant={stable ? "success" : "warning"}>{stable ? "无待办" : `${riskMessages.length} 类`}</Badge>
                </div>
                <div className="mt-5 flex flex-col gap-2.5">
                  {riskMessages.length ? riskMessages.map((message, index) => (
                    <div key={message} className="flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/5 p-3.5">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-warning/15 font-mono text-[11px] font-bold text-status-warning">{index + 1}</span>
                      <p className="pt-0.5 text-sm leading-6 text-foreground">{message}</p>
                    </div>
                  )) : exportResult ? (
                    <div className="flex items-start gap-3 rounded-xl border border-success/20 bg-success/5 p-4">
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-status-success" />
                      <div>
                        <div className="text-sm font-semibold">已执行检查无阻断</div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">只对本次实际执行并有证据的检查作出结论。</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
                      <ClipboardCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-semibold">内容检查暂无阻断</div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">尚未执行导出，保护区、OOXML、格式锁和正文契约不能按“通过”展示。</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl border border-border bg-muted text-foreground"><ShieldCheck className="size-4" /></div>
                  <div>
                    <h3 className="text-base font-semibold">导出完整性</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">保护、排版与 Word 结构检查</p>
                  </div>
                </div>
                {exportHealth ? (
                  <div className="mt-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    {exportHealth.sections.map((section) => (
                      <div key={section.label} className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3">
                        <span className="text-xs font-medium text-muted-foreground">{section.label}</span>
                        <Badge variant={section.variant}>{section.value}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                    尚未执行导出；这里只展示真实生成的硬审计，不把“未运行”折算成 0 个问题。
                  </div>
                )}
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-foreground" />
                  导出后仍会生成独立审计报告，便于追踪保护区和版式检查结果。
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="flex items-start gap-3 p-5 text-sm leading-6 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-foreground" />
            当前只有原文诊断基线。完成至少一轮处理后，这里会同时出现引用、数字、事实保护和导出结构检查。
          </CardContent>
        </Card>
      )}
    </div>
  );
}
