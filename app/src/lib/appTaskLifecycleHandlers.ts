import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import {
  canApplyTaskTicket,
  nextTaskTicket,
  shouldClearMessagesOnBegin,
  shouldSetGlobalBusyOnBegin,
  type BeginTaskOptions,
  type TransitionTaskOptions,
} from "@/lib/appTaskLifecycleHelpers";
import type { TaskPhase } from "@/lib/taskState";

export type AppTaskLifecycleDeps = {
  taskTicketRef: MutableRefObject<number>;
  setTaskPhase: Dispatch<SetStateAction<TaskPhase>>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  setRuntimeStep: (step: string) => void;
  setBusy: (busy: boolean) => void;
};

export function createAppTaskLifecycleHandlers(deps: AppTaskLifecycleDeps) {
  function beginTask(phase: TaskPhase, options: BeginTaskOptions = {}) {
    const ticket = nextTaskTicket(deps.taskTicketRef.current);
    deps.taskTicketRef.current = ticket;
    deps.setTaskPhase(phase);
    if (shouldClearMessagesOnBegin(options)) {
      deps.setError("");
      deps.setNotice("");
    }
    if (options.runtimeStep) deps.setRuntimeStep(options.runtimeStep);
    deps.setBusy(shouldSetGlobalBusyOnBegin(options));
    return ticket;
  }

  function transitionTask(ticket: number, phase: TaskPhase, options: TransitionTaskOptions = {}) {
    if (!canApplyTaskTicket(ticket, deps.taskTicketRef.current)) return false;
    deps.setTaskPhase(phase);
    if (options.runtimeStep) deps.setRuntimeStep(options.runtimeStep);
    if (typeof options.globalBusy === "boolean") deps.setBusy(options.globalBusy);
    return true;
  }

  function finishTask(ticket: number) {
    if (!canApplyTaskTicket(ticket, deps.taskTicketRef.current)) return;
    deps.setTaskPhase("idle");
    deps.setBusy(false);
  }

  return {
    beginTask,
    transitionTask,
    finishTask,
  };
}
