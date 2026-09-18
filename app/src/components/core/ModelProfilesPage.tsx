import { useMemo, useRef, useState } from "react";
import { Ellipsis, Eye, EyeOff, Plus, RefreshCw, Trash2, Wifi } from "lucide-react";

import { useAppNotifications } from "@/components/AppNotifications";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { coreService } from "@/lib/coreService";
import { cn } from "@/lib/utils";
import type { CoreSettings, ModelProfile, Protocol, ReasoningEffort } from "@/types/core";

interface Props {
  settings: CoreSettings;
  onRefresh: () => Promise<void>;
}

type ProfileDraft = ModelProfile & { makeDefault?: boolean };
type BusyState = "models" | "validate" | "save" | "delete";

const DEEPSEEK_PROFILE_ID = "builtin-deepseek-official";
const SECRET_PLACEHOLDER = "__FYADR_SAVED_SECRET__";
const MANUAL_MODEL_VALUE = "__manual_model__";
const DEEPSEEK_EFFORTS: Array<{ value: ReasoningEffort; label: string }> = [
  { value: "none", label: "关闭" },
  { value: "low", label: "低" },
  { value: "high", label: "高" },
  { value: "max", label: "最大" },
];
const OPENAI_EFFORTS: Array<{ value: ReasoningEffort; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "none", label: "关闭" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
];

function fallbackDeepSeekProfile(): ModelProfile {
  return {
    id: DEEPSEEK_PROFILE_ID,
    provider: "deepseek",
    builtIn: true,
    name: "DeepSeek 官方",
    baseUrl: "https://api.deepseek.com",
    apiKey: "",
    hasApiKey: false,
    model: "",
    protocol: "chat_completions",
    reasoningEffort: "high",
    temperature: null,
    connectTimeoutSeconds: 15,
    firstEventTimeoutSeconds: 300,
    idleTimeoutSeconds: 180,
    maxRetries: 2,
    knownModels: [],
    configured: false,
  };
}

function blankCustomProfile(): ProfileDraft {
  return {
    id: "",
    provider: "custom",
    builtIn: false,
    name: "",
    baseUrl: "",
    apiKey: "",
    hasApiKey: false,
    model: "",
    protocol: "chat_completions",
    reasoningEffort: "auto",
    temperature: null,
    connectTimeoutSeconds: 15,
    firstEventTimeoutSeconds: 300,
    idleTimeoutSeconds: 180,
    maxRetries: 2,
    knownModels: [],
    configured: false,
    makeDefault: false,
  };
}

function draftFromProfile(profile: ModelProfile, defaultProfileId: string): ProfileDraft {
  return {
    ...profile,
    apiKey: "",
    reasoningEffort: profile.reasoningEffort || (profile.provider === "deepseek" ? "high" : "auto"),
    makeDefault: profile.id === defaultProfileId,
  };
}

function isLocalAddress(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLocaleLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
  } catch {
    return false;
  }
}

