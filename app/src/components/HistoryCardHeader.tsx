import { FolderClock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { getProfileLabel } from "@/lib/historyCardHelpers";
import type { ModelConfig, PromptWorkflow } from "@/types/app";

export function HistoryCardHeader({
  promptProfile,
  promptWorkflows,
  open,
  busy,
  itemsLength,
  onToggle,
}: {
  promptProfile: ModelConfig["promptProfile"];
  promptWorkflows?: PromptWorkflow[];
  open: boolean;
  busy: boolean;
  itemsLength: number;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">历史记录</Badge>
          <Badge variant="outline">{getProfileLabel(promptProfile, promptWorkflows)}</Badge>
        </div>
        <CardTitle className="text-xl">继续处理与导出</CardTitle>
      </div>
      <Button variant="outline" size="sm" onClick={onToggle} disabled={busy}>
        <FolderClock data-icon="inline-start" />
        {open ? "收起" : `展开（${itemsLength}）`}
      </Button>
    </div>
  );
}
