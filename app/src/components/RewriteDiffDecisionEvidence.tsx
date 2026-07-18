import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type {
  CandidateSelectionView,
  ChunkDecisionEvidence,
  ChunkDecisionEvidenceTone,
} from "@/lib/chunkDecisionEvidence";
import { cn } from "@/lib/utils";

function badgeVariant(tone: ChunkDecisionEvidenceTone) {
  if (tone === "success") return "success" as const;
  if (tone === "warning") return "warning" as const;
  if (tone === "danger") return "danger" as const;
  return "outline" as const;
}

function CandidateSelectionEvidencePanel({ value }: { value: CandidateSelectionView }) {
  return (
    <div className="rounded-md border border-border bg-background/65 p-3" data-ui-section="candidate-selection-evidence">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold text-foreground">有界候选选择</div>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{value.retryLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={badgeVariant(value.decisionTone)}>{value.decisionLabel}</Badge>
            <Badge variant="outline">{value.callLabel}</Badge>
            <Badge variant="outline">{value.comparisonLabel}</Badge>
          </div>
        </div>

        {value.reasonLabels.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-foreground">选择原因</span>
            {value.reasonLabels.map((reason) => <Badge key={reason} variant="outline">{reason}</Badge>)}
          </div>
        ) : null}

        <div className="grid gap-2 lg:grid-cols-3">
          {value.candidates.map((candidate) => (
            <div
              key={candidate.candidateId}
              className={cn(
                "rounded-md border p-2.5",
                candidate.selected ? "border-foreground/25 bg-foreground/[0.035]" : "border-border bg-card/65",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[11px] font-semibold">{candidate.label}</span>
                {candidate.selected ? <Badge variant="secondary">最终选择</Badge> : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge variant={badgeVariant(candidate.hardGateTone)}>{candidate.hardGateLabel}</Badge>
                <Badge variant={badgeVariant(candidate.readabilityTone)}>{candidate.readabilityLabel}</Badge>
                <Badge variant={badgeVariant(candidate.factualGuardTone)}>{candidate.factualGuardLabel}</Badge>
                <Badge variant={candidate.safetyLabel === "可进入选择" ? "success" : "danger"}>{candidate.safetyLabel}</Badge>
              </div>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <div className="rounded border border-border/75 bg-background/70 px-2 py-1.5">
                  <div className="text-[10px] font-semibold text-foreground">原稿模式</div>
                  <div className="mt-0.5 flex items-start gap-1">
                    <Badge variant={badgeVariant(candidate.sourcePatternTone)}>{candidate.sourcePatternTone === "danger" ? "阻断" : "通过"}</Badge>
                    <span className="text-[10px] leading-4 text-muted-foreground">{candidate.sourcePatternLabel}</span>
                  </div>
                </div>
                <div className="rounded border border-border/75 bg-background/70 px-2 py-1.5">
                  <div className="text-[10px] font-semibold text-foreground">全文影响</div>
                  <div className="mt-0.5 flex items-start gap-1">
                    <Badge variant={badgeVariant(candidate.documentImpactTone)}>{candidate.documentImpactTone === "danger" ? "超线" : candidate.documentImpactTone === "success" ? "通过" : "本块"}</Badge>
                    <span className="text-[10px] leading-4 text-muted-foreground">{candidate.documentImpactLabel}</span>
                  </div>
                </div>
                <div className="rounded border border-border/75 bg-background/70 px-2 py-1.5">
                  <div className="text-[10px] font-semibold text-foreground">句界稳定</div>
                  <div className="mt-0.5 flex items-start gap-1">
                    <Badge variant={badgeVariant(candidate.sentenceBoundaryTone)}>{candidate.sentenceBoundaryTone === "danger" ? "阻断" : "通过"}</Badge>
                    <span className="text-[10px] leading-4 text-muted-foreground">{candidate.sentenceBoundaryLabel}</span>
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[11px] leading-5 text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">确定性词汇保留代理：</span>
                  <span className="tabular-nums">{candidate.retentionScore}</span>
                  <span> / 最低 {candidate.retentionMinimum}</span>
                  <Badge className="ml-1.5" variant={candidate.retentionPassed ? "success" : "danger"}>{candidate.retentionPassed ? "达标" : "未达标"}</Badge>
                </p>
                <p>{candidate.retentionDetail}</p>
                <p className="mt-1">
                  <span className="font-medium text-foreground">同维方向：</span>
                  {candidate.dimensionLabel} · {candidate.metricLabel} {candidate.metricValue} · {candidate.metricStatus}
                </p>
                {candidate.metricNote ? <p>{candidate.metricNote}</p> : null}
                <p><span className="font-medium text-foreground">综合风格惩罚：</span>{candidate.stylePenalty}</p>
              </div>
              {candidate.rejectionLabels.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {candidate.rejectionLabels.map((reason) => <Badge key={reason} variant="warning">{reason}</Badge>)}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="rounded-md border border-border bg-muted/35 px-2.5 py-2 text-[11px] leading-5 text-muted-foreground">
          {value.disclaimer}
        </div>
      </div>
    </div>
  );
}

export function RewriteDiffDecisionEvidence({ value }: { value: ChunkDecisionEvidence | null }) {
  if (!value) return null;
  const blocked = value.outcomeTone === "danger" || value.outcomeTone === "warning";

  return (
    <section
      className={cn(
        "xl:col-span-2 rounded-lg border p-3.5",
        blocked ? "border-warning/25 bg-warning/[0.045]" : "border-border bg-card/75",
      )}
      aria-label="候选决策证据"
      data-ui-section="chunk-decision-evidence"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            {value.outcomeTone === "success" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-success" />
            ) : (
              <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", value.outcomeTone === "danger" ? "text-destructive" : "text-status-warning")} />
            )}
            <div className="min-w-0">
              <div className="text-xs font-semibold">候选为何接受 / 为何保留上一版</div>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{value.outcomeDetail}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <Badge variant={badgeVariant(value.outcomeTone)}>{value.outcomeLabel}</Badge>
            {value.attemptCount ? <Badge variant="outline">尝试 {value.attemptCount} 次</Badge> : null}
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-md border border-border bg-background/65 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-semibold text-foreground">同维 before / after</div>
              <Badge variant={value.metricStatus === "满足接收条件" ? "success" : "outline"}>{value.metricStatus}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-xs text-muted-foreground">{value.dimensionLabel}</span>
              <span className="text-sm font-semibold tabular-nums">{value.metricLabel} {value.metricValue}</span>
            </div>
            {value.riskCodeChange ? <p className="mt-1 text-[11px] text-muted-foreground">{value.riskCodeChange}</p> : null}
            {value.metricNote ? <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{value.metricNote}</p> : null}
          </div>

          <div className="rounded-md border border-border bg-background/65 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                <ShieldCheck className="size-3.5" />
                内容保留与硬门禁
              </div>
              <Badge variant={badgeVariant(value.hardGateTone)}>{value.hardGateLabel}</Badge>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{value.hardGateDetail}</p>
          </div>
        </div>

        {value.candidateSelection ? <CandidateSelectionEvidencePanel value={value.candidateSelection} /> : null}
      </div>
    </section>
  );
}
