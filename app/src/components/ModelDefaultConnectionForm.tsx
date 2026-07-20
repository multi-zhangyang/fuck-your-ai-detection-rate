import { useId, type ChangeEvent } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { API_OPTIONS, NUMBER_FIELDS } from "@/lib/modelConfigCardHelpers";
import { MAX_REWRITE_CONCURRENCY } from "@/lib/modelRoute";
import type { ModelCatalogResult, ModelConfig } from "@/types/app";
import { KeyRound, PlugZap, SlidersHorizontal } from "lucide-react";

export function ModelDefaultConnectionForm({
  value,
  modelCatalog,
  onChange,
}: {
  value: ModelConfig;
  modelCatalog: ModelCatalogResult | null;
  onChange: (value: ModelConfig) => void;
}) {
  const fieldPrefix = useId();
  const fieldId = (name: string) => `${fieldPrefix}-${name}`;
  function handleFieldChange<K extends keyof ModelConfig>(key: K) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const rawValue = event.target.value;
      const nextValue = NUMBER_FIELDS.has(key) ? Number(rawValue) : rawValue;
      onChange({ ...value, [key]: nextValue as ModelConfig[K] });
    };
  }
  const hasModelOptions = (modelCatalog?.models.length ?? 0) > 0;

  return (
    <Card className="flex min-h-[42rem] flex-col overflow-hidden border-border/80 bg-card/80 shadow-none 2xl:min-h-0" data-ui-section="model-form-card">
      <CardHeader className="border-b border-border/70 bg-muted/20 px-4 py-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="vercel-icon-frame size-8"><PlugZap className="size-4" /></span>
            <div className="min-w-0">
              <div className="vercel-kicker mb-0.5">Connection</div>
              <CardTitle className="text-base">默认连接</CardTitle>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0">
            {hasModelOptions ? `${modelCatalog?.models.length ?? 0} 个模型` : "手动配置"}
          </Badge>
        </div>
      </CardHeader>
      <ScrollArea className="min-h-0 flex-1" data-ui-section="model-form-scroll">
        <CardContent className="flex flex-col gap-5 p-4">
          <section className="flex flex-col gap-4" aria-labelledby={`${fieldPrefix}-credentials-heading`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-muted-foreground" />
                <h3 id={`${fieldPrefix}-credentials-heading`} className="text-sm font-semibold">连接凭据</h3>
              </div>
              <span className="text-[11px] text-muted-foreground">密钥保存在当前部署的服务端配置</span>
            </div>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field className="md:col-span-2">
                <FieldLabel htmlFor={fieldId("baseUrl")}>API 地址</FieldLabel>
                <Input id={fieldId("baseUrl")} value={value.baseUrl} onChange={handleFieldChange("baseUrl")} placeholder="https://api.example.com/v1" />
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel htmlFor={fieldId("apiKey")}>API Key</FieldLabel>
                <Input id={fieldId("apiKey")} type="password" value={value.apiKey} onChange={handleFieldChange("apiKey")} placeholder="sk-..." />
              </Field>
              <Field>
                <FieldLabel htmlFor={fieldId("model")}>默认模型</FieldLabel>
                {hasModelOptions ? (
                  <Select value={value.model || undefined} onValueChange={(model) => onChange({ ...value, model })}>
                    <SelectTrigger id={fieldId("model")}><SelectValue placeholder="选择模型" /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {modelCatalog?.models.map((item) => <SelectItem key={item.id} value={item.id}>{item.id}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input id={fieldId("model")} value={value.model} onChange={handleFieldChange("model")} placeholder="填写模型名称" />
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor={fieldId("apiType")}>接口类型</FieldLabel>
                <Select value={value.apiType} onValueChange={(apiType) => onChange({ ...value, apiType: apiType as ModelConfig["apiType"] })}>
                  <SelectTrigger id={fieldId("apiType")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {API_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          </section>

          <Separator className="opacity-70" />

          <section className="flex flex-col gap-4" aria-labelledby={`${fieldPrefix}-policy-heading`}>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-muted-foreground" />
              <h3 id={`${fieldPrefix}-policy-heading`} className="text-sm font-semibold">生成与容错策略</h3>
            </div>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={fieldId("temperature")}>Temperature</FieldLabel>
                <Input id={fieldId("temperature")} type="number" step="0.1" min="0" max="2" value={value.temperature} onChange={handleFieldChange("temperature")} />
              </Field>
              <Field>
                <FieldLabel htmlFor={fieldId("requestTimeoutSeconds")}>超时秒数</FieldLabel>
                <Input id={fieldId("requestTimeoutSeconds")} type="number" min="30" max="3600" value={value.requestTimeoutSeconds} onChange={handleFieldChange("requestTimeoutSeconds")} />
              </Field>
              <Field>
                <FieldLabel htmlFor={fieldId("maxRetries")}>最大重试</FieldLabel>
                <Input id={fieldId("maxRetries")} type="number" min="0" max="10" value={value.maxRetries} onChange={handleFieldChange("maxRetries")} />
              </Field>
              <Field>
                <FieldLabel htmlFor={fieldId("rewriteConcurrency")}>轮内并发</FieldLabel>
                <Input id={fieldId("rewriteConcurrency")} type="number" min="1" max={MAX_REWRITE_CONCURRENCY} value={value.rewriteConcurrency} onChange={handleFieldChange("rewriteConcurrency")} />
              </Field>
              <Field orientation="horizontal" className="rounded-lg border bg-background px-3 py-3 md:col-span-2">
                <FieldContent>
                  <FieldTitle id={fieldId("streaming")}>流式接收</FieldTitle>
                  <FieldDescription>
                    默认开启并兼容旧配置。系统仅消费最终回答，思考字段不会进入论文/日志；流式期间只显示接收计数，完整候选通过门禁后才进入 Diff。
                  </FieldDescription>
                </FieldContent>
                <Switch
                  aria-labelledby={fieldId("streaming")}
                  checked={value.streaming}
                  onCheckedChange={(streaming) => onChange({ ...value, streaming })}
                />
              </Field>
            </FieldGroup>
          </section>
        </CardContent>
      </ScrollArea>
    </Card>
  );
}
