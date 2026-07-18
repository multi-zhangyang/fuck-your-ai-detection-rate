import type { ChangeEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatDateTime } from "@/lib/formatters";
import { PROVIDER_NUMBER_FIELDS } from "@/lib/modelConfigCardHelpers";
import type { ModelConfig, ModelProviderConfig } from "@/types/app";

export function ModelProviderParamFields({
  value,
  selectedProvider,
  providerCatalogErrors,
  onUpdateProvider,
}: {
  value: ModelConfig;
  selectedProvider: ModelProviderConfig;
  providerCatalogErrors: Partial<Record<string, string>>;
  onUpdateProvider: (providerId: string, patch: Partial<ModelProviderConfig>) => void;
}) {
  function handleProviderFieldChange<K extends keyof ModelProviderConfig>(providerId: string, field: K) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const rawValue = event.target.value;
      const nextValue = PROVIDER_NUMBER_FIELDS.has(field) ? Number(rawValue) : rawValue;
      onUpdateProvider(providerId, { [field]: nextValue } as Partial<ModelProviderConfig>);
    };
  }

  return (
    <>
      <FieldGroup className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field className="md:col-span-2 xl:col-span-4">
          <FieldLabel htmlFor={`${selectedProvider.id}-defaultModel`}>默认模型</FieldLabel>
          {(selectedProvider.models?.length ?? 0) > 0 ? (
            <Select value={selectedProvider.defaultModel || undefined} onValueChange={(defaultModel) => onUpdateProvider(selectedProvider.id, { defaultModel })}>
              <SelectTrigger id={`${selectedProvider.id}-defaultModel`}><SelectValue placeholder="选择默认模型" /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {selectedProvider.models?.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : (
            <Input id={`${selectedProvider.id}-defaultModel`} value={selectedProvider.defaultModel ?? ""} onChange={handleProviderFieldChange(selectedProvider.id, "defaultModel")} placeholder="填写模型名称" />
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${selectedProvider.id}-temperature`}>Temperature</FieldLabel>
          <Input id={`${selectedProvider.id}-temperature`} type="number" step="0.1" min="0" max="2" value={String(selectedProvider.temperature ?? value.temperature)} onChange={handleProviderFieldChange(selectedProvider.id, "temperature")} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${selectedProvider.id}-requestTimeoutSeconds`}>超时秒数</FieldLabel>
          <Input id={`${selectedProvider.id}-requestTimeoutSeconds`} type="number" min="30" value={String(selectedProvider.requestTimeoutSeconds ?? value.requestTimeoutSeconds)} onChange={handleProviderFieldChange(selectedProvider.id, "requestTimeoutSeconds")} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${selectedProvider.id}-rateLimitWindowMinutes`}>窗口分钟数</FieldLabel>
          <Input id={`${selectedProvider.id}-rateLimitWindowMinutes`} type="number" min="0" step="0.1" value={String(selectedProvider.rateLimitWindowMinutes ?? 0)} onChange={handleProviderFieldChange(selectedProvider.id, "rateLimitWindowMinutes")} placeholder="0 为不限速" />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${selectedProvider.id}-rateLimitMaxRequests`}>窗口请求数</FieldLabel>
          <Input id={`${selectedProvider.id}-rateLimitMaxRequests`} type="number" min="0" value={String(selectedProvider.rateLimitMaxRequests ?? 0)} onChange={handleProviderFieldChange(selectedProvider.id, "rateLimitMaxRequests")} placeholder="0 为不限速" />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${selectedProvider.id}-maxRetries`}>最大重试</FieldLabel>
          <Input id={`${selectedProvider.id}-maxRetries`} type="number" min="0" max="10" value={String(selectedProvider.maxRetries ?? value.maxRetries)} onChange={handleProviderFieldChange(selectedProvider.id, "maxRetries")} />
        </Field>
        <Field orientation="horizontal" className="rounded-lg border bg-background px-3 py-3 md:col-span-2 xl:col-span-4">
          <FieldContent>
            <FieldTitle id={`${selectedProvider.id}-streaming`}>流式接收</FieldTitle>
            <FieldDescription>
              仅消费最终回答，思考字段不会进入论文/日志；接收期间不展示任何模型片段。
            </FieldDescription>
          </FieldContent>
          <Switch
            aria-labelledby={`${selectedProvider.id}-streaming`}
            checked={selectedProvider.streaming ?? value.streaming}
            onCheckedChange={(streaming) => onUpdateProvider(selectedProvider.id, { streaming })}
          />
        </Field>
      </FieldGroup>

      {selectedProvider.models?.length ? (
        <div className="rounded-lg border bg-background p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">缓存模型</div>
            <Badge variant="outline">{selectedProvider.updatedAt ? formatDateTime(selectedProvider.updatedAt) : "未读取"}</Badge>
          </div>
          <div className="flex max-h-24 flex-wrap gap-2 overflow-auto">
            {selectedProvider.models.slice(0, 80).map((model) => <Badge key={model} variant="outline">{model}</Badge>)}
          </div>
        </div>
      ) : null}

      {providerCatalogErrors[selectedProvider.id] ? (
        <Alert variant="destructive">
          <AlertTitle>模型列表读取失败</AlertTitle>
          <AlertDescription>{providerCatalogErrors[selectedProvider.id]}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
