import type { TaskPhase } from "@/lib/taskState";

export type BeginTaskOptions = {
  globalBusy?: boolean;
  clearMessages?: boolean;
  runtimeStep?: string;
};

export type TransitionTaskOptions = {
  globalBusy?: boolean;
  runtimeStep?: string;
};

export function nextTaskTicket(currentTicket: number): number {
  return currentTicket + 1;
}

export function shouldClearMessagesOnBegin(options: BeginTaskOptions): boolean {
  return options.clearMessages !== false;
}

export function shouldSetGlobalBusyOnBegin(options: BeginTaskOptions): boolean {
  return options.globalBusy !== false;
}

export function canApplyTaskTicket(ticket: number, currentTicket: number): boolean {
  return ticket === currentTicket;
}
