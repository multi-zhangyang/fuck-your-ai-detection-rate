import { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { coreService } from "@/lib/coreService";
import type { CoreSettings, PromptTemplate } from "@/types/core";

interface Props {
  settings: CoreSettings;
  onRefresh: () => Promise<void>;
}

const emptyTemplate = (): Partial<PromptTemplate> => ({ name: "", description: "", content: "" });

export function PromptTemplatesPage({ settings, onRefresh }: Props) {
  const { notify } = useAppNotifications();
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState<Partial<PromptTemplate>>(
    settings.promptTemplates[0] ? { ...settings.promptTemplates[0] } : emptyTemplate(),
  );
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PromptTemplate | null>(null);

  const selectTemplate = (template: PromptTemplate) => {
    setDraft({ ...template });
    setCreating(false);
    setLibraryOpen(false);
  };

  const createTemplate = () => {
    setDraft(emptyTemplate());
    setCreating(true);
    setLibraryOpen(false);
  };

  const saveTemplate = async () => {
    if (!draft.name?.trim() || !draft.content?.trim()) {
      notify({ kind: "warning", title: "请填写名称和提示词内容" });
      return;
    }
    setBusy(true);
    try {
      const saved = draft.id
        ? await coreService.updateTemplate(draft.id, draft)
        : await coreService.createTemplate(draft);
      await onRefresh();
      setDraft(saved);
      setCreating(false);
      notify({ kind: "success", title: "提示词已保存" });
    } catch (reason) {
      notify({
        kind: "error",
        title: "提示词保存失败",
        text: reason instanceof Error ? reason.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const copyTemplate = async () => {
    if (!draft.id) return;
    setBusy(true);
    try {
      const copied = await coreService.copyTemplate(draft.id);
      await onRefresh();
      setDraft(copied);
      setCreating(false);
      notify({ kind: "success", title: "提示词已复制" });
    } catch (reason) {
      notify({ kind: "error", title: "复制失败", text: reason instanceof Error ? reason.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const removeTemplate = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await coreService.deleteTemplate(deleteTarget.id);
      setDeleteTarget(null);
      await onRefresh();
      const fallback = settings.promptTemplates.find((item) => item.id !== deleteTarget.id);
      setDraft(fallback ? { ...fallback } : emptyTemplate());
      setCreating(false);
      notify({ kind: "success", title: "提示词已删除" });
    } catch (reason) {
      setDeleteTarget(null);
      notify({ kind: "error", title: "删除失败", text: reason instanceof Error ? reason.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const library = (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <CardHeader className="flex-row items-center gap-3">
        <CardTitle className="min-w-0 flex-1">提示词</CardTitle>
        <Button size="icon" variant="outline" aria-label="新建提示词" onClick={createTemplate}>
          <Plus />
        </Button>
      </CardHeader>
      <Separator />
      <CardContent className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-full">
          <ItemGroup className="gap-1 p-2">
            {settings.promptTemplates.map((template) => (
              <Item
                key={template.id}
                asChild
                size="sm"
                variant={draft.id === template.id ? "muted" : "default"}
              >
                <button type="button" onClick={() => selectTemplate(template)}>
                  <ItemContent>
                    <ItemTitle className="truncate">{template.name}</ItemTitle>
                    <ItemDescription className="truncate">{template.description || "自定义提示词"}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {template.builtIn ? <Badge variant="outline">内置</Badge> : null}
                  </ItemActions>
                </button>
              </Item>
            ))}
          </ItemGroup>
        </ScrollArea>
      </CardContent>
    </Card>
  );

  const editor = (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="prompt-template-editor">
      <CardHeader className="flex-row items-center gap-3">
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate">{draft.name || "新建提示词"}</CardTitle>
        </div>
        {draft.readOnly ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void copyTemplate()}>
            {busy ? <Spinner data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            复制
          </Button>
        ) : (
          <ButtonGroup>
            {draft.id ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setDeleteTarget(draft as PromptTemplate)}
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
      </CardHeader>
      <Separator />
      <CardContent className="min-h-0 flex-1 p-0">
        {creating || draft.id || draft.name || draft.content ? (
          <FieldGroup className="mx-auto h-full min-h-0 w-full max-w-5xl p-4 md:p-6">
            {!draft.readOnly ? (
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="template-name">名称</FieldLabel>
                  <Input
                    id="template-name"
                    value={draft.name || ""}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="template-description">备注</FieldLabel>
                  <Input
                    id="template-description"
                    value={draft.description || ""}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  />
                </Field>
              </FieldGroup>
            ) : null}
            <Field className="min-h-0 flex-1">
              <FieldLabel htmlFor="template-content">提示词内容</FieldLabel>
              <Textarea
                id="template-content"
                readOnly={Boolean(draft.readOnly)}
                className="min-h-[20rem] flex-1 resize-none font-mono"
                value={draft.content || ""}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                placeholder="输入提示词"
              />
            </Field>
          </FieldGroup>
        ) : (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon"><FileText /></EmptyMedia>
              <EmptyTitle>选择或新建提示词</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );

  return (
    <>
      <div data-testid="prompt-workspace" className="h-full min-h-0 overflow-hidden">
        {isMobile ? (
          <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
            <ButtonGroup className="shrink-0 self-end">
              <Button variant="outline" onClick={() => setLibraryOpen(true)}>
                <Library data-icon="inline-start" />
                提示词
              </Button>
              <Button onClick={createTemplate}>
                <Plus data-icon="inline-start" />
                新建
              </Button>
            </ButtonGroup>
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
      </div>

      <Drawer open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DrawerContent className="h-[72svh]">
          <DrawerHeader>
            <DrawerTitle>提示词</DrawerTitle>
          </DrawerHeader>
          <Separator />
          <div className="min-h-0 flex-1 overflow-hidden">{library}</div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>“{deleteTarget?.name}”将从本机配置中删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void removeTemplate()}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
