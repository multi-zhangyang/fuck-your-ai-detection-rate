import { RefreshCw, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function HomeRunControlActionButtons({
  running,
  busy,
  waitingForStatusSync,
  primaryRunButtonVariant,
  primaryRunButtonDisabled,
  runButtonText,
  canResetRound,
  latestCompletedRound,
  resumableCheckpoint,
  onPrimaryRunAction,
  onCancelRun,
  onResetRound,
}: {
  running: boolean;
  busy: boolean;
  waitingForStatusSync: boolean;
  primaryRunButtonVariant: "default" | "secondary";
  primaryRunButtonDisabled: boolean;
  runButtonText: string;
  canResetRound: boolean;
  latestCompletedRound: number | null;
  resumableCheckpoint: boolean;
  onPrimaryRunAction: () => void;
  onCancelRun: () => void;
  onResetRound: () => void;
}) {
  return (
    <div className="grid gap-2">
      {!running ? (
        <Button
          variant={primaryRunButtonVariant}
          className="h-11 w-full min-w-0 overflow-hidden"
          onClick={onPrimaryRunAction}
          disabled={primaryRunButtonDisabled}
        >
          {waitingForStatusSync ? <RefreshCw data-icon="inline-start" /> : <Wand2 data-icon="inline-start" />}
          <span className="min-w-0 truncate">{runButtonText}</span>
        </Button>
      ) : null}
      {running ? (
        <Button className="h-10 min-w-0 overflow-hidden" variant="destructive" onClick={onCancelRun}><span className="min-w-0 truncate">中断当前轮</span></Button>
      ) : canResetRound ? (
        <Button className="h-10 min-w-0 overflow-hidden" variant="outline" onClick={onResetRound} disabled={busy}>
          <span className="min-w-0 truncate">{latestCompletedRound && !resumableCheckpoint ? "放弃已完成结果" : "放弃本轮进度"}</span>
        </Button>
      ) : null}
    </div>
  );
}
