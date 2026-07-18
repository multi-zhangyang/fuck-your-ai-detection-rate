import { Signal, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  formatPendingAutoActionStatus,
  getPendingAutoActionPercent,
  getPendingAutoActionTitle,
  isCountdownAutoAction,
  type PendingAutoAction,
} from "@/lib/autoRun";

export function AutoRunSignal({ action, onReject }: { action: PendingAutoAction | null; onReject: () => void }) {
  if (!action) {
    return null;
  }
  const percent = getPendingAutoActionPercent(action);
  const countdown = isCountdownAutoAction(action);
  return (
    <Alert variant={action.kind === "manual-intervention" ? "destructive" : "default"} className="min-w-0 overflow-hidden bg-background">
      <Signal />
      <AlertTitle className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate">{getPendingAutoActionTitle(action)}</span>
        <Badge variant={action.kind === "manual-intervention" ? "danger" : action.kind === "retry" ? "warning" : "secondary"} className="shrink-0">
          {countdown ? `${action.secondsRemaining}s` : "人工处理"}
        </Badge>
      </AlertTitle>
      <AlertDescription>
        <div className="flex min-w-0 flex-col gap-3 overflow-hidden">
          <p className="min-w-0 break-words">{formatPendingAutoActionStatus(action)}</p>
          {typeof percent === "number" ? (
            <Progress value={percent} className="h-2" />
          ) : null}
          <Button type="button" variant={action.kind === "manual-intervention" ? "outline" : "outlineWarning"} size="sm" className="min-w-0 overflow-hidden" onClick={onReject}>
            <X data-icon="inline-start" />
            <span className="min-w-0 truncate">{action.kind === "manual-intervention" ? "我来处理" : "拒绝自动执行"}</span>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
