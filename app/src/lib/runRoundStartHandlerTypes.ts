import type { ReadyRunLaunchPrepared } from "@/lib/runRoundPrep";
import type {
  AwaitStartedRunRoundInput,
  StartAndListenRunRoundInput,
  StartAndListenRunRoundResult,
  StartedRunRoundHandle,
} from "@/lib/runRoundHandlerTypes";
import type { DocumentStatus, ModelConfig } from "@/types/app";
import type { RunSession } from "@/hooks/useRunSession";
import type { RateAuditAutoNextApproval } from "@/lib/rateAuditAutoNextGate";

export type RunRoundStartHandlers = {
  beginStartedRunSession: (prepared: ReadyRunLaunchPrepared, runToken: string, taskTicket: number) => RunSession;
  createStartedRunSession: (
    prepared: ReadyRunLaunchPrepared,
    taskTicket: number,
    autoNextApproval?: RateAuditAutoNextApproval,
  ) => Promise<{ runSession: RunSession; runToken: string }>;
  attachStartedRunProgress: (prepared: ReadyRunLaunchPrepared, runSession: RunSession, runToken: string) => Promise<void>;
  startAndListenRunRound: (input: StartAndListenRunRoundInput) => Promise<StartAndListenRunRoundResult>;
  awaitStartedRunRound: (input: AwaitStartedRunRoundInput) => Promise<void>;
  awaitPreparedStartedRun: (prepared: ReadyRunLaunchPrepared, started: StartedRunRoundHandle) => Promise<RunSession>;
  runPreparedRound: (
    prepared: ReadyRunLaunchPrepared,
    taskTicket: number,
    autoNextApproval?: RateAuditAutoNextApproval,
  ) => Promise<RunSession>;
  executePreparedRunRound: (
    launchDocumentStatus: DocumentStatus,
    configOverride: ModelConfig | undefined,
    taskTicket: number,
    autoNextApproval?: RateAuditAutoNextApproval,
  ) => Promise<{ runSession: RunSession | null; runConfig: ModelConfig; launchStatus: DocumentStatus }>;
  handleRunRound: (
    configOverride?: ModelConfig,
    autoNextApproval?: RateAuditAutoNextApproval,
  ) => Promise<void>;
};
