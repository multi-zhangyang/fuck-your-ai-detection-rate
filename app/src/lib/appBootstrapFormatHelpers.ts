import type { AppService } from "@/lib/appService";
import { saveStoredFormatRules } from "@/lib/formatStorage";
import { FORMAT_RULE_ACTIVE_KEY } from "@/lib/storageKeys";
import type { FormatRules } from "@/types/app";

export async function bootstrapAppFormatRules(input: {
  service: AppService;
  cancelled: () => boolean;
  setActiveFormatRules: (rules: FormatRules) => void;
}): Promise<void> {
  try {
    const rules = await input.service.loadFormatRules();
    if (!input.cancelled()) {
      input.setActiveFormatRules(rules);
      saveStoredFormatRules(FORMAT_RULE_ACTIVE_KEY, rules);
    }
  } catch {
    // Format rules are non-blocking; keep the page usable even if the backend is still starting.
  }
}
