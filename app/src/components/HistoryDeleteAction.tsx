import { Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getDeleteModeScope } from "@/lib/historyCardHelpers";
import type { DeleteHistoryOptions } from "@/types/app";

export function HistoryDeleteAction({
  title,
  options,
  docId,
  busy,
  loading,
  destructive = false,
  onPreview,
  onDelete,
}: {
  title: string;
  options: DeleteHistoryOptions;
  docId: string;
  busy: boolean;
  loading: boolean;
  destructive?: boolean;
  onPreview: (docId: string, options: DeleteHistoryOptions) => void;
  onDelete: (docId: string, options: DeleteHistoryOptions) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className={destructive ? "text-sm font-semibold text-destructive" : "text-sm font-semibold text-foreground"}>{title}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{getDeleteModeScope(options.fromRound)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onPreview(docId, options)} disabled={busy || loading}>
          <Search data-icon="inline-start" />
          {loading ? "预览中" : "先看影响"}
        </Button>
        <Button type="button" variant={destructive ? "outlineDanger" : "outline"} size="sm" onClick={() => onDelete(docId, options)} disabled={busy}>
          {destructive ? <Trash2 data-icon="inline-start" /> : null}
          执行
        </Button>
      </div>
    </div>
  );
}
