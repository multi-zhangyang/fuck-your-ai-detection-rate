import { Bell, X } from "lucide-react";

import { NotificationHistorySection } from "@/components/NotificationHistorySection";
import { NotificationRuntimeTaskSection } from "@/components/NotificationRuntimeTaskSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { deriveNotificationCenterSummary } from "@/lib/notificationCenterViewModel";
import type { AppNotification, RuntimeTaskCenterItem } from "@/lib/uiTypes";

export function NotificationCenter({
  open,
  items,
  taskItems,
  onClose,
  onClear,
}: {
  open: boolean;
  items: AppNotification[];
  taskItems: RuntimeTaskCenterItem[];
  onClose: () => void;
  onClear: () => void;
}) {
  const {
    unreadCount,
    errorCount,
    runningTaskCount,
    taskCountText,
  } = deriveNotificationCenterSummary({ items, taskItems });

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <SheetContent
        aria-modal={true}
        side="right"
        className="flex w-[min(96vw,34rem)] min-w-0 max-w-[calc(100vw-0.75rem)] flex-col overflow-hidden p-0 sm:max-w-none [&>button]:hidden"
      >
        <SheetHeader className="min-w-0 overflow-hidden border-b border-border/70 bg-muted/20 px-4 py-4 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 overflow-hidden">
              <SheetTitle className="flex min-w-0 items-center gap-2">
                <span className="vercel-icon-frame size-9"><Bell className="size-4" /></span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="vercel-kicker">Activity center</span>
                  <span className="min-w-0 truncate">通知与任务中心</span>
                </span>
              </SheetTitle>
              <SheetDescription className="sr-only">查看运行任务和最近通知。</SheetDescription>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose} aria-label="关闭通知与任务中心">
              <X data-icon="inline-start" />
            </Button>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 overflow-hidden">
            <div className="flex min-w-0 flex-wrap gap-2 text-xs">
              <Badge variant={runningTaskCount ? "warning" : "outline"}>{runningTaskCount} 运行中</Badge>
              <Badge variant="outline">{taskCountText}</Badge>
              <Badge variant="outline">{items.length} 通知</Badge>
              {unreadCount ? <Badge variant="secondary">{unreadCount} 未读</Badge> : null}
              {errorCount ? <Badge variant="warning">{errorCount} 错误</Badge> : null}
            </div>
            <Button variant="ghost" size="sm" onClick={onClear} disabled={!items.length}>
              清空
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-x-hidden">
          <div className="flex min-w-0 max-w-full flex-col gap-5 overflow-x-hidden p-4">
            <NotificationRuntimeTaskSection taskItems={taskItems} runningTaskCount={runningTaskCount} />
            <NotificationHistorySection items={items} />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
