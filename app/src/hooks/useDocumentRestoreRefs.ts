import { useRef } from "react";

import type { TaskPhase } from "@/lib/taskState";
import type {
  HistoryDocumentSummary,
  DocumentStatus,
  ModelConfig,
} from "@/types/app";
import type { HistoryListRefreshResult } from "@/lib/historyHandlerInputTypes";

export function useDocumentRestoreRefs(input: {
  beginTask: (
    phase: TaskPhase,
    options?: { globalBusy?: boolean; clearMessages?: boolean; runtimeStep?: string },
  ) => number;
  finishTask: (ticket: number) => void;
  refreshDocumentState: (
    sourcePath: string,
    config?: ModelConfig,
    options?: { shouldCommit?: () => boolean },
  ) => Promise<DocumentStatus>;
  refreshHistoryList: (options?: { shouldCommit?: () => boolean }) => Promise<HistoryListRefreshResult>;
  clearLoadedRoundSnapshot: () => void;
  loadLatestRoundSnapshot: (
    status: DocumentStatus,
    config: ModelConfig,
    options?: {
      historyItems?: HistoryDocumentSummary[];
      allowProfileFallback?: boolean;
      shouldCommit?: () => boolean;
    },
  ) => Promise<unknown>;
  setNotice: (message: string) => void;
  setRuntimeStep: (step: string) => void;
}) {
  const beginTaskRef = useRef(input.beginTask);
  const finishTaskRef = useRef(input.finishTask);
  const refreshDocumentStateRef = useRef(input.refreshDocumentState);
  const refreshHistoryListRef = useRef(input.refreshHistoryList);
  const clearLoadedRoundSnapshotRef = useRef(input.clearLoadedRoundSnapshot);
  const loadLatestRoundSnapshotRef = useRef(input.loadLatestRoundSnapshot);
  const setNoticeRef = useRef(input.setNotice);
  const setRuntimeStepRef = useRef(input.setRuntimeStep);

  beginTaskRef.current = input.beginTask;
  finishTaskRef.current = input.finishTask;
  refreshDocumentStateRef.current = input.refreshDocumentState;
  refreshHistoryListRef.current = input.refreshHistoryList;
  clearLoadedRoundSnapshotRef.current = input.clearLoadedRoundSnapshot;
  loadLatestRoundSnapshotRef.current = input.loadLatestRoundSnapshot;
  setNoticeRef.current = input.setNotice;
  setRuntimeStepRef.current = input.setRuntimeStep;

  return {
    beginTaskRef,
    finishTaskRef,
    refreshDocumentStateRef,
    refreshHistoryListRef,
    clearLoadedRoundSnapshotRef,
    loadLatestRoundSnapshotRef,
    setNoticeRef,
    setRuntimeStepRef,
  };
}
