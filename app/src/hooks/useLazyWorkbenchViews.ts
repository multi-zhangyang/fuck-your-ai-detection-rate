import { useEffect, useRef } from "react";

import type { WorkbenchView } from "@/lib/workbenchNav";

type UseLazyWorkbenchViewsInput = {
  activeView: WorkbenchView;
  diagnostics: unknown;
  promptPreviews: unknown;
  promptPreviewBusy: boolean;
  refreshDiagnostics: (options?: { silent?: boolean }) => unknown;
  refreshPromptPreviews: (options?: { silent?: boolean }) => unknown;
};

export function useLazyWorkbenchViews(input: UseLazyWorkbenchViewsInput) {
  const {
    activeView,
    diagnostics,
    promptPreviews,
    promptPreviewBusy,
    refreshDiagnostics,
    refreshPromptPreviews,
  } = input;

  const refreshDiagnosticsRef = useRef(refreshDiagnostics);
  const refreshPromptPreviewsRef = useRef(refreshPromptPreviews);
  const diagnosticsRequestStartedRef = useRef(false);
  const promptPreviewAutoAttemptedRef = useRef(false);
  refreshDiagnosticsRef.current = refreshDiagnostics;
  refreshPromptPreviewsRef.current = refreshPromptPreviews;

  useEffect(() => {
    if (activeView !== "diagnostics") {
      diagnosticsRequestStartedRef.current = false;
      return;
    }
    if (diagnostics) {
      diagnosticsRequestStartedRef.current = false;
      return;
    }
    if (diagnosticsRequestStartedRef.current) {
      return;
    }
    diagnosticsRequestStartedRef.current = true;
    void refreshDiagnosticsRef.current({ silent: true });
  }, [activeView, diagnostics]);

  useEffect(() => {
    if (activeView !== "prompts") {
      promptPreviewAutoAttemptedRef.current = false;
      return;
    }
    if (promptPreviews || promptPreviewBusy || promptPreviewAutoAttemptedRef.current) {
      return;
    }
    promptPreviewAutoAttemptedRef.current = true;
    void refreshPromptPreviewsRef.current({ silent: true });
  }, [activeView, promptPreviews, promptPreviewBusy]);
}
