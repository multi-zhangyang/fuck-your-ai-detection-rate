import type {
  PromptId,
  PromptOption,
  PromptPreviewResponse,
  PromptProfile,
  PromptSaveResult,
  PromptDeleteResult,
  PromptWorkflow,
  ModelConfig,
} from "@/types/app";

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
