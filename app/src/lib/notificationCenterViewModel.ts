import type { AppNotification, RuntimeTaskCenterItem } from "@/lib/uiTypes";

export function deriveNotificationCenterSummary(input: {
  items: AppNotification[];
  taskItems: RuntimeTaskCenterItem[];
}) {
  const unreadCount = input.items.filter((item) => !item.read).length;
  const errorCount = input.items.filter((item) => item.kind === "error").length;
  const runningTaskCount = input.taskItems.filter((item) => item.running).length;
  const taskCountText = input.taskItems.length ? `${input.taskItems.length} 任务` : "无任务";
  return {
    unreadCount,
    errorCount,
    runningTaskCount,
    taskCountText,
  };
}
