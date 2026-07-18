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
  refreshDiagnosticsRef.current = refreshDiagnostics;
  refreshPromptPreviewsRef.current = refreshPromptPreviews;

  useEffect(() => {
    if (activeView !== "diagnostics" || diagnostics) {
      return;
    }
    void refreshDiagnosticsRef.current({ silent: true });
  }, [activeView, diagnostics]);

  useEffect(() => {
    if (activeView !== "prompts" || promptPreviews || promptPreviewBusy) {
      return;
    }
    void refreshPromptPreviewsRef.current({ silent: true });
  }, [activeView, promptPreviews, promptPreviewBusy]);
}
