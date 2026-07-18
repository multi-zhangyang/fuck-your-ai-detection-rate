import { Plus, Wand2 } from "lucide-react";

import { AppendRoundDialogFields } from "@/components/AppendRoundDialogFields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { AppendRoundDraft } from "@/lib/homeRunPanelState";
import type { ModelConfig, ModelProviderConfig, PromptOption } from "@/types/app";

type Props = {
  open: boolean;
  appendDraft: AppendRoundDraft | null;
  appendRoundNumber: number;
  appendPromptOptions: Array<Pick<PromptOption, "id" | "label">>;
  providerOptions: ModelProviderConfig[];
  modelConfig: ModelConfig;
  appendModelOptions: string[];
  appendRouteIssues: string[];
  appendConfirmDisabled: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: AppendRoundDraft | null | ((current: AppendRoundDraft | null) => AppendRoundDraft | null)) => void;
  onProviderChange: (providerId: string) => void;
  onConfirm: () => void;
};

export function AppendRoundDialog({
  open,
  appendDraft,
  appendRoundNumber,
  appendPromptOptions,
  providerOptions,
  modelConfig,
  appendModelOptions,
  appendRouteIssues,
  appendConfirmDisabled,
  onOpenChange,
  onDraftChange,
  onProviderChange,
  onConfirm,
}: Props) {
  if (!open || !appendDraft) {
    return null;
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[min(88svh,36rem)] min-w-0 overflow-hidden p-0 sm:max-w-[520px]">
        <DialogHeader className="bg-muted/20 px-6 pb-5 pt-6">
          <div className="flex items-start gap-3 pr-8">
            <span className="vercel-icon-frame size-10"><Plus className="size-5" /></span>
            <div>
              <div className="vercel-kicker mb-1">Continue workflow</div>
              <DialogTitle>追加第 {appendRoundNumber} 轮</DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-5">为下一轮选择提示词、服务商和模型。</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <Separator />
        <AppendRoundDialogFields
          appendDraft={appendDraft}
          appendPromptOptions={appendPromptOptions}
          providerOptions={providerOptions}
          modelConfig={modelConfig}
          appendModelOptions={appendModelOptions}
          appendRouteIssues={appendRouteIssues}
          onDraftChange={onDraftChange}
          onProviderChange={onProviderChange}
        />
        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="button" onClick={onConfirm} disabled={appendConfirmDisabled}>
            <Wand2 data-icon="inline-start" />
            开始追加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
