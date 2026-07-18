import { Fragment } from "react";
import { Activity, CheckCircle2, Clock3, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { LOADING_ICON_CLASS_NAME } from "@/lib/loadingIcon";
import type { RuntimeTaskCenterItem } from "@/lib/uiTypes";
import { clampPercent } from "@/lib/qualityStats";
import { cn } from "@/lib/utils";

export function NotificationRuntimeTaskSection({
  taskItems,
  runningTaskCount,
}: {
  taskItems: RuntimeTaskCenterItem[];
  runningTaskCount: number;
}) {
  return (
    <section data-ui-section="runtime-task-center" className="flex min-w-0 flex-col gap-3 overflow-hidden">
      <div className="flex min-w-0 items-center justify-between gap-3 overflow-hidden">
        <div className="flex min-w-0 items-center gap-2.5 text-sm font-semibold text-foreground">
          <span className="vercel-icon-frame size-7"><Activity className="size-3.5" /></span>
          <span className="min-w-0 truncate">运行任务</span>
        </div>
        <Badge className="shrink-0" variant={runningTaskCount ? "warning" : "outline"}>
          {runningTaskCount ? `${runningTaskCount} 个运行中` : "无运行任务"}
        </Badge>
      </div>

      {taskItems.length ? (
        <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border/80 bg-card/70 shadow-sm">
          {taskItems.map((item, index) => (
            <Fragment key={item.id}>
              {index ? <Separator /> : null}
              <div className={cn("flex flex-col gap-3 p-3", item.tone === "red" && "bg-destructive/5")}>
                <div className="flex min-w-0 items-start gap-3 overflow-hidden">
                  <div className="vercel-icon-frame mt-0.5 size-8 text-muted-foreground">
                    {item.running ? <Loader2 className={LOADING_ICON_CLASS_NAME} /> : <Clock3 />}
                  </div>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="flex min-w-0 items-start justify-between gap-3 overflow-hidden">
                      <div className="min-w-0 break-words text-sm font-semibold leading-5">{item.title}</div>
                      <Badge className="shrink-0" variant={item.tone === "red" ? "danger" : "outline"}>{item.status}</Badge>
                    </div>
                    {typeof item.percent === "number" ? (
                      <div className="mt-2 flex min-w-0 items-center gap-2">
                        <Progress value={clampPercent(item.percent)} className="h-1.5 min-w-0 flex-1" />
                        <span className="w-10 shrink-0 text-right text-xs font-medium text-muted-foreground">{clampPercent(item.percent)}%</span>
                      </div>
                    ) : null}
                  </div>
                </div>
                {item.onAction || item.onCancel ? (
                  <div className="flex min-w-0 flex-wrap justify-end gap-2">
                    {item.onAction && item.actionLabel ? (
                      <Button type="button" variant="outline" size="sm" className="max-w-full min-w-0 overflow-hidden" onClick={item.onAction}>
                        <span className="min-w-0 truncate">{item.actionLabel}</span>
                      </Button>
                    ) : null}
                    {item.onCancel && item.cancelLabel ? (
                      <Button type="button" variant="destructive" size="sm" className="max-w-full min-w-0 overflow-hidden" onClick={item.onCancel}>
                        <span className="min-w-0 truncate">{item.cancelLabel}</span>
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Fragment>
          ))}
        </div>
      ) : (
        <Empty className="vercel-empty-state min-h-[8rem] border border-border/70">
          <EmptyHeader>
            <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
            <EmptyTitle>当前没有运行或待继续的任务</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}
