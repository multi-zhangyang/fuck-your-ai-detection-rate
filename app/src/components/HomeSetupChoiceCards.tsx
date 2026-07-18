import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SetupEditorMode } from "@/components/SetupEditorDialog";
import { getPromptLabel } from "@/lib/promptRegistry";
import { cn } from "@/lib/utils";
import type { PromptId, PromptOption } from "@/types/app";
import { ChevronRight, GitBranch, Network } from "lucide-react";

type Props = {
  busy: boolean;
  setupEditor: SetupEditorMode | null;
  promptSummary: string;
  activeFlowSequence: PromptId[];
  promptSelectOptions: Array<Pick<PromptOption, "id" | "label">>;
  unavailableRouteCount: number;
  modelRouteStatus: string;
  modelRouteTitle: string;
  modelRouteLines: string[];
  onTogglePromptEditor: () => void;
  onToggleModelEditor: () => void;
};

export function HomeSetupChoiceCards({
  busy,
  setupEditor,
  promptSummary,
  activeFlowSequence,
  promptSelectOptions,
  unavailableRouteCount,
  modelRouteStatus,
  modelRouteTitle,
  modelRouteLines,
  onTogglePromptEditor,
  onToggleModelEditor,
}: Props) {
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-2 overflow-hidden">
      <Button
        type="button"
        variant="outline"
        onClick={onTogglePromptEditor}
        disabled={busy}
        aria-expanded={setupEditor === "prompt"}
        className={cn("shadcn-choice-card", setupEditor === "prompt" && "shadcn-choice-card-active")}
      >
        <div className="flex w-full min-w-0 items-center gap-2.5">
          <span className="vercel-icon-frame size-8">
            <GitBranch className="size-4" />
          </span>
          <div className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground">改写流程</div>
          <Badge variant={setupEditor === "prompt" ? "default" : "outline"} className="max-w-[9rem] shrink-0 truncate">{setupEditor === "prompt" ? "已打开" : "编辑"}</Badge>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" />
        </div>
        <div className="mt-1 truncate pl-[2.625rem] text-sm font-semibold">{promptSummary}</div>
        <div className="flex min-w-0 flex-wrap gap-1 pl-[2.625rem]">
          {activeFlowSequence.map((promptId, index) => (
            <Badge key={`${promptId}-${index}-flow`} variant="secondary" className="max-w-full truncate text-[10px]">
              {index + 1}. {getPromptLabel(promptId, promptSelectOptions)}
            </Badge>
          ))}
        </div>
      </Button>

      <Button
        type="button"
        variant="outline"
        onClick={onToggleModelEditor}
        disabled={busy}
        aria-expanded={setupEditor === "model"}
        className={cn(
          "shadcn-choice-card",
          unavailableRouteCount ? "border-destructive/40" : setupEditor === "model" && "shadcn-choice-card-active",
        )}
      >
        <div className="flex w-full min-w-0 items-center gap-2.5">
          <span className="vercel-icon-frame size-8">
            <Network className="size-4" />
          </span>
          <div className={`min-w-0 flex-1 truncate text-xs font-semibold ${unavailableRouteCount ? "text-destructive" : "text-muted-foreground"}`}>模型路线</div>
          <Badge variant={unavailableRouteCount ? "warning" : setupEditor === "model" ? "default" : "outline"} className="max-w-[11rem] shrink-0 truncate">
            {setupEditor === "model" ? "已打开" : modelRouteStatus}
          </Badge>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" />
        </div>
        <div className="mt-1 truncate pl-[2.625rem] text-sm font-semibold" data-ui-section="home-active-model-route">
          {modelRouteTitle}
        </div>
        <div className="mt-1 flex min-w-0 flex-col gap-1 pl-[2.625rem] text-[11px] font-medium text-muted-foreground">
          {modelRouteLines.slice(0, 3).map((line) => (
            <span key={line} className="truncate">{line}</span>
          ))}
        </div>
      </Button>
    </div>
  );
}
