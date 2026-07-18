import { AlertCircle, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ModelConfig, ModelProviderConfig, PromptId } from "@/types/app";

export function SetupEditorModelRouteRoundCard({
  index,
  promptId,
  promptLabel,
  busy,
  modelConfig,
  providerOptions,
  selectedProviderId,
  selectedModels,
  selectedModelValue,
  routeIssues,
  provider,
  roundModel,
  onUpdateRoundProvider,
  onUpdateRoundModel,
  onRefreshProviderModels,
}: {
  index: number;
  promptId: PromptId;
  promptLabel: string;
  busy: boolean;
  modelConfig: ModelConfig;
  providerOptions: ModelProviderConfig[];
  selectedProviderId: string;
  selectedModels: string[];
  selectedModelValue: string;
  routeIssues: string[];
  provider: ModelProviderConfig | null | undefined;
  roundModel: { model?: string } | null | undefined;
  onUpdateRoundProvider: (roundIndex: number, providerId: string) => void;
  onUpdateRoundModel: (roundIndex: number, model: string) => void;
  onRefreshProviderModels: (providerId: string) => void;
}) {
  return (
    <Card key={`${promptId}-${index}-model`} className={cn("min-w-0 overflow-hidden shadow-none", routeIssues.length && "border-destructive/40 bg-destructive/5")}>
      <CardHeader className="flex min-w-0 flex-row items-center justify-between gap-3 p-3 pb-2">
        <CardTitle className="min-w-0 truncate text-sm">第 {index + 1} 轮 · {promptLabel}</CardTitle>
        <Badge variant={selectedProviderId === "__default" ? "outline" : "secondary"} className="shrink-0">{selectedProviderId === "__default" ? "默认" : "专属"}</Badge>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3 overflow-hidden p-3 pt-0">
        <FieldGroup className="grid min-w-0 gap-2 md:grid-cols-2">
          <Field>
            <FieldLabel className="sr-only">第 {index + 1} 轮服务商</FieldLabel>
            <Select value={selectedProviderId || "__default"} onValueChange={(providerId) => onUpdateRoundProvider(index, providerId)} disabled={busy}>
              <SelectTrigger><SelectValue placeholder="选择服务商" /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="__default">默认连接 · {modelConfig.model || "未选模型"}</SelectItem>
                  {providerOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name || "未命名服务商"}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel className="sr-only">第 {index + 1} 轮模型</FieldLabel>
            {selectedProviderId === "__default" ? (
              <Input value={modelConfig.model || "未选模型"} readOnly disabled />
            ) : selectedModels.length > 0 ? (
              <Select value={selectedModelValue} onValueChange={(model) => onUpdateRoundModel(index, model)} disabled={busy}>
                <SelectTrigger><SelectValue placeholder="选择模型" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {selectedModels.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={roundModel?.model ?? ""}
                onChange={(event) => onUpdateRoundModel(index, event.target.value)}
                disabled={busy}
                placeholder="填写模型名称"
              />
            )}
          </Field>
        </FieldGroup>
        {selectedProviderId !== "__default" && provider && selectedModels.length === 0 ? (
          <Button type="button" variant="outline" size="sm" className="w-fit max-w-full" onClick={() => onRefreshProviderModels(provider.id)} disabled={busy}>
            <RefreshCw data-icon="inline-start" />读取模型
          </Button>
        ) : null}
        {routeIssues.length ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>本轮不可用</AlertTitle>
            <AlertDescription>{routeIssues.join("，")}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
