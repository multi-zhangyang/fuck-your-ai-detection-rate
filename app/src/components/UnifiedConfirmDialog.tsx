import { AlertCircle } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ConfirmDialogState, ConfirmDialogTone } from "@/lib/uiTypes";
import { cn } from "@/lib/utils";

export function UnifiedConfirmDialog({
  value,
  onCancel,
  onConfirm,
}: {
  value: ConfirmDialogState | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!value) {
    return null;
  }

  const tone = value.tone ?? "neutral";
  const confirmVariant: Record<ConfirmDialogTone, "neutral" | "warning" | "destructive"> = {
    neutral: "neutral",
    info: "neutral",
    warning: "warning",
    danger: "destructive",
  };

  return (
    <AlertDialog open onOpenChange={(open) => {
      if (!open) onCancel();
    }}>
      <AlertDialogContent className={cn(tone === "danger" && "border-destructive/40")}>
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground", tone === "danger" && "border-destructive/30 bg-destructive/10 text-destructive")}>
              <AlertCircle />
            </span>
            <div className="min-w-0 flex-1">
              <AlertDialogTitle>{value.title}</AlertDialogTitle>
              {value.description ? (
                <AlertDialogDescription>{value.description}</AlertDialogDescription>
              ) : (
                <AlertDialogDescription className="sr-only">确认当前操作。</AlertDialogDescription>
              )}
            </div>
          </div>
        </AlertDialogHeader>
        {value.details?.length ? (
          <div className="flex flex-col gap-2">
            {value.details.map((detail, index) => (
              <div key={`${value.id}-${index}-${detail}`} className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium leading-6 text-muted-foreground">
                {detail}
              </div>
            ))}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{value.cancelLabel ?? "取消"}</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              type="button"
              variant={confirmVariant[tone]}
              onClick={(event) => {
                event.preventDefault();
                onConfirm();
              }}
            >
              {value.confirmLabel ?? "确定"}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
