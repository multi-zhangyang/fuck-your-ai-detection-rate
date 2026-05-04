import type { ChangeEvent } from "react";
import { useRef, useState } from "react";

import { CheckCircle2, DatabaseZap, Loader2, Plus, RefreshCw, Save, ShieldCheck, SlidersHorizontal, Trash2, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldContent, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { FormatRules, ModelCatalogResult, ModelConfig, ModelProviderConfig } from "@/types/app";

type ModelConfigCardProps = {
  value: ModelConfig;
  busy: boolean;
  modelCatalog: ModelCatalogResult | null;
  modelCatalogBusy: boolean;
  modelCatalogError: string;
  onChange: (value: ModelConfig) => void;
  onSave: (nextValue?: ModelConfig, testValue?: ModelConfig) => void;
  onTestConnection: () => void;
  onRefreshModels: () => void;
  onListModelsForConfig: (config: ModelConfig, signal?: AbortSignal) => Promise<ModelCatalogResult | null>;
};

type SchoolFormatCardProps = {
  busy: boolean;
  formatRuleText: string;
  activeFormatRules: FormatRules | null;
  modelConfig: ModelConfig;
  modelCatalog: ModelCatalogResult | null;
  parserProviderId: string;
  parserModel: string;
  onFormatRuleTextChange: (text: string) => void;
  onParseFormatRules: (text: string) => void;
  formatParsing: boolean;
  onCancelParseFormatRules: () => void;
  onParserProviderChange: (providerId: string) => void;
  onParserModelChange: (model: string) => void;
  pendingFormatRules: FormatRules | null;
  onConfirmFormatRules: () => void;
  onDiscardFormatRules: () => void;
  onResetFormatRules: () => void;
};

const NUMBER_FIELDS = new Set<keyof ModelConfig>(["temperature", "requestTimeoutSeconds", "maxRetries"]);
const PROVIDER_NUMBER_FIELDS = new Set<keyof ModelProviderConfig>(["temperature", "requestTimeoutSeconds", "maxRetries", "rateLimitWindowMinutes", "rateLimitMaxRequests"]);

const API_OPTIONS: Array<{ value: ModelConfig["apiType"]; label: string }> = [
  { value: "chat_completions", label: "chat/completions" },
  { value: "responses", label: "responses" },
];

const FORMAT_PARSER_DEFAULT_PROVIDER_ID = "__default";

function createModelProvider(value: ModelConfig): ModelProviderConfig {
  const timestamp = Date.now().toString(36);
  return {
    id: `provider-${timestamp}`,
    name: `服务商 ${((value.modelProviders?.length ?? 0) + 1)}`,
    enabled: true,
    baseUrl: value.baseUrl,
    apiKey: value.apiKey,
    apiType: value.apiType,
    temperature: value.temperature,
    requestTimeoutSeconds: value.requestTimeoutSeconds,
    maxRetries: value.maxRetries,
    rateLimitWindowMinutes: 0,
    rateLimitMaxRequests: 0,
    models: value.model ? [value.model] : [],
    defaultModel: value.model,
    updatedAt: new Date().toISOString(),
  };
}

function providerToModelConfig(value: ModelConfig, provider: ModelProviderConfig, model?: string): ModelConfig {
  return {
    ...value,
    offlineMode: false,
    baseUrl: provider.baseUrl.trim() || value.baseUrl,
    apiKey: provider.apiKey.trim() || value.apiKey,
    model: (model ?? provider.defaultModel ?? "").trim() || value.model,
    apiType: provider.apiType || value.apiType,
    temperature: typeof provider.temperature === "number" ? provider.temperature : value.temperature,
    requestTimeoutSeconds: typeof provider.requestTimeoutSeconds === "number" ? provider.requestTimeoutSeconds : value.requestTimeoutSeconds,
    maxRetries: typeof provider.maxRetries === "number" ? provider.maxRetries : value.maxRetries,
  };
}

export function ModelConfigCard({
  value,
  busy,
  modelCatalog,
  modelCatalogBusy,
  modelCatalogError,
  onChange,
  onSave,
  onTestConnection,
  onRefreshModels,
  onListModelsForConfig,
}: ModelConfigCardProps) {
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [providerCatalogBusy, setProviderCatalogBusy] = useState<Partial<Record<string, boolean>>>({});
  const [providerCatalogErrors, setProviderCatalogErrors] = useState<Partial<Record<string, string>>>({});
  const providerCatalogAbortRef = useRef<AbortController | null>(null);

  function handleFieldChange<K extends keyof ModelConfig>(key: K) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const rawValue = event.target.value;
      const nextValue = NUMBER_FIELDS.has(key) ? Number(rawValue) : rawValue;
      onChange({ ...value, [key]: nextValue as ModelConfig[K] });
    };
  }

  function updateProviders(providers: ModelProviderConfig[]) {
    onChange({ ...value, modelProviders: providers });
  }

  function addProvider() {
    const provider = createModelProvider(value);
    updateProviders([...(value.modelProviders ?? []), provider]);
    setSelectedProviderId(provider.id);
  }

  function deleteProvider(providerId: string) {
    const nextProviders = (value.modelProviders ?? []).filter((provider) => provider.id !== providerId);
    updateProviders(nextProviders);
    if (selectedProviderId === providerId) {
      setSelectedProviderId(nextProviders[0]?.id ?? "");
    }
  }

  function updateProvider(providerId: string, patch: Partial<ModelProviderConfig>) {
    const nextProviders = (value.modelProviders ?? []).map((provider) => (
      provider.id === providerId ? { ...provider, ...patch, updatedAt: new Date().toISOString() } : provider
    ));
    updateProviders(nextProviders);
  }

  function handleProviderFieldChange<K extends keyof ModelProviderConfig>(providerId: string, field: K) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const rawValue = event.target.value;
      const nextValue = PROVIDER_NUMBER_FIELDS.has(field) ? Number(rawValue) : rawValue;
      updateProvider(providerId, { [field]: nextValue } as Partial<ModelProviderConfig>);
    };
  }

  function beginProviderCatalogRequest(): AbortController {
    providerCatalogAbortRef.current?.abort("fyadr-provider-catalog-replaced");
    const controller = new AbortController();
    providerCatalogAbortRef.current = controller;
    return controller;
  }

  function clearProviderCatalogRequest(controller: AbortController) {
    if (providerCatalogAbortRef.current === controller) {
      providerCatalogAbortRef.current = null;
    }
  }

  function stopProviderCatalogRequest() {
    providerCatalogAbortRef.current?.abort("fyadr-user-cancel");
  }

  async function refreshProviderCatalog(provider: ModelProviderConfig) {
    const abortController = beginProviderCatalogRequest();
    setProviderCatalogBusy((current) => ({ ...current, [provider.id]: true }));
    setProviderCatalogErrors((current) => ({ ...current, [provider.id]: "" }));
    try {
      const catalog = await onListModelsForConfig(providerToModelConfig(value, provider), abortController.signal);
      if (catalog) {
        updateProvider(provider.id, {
          models: catalog.models.map((item) => item.id),
          defaultModel: provider.defaultModel || catalog.models[0]?.id || "",
        });
      }
    } catch (error) {
      setProviderCatalogErrors((current) => ({
        ...current,
        [provider.id]: abortController.signal.aborted ? "已停止读取模型列表。" : error instanceof Error ? error.message : String(error),
      }));
    } finally {
      clearProviderCatalogRequest(abortController);
      setProviderCatalogBusy((current) => ({ ...current, [provider.id]: false }));
    }
  }

  async function refreshAllProviderCatalogs() {
    const enabledProviders = providers.filter((provider) => provider.enabled !== false);
    if (!enabledProviders.length) return;
    const abortController = beginProviderCatalogRequest();
    let nextProviders = [...providers];
    for (const provider of enabledProviders) {
      if (abortController.signal.aborted) {
        break;
      }
      setProviderCatalogBusy((current) => ({ ...current, [provider.id]: true }));
      setProviderCatalogErrors((current) => ({ ...current, [provider.id]: "" }));
      try {
        const catalog = await onListModelsForConfig(providerToModelConfig(value, provider), abortController.signal);
        if (catalog) {
          nextProviders = nextProviders.map((item) => (
            item.id === provider.id
              ? {
                ...item,
                models: catalog.models.map((model) => model.id),
                defaultModel: item.defaultModel || catalog.models[0]?.id || "",
                updatedAt: new Date().toISOString(),
              }
              : item
          ));
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          setProviderCatalogErrors((current) => ({ ...current, [provider.id]: "已停止读取模型列表。" }));
          break;
        }
        setProviderCatalogErrors((current) => ({ ...current, [provider.id]: error instanceof Error ? error.message : String(error) }));
      } finally {
        setProviderCatalogBusy((current) => ({ ...current, [provider.id]: false }));
      }
    }
    clearProviderCatalogRequest(abortController);
    const nextConfig = { ...value, modelProviders: nextProviders };
    onChange(nextConfig);
    onSave(nextConfig);
  }

  function saveProviderConfig(provider: ModelProviderConfig) {
    const testValue = provider.enabled === false ? undefined : providerToModelConfig(value, provider);
    onSave(value, testValue);
  }

  const hasModelOptions = (modelCatalog?.models.length ?? 0) > 0;
  const providers = value.modelProviders ?? [];
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? providers[0] ?? null;
  const providerCatalogRunning = Object.values(providerCatalogBusy).some(Boolean);
  const enabledProviderCount = providers.filter((provider) => provider.enabled !== false).length;
  const onlineValue = { ...value, offlineMode: false };

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden border-border bg-card shadow-sm">
      <Tabs defaultValue="default" className="flex h-full min-h-0 flex-col">
        <CardHeader className="shrink-0 border-b px-5 py-3">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-xl">模型配置</CardTitle>
            </div>
            <TabsList className="grid h-9 w-full shrink-0 grid-cols-2 lg:w-[360px]">
              <TabsTrigger value="default">默认连接</TabsTrigger>
              <TabsTrigger value="providers">服务商仓库</TabsTrigger>
            </TabsList>
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-hidden p-4">

          <TabsContent value="default" className="m-0 h-full min-h-0 overflow-hidden">
            <div className="grid h-full min-h-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
              <Card className="flex min-h-0 flex-col overflow-hidden shadow-none">
                <CardHeader className="border-b px-4 py-3">
                  <CardTitle className="text-base">默认连接</CardTitle>
                </CardHeader>
                <ScrollArea className="min-h-0 flex-1">
                  <CardContent className="flex flex-col gap-4 p-4">
                    <FieldGroup className="grid gap-4 md:grid-cols-2">
                      <Field className="md:col-span-2">
                        <FieldLabel htmlFor="baseUrl">API 地址</FieldLabel>
                        <Input id="baseUrl" value={value.baseUrl} onChange={handleFieldChange("baseUrl")} placeholder="https://api.example.com/v1" />
                      </Field>
                      <Field className="md:col-span-2">
                        <FieldLabel htmlFor="apiKey">API Key</FieldLabel>
                        <Input id="apiKey" type="password" value={value.apiKey} onChange={handleFieldChange("apiKey")} placeholder="sk-..." />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="model">默认模型</FieldLabel>
                        {hasModelOptions ? (
                          <Select value={value.model || undefined} onValueChange={(model) => onChange({ ...value, model })}>
                            <SelectTrigger><SelectValue placeholder="选择模型" /></SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {modelCatalog?.models.map((item) => <SelectItem key={item.id} value={item.id}>{item.id}</SelectItem>)}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input id="model" value={value.model} onChange={handleFieldChange("model")} placeholder="填写模型名称" />
                        )}
                      </Field>
                      <Field>
                        <FieldLabel>接口类型</FieldLabel>
                        <Select value={value.apiType} onValueChange={(apiType) => onChange({ ...value, apiType: apiType as ModelConfig["apiType"] })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {API_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="temperature">Temperature</FieldLabel>
                        <Input id="temperature" type="number" step="0.1" min="0" max="2" value={value.temperature} onChange={handleFieldChange("temperature")} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="requestTimeoutSeconds">超时秒数</FieldLabel>
                        <Input id="requestTimeoutSeconds" type="number" min="30" value={value.requestTimeoutSeconds} onChange={handleFieldChange("requestTimeoutSeconds")} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="maxRetries">最大重试</FieldLabel>
                        <Input id="maxRetries" type="number" min="0" max="10" value={value.maxRetries} onChange={handleFieldChange("maxRetries")} />
                      </Field>
                    </FieldGroup>
                  </CardContent>
                </ScrollArea>
              </Card>

              <div className="flex min-h-0 flex-col gap-4">
                <Card className="shadow-none">
                  <CardHeader className="p-4">
                    <CardTitle className="text-base">连接操作</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 p-4 pt-0">
                    <Button variant="outline" onClick={onTestConnection} disabled={busy}>
                      <ShieldCheck data-icon="inline-start" />测试连接
                    </Button>
                    <Button variant="outline" onClick={onRefreshModels} disabled={busy || modelCatalogBusy}>
                      {modelCatalogBusy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}读取模型列表
                    </Button>
                    <Button onClick={() => onSave(onlineValue, onlineValue)} disabled={busy}>
                      <Save data-icon="inline-start" />保存默认配置
                    </Button>
                  </CardContent>
                </Card>
                {modelCatalogError ? (
                  <Alert variant="destructive">
                    <AlertTitle>读取默认模型失败</AlertTitle>
                    <AlertDescription>{modelCatalogError}</AlertDescription>
                  </Alert>
                ) : null}
                {modelCatalog ? (
                  <Alert>
                    <CheckCircle2 />
                    <AlertTitle>模型列表已读取</AlertTitle>
                  </Alert>
                ) : null}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="providers" className="m-0 h-full min-h-0 overflow-hidden">
            <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
                <div className="border-b px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">服务商</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge variant="outline">{providers.length} 个</Badge>
                        <Badge variant="outline">{enabledProviderCount} 启用</Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => void refreshAllProviderCatalogs()} disabled={busy || providerCatalogRunning || enabledProviderCount === 0}>
                        {providerCatalogRunning ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}获取全部
                      </Button>
                      <Button type="button" size="sm" onClick={addProvider} disabled={busy}>
                        <Plus data-icon="inline-start" />添加
                      </Button>
                    </div>
                  </div>
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="flex flex-col p-2">
                    {providers.length ? providers.map((provider) => {
                      const active = selectedProvider?.id === provider.id;
                      const modelLabel = provider.defaultModel || provider.models?.[0] || "未选择模型";
                      const modelCount = provider.models?.length ?? 0;
                      const providerEnabled = provider.enabled !== false;
                      return (
                        <Button
                          key={provider.id}
                          type="button"
                          variant="ghost"
                          onClick={() => setSelectedProviderId(provider.id)}
                          className={cn(
                            "h-auto w-full flex-col items-stretch justify-start gap-2 whitespace-normal p-2.5 text-left",
                            active && "bg-muted",
                          )}
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold">{provider.name || "未命名服务商"}</span>
                              <span className="mt-1 block truncate text-xs text-muted-foreground">{modelLabel}</span>
                            </span>
                            <Badge variant={providerEnabled ? "secondary" : "outline"}>{providerEnabled ? "启用" : "关闭"}</Badge>
                          </span>
                          <span className="flex gap-2 text-xs text-muted-foreground">
                            <span>{modelCount} 模型</span>
                            <span>{provider.apiType}</span>
                          </span>
                        </Button>
                      );
                    }) : (
                      <Empty className="border bg-background">
                        <EmptyHeader>
                          <EmptyMedia variant="icon"><DatabaseZap /></EmptyMedia>
                          <EmptyTitle>还没有服务商</EmptyTitle>
                        </EmptyHeader>
                        <Button type="button" onClick={addProvider} disabled={busy}><Plus data-icon="inline-start" />添加服务商</Button>
                      </Empty>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {selectedProvider ? (
                <Card className="flex min-h-0 flex-col overflow-hidden shadow-none">
                  <CardHeader className="border-b p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{selectedProvider.name || "未命名服务商"}</CardTitle>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge variant="outline">{selectedProvider.models?.length ?? 0} 模型</Badge>
                          <Badge variant="outline">{selectedProvider.apiType}</Badge>
                          <Badge variant={selectedProvider.enabled !== false ? "secondary" : "outline"}>{selectedProvider.enabled !== false ? "启用" : "关闭"}</Badge>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" disabled={busy || providerCatalogRunning} onClick={() => void refreshProviderCatalog(selectedProvider)}>
                          {providerCatalogBusy[selectedProvider.id] ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}获取模型
                        </Button>
                        {providerCatalogRunning ? (
                          <Button type="button" size="sm" variant="outlineDanger" onClick={stopProviderCatalogRequest}>
                            <X data-icon="inline-start" />停止
                          </Button>
                        ) : null}
                        <Button type="button" size="sm" onClick={() => saveProviderConfig(selectedProvider)} disabled={busy}>
                          <Save data-icon="inline-start" />保存
                        </Button>
                        <Button type="button" variant="outlineDanger" size="sm" onClick={() => deleteProvider(selectedProvider.id)} disabled={busy}>
                          <Trash2 data-icon="inline-start" />删除
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <ScrollArea className="min-h-0 flex-1">
                    <CardContent className="flex flex-col gap-3 p-3">
                      <Field orientation="horizontal" className="rounded-lg border bg-background px-3 py-2">
                        <FieldContent>
                          <FieldTitle>启用服务商</FieldTitle>
                        </FieldContent>
                        <Switch checked={selectedProvider.enabled !== false} onCheckedChange={(enabled) => updateProvider(selectedProvider.id, { enabled })} />
                      </Field>

                      <FieldGroup className="grid gap-3 md:grid-cols-2">
                        <Field>
                          <FieldLabel>服务商名称</FieldLabel>
                          <Input value={selectedProvider.name} onChange={handleProviderFieldChange(selectedProvider.id, "name")} placeholder="例如：DeepSeek / Nebius / Groq" />
                        </Field>
                        <Field>
                          <FieldLabel>接口类型</FieldLabel>
                          <Select value={selectedProvider.apiType} onValueChange={(apiType) => updateProvider(selectedProvider.id, { apiType: apiType as ModelConfig["apiType"] })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {API_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field className="md:col-span-2">
                          <FieldLabel>API 地址</FieldLabel>
                          <Input value={selectedProvider.baseUrl} onChange={handleProviderFieldChange(selectedProvider.id, "baseUrl")} placeholder="https://api.example.com/v1" />
                        </Field>
                        <Field className="md:col-span-2">
                          <FieldLabel>API Key</FieldLabel>
                          <Input type="password" value={selectedProvider.apiKey} onChange={handleProviderFieldChange(selectedProvider.id, "apiKey")} placeholder="sk-..." />
                        </Field>
                      </FieldGroup>

                      <Separator />

                      <FieldGroup className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <Field className="md:col-span-2 xl:col-span-4">
                          <FieldLabel>默认模型</FieldLabel>
                          {(selectedProvider.models?.length ?? 0) > 0 ? (
                            <Select value={selectedProvider.defaultModel || undefined} onValueChange={(defaultModel) => updateProvider(selectedProvider.id, { defaultModel })}>
                              <SelectTrigger><SelectValue placeholder="选择默认模型" /></SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {selectedProvider.models?.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input value={selectedProvider.defaultModel ?? ""} onChange={handleProviderFieldChange(selectedProvider.id, "defaultModel")} placeholder="填写模型名称" />
                          )}
                        </Field>
                        <Field>
                          <FieldLabel>Temperature</FieldLabel>
                          <Input type="number" step="0.1" min="0" max="2" value={String(selectedProvider.temperature ?? value.temperature)} onChange={handleProviderFieldChange(selectedProvider.id, "temperature")} />
                        </Field>
                        <Field>
                          <FieldLabel>超时秒数</FieldLabel>
                          <Input type="number" min="30" value={String(selectedProvider.requestTimeoutSeconds ?? value.requestTimeoutSeconds)} onChange={handleProviderFieldChange(selectedProvider.id, "requestTimeoutSeconds")} />
                        </Field>
                        <Field>
                          <FieldLabel>窗口分钟数</FieldLabel>
                          <Input type="number" min="0" step="0.1" value={String(selectedProvider.rateLimitWindowMinutes ?? 0)} onChange={handleProviderFieldChange(selectedProvider.id, "rateLimitWindowMinutes")} placeholder="0 为不限速" />
                        </Field>
                        <Field>
                          <FieldLabel>窗口请求数</FieldLabel>
                          <Input type="number" min="0" value={String(selectedProvider.rateLimitMaxRequests ?? 0)} onChange={handleProviderFieldChange(selectedProvider.id, "rateLimitMaxRequests")} placeholder="0 为不限速" />
                        </Field>
                        <Field>
                          <FieldLabel>最大重试</FieldLabel>
                          <Input type="number" min="0" max="10" value={String(selectedProvider.maxRetries ?? value.maxRetries)} onChange={handleProviderFieldChange(selectedProvider.id, "maxRetries")} />
                        </Field>
                      </FieldGroup>

                      {selectedProvider.models?.length ? (
                        <div className="rounded-lg border bg-background p-3">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold">缓存模型</div>
                            <Badge variant="outline">{selectedProvider.updatedAt ? new Date(selectedProvider.updatedAt).toLocaleString() : "未读取"}</Badge>
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
                    </CardContent>
                  </ScrollArea>
                </Card>
              ) : (
                <Empty className="min-h-[28rem] border bg-background">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><DatabaseZap /></EmptyMedia>
                    <EmptyTitle>先添加服务商</EmptyTitle>
                  </EmptyHeader>
                  <Button type="button" onClick={addProvider} disabled={busy}><Plus data-icon="inline-start" />添加服务商</Button>
                </Empty>
              )}
            </div>
          </TabsContent>

        </CardContent>
      </Tabs>
    </Card>
  );
}

export function SchoolFormatCard({
  busy,
  formatRuleText,
  activeFormatRules,
  modelConfig,
  modelCatalog,
  parserProviderId,
  parserModel,
  onFormatRuleTextChange,
  onParseFormatRules,
  formatParsing,
  onCancelParseFormatRules,
  onParserProviderChange,
  onParserModelChange,
  pendingFormatRules,
  onConfirmFormatRules,
  onDiscardFormatRules,
  onResetFormatRules,
}: SchoolFormatCardProps) {
  const displayRules = pendingFormatRules ?? activeFormatRules;
  const hasInput = Boolean(formatRuleText.trim());
  const usingDefault = !pendingFormatRules && (activeFormatRules?.schoolName === "default" || !activeFormatRules);
  const parserProviderValue = parserProviderId || FORMAT_PARSER_DEFAULT_PROVIDER_ID;
  const providers = modelConfig.modelProviders ?? [];
  const selectedParserProvider = providers.find((provider) => provider.id === parserProviderValue) ?? null;
  const providerModelOptions = selectedParserProvider?.models ?? [];
  const defaultModelOptions = modelCatalog?.models.map((item) => item.id) ?? [];
  const effectiveParserModel = parserModel.trim()
    || selectedParserProvider?.defaultModel
    || selectedParserProvider?.models?.[0]
    || modelConfig.model;
  const parserModelOptions = Array.from(new Set([
    effectiveParserModel,
    ...(selectedParserProvider ? providerModelOptions : defaultModelOptions),
  ].filter(Boolean)));
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="text-xl">学校排版规范</CardTitle>
          </div>
          <Badge variant={pendingFormatRules ? "warning" : usingDefault ? "outline" : "success"}>{pendingFormatRules ? "待确认" : usingDefault ? "默认" : "已启用"}</Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 p-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)]">
            <FieldGroup className="gap-3">
              <Field>
                <FieldLabel>模型来源</FieldLabel>
                <Select value={parserProviderValue} onValueChange={onParserProviderChange} disabled={busy}>
                  <SelectTrigger>
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
                <FieldLabel>解析模型</FieldLabel>
                {parserModelOptions.length > 0 ? (
                  <Select value={effectiveParserModel || undefined} onValueChange={onParserModelChange} disabled={busy}>
                    <SelectTrigger>
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
                  <Input value={parserModel} onChange={(event) => onParserModelChange(event.target.value)} placeholder="填写模型名称" disabled={busy} />
                )}
              </Field>
            </FieldGroup>

            <FieldGroup className="gap-3">
              <Field>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FieldLabel htmlFor="formatRuleText">学校格式要求</FieldLabel>
                  <Badge variant={hasInput ? "default" : "outline"}>{hasInput ? `${formatRuleText.trim().length} 字` : "未填写"}</Badge>
                </div>
                <Textarea
                  id="formatRuleText"
                  value={formatRuleText}
                  onChange={(event) => onFormatRuleTextChange(event.target.value)}
                  placeholder="粘贴学校格式要求"
                  disabled={busy}
                  className="h-[150px] min-h-[150px] resize-y"
                />
              </Field>

              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => onParseFormatRules(formatRuleText)} disabled={busy}>
                  {formatParsing ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <SlidersHorizontal data-icon="inline-start" />}
                  {hasInput ? "解析规范" : "使用默认规范"}
                </Button>
                {formatParsing ? (
                  <Button type="button" size="sm" variant="destructive" onClick={onCancelParseFormatRules}>
                    <X data-icon="inline-start" />
                    停止解析
                  </Button>
                ) : null}
                <Button type="button" size="sm" variant="outline" onClick={onResetFormatRules} disabled={busy}>
                  恢复默认
                </Button>
              </div>
            </FieldGroup>
          </div>
        </div>

        {displayRules ? (
          <FormatRulesPreview
            rules={displayRules}
            busy={busy}
            isPending={Boolean(pendingFormatRules)}
            onConfirm={onConfirmFormatRules}
            onDiscard={onDiscardFormatRules}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}


const zh = (...codes: number[]) => String.fromCharCode(...codes);

const ROLE_GROUPS: Array<{ title: string; roles: string[] }> = [
  { title: zh(0x9875, 0x9762, 0x4e0e, 0x76ee, 0x5f55), roles: ["toc_heading"] },
  { title: zh(0x6458, 0x8981, 0x4e0e, 0x5173, 0x952e, 0x8bcd), roles: ["cn_abstract_lead", "cn_abstract_body", "cn_keywords", "en_abstract_lead", "en_abstract_body", "en_keywords"] },
  { title: zh(0x6b63, 0x6587, 0x4e0e, 0x6807, 0x9898), roles: ["body_text", "heading_1", "heading_2", "heading_3", "heading_4"] },
  { title: zh(0x56fe, 0x8868, 0x4e0e, 0x6ce8, 0x91ca), roles: ["caption", "note", "table_text"] },
  { title: zh(0x6587, 0x732e, 0x4e0e, 0x81f4, 0x8c22), roles: ["references_heading", "references_body", "ack_heading", "ack_body"] },
];

const ROLE_LABELS: Record<string, string> = {
  toc_heading: zh(0x76ee, 0x5f55, 0x6807, 0x9898),
  cn_abstract_lead: zh(0x4e2d, 0x6587, 0x6458, 0x8981, 0x6807, 0x9898),
  cn_abstract_body: zh(0x4e2d, 0x6587, 0x6458, 0x8981, 0x6b63, 0x6587),
  cn_keywords: zh(0x4e2d, 0x6587, 0x5173, 0x952e, 0x8bcd),
  en_abstract_lead: "Abstract",
  en_abstract_body: "Abstract body",
  en_keywords: "Key words",
  body_text: zh(0x8bba, 0x6587, 0x6b63, 0x6587),
  heading_1: zh(0x4e00, 0x7ea7, 0x6807, 0x9898),
  heading_2: zh(0x4e8c, 0x7ea7, 0x6807, 0x9898),
  heading_3: zh(0x4e09, 0x7ea7, 0x6807, 0x9898),
  heading_4: zh(0x56db, 0x7ea7, 0x6807, 0x9898),
  caption: zh(0x56fe, 0x8868, 0x9898, 0x540d),
  note: zh(0x56fe, 0x8868, 0x6ce8),
  table_text: zh(0x8868, 0x683c, 0x5185, 0x5bb9),
  references_heading: zh(0x53c2, 0x8003, 0x6587, 0x732e, 0x6807, 0x9898),
  references_body: zh(0x53c2, 0x8003, 0x6587, 0x732e, 0x5185, 0x5bb9),
  ack_heading: zh(0x81f4, 0x8c22, 0x6807, 0x9898),
  ack_body: zh(0x81f4, 0x8c22, 0x5185, 0x5bb9),
};

function FormatRulesPreview({
  rules,
  busy,
  isPending,
  onConfirm,
  onDiscard,
}: {
  rules: FormatRules;
  busy: boolean;
  isPending: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const styles = rules.styles ?? {};
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
        <h3 className="text-base font-semibold text-foreground">解析结果</h3>
        {isPending ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={onConfirm} disabled={busy}>
              <CheckCircle2 data-icon="inline-start" />
              {zh(0x786e, 0x8ba4, 0x542f, 0x7528)}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onDiscard} disabled={busy}>
              {zh(0x653e, 0x5f03, 0x672c, 0x6b21, 0x89e3, 0x6790)}
            </Button>
          </div>
        ) : null}
      </div>
      <div className="divide-y">
        {ROLE_GROUPS.map((group) => (
          <section key={group.title} className="grid gap-3 px-4 py-3 xl:grid-cols-[9rem_minmax(0,1fr)]">
            <div className="text-sm font-semibold text-foreground">{group.title}</div>
            <div className="grid overflow-hidden rounded-lg border bg-background xl:grid-cols-2">
              {group.roles.map((role) => (
                <RuleRow key={role} role={role} style={styles[role]} meta={rules.styleMeta?.[role]} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function RuleRow({ role, style, meta }: { role: string; style?: Record<string, unknown>; meta?: { sourceText?: string; confidence?: number; isInferred?: boolean } }) {
  return (
    <div className="min-w-0 border-b border-border/70 p-3 last:border-b-0 xl:border-r xl:[&:nth-child(even)]:border-r-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 truncate font-medium text-foreground">{ROLE_LABELS[role] ?? role}</div>
        <Badge variant={meta?.isInferred ? "warning" : meta ? "success" : "outline"}>{meta?.isInferred ? "继承" : meta ? `${Math.round((meta.confidence ?? 0.7) * 100)}%` : "默认"}</Badge>
      </div>
      <div className="mt-1 truncate text-sm text-muted-foreground">{styleSummary(style)} · {styleSpacing(style)} · {formatAlignment(style?.alignment)}</div>
    </div>
  );
}

function styleSummary(style?: Record<string, unknown>): string {
  if (!style) return "-";
  return `${String(style.cnFont ?? "-")} / ${String(style.fontSizePt ?? "-")}pt`;
}

function styleSpacing(style?: Record<string, unknown>): string {
  if (!style) return "-";
  if (style.lineSpacingPt) return `${zh(0x884c, 0x8ddd)} ${String(style.lineSpacingPt)}pt`;
  if (style.lineSpacingMultiple) return `${String(style.lineSpacingMultiple)}x`;
  return "-";
}

function formatAlignment(value: unknown): string {
  if (value === "center") return zh(0x5c45, 0x4e2d);
  if (value === "left") return zh(0x5c45, 0x5de6);
  if (value === "right") return zh(0x5c45, 0x53f3);
  if (value === "justify") return zh(0x4e24, 0x7aef, 0x5bf9, 0x9f50);
  return String(value ?? "-");
}
