import { useCallback, useRef, useState, type MutableRefObject } from "react";

import {
  createRunSession,
  isRunSessionCancelRequestedState,
  isSameRunSession,
  withRunSessionCancelRequested,
} from "@/hooks/runSessionHelpers";
import type { RunSession } from "@/hooks/runSessionTypes";

export function useRunSessionRunControls() {
  const runSessionRef = useRef<RunSession | null>(null);
  const runSessionSequenceRef = useRef(0);
  const attachedRunTokenRef = useRef<string | null>(null);
  const [currentRunToken, setCurrentRunToken] = useState<string | null>(null);

  const beginRunSession = useCallback((input: Omit<RunSession, "sessionId" | "cancelRequested">): RunSession => {
    const session = createRunSession(input, runSessionSequenceRef.current + 1);
    runSessionSequenceRef.current = session.sessionId;
    runSessionRef.current = session;
    setCurrentRunToken(session.runId);
    return session;
  }, []);

  const isActiveRunSession = useCallback((session: RunSession | null | undefined): session is RunSession => {
    return isSameRunSession(runSessionRef.current, session);
  }, []);

  const clearRunSession = useCallback((session: RunSession | null | undefined) => {
    if (!isSameRunSession(runSessionRef.current, session) || !session) {
      return;
    }
    runSessionRef.current = null;
    setCurrentRunToken((current) => (current === session.runId ? null : current));
  }, []);

  const markRunSessionCancelRequested = useCallback((session: RunSession) => {
    if (!isSameRunSession(runSessionRef.current, session)) {
      return false;
    }
    runSessionRef.current = withRunSessionCancelRequested(session);
    return true;
  }, []);

  const isRunSessionCancelRequested = useCallback((session: RunSession | null | undefined) => {
    return isRunSessionCancelRequestedState(runSessionRef.current, session);
  }, []);

  return {
    currentRunToken,
    runSessionRef,
    attachedRunTokenRef,
    beginRunSession,
    isActiveRunSession,
    clearRunSession,
    markRunSessionCancelRequested,
    isRunSessionCancelRequested,
  };
}

export type RunSessionRunControls = ReturnType<typeof useRunSessionRunControls> & {
  runSessionRef: MutableRefObject<RunSession | null>;
};
