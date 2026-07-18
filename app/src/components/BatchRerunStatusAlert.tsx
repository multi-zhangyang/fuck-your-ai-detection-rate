import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function BatchRerunStatusAlert({
  statusText,
  onCancel,
}: {
  statusText?: string;
  onCancel?: () => void;
}) {
  return (
    <Alert variant="destructive" className="shrink-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <AlertTitle>后台重跑进行中</AlertTitle>
          <AlertDescription className="text-xs font-semibold opacity-85">
            {statusText || "正在处理重跑任务；已完成的块会实时保留。"}
          </AlertDescription>
        </div>
        <Button size="sm" variant="destructive" onClick={onCancel}>停止重跑</Button>
      </div>
    </Alert>
  );
}
