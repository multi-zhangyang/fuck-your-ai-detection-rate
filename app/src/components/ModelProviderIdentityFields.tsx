import { useId, type ChangeEvent } from "react";

import { Field, FieldContent, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { API_OPTIONS, PROVIDER_NUMBER_FIELDS } from "@/lib/modelConfigCardHelpers";
import type { ModelConfig, ModelProviderConfig } from "@/types/app";

export function ModelProviderIdentityFields({
  selectedProvider,
  onUpdateProvider,
}: {
  selectedProvider: ModelProviderConfig;
  onUpdateProvider: (providerId: string, patch: Partial<ModelProviderConfig>) => void;
}) {
  const enabledLabelId = useId();
  const nameId = useId();
  const apiTypeId = useId();
  const baseUrlId = useId();
  const apiKeyId = useId();

  function handleProviderFieldChange<K extends keyof ModelProviderConfig>(providerId: string, field: K) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const rawValue = event.target.value;
      const nextValue = PROVIDER_NUMBER_FIELDS.has(field) ? Number(rawValue) : rawValue;
      onUpdateProvider(providerId, { [field]: nextValue } as Partial<ModelProviderConfig>);
    };
  }

  return (
    <>
      <Field orientation="horizontal" className="rounded-lg border bg-background px-3 py-2">
        <FieldContent>
          <FieldTitle id={enabledLabelId}>启用服务商</FieldTitle>
        </FieldContent>
        <Switch aria-labelledby={enabledLabelId} checked={selectedProvider.enabled !== false} onCheckedChange={(enabled) => onUpdateProvider(selectedProvider.id, { enabled })} />
      </Field>

      <FieldGroup className="grid gap-3 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={nameId}>服务商名称</FieldLabel>
          <Input id={nameId} value={selectedProvider.name} onChange={handleProviderFieldChange(selectedProvider.id, "name")} placeholder="例如：DeepSeek / Nebius / Groq" />
        </Field>
        <Field>
          <FieldLabel htmlFor={apiTypeId}>接口类型</FieldLabel>
          <Select value={selectedProvider.apiType} onValueChange={(apiType) => onUpdateProvider(selectedProvider.id, { apiType: apiType as ModelConfig["apiType"] })}>
            <SelectTrigger id={apiTypeId}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {API_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor={baseUrlId}>API 地址</FieldLabel>
          <Input id={baseUrlId} value={selectedProvider.baseUrl} onChange={handleProviderFieldChange(selectedProvider.id, "baseUrl")} placeholder="https://api.example.com/v1" />
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor={apiKeyId}>API Key</FieldLabel>
          <Input id={apiKeyId} type="password" value={selectedProvider.apiKey} onChange={handleProviderFieldChange(selectedProvider.id, "apiKey")} placeholder="sk-..." />
        </Field>
      </FieldGroup>
    </>
  );
}
