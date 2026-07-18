import { useCallback, useRef, useState } from "react";

import { withBatchRerunCancelRequested } from "@/hooks/runSessionHelpers";
import type { BatchRerunSession, ProgressUnlisten } from "@/hooks/runSessionTypes";

export function useRunSessionBatchControls() {
  const batchRerunSessionRef = useRef<BatchRerunSession | null>(null);
  const progressUnlistenRef = useRef<null | ProgressUnlisten>(null);
  const [currentBatchRerunToken, setCurrentBatchRerunToken] = useState<string | null>(null);

  const beginBatchRerunSession = useCallback((session: BatchRerunSession) => {
    batchRerunSessionRef.current = session;
    setCurrentBatchRerunToken(session.runId);
  }, []);

  const clearBatchRerunSession = useCallback((runId: string | null | undefined) => {
    if (!runId) {
      return;
    }
    if (batchRerunSessionRef.current?.runId === runId) {
      batchRerunSessionRef.current = null;
    }
    setCurrentBatchRerunToken((current) => (current === runId ? null : current));
  }, []);

  const markBatchRerunCancelRequested = useCallback((runId: string) => {
    const session = batchRerunSessionRef.current;
    if (!session || session.runId !== runId) {
      return;
    }
    batchRerunSessionRef.current = withBatchRerunCancelRequested(session);
  }, []);

  const releaseProgressListener = useCallback(async () => {
    if (!progressUnlistenRef.current) {
      return;
    }
    await progressUnlistenRef.current();
    progressUnlistenRef.current = null;
  }, []);

  const setProgressUnlisten = useCallback((unlisten: ProgressUnlisten | null) => {
    progressUnlistenRef.current = unlisten;
  }, []);

  return {
    currentBatchRerunToken,
    batchRerunSessionRef,
    progressUnlistenRef,
    beginBatchRerunSession,
    clearBatchRerunSession,
    markBatchRerunCancelRequested,
    releaseProgressListener,
    setProgressUnlisten,
  };
}
