import { Fragment } from "react";
import { AlertCircle, Bell, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { formatNotificationTime } from "@/lib/formatters";
import type { AppNotification } from "@/lib/uiTypes";
import { cn } from "@/lib/utils";

export function NotificationHistorySection({ items }: { items: AppNotification[] }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 overflow-hidden">
      <div className="flex min-w-0 items-center justify-between gap-3 overflow-hidden">
        <div className="flex min-w-0 items-center gap-2.5 text-sm font-semibold text-foreground">
          <span className="vercel-icon-frame size-7"><Bell className="size-3.5" /></span>
          <span className="min-w-0 truncate">历史通知</span>
        </div>
        <Badge className="shrink-0" variant="outline">{items.length} 条</Badge>
      </div>

      {items.length ? (
        <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border/80 bg-card/70 shadow-sm">
          {items.map((item, index) => {
            const isError = item.kind === "error";
            return (
              <Fragment key={item.id}>
                {index ? <Separator /> : null}
                <div className={cn("min-w-0 max-w-full overflow-hidden p-3", isError && "bg-destructive/5")}>
                  <div className="flex min-w-0 max-w-full items-start gap-3 overflow-hidden">
                    <div className="vercel-icon-frame mt-0.5 size-8 text-muted-foreground">
                      {isError ? <AlertCircle /> : <CheckCircle2 />}
                    </div>
                    <div className="min-w-0 max-w-full flex-1 overflow-hidden">
                      <div className="flex min-w-0 items-center justify-between gap-3 overflow-hidden">
                        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                          {!item.read ? <span className="size-2 shrink-0 rounded-full bg-primary" /> : null}
                          <div className="min-w-0 truncate text-sm font-semibold">{item.title}</div>
                        </div>
                        <div className="shrink-0 text-xs text-muted-foreground">{formatNotificationTime(item.time)}</div>
                      </div>
                      <p className="mt-1 min-w-0 max-w-full whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">{item.text}</p>
                    </div>
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      ) : (
        <Empty className="vercel-empty-state min-h-[8rem] border border-border/70">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Bell /></EmptyMedia>
            <EmptyTitle>暂无通知</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}
