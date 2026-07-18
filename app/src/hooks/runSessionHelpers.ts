import type { BatchRerunSession, RunSession } from "@/hooks/runSessionTypes";

export function createRunSession(
  input: Omit<RunSession, "sessionId" | "cancelRequested">,
  nextSessionId: number,
): RunSession {
  return {
    ...input,
    sessionId: nextSessionId,
    cancelRequested: false,
  };
}

export function isSameRunSession(
  current: RunSession | null | undefined,
  session: RunSession | null | undefined,
): boolean {
  return Boolean(
    session
    && current?.sessionId === session.sessionId
    && current?.runId === session.runId,
  );
}

export function withRunSessionCancelRequested(session: RunSession): RunSession {
  return { ...session, cancelRequested: true };
}

export function withBatchRerunCancelRequested(session: BatchRerunSession): BatchRerunSession {
  return { ...session, cancelRequested: true };
}

export function isRunSessionCancelRequestedState(
  current: RunSession | null | undefined,
  session: RunSession | null | undefined,
): boolean {
  return Boolean(
    session
    && current?.sessionId === session.sessionId
    && current.cancelRequested,
  );
}
