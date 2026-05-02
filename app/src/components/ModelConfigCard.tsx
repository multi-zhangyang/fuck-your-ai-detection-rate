import type { ChangeEvent } from "react";
import { useRef, useState } from "react";

import { CheckCircle2, DatabaseZap, Loader2, Plus, RefreshCw, Save, ShieldCheck, SlidersHorizontal, Trash2, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  onRefreshParserProviderModels: (providerId: string) => void;
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

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden border-border bg-card shadow-sm">
      <CardHeader className="shrink-0 border-b px-5 py-4">
        <CardTitle className="text-xl">模型配置</CardTitle>
        <CardDescription className="mt-1">管理默认连接和服务商仓库。</CardDescription>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-hidden p-5">
        <Tabs defaultValue="default" className="flex h-full min-h-0 flex-col gap-4">
          <TabsList className="grid h-auto w-full grid-cols-2 xl:w-[360px]">
            <TabsTrigger value="default">默认连接</TabsTrigger>
            <TabsTrigger value="providers">服务商仓库</TabsTrigger>
          </TabsList>

          <TabsContent value="default" className="min-h-0 flex-1 overflow-hidden">
            <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <Card className="flex min-h-0 flex-col overflow-hidden shadow-none">
                <CardHeader className="border-b px-4 py-3">
                  <CardTitle className="text-base">默认连接</CardTitle>
                  <CardDescription>没有指定专属服务商的轮次会使用这里。</CardDescription>
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
                      <Field orientation="horizontal" className="rounded-lg border bg-muted/40 px-4 py-3 md:col-span-2">
                        <FieldContent>
                          <FieldTitle>离线模式</FieldTitle>
                          <FieldDescription>开启后不请求远程模型。</FieldDescription>
                        </FieldContent>
                        <Switch checked={value.offlineMode} onCheckedChange={(offlineMode) => onChange({ ...value, offlineMode })} />
                      </Field>
                    </FieldGroup>
                  </CardContent>
                </ScrollArea>
              </Card>

              <div className="flex min-h-0 flex-col gap-4">
                <Card className="shadow-none">
                  <CardHeader className="p-4">
                    <CardTitle className="text-base">连接操作</CardTitle>
                    <CardDescription>测试、读取模型列表并保存默认配置。</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 p-4 pt-0">
                    <Button variant="outline" onClick={onTestConnection} disabled={busy}>
                      <ShieldCheck data-icon="inline-start" />测试连接
                    </Button>
                    <Button variant="outline" onClick={onRefreshModels} disabled={busy || modelCatalogBusy || value.offlineMode}>
                      {modelCatalogBusy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}读取模型列表
                    </Button>
                    <Button onClick={() => onSave(value, value)} disabled={busy}>
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
                    <AlertDescription>共 {modelCatalog.total} 个模型。</AlertDescription>
                  </Alert>
                ) : null}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="providers" className="min-h-0 flex-1 overflow-hidden">
            <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
              <Card className="flex min-h-0 flex-col overflow-hidden shadow-none">
                <CardHeader className="border-b p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">服务商</CardTitle>
                      <CardDescription>连接、模型与限速策略</CardDescription>
                    </div>
                    <Button type="button" size="sm" onClick={addProvider} disabled={busy}>
                      <Plus data-icon="inline-start" />添加
                    </Button>
                  </div>
                </CardHeader>
                <ScrollArea className="min-h-0 flex-1">
                  <CardContent className="flex flex-col gap-2 p-3">
                    {providers.length ? providers.map((provider) => {
                      const active = selectedProvider?.id === provider.id;
                      const modelLabel = provider.defaultModel || provider.models?.[0] || "未选择模型";
                      const modelCount = provider.models?.length ?? 0;
                      const providerEnabled = provider.enabled !== false;
                      return (
                        <Button
                          key={provider.id}
                          type="button"
                          variant="outline"
                          onClick={() => setSelectedProviderId(provider.id)}
                          className={cn(
                            "h-auto w-full flex-col items-stretch justify-start gap-2 whitespace-normal p-3 text-left",
                            active && "border-primary bg-muted shadow-sm",
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
                          <EmptyDescription>添加后可为不同轮次指定模型。</EmptyDescription>
                        </EmptyHeader>
                        <Button type="button" onClick={addProvider} disabled={busy}><Plus data-icon="inline-start" />添加服务商</Button>
                      </Empty>
                    )}
                  </CardContent>
                </ScrollArea>
              </Card>

              {selectedProvider ? (
                <Card className="flex min-h-0 flex-col overflow-hidden shadow-none">
                  <CardHeader className="border-b p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{selectedProvider.name || "未命名服务商"}</CardTitle>
                        <CardDescription>
                          {selectedProvider.models?.length ?? 0} 个缓存模型 · {selectedProvider.enabled !== false ? "启用" : "关闭"}
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" disabled={busy || providerCatalogRunning || value.offlineMode} onClick={() => void refreshProviderCatalog(selectedProvider)}>
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
                    <CardContent className="flex flex-col gap-4 p-4">
                      <Field orientation="horizontal" className="rounded-lg border bg-muted/40 px-4 py-3">
                        <FieldContent>
                          <FieldTitle>启用服务商</FieldTitle>
                          <FieldDescription>关闭后不会被任务使用。</FieldDescription>
                        </FieldContent>
                        <Switch checked={selectedProvider.enabled !== false} onCheckedChange={(enabled) => updateProvider(selectedProvider.id, { enabled })} />
                      </Field>

                      <FieldGroup className="grid gap-4 md:grid-cols-2">
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

                      <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold">缓存模型</div>
                            <Badge variant="outline">{selectedProvider.updatedAt ? new Date(selectedProvider.updatedAt).toLocaleString() : "未读取"}</Badge>
                          </div>
                          <div className="flex max-h-28 flex-wrap gap-2 overflow-auto">
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
                    <EmptyDescription>服务商会沉淀模型列表、API 类型和限速策略。</EmptyDescription>
                  </EmptyHeader>
                  <Button type="button" onClick={addProvider} disabled={busy}><Plus data-icon="inline-start" />添加服务商</Button>
                </Empty>
              )}
            </div>
          </TabsContent>

        </Tabs>
      </CardContent>
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
  onRefreshParserProviderModels,
  pendingFormatRules,
  onConfirmFormatRules,
  onDiscardFormatRules,
  onResetFormatRules,
}: SchoolFormatCardProps) {
  const displayRules = pendingFormatRules ?? activeFormatRules;
  const rulesMode = pendingFormatRules ? zh(0x5f85, 0x786e, 0x8ba4) : activeFormatRules ? zh(0x5df2, 0x542f, 0x7528) : zh(0x672a, 0x89e3, 0x6790);
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
      <CardHeader className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">学校规范</Badge>
              <Badge variant={pendingFormatRules ? "warning" : "success"}>{pendingFormatRules ? "等待确认" : usingDefault ? "默认规范生效" : "已启用"}</Badge>
              <Badge variant="outline">只影响 Word 导出</Badge>
            </div>
            <CardTitle className="text-2xl">学校排版规范</CardTitle>
            <CardDescription>不填写时自动使用内置默认规范；填写后先解析成结构化规则，确认启用后才影响 Word 导出。</CardDescription>
          </div>
          <div className="hidden rounded-md bg-primary/10 p-3 text-primary md:block">
            <SlidersHorizontal className="size-6" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="rounded-lg border border-primary/15 bg-primary/5 p-5">
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center">
            <div className="min-w-[240px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-black text-foreground">规范解析模型</div>
                <Badge variant="secondary">JSON 优先</Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">这里只决定“学校说明 → 结构化 JSON”的解析模型，不参与论文改写。</p>
            </div>

            <div className="grid min-w-0 flex-[2] gap-3 md:grid-cols-2">
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
                  <Input value={parserModel} onChange={(event) => onParserModelChange(event.target.value)} placeholder="填写能稳定输出 JSON 的模型" disabled={busy} />
                )}
              </Field>
            </div>

            <div className="flex min-w-0 flex-col gap-2 rounded-md border border-primary/10 bg-background/80 px-4 py-3 2xl:w-[340px]">
              <div className="text-xs font-semibold text-foreground">解析专用配置</div>
              <div className="text-[11px] leading-4 text-muted-foreground">建议选择遵循 schema、结构化 JSON 输出稳定的模型。</div>
              {selectedParserProvider ? (
                <Button type="button" variant="outline" size="sm" onClick={() => onRefreshParserProviderModels(selectedParserProvider.id)} disabled={busy} className="w-fit">
                  <RefreshCw data-icon="inline-start" />
                  刷新模型
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-h-[480px] flex-col gap-4 rounded-lg border border-border/70 bg-background/70 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <Label htmlFor="formatRuleText">学校模板说明文档</Label>
                <p className="mt-1 text-sm text-muted-foreground">粘贴学校格式要求；为空时点击按钮会直接启用默认规范。</p>
              </div>
              <Badge variant={hasInput ? "default" : "outline"}>{hasInput ? `${formatRuleText.trim().length} 字` : "未填写"}</Badge>
            </div>
            <Textarea
              id="formatRuleText"
              value={formatRuleText}
              onChange={(event) => onFormatRuleTextChange(event.target.value)}
              placeholder="例如：正文 5 号宋体，固定行距 20 磅；一级标题 4 号黑体；A4 上下 2.5cm、左 3cm、右 3cm……"
              disabled={busy}
              className="min-h-[320px] flex-1 resize-y"
            />
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={() => onParseFormatRules(formatRuleText)} disabled={busy}>
              {formatParsing ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <SlidersHorizontal data-icon="inline-start" />}
                {hasInput ? "解析规范" : "使用默认规范"}
              </Button>
              {formatParsing ? (
                <Button type="button" variant="destructive" onClick={onCancelParseFormatRules}>
                <X data-icon="inline-start" />
                  停止解析
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={onResetFormatRules} disabled={busy}>
                恢复默认规范
              </Button>
            </div>
          </div>

            <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border/70 bg-muted/30 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-foreground">当前导出规则</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">确认启用后才影响 Word 导出；未启用自定义时使用默认规范。</p>
                </div>
                <Badge variant={usingDefault ? "outline" : "success"}>{usingDefault ? "默认" : displayRules?.schoolName || "自定义"}</Badge>
              </div>
              <div className="mt-4 grid gap-2">
                <FormatStep active done title="1 输入说明" text={hasInput ? "已填写学校说明" : "未填写也可继续"} />
                <FormatStep active={Boolean(pendingFormatRules || activeFormatRules || usingDefault)} done={Boolean(!pendingFormatRules && (activeFormatRules || usingDefault))} title="2 解析审查" text={pendingFormatRules ? "有待确认解析结果" : activeFormatRules ? "当前规则已启用" : "将使用内置默认规则"} />
                <FormatStep active={Boolean(!pendingFormatRules && (activeFormatRules || usingDefault))} done={Boolean(!pendingFormatRules && (activeFormatRules || usingDefault))} title="3 Word 导出" text="只作用于可安全处理的样式" />
              </div>
            </div>

            <Alert>
              <AlertTitle>解析边界</AlertTitle>
              <AlertDescription>
                可执行规则会进入样式；封面、目录、页码分节、公式、图表不跨页等结构要求只记录为审计提示，不伪装成样式。
              </AlertDescription>
            </Alert>
          </div>
        </div>

        {displayRules ? (
          <FormatRulesPreview
            rules={displayRules}
            busy={busy}
            mode={rulesMode}
            isPending={Boolean(pendingFormatRules)}
            onConfirm={onConfirmFormatRules}
            onDiscard={onDiscardFormatRules}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-background/70 p-8 text-center">
            <div className="mx-auto w-fit rounded-md bg-primary/10 p-4 text-primary">
            <SlidersHorizontal className="size-7" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">默认规范会自动兜底</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">后端导出时如果没有自定义学校规范，会使用内置默认规则。点击“使用默认规范”只是显式启用默认值，不会假装解析出了学校专属规则。</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


const zh = (...codes: number[]) => String.fromCharCode(...codes);

function FormatStep({ active, done, title, text }: { active: boolean; done: boolean; title: string; text: string }) {
  return (
    <div className={`rounded-md border p-3 ${active ? "border-primary/20 bg-background" : "border-border/70 bg-background/70"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-black text-foreground">{title}</div>
        <Badge variant={done ? "success" : active ? "default" : "outline"}>{done ? "完成" : active ? "进行中" : "等待"}</Badge>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
    </div>
  );
}

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

const REQUIRED_FORMAT_ROLES = [
  "body_text",
  "heading_1",
  "heading_2",
  "heading_3",
  "cn_abstract_lead",
  "cn_abstract_body",
  "cn_keywords",
  "references_heading",
  "references_body",
  "ack_heading",
  "ack_body",
];

function FormatRulesPreview({
  rules,
  busy,
  mode,
  isPending,
  onConfirm,
  onDiscard,
}: {
  rules: FormatRules;
  busy: boolean;
  mode: string;
  isPending: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const styles = rules.styles ?? {};
  const page = rules.page ?? {};
  const quality = rules.quality ?? {};
  const styleMeta = rules.styleMeta ?? {};
  const warnings = quality.warnings ?? [];
  const suggestions = quality.suggestions ?? [];
  const explicitRoles = quality.explicitRoles ?? Object.entries(styleMeta).filter(([, meta]) => !meta?.isInferred).map(([role]) => role);
  const inheritedRoles = quality.inheritedRoles ?? Object.entries(styleMeta).filter(([, meta]) => meta?.isInferred).map(([role]) => role);
  const defaultRoles = quality.defaultRoles ?? REQUIRED_FORMAT_ROLES.filter((role) => !styleMeta[role]);
  const missingSourceRoles = quality.missingSourceRoles ?? REQUIRED_FORMAT_ROLES.filter((role) => defaultRoles.includes(role));
  const lowConfidenceRoles = quality.lowConfidenceRoles ?? REQUIRED_FORMAT_ROLES.filter((role) => {
    const meta = styleMeta[role];
    return meta && typeof meta.confidence === "number" && meta.confidence < 0.7;
  });
  const explicitCoverage = quality.explicitCoveragePercent ?? Math.round((REQUIRED_FORMAT_ROLES.filter((role) => explicitRoles.includes(role)).length / REQUIRED_FORMAT_ROLES.length) * 100);
  const usableCoverage = quality.usableCoveragePercent ?? Math.round((REQUIRED_FORMAT_ROLES.filter((role) => explicitRoles.includes(role) || inheritedRoles.includes(role)).length / REQUIRED_FORMAT_ROLES.length) * 100);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-muted/50 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">{zh(0x5f85, 0x786e, 0x8ba4, 0x89c4, 0x8303)}</Badge>
              <Badge variant={isPending ? "warning" : "success"}>{mode}</Badge>
              <Badge variant="outline">{rules.schoolName || "自定义"}</Badge>
              <Badge variant={warnings.length ? "warning" : "outline"}>{warnings.length ? `${warnings.length} 条提示` : "已检查"}</Badge>
            </div>
            <h3 className="mt-3 text-lg font-semibold text-foreground">{zh(0x5b8c, 0x6574, 0x89e3, 0x6790, 0x7ed3, 0x679c, 0x5ba1, 0x67e5)}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {isPending ? zh(0x89c4, 0x5219, 0x5c1a, 0x672a, 0x542f, 0x7528, 0xff0c, 0x786e, 0x8ba4, 0x540e, 0x624d, 0x4f1a, 0x5f71, 0x54cd, 0x0020, 0x0057, 0x006f, 0x0072, 0x0064, 0x0020, 0x5bfc, 0x51fa, 0x3002) : zh(0x5f53, 0x524d, 0x89c4, 0x8303, 0x5df2, 0x542f, 0x7528, 0xff0c, 0x540e, 0x7eed, 0x0020, 0x0057, 0x006f, 0x0072, 0x0064, 0x0020, 0x5bfc, 0x51fa, 0x4f1a, 0x6309, 0x8fd9, 0x5957, 0x89c4, 0x5219, 0x6267, 0x884c, 0x3002)}
            </p>
          </div>
          <div className="grid gap-2 text-right text-sm">
            <span>{zh(0x786e, 0x5b9a, 0x547d, 0x4e2d)}: {quality.deterministicHits ?? 0}</span>
            <span>继承项: {inheritedRoles.length}</span>
            <span>默认项: {defaultRoles.length}</span>
          </div>
        </div>
      </div>
      <div className="grid gap-4 p-5 md:grid-cols-4">
        <RuleMetric label="显式命中" value={`${explicitCoverage}%`} hint={`${explicitRoles.filter((role) => REQUIRED_FORMAT_ROLES.includes(role)).length}/${REQUIRED_FORMAT_ROLES.length}`} />
        <RuleMetric label="可执行覆盖" value={`${usableCoverage}%`} hint={`含 ${inheritedRoles.length} 个继承项`} />
        <RuleMetric label={zh(0x4e0a, 0x4e0b, 0x8fb9, 0x8ddd)} value={`${page.topMarginCm ?? "-"}/${page.bottomMarginCm ?? "-"}cm`} hint={`${page.leftMarginCm ?? "-"}/${page.rightMarginCm ?? "-"}cm`} />
        <RuleMetric label={zh(0x8bba, 0x6587, 0x6b63, 0x6587)} value={styleSummary(styles.body_text)} hint={styleSpacing(styles.body_text)} />
        <RuleMetric label={zh(0x4e00, 0x7ea7, 0x6807, 0x9898)} value={styleSummary(styles.heading_1)} hint={styleSpacing(styles.heading_1)} />
      </div>
      {missingSourceRoles.length || inheritedRoles.length || defaultRoles.length || lowConfidenceRoles.length ? (
        <div className="mx-5 mb-4 grid gap-3 xl:grid-cols-2">
          {missingSourceRoles.length ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm leading-6 text-destructive">
              <div className="mb-2 font-semibold">建议补充来源</div>
              <div>{missingSourceRoles.map((role) => ROLE_LABELS[role] ?? role).join(" / ")}</div>
            </div>
          ) : null}
          {inheritedRoles.length ? (
            <div className="rounded-md border border-primary/20 bg-muted/60 p-4 text-sm leading-6 text-foreground">
              <div className="mb-2 font-semibold">继承项</div>
              <div>{inheritedRoles.slice(0, 12).map((role) => ROLE_LABELS[role] ?? role).join(" / ")}</div>
            </div>
          ) : null}
          {defaultRoles.length ? (
            <div className="rounded-md border border-border bg-muted/50 p-4 text-sm leading-6 text-foreground">
              <div className="mb-2 font-semibold">默认项</div>
              <div>{defaultRoles.slice(0, 12).map((role) => ROLE_LABELS[role] ?? role).join(" / ")}</div>
            </div>
          ) : null}
          {lowConfidenceRoles.length ? (
            <div className="rounded-md border border-primary/20 bg-muted/60 p-4 text-sm leading-6 text-foreground">
              <div className="mb-2 font-semibold">低置信项</div>
              <div>{lowConfidenceRoles.map((role) => ROLE_LABELS[role] ?? role).join(" / ")}</div>
            </div>
          ) : null}
        </div>
      ) : null}
      {warnings.length ? (
        <div className="mx-5 mb-4 rounded-md border border-primary/20 bg-muted/60 p-4 text-sm leading-6 text-foreground">
          {warnings.map((warning, index) => <p key={index}>- {warning}</p>)}
        </div>
      ) : null}
      {suggestions.length ? (
        <div className="mx-5 mb-4 rounded-md border border-border bg-muted/50 p-4 text-sm leading-6 text-foreground">
          {suggestions.map((suggestion, index) => <p key={index}>- {suggestion}</p>)}
        </div>
      ) : null}
          <div className="flex flex-col gap-4 px-5 pb-5">
        {ROLE_GROUPS.map((group) => (
          <div key={group.title} className="rounded-md border border-border/70 bg-background p-4">
            <div className="mb-3 text-sm font-semibold text-foreground">{group.title}</div>
            <div className="grid gap-3 xl:grid-cols-2">
              {group.roles.map((role) => (
                <RuleRow key={role} role={role} style={styles[role]} meta={rules.styleMeta?.[role]} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {rules.notes?.length ? (
        <div className="px-5 pb-4 text-sm leading-6 text-muted-foreground">
          {rules.notes.slice(0, 6).map((note, index) => <p key={index}>- {note}</p>)}
        </div>
      ) : null}
      <div className="flex flex-col gap-3 border-t border-border bg-muted/40 p-5 md:flex-row md:items-center md:justify-between">
        <div className={cn("text-sm", missingSourceRoles.length ? "text-foreground" : "text-muted-foreground")}>
          {missingSourceRoles.length ? "存在关键规则未命中来源，将使用默认值；建议确认后再启用。" : "关键规则已命中来源，可以确认启用。"}
        </div>
        <div className="flex flex-wrap gap-3">
          {isPending ? (
            <>
              <Button type="button" onClick={onConfirm} disabled={busy}>
            <CheckCircle2 data-icon="inline-start" />
                {zh(0x786e, 0x8ba4, 0x542f, 0x7528)}
              </Button>
              <Button type="button" variant="outline" onClick={onDiscard} disabled={busy}>
                {zh(0x653e, 0x5f03, 0x672c, 0x6b21, 0x89e3, 0x6790)}
              </Button>
            </>
          ) : (
            <Badge variant="success" className="rounded-full px-4 py-2">{zh(0x5df2, 0x4f5c, 0x4e3a, 0x5bfc, 0x51fa, 0x89c4, 0x8303, 0x542f, 0x7528)}</Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleRow({ role, style, meta }: { role: string; style?: Record<string, unknown>; meta?: { sourceText?: string; confidence?: number; isInferred?: boolean } }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/80 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-foreground">{ROLE_LABELS[role] ?? role}</div>
        <Badge variant={meta?.isInferred ? "warning" : meta ? "success" : "outline"}>{meta?.isInferred ? "继承" : meta ? `${Math.round((meta.confidence ?? 0.7) * 100)}%` : "默认"}</Badge>
      </div>
      <div className="mt-2 text-sm text-muted-foreground">{styleSummary(style)} · {styleSpacing(style)} · {formatAlignment(style?.alignment)}</div>
      {meta?.sourceText ? <div className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{meta.sourceText}</div> : null}
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

function RuleMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-background/80 p-4">
      <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-base font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
