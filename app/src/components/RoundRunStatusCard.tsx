import { Activity, AlertCircle, Loader2, X } from "lucide-react";

import { RoundRunStatusStats } from "@/components/RoundRunStatusStats";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LOADING_ICON_NEUTRAL_CLASS_NAME } from "@/lib/loadingIcon";
import { deriveRoundRunStatusViewState } from "@/lib/roundRunStatusViewModel";
import type { RoundProgress } from "@/types/app";

type Props = {
  progress: RoundProgress | null;
  configuredConcurrency: number;
  runtimeLabel: string;
  cancelRequested: boolean;
  onCancel: () => void;
};

export function RoundRunStatusCard({
  progress,
  configuredConcurrency,
  runtimeLabel,
  cancelRequested,
  onCancel,
}: Props) {
  const {
    totalChunks,
    safeCompletedChunks,
    remainingChunks,
    concurrencyLabel,
    concurrencyDetail,
    percent,
    failed,
    errorBrief,
    streaming,
    streamChars,
    statusLabel,
    chunkId,
  } = deriveRoundRunStatusViewState({
    progress,
    configuredConcurrency,
    cancelRequested,
  });

  return (
    <Card
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      <CardHeader className="shrink-0 border-b border-border/70 bg-muted/20 p-4 pb-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="vercel-icon-frame size-9"><Activity className="size-4" /></span>
            <div className="min-w-0">
              <div className="vercel-kicker mb-0.5">Live execution</div>
              <CardTitle className="truncate text-base">轮次运行中</CardTitle>
            </div>
          </div>
          <Badge variant={failed ? "danger" : cancelRequested ? "warning" : "secondary"} className="shrink-0">
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 pt-0">
        <Alert variant={failed ? "destructive" : "default"} className="min-w-0 overflow-hidden bg-background">
          {failed ? <AlertCircle /> : <Activity />}
          <AlertTitle className="truncate text-sm">{runtimeLabel || "等待进度"}</AlertTitle>
          {totalChunks || errorBrief || streaming ? (
            <AlertDescription className="flex flex-col gap-2 pt-2">
              {errorBrief ? <span className="truncate text-xs">{errorBrief}</span> : null}
              {streaming ? (
                <span className="line-clamp-3 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                  {chunkId ? `分块 ${chunkId}` : "当前分块"}
                  {streamChars ? ` · ${streamChars} 字` : ""}
                  {" · 思考内容已隔离，仅显示安全进度"}
                </span>
              ) : null}
              {totalChunks ? <Progress value={percent} className="h-2" /> : null}
            </AlertDescription>
          ) : null}
        </Alert>

        <RoundRunStatusStats
          totalChunks={totalChunks}
          safeCompletedChunks={safeCompletedChunks}
          remainingChunks={remainingChunks}
          concurrencyLabel={concurrencyLabel}
          concurrencyDetail={concurrencyDetail}
        />

        <div className="mt-auto shrink-0">
          <Button type="button" variant="destructive" className="w-full min-w-0 overflow-hidden" onClick={onCancel} disabled={cancelRequested}>
            {cancelRequested ? <Loader2 className={LOADING_ICON_NEUTRAL_CLASS_NAME} data-icon="inline-start" /> : <X data-icon="inline-start" />}
            <span className="min-w-0 truncate">{cancelRequested ? "正在中断" : "中断当前轮"}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
