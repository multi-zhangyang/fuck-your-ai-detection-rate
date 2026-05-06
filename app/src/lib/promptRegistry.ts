import type { PromptId, PromptOption, PromptPreviewResponse, PromptProfile, PromptWorkflow } from "@/types/app";

export const ACTIVE_PROMPT_PROFILE: PromptProfile = "cn_custom";
export const DEFAULT_PROMPT_SEQUENCE: PromptId[] = ["prewrite", "round1", "round2"];
export const DEFAULT_PROMPT_SEQUENCE_LIMIT = 3;
export const DEFAULT_PROMPT_ROUND_LIMIT = 12;
export const MAX_PROMPT_SEQUENCE_ROUNDS = DEFAULT_PROMPT_SEQUENCE_LIMIT;

export const DEFAULT_PROMPT_OPTIONS: PromptOption[] = [
  {
    id: "prewrite",
    label: "润色改写",
    description: "先做保守自然化与结构预热。",
    fileName: "prewrite.md",
    relativePath: "prompts/prewrite.md",
    builtIn: true,
    editable: true,
    defaultAvailable: true,
  },
  {
    id: "classical",
    label: "经典改写",
    description: "慢节奏解释型改写。",
    fileName: "classical-rewrite.md",
    relativePath: "prompts/classical-rewrite.md",
    builtIn: true,
    editable: true,
    defaultAvailable: true,
  },
  {
    id: "round1",
    label: "规范改写",
    description: "正文主体降痕与语气调整。",
    fileName: "rewrite-pass-1.md",
    relativePath: "prompts/rewrite-pass-1.md",
    builtIn: true,
    editable: true,
    defaultAvailable: true,
  },
  {
    id: "round2",
    label: "专家改写",
    description: "最终降痕与连贯性修整。",
    fileName: "rewrite-pass-2.md",
    relativePath: "prompts/rewrite-pass-2.md",
    builtIn: true,
    editable: true,
    defaultAvailable: true,
  },
];

export const DEFAULT_PROMPT_WORKFLOWS: PromptWorkflow[] = [
  {
    id: "cn",
    label: "中文双轮",
    description: "兼容旧双轮记录。",
    defaultSequence: ["round1", "round2"],
    customizable: false,
    sequenceLimit: 2,
    roundLimit: 2,
    chunkMetric: "char",
    legacy: true,
    visible: false,
  },
  {
    id: "cn_prewrite",
    label: "中文三轮流程",
    description: "兼容旧三轮记录。",
    defaultSequence: DEFAULT_PROMPT_SEQUENCE,
    customizable: false,
    sequenceLimit: 3,
    roundLimit: 3,
    chunkMetric: "char",
    legacy: true,
    visible: false,
  },
  {
    id: ACTIVE_PROMPT_PROFILE,
    label: "自定义组合",
    description: "当前改写流程。",
    defaultSequence: DEFAULT_PROMPT_SEQUENCE,
    customizable: true,
    sequenceLimit: DEFAULT_PROMPT_SEQUENCE_LIMIT,
    roundLimit: DEFAULT_PROMPT_ROUND_LIMIT,
    chunkMetric: "char",
    legacy: false,
    visible: true,
  },
];

const PROMPT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function normalizePromptId(value: unknown): PromptId | null {
  const promptId = String(value ?? "").trim().toLowerCase();
  return PROMPT_ID_PATTERN.test(promptId) ? promptId : null;
}

export function getPromptOptionsFromPreviews(value: PromptPreviewResponse | null | undefined): PromptOption[] {
  const items = value?.items?.length ? value.items : DEFAULT_PROMPT_OPTIONS;
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    fileName: item.fileName,
    relativePath: item.relativePath,
    builtIn: item.builtIn,
    editable: item.editable,
    defaultAvailable: item.defaultAvailable,
  }));
}

export function getPromptWorkflowsFromPreviews(value: PromptPreviewResponse | null | undefined, options?: PromptOption[]): PromptWorkflow[] {
  const workflows = value?.workflows?.length ? value.workflows : DEFAULT_PROMPT_WORKFLOWS;
  return workflows.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    defaultSequence: normalizePromptSequence(item.defaultSequence, options),
    customizable: Boolean(item.customizable),
    sequenceLimit: Math.max(1, Number(item.sequenceLimit || item.defaultSequence?.length || DEFAULT_PROMPT_SEQUENCE_LIMIT)),
    roundLimit: Math.max(
      Math.max(1, Number(item.sequenceLimit || item.defaultSequence?.length || DEFAULT_PROMPT_SEQUENCE_LIMIT)),
      Number(item.roundLimit || item.sequenceLimit || item.defaultSequence?.length || DEFAULT_PROMPT_SEQUENCE_LIMIT),
    ),
    chunkMetric: item.chunkMetric ?? "char",
    legacy: Boolean(item.legacy),
    visible: item.visible !== false,
  }));
}

function getWorkflowCandidates(workflows?: PromptWorkflow[]): PromptWorkflow[] {
  return workflows?.length ? workflows : DEFAULT_PROMPT_WORKFLOWS;
}

function getFallbackWorkflow(workflows?: PromptWorkflow[]): PromptWorkflow {
  const candidates = getWorkflowCandidates(workflows);
  return candidates.find((item) => item.id === ACTIVE_PROMPT_PROFILE)
    ?? candidates.find((item) => item.visible !== false && !item.legacy)
    ?? candidates[0]
    ?? DEFAULT_PROMPT_WORKFLOWS[0];
}