export function ModelProfilesPage({ settings, onRefresh }: Props) {
  const { notify } = useAppNotifications();
  const isMobile = useIsMobile();
  const editorScroll = useRef<HTMLDivElement>(null);
  const deepseekProfile = settings.modelProfiles.find((profile) => profile.id === DEEPSEEK_PROFILE_ID)
    || fallbackDeepSeekProfile();
  const customProfiles = settings.modelProfiles.filter((profile) => profile.provider !== "deepseek");
  const initialProfile = settings.modelProfiles.find((profile) => profile.id === settings.defaultModelProfileId)
    || deepseekProfile;

  const [draft, setDraft] = useState<ProfileDraft>(() => draftFromProfile(initialProfile, settings.defaultModelProfileId));
  const [models, setModels] = useState<string[]>(draft.knownModels || []);
  const [modelEntryMode, setModelEntryMode] = useState<"list" | "manual">(
    draft.provider === "deepseek" || draft.knownModels?.includes(draft.model) ? "list" : "manual",
  );
  const [clearSavedApiKey, setClearSavedApiKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [busy, setBusy] = useState<Set<BusyState>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<"connections" | "editor">("editor");

  const isDeepSeek = draft.provider === "deepseek";
  const hasEffectiveApiKey = !clearSavedApiKey && Boolean(draft.apiKey || draft.hasApiKey);
  const requiresApiKey = isDeepSeek || !isLocalAddress(draft.baseUrl);
  const accessIssue = !draft.baseUrl.trim()
    ? "请填写 API 地址。"
    : requiresApiKey && !hasEffectiveApiKey
      ? "请填写 API Key。"
      : "";
  const saveIssue = !draft.baseUrl.trim()
    ? "请填写 API 地址。"
    : !draft.model.trim()
      ? "请选择或填写模型名称。"
      : !isDeepSeek && !draft.name.trim()
        ? "请填写连接名称。"
        : "";
  const validateIssue = accessIssue || saveIssue;
  const reasoningEnabled = !["auto", "none"].includes(draft.reasoningEffort);
  const reasoningOptions = isDeepSeek ? DEEPSEEK_EFFORTS : OPENAI_EFFORTS;
  const selectableModels = useMemo(
    () => Array.from(new Set([...models, draft.model].filter((model) => model.trim()))),
    [draft.model, models],
  );

  const setOperationBusy = (operation: BusyState, active: boolean) => {
    setBusy((current) => {
      const next = new Set(current);
      if (active) next.add(operation);
      else next.delete(operation);
      return next;
    });
  };
  const isBusy = (operation: BusyState) => busy.has(operation);

  const requestValue = (): ProfileDraft => ({
    ...draft,
    apiKey: clearSavedApiKey ? "" : draft.apiKey || (draft.hasApiKey ? SECRET_PLACEHOLDER : ""),
  });

  const scrollToTop = () => {
    window.requestAnimationFrame(() => {
      const viewport = editorScroll.current?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
      viewport?.scrollTo({ top: 0 });
    });
  };

  const selectProfile = (profile: ModelProfile) => {
    setDraft(draftFromProfile(profile, settings.defaultModelProfileId));
    setModels(profile.knownModels || []);
    setModelEntryMode(profile.provider === "deepseek" || profile.knownModels?.includes(profile.model) ? "list" : "manual");
    setClearSavedApiKey(false);
    setShowApiKey(false);
    setMobilePane("editor");
    scrollToTop();
  };

  const createChannel = () => {
    setDraft(blankCustomProfile());
    setModels([]);
    setModelEntryMode("manual");
    setClearSavedApiKey(false);
    setShowApiKey(false);
    setMobilePane("editor");
    scrollToTop();
  };

  const loadModels = async () => {
    if (accessIssue) {
      notify({ kind: "warning", title: "无法获取模型", text: accessIssue });
      return;
    }
    setOperationBusy("models", true);
    try {
      const result = await coreService.listModels(requestValue());
      setModels(result.models);
      if (result.models.length) {
        setModelEntryMode("list");
        setDraft((current) => ({
          ...current,
          knownModels: result.models,
          model: current.model && result.models.includes(current.model) ? current.model : result.models[0],
        }));
      } else {
        setModelEntryMode("manual");
      }
      notify({
        kind: "success",
        title: result.models.length ? "模型已更新" : "未返回模型",
        text: result.models.length ? "共 " + result.models.length + " 个模型。" : "可以手动填写模型名称。",
      });
    } catch (reason) {
      notify({ kind: "error", title: "模型读取失败", text: reason instanceof Error ? reason.message : undefined });
    } finally {
      setOperationBusy("models", false);
    }
  };

  const validateConnection = async () => {
    if (validateIssue) {
      notify({ kind: "warning", title: "无法验证连接", text: validateIssue });
      return;
    }
    setOperationBusy("validate", true);
    try {
      const result = await coreService.testModelProfile(requestValue());
      notify({ kind: "success", title: "连接正常", text: result.reply || "模型已响应。" });
    } catch (reason) {
      notify({ kind: "error", title: "连接失败", text: reason instanceof Error ? reason.message : undefined });
    } finally {
      setOperationBusy("validate", false);
    }
  };

  const save = async () => {
    if (saveIssue) {
      notify({ kind: "warning", title: "无法保存", text: saveIssue });
      return;
    }
    setOperationBusy("save", true);
    try {
      const value = {
        ...requestValue(),
        name: isDeepSeek ? "DeepSeek 官方" : draft.name.trim(),
      };
      const saved = draft.id
        ? await coreService.updateModelProfile(draft.id, value)
        : await coreService.createModelProfile(value);
      await onRefresh();
      const nextDefaultId = draft.makeDefault
        ? saved.id
        : settings.defaultModelProfileId === saved.id
          ? ""
          : settings.defaultModelProfileId;
      setDraft(draftFromProfile(saved, nextDefaultId));
      setModels(saved.knownModels || models);
      setClearSavedApiKey(false);
      notify({ kind: "success", title: "连接已保存" });
    } catch (reason) {
      notify({ kind: "error", title: "保存失败", text: reason instanceof Error ? reason.message : undefined });
    } finally {
      setOperationBusy("save", false);
    }
  };

  const removeChannel = async () => {
    if (!draft.id || isDeepSeek) return;
    setOperationBusy("delete", true);
    try {
      await coreService.deleteModelProfile(draft.id);
      const remaining = customProfiles.filter((profile) => profile.id !== draft.id);
      setDeleteOpen(false);
      if (remaining.length) selectProfile(remaining[0]);
      else selectProfile(deepseekProfile);
      await onRefresh();
      notify({ kind: "success", title: "连接已删除" });
    } catch (reason) {
      setDeleteOpen(false);
      notify({ kind: "error", title: "删除失败", text: reason instanceof Error ? reason.message : undefined });
    } finally {
      setOperationBusy("delete", false);
    }
  };

  const connectionList = (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="model-profile-list">
      <div className="flex shrink-0 items-center gap-2 p-3">
        <div className="font-medium">模型连接</div>
        <Badge variant="outline">{customProfiles.length + 1}</Badge>
        <Button className="ml-auto" size="sm" variant="outline" onClick={createChannel}>
          <Plus data-icon="inline-start" />
          新建连接
        </Button>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        <ItemGroup className="gap-1 p-2">
          {[deepseekProfile, ...customProfiles].map((profile) => (
            <Item
              key={profile.id}
              asChild
              size="sm"
              variant={draft.id === profile.id ? "muted" : "default"}
            >
              <button type="button" onClick={() => selectProfile(profile)}>
                <ItemContent>
                  <ItemTitle className="truncate">{profile.name}</ItemTitle>
                  <ItemDescription className="truncate">{profile.model || "未选择模型"}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  {profile.id === settings.defaultModelProfileId ? <Badge variant="secondary">默认</Badge> : null}
                </ItemActions>
              </button>
            </Item>
          ))}
          {!draft.id ? (
            <Item size="sm" variant="muted">
              <ItemContent>
                <ItemTitle>新连接</ItemTitle>
                <ItemDescription>未保存</ItemDescription>
              </ItemContent>
            </Item>
          ) : null}
        </ItemGroup>
      </ScrollArea>
    </Card>
  );

  const editor = (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="model-profile-editor">
      <div className="flex shrink-0 items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold">{draft.name || "新建 OpenAI 兼容连接"}</div>
          <div className="truncate text-sm text-muted-foreground">{isDeepSeek ? "DeepSeek" : "OpenAI 兼容"}</div>
        </div>
        <Field orientation="horizontal" className="w-auto gap-2">
          <Switch
            id="make-default"
            checked={Boolean(draft.makeDefault)}
            onCheckedChange={(checked) => setDraft({ ...draft, makeDefault: checked })}
          />
          <FieldLabel htmlFor="make-default" className="whitespace-nowrap">默认</FieldLabel>
        </Field>
        {draft.id && !isDeepSeek ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="连接操作"><Ellipsis /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => setDeleteOpen(true)}>
                  <Trash2 />
                  删除连接
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <Separator />

      <ScrollArea ref={editorScroll} className="min-h-0 flex-1">
        <div data-testid="model-profile-form" className="mx-auto flex w-full max-w-5xl flex-col gap-7 p-4 md:p-6">
          <FieldSet>
            <FieldLegend>连接</FieldLegend>
            <FieldGroup className={cn("grid gap-5", isDeepSeek ? "md:grid-cols-2" : "md:grid-cols-3")}>
              {!isDeepSeek ? (
                <Field>
                  <FieldLabel htmlFor="profile-name">名称</FieldLabel>
                  <Input
                    id="profile-name"
                    value={draft.name}
                    placeholder="连接名称"
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="base-url">API 地址</FieldLabel>
                <Input
                  id="base-url"
                  value={draft.baseUrl}
                  readOnly={isDeepSeek}
                  placeholder="https://api.example.com/v1"
                  onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
                />
              </Field>
              <Field data-disabled={clearSavedApiKey || undefined}>
                <FieldLabel htmlFor="api-key">API Key</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="api-key"
                    type={showApiKey ? "text" : "password"}
                    value={draft.apiKey}
                    placeholder={draft.hasApiKey ? "已保存，留空不变" : "输入 API Key"}
                    disabled={clearSavedApiKey}
                    onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
                    onBlur={() => {
                      if (isDeepSeek && draft.apiKey.trim() && models.length === 0 && !isBusy("models")) void loadModels();
                    }}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-sm"
                      aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                      onClick={() => setShowApiKey((current) => !current)}
                    >
                      {showApiKey ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            </FieldGroup>
            {draft.hasApiKey ? (
              <Field orientation="horizontal">
                <Switch id="clear-api-key" checked={clearSavedApiKey} onCheckedChange={setClearSavedApiKey} />
                <FieldLabel htmlFor="clear-api-key">清除已保存的密钥</FieldLabel>
              </Field>
            ) : null}
          </FieldSet>

          <Separator />

          <FieldSet>
            <FieldLegend>模型</FieldLegend>
            <FieldGroup className="grid gap-5 md:grid-cols-2">
              <Field>
                <FieldLabel>协议</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={draft.protocol}
                  onValueChange={(value) => value && setDraft({ ...draft, protocol: value as Protocol })}
                  className="w-full"
                >
                  <ToggleGroupItem value="chat_completions" className="flex-1" aria-label="使用 Chat Completions">Chat Completions</ToggleGroupItem>
                  <ToggleGroupItem value="responses" className="flex-1" aria-label="使用 Responses">Responses</ToggleGroupItem>
                </ToggleGroup>
              </Field>
              <Field>
                <FieldLabel htmlFor="profile-model">模型名称</FieldLabel>
                <div className="flex gap-2">
                  {isDeepSeek || (models.length > 0 && modelEntryMode === "list") ? (
                    <Select
                      value={draft.model}
                      onValueChange={(model) => {
                        if (model === MANUAL_MODEL_VALUE) {
                          setModelEntryMode("manual");
                          setDraft({ ...draft, model: "" });
                        } else {
                          setDraft({ ...draft, model });
                        }
                      }}
                    >
                      <SelectTrigger id="profile-model" className="min-w-0 flex-1">
                        <SelectValue placeholder="选择模型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {selectableModels.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}
                          {!isDeepSeek ? <SelectItem value={MANUAL_MODEL_VALUE}>手动输入</SelectItem> : null}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="profile-model"
                      value={draft.model}
                      placeholder="模型名称"
                      onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                    />
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="获取模型"
                    disabled={isBusy("models") || isBusy("save") || isBusy("delete")}
                    onClick={() => void loadModels()}
                  >
                    {isBusy("models") ? <Spinner /> : <RefreshCw />}
                  </Button>
                </div>
              </Field>
            </FieldGroup>
          </FieldSet>

          <Separator />

          <FieldSet>
            <FieldLegend>生成</FieldLegend>
            <FieldGroup className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(12rem,1fr)]">
              <Field>
                <FieldLabel>思考强度</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={draft.reasoningEffort}
                  onValueChange={(value) => value && setDraft({
                    ...draft,
                    reasoningEffort: value as ReasoningEffort,
                    temperature: !["auto", "none"].includes(value) ? null : draft.temperature,
                  })}
                  className="w-full"
                >
                  {reasoningOptions.map((option) => (
                    <ToggleGroupItem key={option.value} value={option.value} className="flex-1">{option.label}</ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
              <Field data-disabled={reasoningEnabled || undefined}>
                <FieldLabel htmlFor="profile-temperature">Temperature</FieldLabel>
                <Input
                  id="profile-temperature"
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={draft.temperature ?? ""}
                  disabled={reasoningEnabled}
                  placeholder={reasoningEnabled ? "不可用" : "默认"}
                  onChange={(event) => setDraft({
                    ...draft,
                    temperature: event.target.value === "" ? null : Number(event.target.value),
                  })}
                />
              </Field>
            </FieldGroup>
          </FieldSet>

          <Accordion type="single" collapsible>
            <AccordionItem value="network">
              <AccordionTrigger>网络与重试</AccordionTrigger>
              <AccordionContent>
                <FieldGroup className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  <Field>
                    <FieldLabel htmlFor="profile-connect-timeout">连接超时</FieldLabel>
                    <Input id="profile-connect-timeout" type="number" min="1" value={draft.connectTimeoutSeconds} onChange={(event) => setDraft({ ...draft, connectTimeoutSeconds: Number(event.target.value) })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="profile-first-timeout">首次响应</FieldLabel>
                    <Input id="profile-first-timeout" type="number" min="5" value={draft.firstEventTimeoutSeconds} onChange={(event) => setDraft({ ...draft, firstEventTimeoutSeconds: Number(event.target.value) })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="profile-idle-timeout">流式空闲</FieldLabel>
                    <Input id="profile-idle-timeout" type="number" min="5" value={draft.idleTimeoutSeconds} onChange={(event) => setDraft({ ...draft, idleTimeoutSeconds: Number(event.target.value) })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="profile-retries">重试次数</FieldLabel>
                    <Input id="profile-retries" type="number" min="0" max="10" value={draft.maxRetries} onChange={(event) => setDraft({ ...draft, maxRetries: Number(event.target.value) })} />
                  </Field>
                </FieldGroup>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </ScrollArea>

      <Separator />
      <div data-testid="model-profile-actions" className="flex shrink-0 justify-end p-4">
        <ButtonGroup>
          <Button
            variant="outline"
            disabled={isBusy("validate") || isBusy("save") || isBusy("delete")}
            onClick={() => void validateConnection()}
          >
            {isBusy("validate") ? <Spinner data-icon="inline-start" /> : <Wifi data-icon="inline-start" />}
            验证连接
          </Button>
          <Button disabled={isBusy("save") || isBusy("delete")} onClick={() => void save()}>
            {isBusy("save") ? <Spinner data-icon="inline-start" /> : null}
            保存
          </Button>
        </ButtonGroup>
      </div>
    </Card>
  );

  return (
    <>
      {isMobile ? (
        <Tabs
          data-testid="model-profile-workspace"
          value={mobilePane}
          onValueChange={(value) => setMobilePane(value as "connections" | "editor")}
          className="flex h-full min-h-0 flex-col"
        >
          <TabsList className="mx-3 mt-3 grid shrink-0 grid-cols-2">
            <TabsTrigger value="connections">连接</TabsTrigger>
            <TabsTrigger value="editor">配置</TabsTrigger>
          </TabsList>
          <TabsContent value="connections" className="m-0 min-h-0 flex-1 overflow-hidden">{connectionList}</TabsContent>
          <TabsContent value="editor" className="m-0 min-h-0 flex-1 overflow-hidden">{editor}</TabsContent>
        </Tabs>
      ) : (
        <ResizablePanelGroup
          data-testid="model-profile-workspace"
          orientation="horizontal"
          className="overflow-hidden"
        >
          <ResizablePanel defaultSize="24%" minSize="18%" maxSize="36%" className="pr-1.5">
            {connectionList}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="76%" minSize="50%" className="pl-1.5">
            {editor}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除连接？</AlertDialogTitle>
            <AlertDialogDescription>“{draft.name}”将从本机配置中删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction disabled={isBusy("delete") || isBusy("save")} onClick={() => void removeChannel()}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
