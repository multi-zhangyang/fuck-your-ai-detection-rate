import { AlertCircle } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AppendRoundDraft } from "@/lib/homeRunPanelState";
import type { ModelConfig, ModelProviderConfig, PromptId, PromptOption } from "@/types/app";

export function AppendRoundDialogFields({
  appendDraft,
  appendPromptOptions,
  providerOptions,
  modelConfig,
  appendModelOptions,
  appendRouteIssues,
  onDraftChange,
  onProviderChange,
}: {
  appendDraft: AppendRoundDraft;
  appendPromptOptions: Array<Pick<PromptOption, "id" | "label">>;
  providerOptions: ModelProviderConfig[];
  modelConfig: ModelConfig;
  appendModelOptions: string[];
  appendRouteIssues: string[];
  onDraftChange: (draft: AppendRoundDraft | null | ((current: AppendRoundDraft | null) => AppendRoundDraft | null)) => void;
  onProviderChange: (providerId: string) => void;
}) {
  return (
    <FieldGroup className="px-6">
      <Field>
        <FieldLabel htmlFor="appendRoundPrompt">提示词</FieldLabel>
        <Select value={appendDraft.promptId} onValueChange={(promptId) => onDraftChange((draft) => (draft ? { ...draft, promptId: promptId as PromptId } : draft))}>
          <SelectTrigger id="appendRoundPrompt"><SelectValue placeholder="选择提示词" /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {appendPromptOptions.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="appendRoundProvider">服务商</FieldLabel>
        <Select value={appendDraft.providerId || "__default"} onValueChange={onProviderChange}>
          <SelectTrigger id="appendRoundProvider"><SelectValue placeholder="选择服务商" /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="__default">默认连接 · {modelConfig.model || "未选模型"}</SelectItem>
              {providerOptions.map((provider) => <SelectItem key={provider.id} value={provider.id}>{provider.name || "未命名服务商"}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="appendRoundModel">模型</FieldLabel>
        {appendDraft.providerId === "__default" ? (
          <Input id="appendRoundModel" value={modelConfig.model || "未选模型"} readOnly disabled />
        ) : appendModelOptions.length > 0 ? (
          <Select value={appendDraft.model} onValueChange={(model) => onDraftChange((draft) => (draft ? { ...draft, model } : draft))}>
            <SelectTrigger id="appendRoundModel"><SelectValue placeholder="选择模型" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {appendModelOptions.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : (
          <Input id="appendRoundModel" value={appendDraft.model} onChange={(event) => onDraftChange((draft) => (draft ? { ...draft, model: event.target.value } : draft))} placeholder="填写模型名称" />
        )}
      </Field>
      {appendRouteIssues.length ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{appendRouteIssues[0]}</AlertTitle>
        </Alert>
      ) : null}
    </FieldGroup>
  );
}
