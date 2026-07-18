import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PromptId, PromptOption } from "@/types/app";
import { Workflow } from "lucide-react";

export function SetupEditorPromptSection({
  busy,
  activeSequence,
  sequenceLengthOptions,
  promptSelectOptions,
  onUpdateSequenceLength,
  onUpdateSequenceRound,
}: {
  busy: boolean;
  activeSequence: PromptId[];
  sequenceLengthOptions: number[];
  promptSelectOptions: Array<Pick<PromptOption, "id" | "label">>;
  onUpdateSequenceLength: (length: number) => void;
  onUpdateSequenceRound: (roundIndex: number, promptId: PromptId) => void;
}) {
  const promptSelectBaseId = useId();

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="vercel-icon-frame size-8"><Workflow className="size-4" /></span>
          <div>
            <div className="text-sm font-semibold">轮次编排</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">确定流程长度，并为每一轮选择改写策略</div>
          </div>
        </div>
        <Badge variant="outline">{activeSequence.length} 轮</Badge>
      </div>
      <div className="min-w-0 overflow-hidden rounded-xl border border-border/80 bg-card/60 p-4 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.025)]">
        <div role="group" aria-label="改写轮数" className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(4.5rem,1fr))]">
          {sequenceLengthOptions.map((length) => (
            <Button key={length} type="button" aria-pressed={activeSequence.length === length} variant={activeSequence.length === length ? "default" : "outline"} size="sm" onClick={() => onUpdateSequenceLength(length)} disabled={busy}>{length} 轮</Button>
          ))}
        </div>
        <div className="mt-4 grid gap-3">
          {activeSequence.map((promptId, index) => {
            const selectId = `${promptSelectBaseId}-${index}`;
            return (
              <div key={`${index}-${promptId}`} className="grid gap-3 rounded-lg border border-border/70 bg-background/60 p-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                <span className="vercel-icon-frame size-8 rounded-full font-mono text-[11px]">{String(index + 1).padStart(2, "0")}</span>
                <div className="grid min-w-0 gap-1.5">
                  <FieldLabel htmlFor={selectId} className="text-xs font-semibold text-muted-foreground">第 {index + 1} 轮</FieldLabel>
                  <Select value={promptId} onValueChange={(nextPromptId) => onUpdateSequenceRound(index, nextPromptId as PromptId)} disabled={busy}>
                    <SelectTrigger id={selectId}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {promptSelectOptions.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
