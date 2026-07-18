import { useEffect } from "react";

import type { SetupEditorMode } from "@/components/SetupEditorDialog";

export function useSetupEditorEscape(
  setupEditor: SetupEditorMode | null,
  setSetupEditor: (mode: SetupEditorMode | null) => void,
) {
  useEffect(() => {
    if (!setupEditor) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSetupEditor(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setupEditor, setSetupEditor]);
}
