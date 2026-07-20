import { useId } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Loader2,
  LockKeyhole,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Workflow,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LOADING_ICON_CLASS_NAME } from "@/lib/loadingIcon";
import { cn } from "@/lib/utils";
import type { PromptWorkflowDraft } from "@/lib/promptWorkflowDraftHelpers";
import type { PromptId, PromptOption, PromptProfile, PromptWorkflow } from "@/types/app";

type Props = {
  workflows: PromptWorkflow[];
  promptOptions: PromptOption[];
  activeWorkflow: PromptWorkflow | null;
  activeWorkflowId: PromptProfile;
  draft: PromptWorkflowDraft;
  busy: boolean;
  saving: boolean;
  editable: boolean;
  dirty: boolean;
  loadError: string;
  mutationError: string;
  validationError: string;
  onSelectWorkflow: (workflowId: PromptProfile) => void;
  onDraftChange: (patch: Partial<PromptWorkflowDraft>) => void;
  onUpdateSequenceItem: (index: number, promptId: PromptId) => void;
  onMoveSequenceItem: (index: number, direction: -1 | 1) => void;
  onRemoveSequenceItem: (index: number) => void;
  onAddSequenceItem: () => void;
  onReset: () => void;
  onSave: () => void;
};

function SequenceIconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function PromptWorkflowEditor({
  workflows,
  promptOptions,
  activeWorkflow,
  activeWorkflowId,
  draft,
  busy,
  saving,
  editable,
  dirty,
  loadError,
  mutationError,
  validationError,
  onSelectWorkflow,
  onDraftChange,
  onUpdateSequenceItem,
  onMoveSequenceItem,
  onRemoveSequenceItem,
  onAddSequenceItem,
  onReset,
  onSave,
}: Props) {
  const labelId = useId();
  const descriptionId = useId();
  const sequenceLimitId = useId();
  const roundLimitId = useId();
  const interactionBusy = busy || saving;
  const canAddSequenceItem = editable
    && !interactionBusy
    && draft.defaultSequence.length < draft.sequenceLimit
    && draft.defaultSequence.length < promptOptions.length;

  return (
    <TooltipProvider delayDuration={250}>
      <div className="grid h-full min-h-0 gap-5 overflow-hidden max-xl:h-auto max-xl:overflow-visible xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-h-[20rem] xl:h-full xl:min-h-0">
          <Card className="flex h-full min-h-0 flex-col overflow-hidden">
            <CardHeader className="shrink-0 border-b border-border/70 bg-muted/20 pb-3">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="vercel-icon-frame size-8"><Workflow className="size-4" /></span>
                  <div className="min-w-0">
                    <div className="vercel-kicker mb-0.5">Workflow templates</div>
                    <CardTitle className="truncate text-lg">流程模板</CardTitle>
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0">{workflows.length} 个</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col px-5 pb-5">
              {workflows.length ? (
                <ScrollArea className="min-h-0 flex-1 pr-1">
                  <div className="flex flex-col gap-2">
                    {workflows.map((workflow) => {
                      const active = workflow.id === activeWorkflowId;
                      const workflowEditable = workflow.customizable && !workflow.legacy;
                      return (
                        <Button
                          key={workflow.id}
                          type="button"
                          variant={active ? "secondary" : "outline"}
                          className={cn(
                            "relative h-auto w-full justify-start overflow-hidden rounded-md px-3 py-3 text-left before:absolute before:left-0 before:h-8 before:w-0.5 before:rounded-full before:bg-foreground before:opacity-0",
                            active && "border-foreground/25 bg-muted shadow-sm before:opacity-100",
                          )}
                          aria-current={active ? "true" : undefined}
                          onClick={() => onSelectWorkflow(workflow.id)}
                          disabled={interactionBusy}
                        >
                          <span className="flex min-w-0 flex-1 flex-col gap-1 pl-1">
                            <span className="flex min-w-0 items-center justify-between gap-3">
                              <span className="truncate font-semibold">{workflow.label}</span>
                              <Badge variant={workflowEditable ? "secondary" : "outline"} className="shrink-0">
                                {workflowEditable ? "可编辑" : "只读"}
                              </Badge>
                            </span>
                            <span className="line-clamp-2 whitespace-normal text-xs leading-5 text-muted-foreground">
                              {workflow.description || workflow.id}
                            </span>
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <Empty className="min-h-[14rem] flex-1 border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      {busy ? <Loader2 className={LOADING_ICON_CLASS_NAME} /> : <Workflow />}
                    </EmptyMedia>
                    <EmptyTitle>{busy ? "正在读取流程模板" : "暂无流程模板"}</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="min-h-[42rem] xl:h-full xl:min-h-0">
          <Card className="flex h-full min-h-0 flex-col overflow-hidden">
            {activeWorkflow ? (
              <>
                <CardHeader className="shrink-0 border-b border-border/70 bg-muted/20 pb-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="vercel-icon-frame size-10"><Workflow className="size-5" /></span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{activeWorkflow.id}</Badge>
                          <Badge variant={editable ? "secondary" : "outline"}>{editable ? "可编辑" : "锁定"}</Badge>
                          {dirty ? <Badge variant="warning" className="gap-1.5"><span className="size-1.5 rounded-full bg-current" />未保存</Badge> : null}
                        </div>
                        <CardTitle className="mt-2 text-xl">{activeWorkflow.label}</CardTitle>
                      </div>
                    </div>
                    <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center">
                      <Button type="button" variant="outline" size="sm" onClick={onReset} disabled={interactionBusy || !dirty}>
                        <RotateCcw data-icon="inline-start" />
                        <span>还原</span>
                      </Button>
                      <Button type="button" size="sm" onClick={onSave} disabled={interactionBusy || !editable || !dirty || Boolean(validationError)}>
                        {saving ? <Loader2 className={LOADING_ICON_CLASS_NAME} data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                        <span>保存流程</span>
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <ScrollArea className="min-h-0 flex-1">
                  <CardContent className="flex flex-col gap-5 px-5 pb-6 pt-4">
                    {loadError || mutationError || validationError ? (
                      <Alert variant="destructive">
                        <AlertCircle />
                        <AlertTitle>{mutationError ? "保存流程失败" : loadError ? "读取流程模板失败" : "流程配置不完整"}</AlertTitle>
                        <AlertDescription>{mutationError || loadError || validationError}</AlertDescription>
                      </Alert>
                    ) : null}

                    {!editable ? (
                      <Alert>
                        <LockKeyhole />
                        <AlertTitle>此流程由系统管理</AlertTitle>
                        <AlertDescription>可以查看当前编排，但不能修改或保存。</AlertDescription>
                      </Alert>
                    ) : null}

                    <FieldGroup className="grid gap-4 md:grid-cols-[minmax(0,1fr)_10rem_10rem]">
                      <Field>
                        <FieldLabel htmlFor={labelId}>流程名称</FieldLabel>
                        <Input
                          id={labelId}
                          value={draft.label}
                          maxLength={80}
                          disabled={!editable || interactionBusy}
                          onChange={(event) => onDraftChange({ label: event.target.value })}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={sequenceLimitId}>默认编排上限</FieldLabel>
                        <Input
                          id={sequenceLimitId}
                          type="number"
                          min={1}
                          max={12}
                          step={1}
                          value={draft.sequenceLimit}
                          disabled={!editable || interactionBusy}
                          onChange={(event) => onDraftChange({ sequenceLimit: Number(event.target.value) })}
                        />
                        <FieldDescription>“添加一轮”会把默认提示词编排扩展到这里。</FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={roundLimitId}>运行轮次上限</FieldLabel>
                        <Input
                          id={roundLimitId}
                          type="number"
                          min={1}
                          max={12}
                          step={1}
                          value={draft.roundLimit}
                          disabled={!editable || interactionBusy}
                          onChange={(event) => onDraftChange({ roundLimit: Number(event.target.value) })}
                        />
                        <FieldDescription>允许继续追加运行轮次的最大值。</FieldDescription>
                      </Field>
                    </FieldGroup>

                    <Field>
                      <FieldLabel htmlFor={descriptionId}>流程说明</FieldLabel>
                      <Textarea
                        id={descriptionId}
                        value={draft.description ?? ""}
                        maxLength={240}
                        rows={3}
                        className="resize-none"
                        disabled={!editable || interactionBusy}
                        onChange={(event) => onDraftChange({ description: event.target.value })}
                      />
                      <FieldDescription>{(draft.description ?? "").length}/240</FieldDescription>
                    </Field>

                    <Field>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <FieldLabel>默认轮次编排</FieldLabel>
                          <FieldDescription className="mt-1">运行此流程时按顺序使用这些提示词。</FieldDescription>
                        </div>
                        <Badge variant="outline">默认 {draft.defaultSequence.length} / {draft.sequenceLimit} 轮 · 最多 {draft.roundLimit} 轮</Badge>
                      </div>

                      <div className="grid gap-2">
                        {draft.defaultSequence.map((promptId, index) => {
                          const availableOptions = promptOptions.filter(
                            (option) => option.id === promptId || !draft.defaultSequence.includes(option.id),
                          );
                          return (
                            <div
                              key={promptId}
                              className="grid min-w-0 gap-2 rounded-md border border-border/70 bg-background/60 p-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center"
                            >
                              <span className="vercel-icon-frame size-8 rounded-full font-mono text-[11px]">{String(index + 1).padStart(2, "0")}</span>
                              <Select
                                value={promptId}
                                disabled={!editable || interactionBusy}
                                onValueChange={(value) => onUpdateSequenceItem(index, value)}
                              >
                                <SelectTrigger aria-label={`第 ${index + 1} 轮提示词`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {availableOptions.map((option) => (
                                      <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                              <div className="flex items-center justify-end gap-1">
                                <SequenceIconButton label={`第 ${index + 1} 轮：上移`} disabled={!editable || interactionBusy || index === 0} onClick={() => onMoveSequenceItem(index, -1)}>
                                  <ArrowUp className="size-4" />
                                </SequenceIconButton>
                                <SequenceIconButton label={`第 ${index + 1} 轮：下移`} disabled={!editable || interactionBusy || index === draft.defaultSequence.length - 1} onClick={() => onMoveSequenceItem(index, 1)}>
                                  <ArrowDown className="size-4" />
                                </SequenceIconButton>
                                <SequenceIconButton label={`第 ${index + 1} 轮：移除`} disabled={!editable || interactionBusy || draft.defaultSequence.length <= 1} onClick={() => onRemoveSequenceItem(index)}>
                                  <Trash2 className="size-4" />
                                </SequenceIconButton>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={onAddSequenceItem} disabled={!canAddSequenceItem}>
                        <Plus data-icon="inline-start" />
                        <span>添加一轮</span>
                      </Button>
                    </Field>
                  </CardContent>
                </ScrollArea>
              </>
            ) : (
              <Empty className="min-h-[24rem] flex-1 border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><Workflow /></EmptyMedia>
                  <EmptyTitle>选择流程模板后查看编排</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}
