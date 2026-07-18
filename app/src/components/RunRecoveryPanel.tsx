import { AlertCircle } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { clampPercent } from "@/lib/qualityStats";
import type { RunRecoveryPanelState } from "@/lib/runRecovery";
import { cn } from "@/lib/utils";

export function RunRecoveryPanel({ state }: { state: RunRecoveryPanelState | null }) {
  if (!state) {
    return null;
  }
  const percent = clampPercent(state.percent);
  const recoveryLabel = state.resumeActionLabel?.includes("收尾") ? "等待收尾" : "断点续跑";
  return (
    <Alert
      variant={state.tone === "red" ? "destructive" : "default"}
      className={cn(
        "min-w-0 overflow-hidden border-0 bg-muted/50 p-3 shadow-none [&>svg]:left-3 [&>svg]:top-3",
        state.tone === "amber" && "border-primary/25 bg-muted/50",
      )}
    >
      <AlertCircle />
      <div className="flex min-w-0 flex-col gap-2 overflow-hidden">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <AlertTitle className="mb-0 truncate text-sm">{recoveryLabel}</AlertTitle>
          </div>
          {state.totalChunks ? (
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {state.completedChunks}/{state.totalChunks} · {percent}%
            </span>
          ) : null}
        </div>
        {state.totalChunks ? (
          <Progress value={percent} className="h-1.5" />
        ) : null}
      </div>
    </Alert>
  );
}
