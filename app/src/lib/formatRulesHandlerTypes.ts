import type { TaskPhase } from "@/lib/taskState";
import type { FormatParserModelRoute, FormatRules, ModelConfig } from "@/types/app";

export type TaskTicket = number;

export type ApplyFormatRulesPlanInput = {
  activeRules?: FormatRules | null;
  pendingRules?: FormatRules | null;
  persistActive?: boolean;
  persistPending?: boolean;
  feedback: { notice: string; runtimeStep: string };
};

export type FormatRulesHandlersDeps = {
  service: {
    resetFormatRules: () => Promise<{ rules: FormatRules }>;
    parseFormatRules: (text: string, config: ModelConfig, signal?: AbortSignal) => Promise<{ rules: FormatRules }>;
    activateFormatRules: (rules: FormatRules) => Promise<{ rules: FormatRules }>;
  };
  getModelConfig: () => ModelConfig;
  getFormatParserRoute: () => FormatParserModelRoute;
  getPendingFormatRules: () => FormatRules | null;
  getFormatParseAbortRef: () => AbortController | null;
  setFormatParseAbortRef: (controller: AbortController | null) => void;
  setFormatRuleTextState: (text: string) => void;
  setFormatParserRoute: (route: FormatParserModelRoute) => void;
  setActiveFormatRules: (rules: FormatRules | null) => void;
  setPendingFormatRules: (rules: FormatRules | null) => void;
  setNotice: (notice: string) => void;
  setRuntimeStep: (step: string) => void;
  beginTask: (kind: TaskPhase, options?: { runtimeStep?: string; globalBusy?: boolean; clearMessages?: boolean }) => TaskTicket;
  finishTask: (ticket: TaskTicket) => void;
  applyErrorRuntimeStep: (error: unknown, fallback: string) => void;
  applyOptionalUiFeedback: (feedback: {
    notice?: string;
    runtimeStep?: string;
    setError?: string;
    clearMessages?: boolean;
  }) => void;
};

export type FormatRulesRouteHandlers = {
  setFormatRuleText: (nextText: string) => void;
  setFormatParserModelRoute: (route: FormatParserModelRoute) => void;
  handleFormatParserProviderChange: (providerId: string) => void;
  applyFormatRulesPlan: (input: ApplyFormatRulesPlanInput) => void;
};

export type FormatRulesActionHandlers = {
  handleParseFormatRules: (text: string) => Promise<void>;
  handleCancelFormatRulesParse: () => void;
  handleConfirmFormatRules: () => Promise<void>;
  handleResetFormatRules: () => Promise<void>;
};
