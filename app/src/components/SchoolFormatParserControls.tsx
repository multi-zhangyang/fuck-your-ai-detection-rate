import { useId } from "react";

import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FORMAT_PARSER_DEFAULT_PROVIDER_ID } from "@/lib/storageKeys";
import type { ModelProviderConfig } from "@/types/app";

export function SchoolFormatParserControls({
  busy,
  parserProviderValue,
  providers,
  effectiveParserModel,
  parserModelOptions,
  parserModel,
  onParserProviderChange,
  onParserModelChange,
}: {
  busy: boolean;
  parserProviderValue: string;
  providers: ModelProviderConfig[];
  effectiveParserModel: string;
  parserModelOptions: string[];
  parserModel: string;
  onParserProviderChange: (providerId: string) => void;
  onParserModelChange: (model: string) => void;
}) {
  const providerId = useId();
  const modelId = useId();

  return (
    <FieldGroup className="gap-3">
      <Field>
        <FieldLabel htmlFor={providerId}>模型来源</FieldLabel>
        <Select value={parserProviderValue} onValueChange={onParserProviderChange} disabled={busy}>
          <SelectTrigger id={providerId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={FORMAT_PARSER_DEFAULT_PROVIDER_ID}>默认连接</SelectItem>
              {providers.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.name || "未命名服务商"}{provider.enabled === false ? "（已关闭）" : ""}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor={modelId}>解析模型</FieldLabel>
        {parserModelOptions.length > 0 ? (
          <Select value={effectiveParserModel || undefined} onValueChange={onParserModelChange} disabled={busy}>
            <SelectTrigger id={modelId}>
              <SelectValue placeholder="选择模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {parserModelOptions.map((model) => (
                  <SelectItem key={model} value={model}>{model}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : (
          <Input id={modelId} value={parserModel} onChange={(event) => onParserModelChange(event.target.value)} placeholder="填写模型名称" disabled={busy} />
        )}
      </Field>
    </FieldGroup>
  );
}
