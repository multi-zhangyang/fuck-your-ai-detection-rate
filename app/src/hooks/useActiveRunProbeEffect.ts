import { useEffect, useRef, type MutableRefObject } from "react";

import type { AppService } from "@/lib/appService";
import { findActiveRunForSource } from "@/lib/activeRunProbeHelpers";
import type { EnvironmentDiagnostics } from "@/types/app";

type ActiveRun = EnvironmentDiagnostics["activeRuns"][number];

export function useActiveRunProbeEffect(input: {
  service: AppService;
  documentSourcePath?: string | null;
  currentRunToken: string | null;
  attachedRunTokenRef: MutableRefObject<string | null>;
  setDiagnostics: (diagnostics: EnvironmentDiagnostics) => void;
  attachActiveRun: (activeRun: ActiveRun) => void | Promise<void>;
}) {
  const attachActiveRunRef = useRef(input.attachActiveRun);
  attachActiveRunRef.current = input.attachActiveRun;

  useEffect(() => {
    if (!input.documentSourcePath || input.currentRunToken || input.attachedRunTokenRef.current) {
      return;
    }
    const sourcePath = input.documentSourcePath;
    let cancelled = false;

    async function probeActiveRun() {
      try {
        const result = await input.service.getHealth();
        if (cancelled) {
          return;
        }
        input.setDiagnostics(result);
        const activeRun = findActiveRunForSource(result, sourcePath);
        if (activeRun && !cancelled) {
          void attachActiveRunRef.current(activeRun);
        }
      } catch {
        // Health probing is non-blocking; the user can still click continue manually.
      }
    }

    void probeActiveRun();

    return () => {
      cancelled = true;
    };
  }, [input.documentSourcePath, input.currentRunToken, input.service, input.attachedRunTokenRef, input.setDiagnostics]);
}
