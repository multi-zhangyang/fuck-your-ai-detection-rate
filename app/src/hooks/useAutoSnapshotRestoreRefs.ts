import { useRef } from "react";

import type { UseAutoSnapshotRestoreInput } from "@/lib/autoSnapshotRestoreHookTypes";

export function useAutoSnapshotRestoreRefs(input: {
  refreshDocumentState: UseAutoSnapshotRestoreInput["refreshDocumentState"];
  loadLatestRoundSnapshot: UseAutoSnapshotRestoreInput["loadLatestRoundSnapshot"];
}) {
  const refreshDocumentStateRef = useRef(input.refreshDocumentState);
  const loadLatestRoundSnapshotRef = useRef(input.loadLatestRoundSnapshot);
  refreshDocumentStateRef.current = input.refreshDocumentState;
  loadLatestRoundSnapshotRef.current = input.loadLatestRoundSnapshot;
  return {
    refreshDocumentStateRef,
    loadLatestRoundSnapshotRef,
  };
}
