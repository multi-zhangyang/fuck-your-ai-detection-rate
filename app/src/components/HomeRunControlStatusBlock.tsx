import { Activity, CheckCircle2 } from "lucide-react";

import { AutoRunSignal } from "@/components/AutoRunSignal";
import { RunRecoveryPanel } from "@/components/RunRecoveryPanel";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { PendingAutoAction } from "@/lib/autoRun";
import { REWRITE_CONCURRENCY_LEVELS } from "@/lib/modelRoute";
import type { RunRecoveryPanelState } from "@/lib/runRecovery";
import type { RoundProgress } from "@/types/app";

export function HomeRunControlStatusBlock({
  running,
  hasPendingRound,
  nextRound,
  runRecoveryState,
  pendingAutoAction,
  hasVisibleResult,
  visibleResultRound,
  rewriteConcurrency,
  progress,
  currentRunProgressPercent,
  busy,
  onRejectAutoAction,
  onRewriteConcurrencyChange,
}: {
  running: boolean;
  hasPendingRound: boolean;
  nextRound?: number | null;
  runRecoveryState: RunRecoveryPanelState | null;
  pendingAutoAction: PendingAutoAction | null;
  hasVisibleResult: boolean;
  visibleResultRound: number | null;
  rewriteConcurrency: number;
  progress: RoundProgress | null;
  currentRunProgressPercent: number | null;
  busy: boolean;
  onRejectAutoAction: () => void;
  onRewriteConcurrencyChange: (value: string) => void;
}) {
  return (
    <>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="vercel-icon-frame size-8"><Activity className="size-4" /></span>
          <div className="min-w-0">
            <div className="vercel-kicker mb-0.5">Execution</div>
            <div className="text-sm font-semibold">运行控制</div>
          </div>
        </div>
        {hasPendingRound ? (
          <Badge variant={running ? "warning" : "outline"} className={running ? "border-destructive/30 bg-destructive/5 text-destructive" : ""}>
            {`第 ${nextRound} 轮`}
          </Badge>
        ) : null}
      </div>
      <RunRecoveryPanel state={running ? null : runRecoveryState} />
      <AutoRunSignal action={pendingAutoAction} onReject={onRejectAutoAction} />
      {hasVisibleResult && visibleResultRound && !running && !runRecoveryState ? (
        <Alert className="min-w-0 overflow-hidden bg-background">
          <CheckCircle2 />
          <AlertTitle className="truncate text-sm">第 {visibleResultRound} 轮已完成</AlertTitle>
        </Alert>
      ) : null}
      <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/25 p-2 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.025)]">
        <div className="min-w-0 text-xs font-semibold text-muted-foreground">轮内并发</div>
        <ToggleGroup type="single" value={String(rewriteConcurrency)} onValueChange={onRewriteConcurrencyChange} disabled={busy || running} size="sm" className="shrink-0">
          {REWRITE_CONCURRENCY_LEVELS.map((item) => (
            <ToggleGroupItem key={item} value={String(item)} className="min-w-8">
              {item}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {progress?.totalChunks && !running && !runRecoveryState && currentRunProgressPercent != null ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
            <span>运行进度</span>
            <span>{currentRunProgressPercent}%</span>
          </div>
          <Progress value={currentRunProgressPercent} className="h-2" />
        </div>
      ) : null}
    </>
  );
}
