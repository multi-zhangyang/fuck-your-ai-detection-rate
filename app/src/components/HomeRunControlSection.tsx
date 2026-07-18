import { Play, Wand2 } from "lucide-react";

import { HomeRunControlActionButtons } from "@/components/HomeRunControlActionButtons";
import { HomeRunControlStatusBlock } from "@/components/HomeRunControlStatusBlock";
import { Button } from "@/components/ui/button";
import type { PendingAutoAction } from "@/lib/autoRun";
import type { RunRecoveryPanelState } from "@/lib/runRecovery";
import { cn } from "@/lib/utils";
import type { RoundProgress } from "@/types/app";

type Props = {
  hasDocument: boolean;
  running: boolean;
  busy: boolean;
  hasPendingRound: boolean;
  nextRound?: number | null;
  runRecoveryState: RunRecoveryPanelState | null;
  pendingAutoAction: PendingAutoAction | null;
  hasVisibleResult: boolean;
  visibleResultRound: number | null;
  rewriteConcurrency: number;
  progress: RoundProgress | null;
  currentRunProgressPercent: number | null;
  waitingForStatusSync: boolean;
  primaryRunButtonVariant: "default" | "secondary";
  primaryRunButtonDisabled: boolean;
  runButtonText: string;
  canResetRound: boolean;
  latestCompletedRound: number | null;
  resumableCheckpoint: boolean;
  onRejectAutoAction: () => void;
  onRewriteConcurrencyChange: (value: string) => void;
  onPrimaryRunAction: () => void;
  onCancelRun: () => void;
  onResetRound: () => void;
};

export function HomeRunControlSection({
  hasDocument,
  running,
  busy,
  hasPendingRound,
  nextRound,
  runRecoveryState,
  pendingAutoAction,
  hasVisibleResult,
  visibleResultRound,
  rewriteConcurrency,
  progress,
  currentRunProgressPercent,
  waitingForStatusSync,
  primaryRunButtonVariant,
  primaryRunButtonDisabled,
  runButtonText,
  canResetRound,
  latestCompletedRound,
  resumableCheckpoint,
  onRejectAutoAction,
  onRewriteConcurrencyChange,
  onPrimaryRunAction,
  onCancelRun,
  onResetRound,
}: Props) {
  return (
    <section className={cn("flex min-w-0 max-w-full flex-col gap-3 overflow-hidden", running && "rounded-xl border border-destructive/30 bg-destructive/5 p-3")}>
      {hasDocument ? (
        <>
          <HomeRunControlStatusBlock
            running={running}
            hasPendingRound={hasPendingRound}
            nextRound={nextRound}
            runRecoveryState={runRecoveryState}
            pendingAutoAction={pendingAutoAction}
            hasVisibleResult={hasVisibleResult}
            visibleResultRound={visibleResultRound}
            rewriteConcurrency={rewriteConcurrency}
            progress={progress}
            currentRunProgressPercent={currentRunProgressPercent}
            busy={busy}
            onRejectAutoAction={onRejectAutoAction}
            onRewriteConcurrencyChange={onRewriteConcurrencyChange}
          />
          <HomeRunControlActionButtons
            running={running}
            busy={busy}
            waitingForStatusSync={waitingForStatusSync}
            primaryRunButtonVariant={primaryRunButtonVariant}
            primaryRunButtonDisabled={primaryRunButtonDisabled}
            runButtonText={runButtonText}
            canResetRound={canResetRound}
            latestCompletedRound={latestCompletedRound}
            resumableCheckpoint={resumableCheckpoint}
            onPrimaryRunAction={onPrimaryRunAction}
            onCancelRun={onCancelRun}
            onResetRound={onResetRound}
          />
        </>
      ) : (
        <>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="vercel-icon-frame size-8"><Play className="size-3.5" /></span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">运行控制</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">上传后即可启动第一轮</div>
              </div>
            </div>
          </div>
          <Button type="button" variant="secondary" className="h-11 w-full min-w-0 overflow-hidden" disabled>
            <Wand2 data-icon="inline-start" />
            <span className="min-w-0 truncate">{runButtonText}</span>
          </Button>
        </>
      )}
    </section>
  );
}