export function getEditablePromptWorkflows(workflows?: PromptWorkflow[]): PromptWorkflow[] {
  const candidates = getWorkflowCandidates(workflows);
  const editable = candidates.filter((item) => item.visible !== false && !item.legacy && item.customizable);
  return editable.length ? editable : candidates.filter((item) => item.visible !== false && !item.legacy);
}

export function getDefaultPromptProfile(workflows?: PromptWorkflow[]): PromptProfile {
  return getEditablePromptWorkflows(workflows)[0]?.id ?? getFallbackWorkflow(workflows).id;
}

export function getPromptWorkflow(promptProfile: PromptProfile | undefined, workflows?: PromptWorkflow[]): PromptWorkflow {
  const normalizedId = String(promptProfile || getDefaultPromptProfile(workflows)).trim().toLowerCase();
  const candidates = getWorkflowCandidates(workflows);
  return candidates.find((item) => item.id === normalizedId) ?? getFallbackWorkflow(candidates);
}

export function normalizePromptProfile(value: unknown, workflows?: PromptWorkflow[]): PromptProfile | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return getWorkflowCandidates(workflows).some((item) => item.id === normalized) ? normalized : null;
}

export function isPromptSequenceCustomizable(promptProfile: PromptProfile | undefined, workflows?: PromptWorkflow[]): boolean {
  return getPromptWorkflow(promptProfile, workflows).customizable;
}

export function getPromptSequenceLimit(promptProfile: PromptProfile | undefined = ACTIVE_PROMPT_PROFILE, workflows?: PromptWorkflow[]): number {
  const workflow = getPromptWorkflow(promptProfile, workflows);
  return Math.max(1, Number(workflow.sequenceLimit || workflow.defaultSequence.length || DEFAULT_PROMPT_SEQUENCE_LIMIT));
}

export function getPromptRoundLimit(promptProfile: PromptProfile | undefined = ACTIVE_PROMPT_PROFILE, workflows?: PromptWorkflow[]): number {
  const workflow = getPromptWorkflow(promptProfile, workflows);
  const sequenceLimit = getPromptSequenceLimit(promptProfile, workflows);
  return Math.max(sequenceLimit, Number(workflow.roundLimit || sequenceLimit));
}

export function normalizePromptSequence(value: unknown, options?: PromptOption[], promptProfile: PromptProfile = ACTIVE_PROMPT_PROFILE, workflows?: PromptWorkflow[]): PromptId[] {
  const rawItems = Array.isArray(value) ? value : [];
  const optionIds = new Set((options ?? DEFAULT_PROMPT_OPTIONS).map((item) => item.id));
  const normalized = rawItems
    .map((item) => normalizePromptId(item))
    .filter((item): item is PromptId => item !== null)
    .filter((item) => !optionIds.size || optionIds.has(item));
  const workflow = getPromptWorkflow(promptProfile, workflows);
  const fallback = workflow.defaultSequence?.length ? workflow.defaultSequence : DEFAULT_PROMPT_SEQUENCE;
  const sequence = normalized.length ? normalized : fallback;
  return sequence.slice(0, getPromptSequenceLimit(promptProfile, workflows));
}

export function getPromptFlowSequence(promptProfile: PromptProfile, promptSequence?: PromptId[], options?: PromptOption[], workflows?: PromptWorkflow[]): PromptId[] {
  const workflow = getPromptWorkflow(promptProfile, workflows);
  if (!workflow.customizable) {
    return workflow.defaultSequence;
  }
  return normalizePromptSequence(promptSequence, options, workflow.id, workflows);
}

export function getRoundModelKey(promptProfile: PromptProfile, round?: number | null, workflows?: PromptWorkflow[]): string | null {
  if (!round || round < 1 || round > getPromptRoundLimit(promptProfile, workflows)) {
    return null;
  }
  return `${getPromptWorkflow(promptProfile, workflows).id}:${round}`;
}

export function getPromptIdForRound(promptProfile: PromptProfile, round: number, promptSequence?: PromptId[], options?: PromptOption[], workflows?: PromptWorkflow[]): PromptId {
  const sequence = getPromptFlowSequence(promptProfile, promptSequence, options, workflows);
  return sequence[Math.min(Math.max(1, round), sequence.length) - 1] ?? sequence[sequence.length - 1] ?? DEFAULT_PROMPT_SEQUENCE[0];
}

export function getPromptProfileLabel(promptProfile: PromptProfile | undefined, workflows?: PromptWorkflow[]): string {
  return getPromptWorkflow(promptProfile, workflows).label;
}

export function getPromptOption(promptId: PromptId, options?: PromptOption[]): PromptOption | undefined {
  const normalizedId = normalizePromptId(promptId) ?? promptId;
  return (options ?? DEFAULT_PROMPT_OPTIONS).find((item) => item.id === normalizedId);
}

export function getPromptLabel(promptId: PromptId, options?: PromptOption[]): string {
  return getPromptOption(promptId, options)?.label ?? promptId;
}

export function formatPromptSequence(sequence: PromptId[] | undefined, options?: PromptOption[], promptProfile: PromptProfile = ACTIVE_PROMPT_PROFILE, workflows?: PromptWorkflow[]): string {
  return normalizePromptSequence(sequence, options, promptProfile, workflows).map((id) => getPromptLabel(id, options)).join(" → ");
}
