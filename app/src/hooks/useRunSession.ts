import { useRunSessionBatchControls } from "@/hooks/useRunSessionBatchControls";
import { useRunSessionRunControls } from "@/hooks/useRunSessionRunControls";

export type {
  BatchRerunSession,
  ProgressUnlisten,
  RunSession,
} from "@/hooks/runSessionTypes";

export function useRunSession() {
  const run = useRunSessionRunControls();
  const batch = useRunSessionBatchControls();
  return {
    ...run,
    ...batch,
  };
}
