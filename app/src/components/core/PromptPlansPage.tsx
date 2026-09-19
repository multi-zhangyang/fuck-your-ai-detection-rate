import { useMemo, useState } from "react";
import { Copy, FileText, Library, Plus, Save, Trash2 } from "lucide-react";

import { useAppNotifications } from "@/components/AppNotifications";
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
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
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
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { coreService } from "@/lib/coreService";
import type { CoreSettings, PromptPlan, PromptTemplate } from "@/types/core";

interface Props {
  settings: CoreSettings;
  onRefresh: () => Promise<void>;
}

type PlanDraft = Partial<PromptPlan> & { makeDefault?: boolean };
type DeleteTarget = { kind: "template"; item: PromptTemplate } | { kind: "plan"; item: PromptPlan };

const emptyTemplate = (): Partial<PromptTemplate> => ({ name: "", description: "", content: "" });
const emptyPlan = (): PlanDraft => ({ name: "", description: "", templateIds: [], makeDefault: false });

export function PromptPlansPage({ settings, onRefresh }: Props) {
  const { notify } = useAppNotifications();
  const isMobile = useIsMobile();
  const initialTemplate = settings.promptTemplates[0];
  const initialPlan = settings.promptPlans.find((plan) => plan.id === settings.defaultPromptPlanId)
    || settings.promptPlans[0];

  const [activeTab, setActiveTab] = useState<"templates" | "plans">("templates");
  const [templateDraft, setTemplateDraft] = useState<Partial<PromptTemplate>>(
    initialTemplate ? { ...initialTemplate } : emptyTemplate(),
  );
  const [planDraft, setPlanDraft] = useState<PlanDraft>(
    initialPlan
      ? {
          ...initialPlan,
          templateIds: [...initialPlan.templateIds],
          makeDefault: initialPlan.id === settings.defaultPromptPlanId,
        }
      : emptyPlan(),
  );
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const templatesById = useMemo(
    () => new Map(settings.promptTemplates.map((template) => [template.id, template])),
    [settings.promptTemplates],
  );

  const selectTemplate = (template: PromptTemplate) => {
    setTemplateDraft({ ...template });
    setCreatingTemplate(false);
    setLibraryOpen(false);
  };

  const selectPlan = (plan: PromptPlan) => {
    setPlanDraft({
      ...plan,
      templateIds: [...plan.templateIds],
      makeDefault: plan.id === settings.defaultPromptPlanId,
    });
    setLibraryOpen(false);
  };

  const create = () => {
    if (activeTab === "templates") {
      setTemplateDraft(emptyTemplate());
      setCreatingTemplate(true);
    } else {
      setPlanDraft(emptyPlan());
    }
    setLibraryOpen(false);
  };

  const saveTemplate = async () => {
    if (!templateDraft.name?.trim() || !templateDraft.content?.trim()) {
      notify({ kind: "warning", title: "请填写名称和提示词内容" });
      return;
    }
    setBusy(true);
    try {
      const saved = templateDraft.id
        ? await coreService.updateTemplate(templateDraft.id, templateDraft)
        : await coreService.createTemplate(templateDraft);
      await onRefresh();
      setTemplateDraft(saved);
      setCreatingTemplate(false);
      notify({ kind: "success", title: "提示词已保存" });
    } catch (reason) {
      notify({ kind: "error", title: "提示词保存失败", text: reason instanceof Error ? reason.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const savePlan = async () => {
    if (!planDraft.name?.trim() || !planDraft.templateIds?.length) {
      notify({ kind: "warning", title: "请填写方案名称并添加步骤" });
      return;
    }
    setBusy(true);
    try {
      const saved = planDraft.id
        ? await coreService.updatePlan(planDraft.id, planDraft)
        : await coreService.createPlan(planDraft);
      await onRefresh();
      setPlanDraft({
        ...saved,
        templateIds: [...saved.templateIds],
        makeDefault: Boolean(planDraft.makeDefault),
      });
      notify({ kind: "success", title: "方案已保存" });
    } catch (reason) {
      notify({ kind: "error", title: "方案保存失败", text: reason instanceof Error ? reason.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const copyTemplate = async () => {
    if (!templateDraft.id) return;
    setBusy(true);
    try {
      const copied = await coreService.copyTemplate(templateDraft.id);
      await onRefresh();
      setTemplateDraft(copied);
      setCreatingTemplate(false);
      notify({ kind: "success", title: "副本已创建" });
    } catch (reason) {
      notify({ kind: "error", title: "创建失败", text: reason instanceof Error ? reason.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const copyPlan = async () => {
    if (!planDraft.id) return;
    setBusy(true);
    try {
      const copied = await coreService.copyPlan(planDraft.id);
      await onRefresh();
      setPlanDraft({ ...copied, templateIds: [...copied.templateIds] });
      notify({ kind: "success", title: "副本已创建" });
    } catch (reason) {
      notify({ kind: "error", title: "创建失败", text: reason instanceof Error ? reason.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    const label = deleteTarget.kind === "template" ? "提示词" : "方案";
    setBusy(true);
    try {
      if (deleteTarget.kind === "template") {
        await coreService.deleteTemplate(deleteTarget.item.id);
        setTemplateDraft(emptyTemplate());
        setCreatingTemplate(false);
      } else {
        await coreService.deletePlan(deleteTarget.item.id);
        setPlanDraft(emptyPlan());
      }
      setDeleteTarget(null);
      await onRefresh();
      notify({ kind: "success", title: label + "已删除" });
    } catch (reason) {
      setDeleteTarget(null);
      notify({ kind: "error", title: "删除失败", text: reason instanceof Error ? reason.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const setPlanStep = (index: number, templateId: string) => {
    const steps = [...(planDraft.templateIds || [])];
    steps[index] = templateId;
    setPlanDraft({ ...planDraft, templateIds: steps });
  };

  const library = (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-3 p-3">
        <div className="flex items-center gap-2">
          <TabsList className="grid min-w-0 flex-1 grid-cols-2">
            <TabsTrigger value="templates">提示词</TabsTrigger>
            <TabsTrigger value="plans">方案</TabsTrigger>
          </TabsList>
          <Button size="icon" variant="outline" aria-label="新建" onClick={create}>
            <Plus />
          </Button>
        </div>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        <ItemGroup className="gap-1 p-2">
          {activeTab === "templates"
            ? settings.promptTemplates.map((template) => (
                <Item
                  key={template.id}
                  asChild
                  size="sm"
                  variant={templateDraft.id === template.id ? "muted" : "default"}
                >
                  <button type="button" onClick={() => selectTemplate(template)}>
                    <ItemContent>
                      <ItemTitle className="truncate">{template.name}</ItemTitle>
                      <ItemDescription className="truncate">{template.description || "提示词"}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      {template.builtIn ? <Badge variant="outline">内置</Badge> : null}
                    </ItemActions>
                  </button>
                </Item>
              ))
            : settings.promptPlans.map((plan) => (
                <Item
                  key={plan.id}
                  asChild
                  size="sm"
                  variant={planDraft.id === plan.id ? "muted" : "default"}
                >
                  <button type="button" onClick={() => selectPlan(plan)}>
                    <ItemContent>
                      <ItemTitle className="truncate">{plan.name}</ItemTitle>
                      <ItemDescription className="truncate">
                        {plan.templateIds.map((id) => templatesById.get(id)?.name).filter(Boolean).join(" → ")}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      {plan.id === settings.defaultPromptPlanId ? <Badge variant="secondary">默认</Badge> : null}
                    </ItemActions>
                  </button>
                </Item>
              ))}
        </ItemGroup>
      </ScrollArea>
    </Card>
  );

  const templateEditor = (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold">{templateDraft.name || "新建提示词"}</div>
          <div className="truncate text-sm text-muted-foreground">
            {templateDraft.readOnly ? "内置" : "自定义"}
          </div>
        </div>
        {templateDraft.readOnly ? (
          <Button size="sm" disabled={busy} onClick={() => void copyTemplate()}>
            {busy ? <Spinner data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            新建副本
          </Button>
        ) : (
          <ButtonGroup>
            {templateDraft.id ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setDeleteTarget({ kind: "template", item: templateDraft as PromptTemplate })}
              >
                <Trash2 data-icon="inline-start" />
                删除
              </Button>
            ) : null}
            <Button size="sm" disabled={busy} onClick={() => void saveTemplate()}>
              {busy ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
              保存
            </Button>
          </ButtonGroup>
        )}
      </div>
      <Separator />
      <div className="min-h-0 flex-1">
        {creatingTemplate || templateDraft.id || templateDraft.name || templateDraft.content ? (
          <FieldGroup className="mx-auto h-full min-h-0 w-full max-w-5xl p-4 md:p-6">
            {!templateDraft.readOnly ? (
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="template-name">名称</FieldLabel>
                  <Input
                    id="template-name"
                    value={templateDraft.name || ""}
                    onChange={(event) => setTemplateDraft({ ...templateDraft, name: event.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="template-description">备注</FieldLabel>
                  <Input
                    id="template-description"
                    value={templateDraft.description || ""}
                    onChange={(event) => setTemplateDraft({ ...templateDraft, description: event.target.value })}
                  />
                </Field>
              </FieldGroup>
            ) : null}
            <Field className="min-h-0 flex-1">
              <FieldLabel htmlFor="template-content">提示词内容</FieldLabel>
              <Textarea
                id="template-content"
                readOnly={Boolean(templateDraft.readOnly)}
                className="min-h-[20rem] flex-1 resize-none font-mono"
                value={templateDraft.content || ""}
                onChange={(event) => setTemplateDraft({ ...templateDraft, content: event.target.value })}
                placeholder={"请改写以下内容……\n\n{{text}}"}
              />
            </Field>
          </FieldGroup>
        ) : (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon"><FileText /></EmptyMedia>
              <EmptyTitle>新建提示词</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </Card>
  );

  const planEditor = (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold">{planDraft.name || "新建方案"}</div>
          <div className="truncate text-sm text-muted-foreground">{planDraft.templateIds?.length || 0} 个步骤</div>
        </div>
        {planDraft.readOnly ? (
          <Button size="sm" disabled={busy} onClick={() => void copyPlan()}>
            {busy ? <Spinner data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            新建副本
          </Button>
        ) : (
          <ButtonGroup>
            {planDraft.id ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setDeleteTarget({ kind: "plan", item: planDraft as PromptPlan })}
              >
                <Trash2 data-icon="inline-start" />
                删除
              </Button>
            ) : null}
            <Button size="sm" disabled={busy} onClick={() => void savePlan()}>
              {busy ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
              保存
            </Button>
          </ButtonGroup>
        )}
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        <FieldGroup className="mx-auto w-full max-w-4xl p-4 md:p-6">
          {!planDraft.readOnly ? (
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="plan-name">名称</FieldLabel>
                <Input
                  id="plan-name"
                  value={planDraft.name || ""}
                  onChange={(event) => setPlanDraft({ ...planDraft, name: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="plan-description">备注</FieldLabel>
                <Input
                  id="plan-description"
                  value={planDraft.description || ""}
                  onChange={(event) => setPlanDraft({ ...planDraft, description: event.target.value })}
                />
              </Field>
            </FieldGroup>
          ) : null}

          <Field>
            <div className="flex items-center justify-between gap-3">
              <FieldLabel>执行步骤</FieldLabel>
              {!planDraft.readOnly ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={(planDraft.templateIds?.length || 0) >= 3}
                  onClick={() => setPlanDraft({
                    ...planDraft,
                    templateIds: [...(planDraft.templateIds || []), settings.promptTemplates[0]?.id || ""],
                  })}
                >
                  <Plus data-icon="inline-start" />
                  添加步骤
                </Button>
              ) : null}
            </div>
            <ItemGroup className="gap-2">
              {(planDraft.templateIds || []).map((templateId, index) => (
                <Item key={templateId + "-" + index} size="sm" variant="outline">
                  <ItemMedia><Badge variant="outline">{index + 1}</Badge></ItemMedia>
                  <ItemContent>
                    {planDraft.readOnly ? (
                      <>
                        <ItemTitle>{templatesById.get(templateId)?.name || "提示词不存在"}</ItemTitle>
                        <ItemDescription>{templatesById.get(templateId)?.description}</ItemDescription>
                      </>
                    ) : (
                      <Select value={templateId} onValueChange={(value) => setPlanStep(index, value)}>
                        <SelectTrigger data-testid={`prompt-plan-step-${index + 1}`}>
                          <SelectValue placeholder="选择提示词" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {settings.promptTemplates.map((template) => (
                              <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    )}
                  </ItemContent>
                  {!planDraft.readOnly ? (
                    <ItemActions>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="移除步骤"
                        onClick={() => setPlanDraft({
                          ...planDraft,
                          templateIds: (planDraft.templateIds || []).filter((_, itemIndex) => itemIndex !== index),
                        })}
                      >
                        <Trash2 />
                      </Button>
                    </ItemActions>
                  ) : null}
                </Item>
              ))}
              {!planDraft.templateIds?.length ? (
                <Empty className="min-h-40 border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><Plus /></EmptyMedia>
                    <EmptyTitle>添加第一个步骤</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : null}
            </ItemGroup>
          </Field>

          {!planDraft.readOnly ? (
            <Field orientation="horizontal">
              <Switch
                id="default-plan"
                checked={Boolean(planDraft.makeDefault)}
                onCheckedChange={(checked) => setPlanDraft({ ...planDraft, makeDefault: checked })}
              />
              <FieldLabel htmlFor="default-plan">默认方案</FieldLabel>
            </Field>
          ) : null}
        </FieldGroup>
      </ScrollArea>
    </Card>
  );

  const editor = (
    <>
      <TabsContent value="templates" className="m-0 h-full min-h-0 overflow-hidden">
        {templateEditor}
      </TabsContent>
      <TabsContent value="plans" className="m-0 h-full min-h-0 overflow-hidden">
        {planEditor}
      </TabsContent>
    </>
  );

  return (
    <>
      <Tabs
        data-testid="prompt-workspace"
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "templates" | "plans")}
        className="h-full min-h-0"
      >
        {isMobile ? (
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-2 p-3">
              <TabsList className="grid min-w-0 flex-1 grid-cols-2">
                <TabsTrigger value="templates">提示词</TabsTrigger>
                <TabsTrigger value="plans">方案</TabsTrigger>
              </TabsList>
              <Button variant="outline" size="icon" aria-label="打开列表" onClick={() => setLibraryOpen(true)}>
                <Library />
              </Button>
              <Button size="icon" aria-label="新建" onClick={create}><Plus /></Button>
            </div>
            <Separator />
            <div className="min-h-0 flex-1">{editor}</div>
          </div>
        ) : (
          <ResizablePanelGroup orientation="horizontal" className="overflow-hidden">
            <ResizablePanel defaultSize="26%" minSize="20%" maxSize="38%" className="pr-1.5">
              {library}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="74%" minSize="50%" className="pl-1.5">
              {editor}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}

        <Drawer open={libraryOpen} onOpenChange={setLibraryOpen}>
          <DrawerContent className="h-[72svh]">
            <DrawerHeader>
              <DrawerTitle>{activeTab === "templates" ? "提示词" : "方案"}</DrawerTitle>
            </DrawerHeader>
            <Separator />
            <div className="min-h-0 flex-1 overflow-hidden">{library}</div>
          </DrawerContent>
        </Drawer>
      </Tabs>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>“{deleteTarget?.item.name}”将从本机配置中删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void remove()}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
