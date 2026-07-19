import type { WorkbenchView } from "@/lib/workbenchNav";

export const WORKBENCH_VIEW_QUERY_PARAM = "view";

const WORKBENCH_VIEW_VALUES = new Set<WorkbenchView>([
  "home",
  "quality",
  "model",
  "prompts",
  "protection",
  "history",
  "diagnostics",
]);

/** Normalize untrusted URL input before it reaches the view switch. */
export function normalizeWorkbenchView(value: string | null | undefined): WorkbenchView {
  return value && WORKBENCH_VIEW_VALUES.has(value as WorkbenchView) ? value as WorkbenchView : "home";
}

export function readWorkbenchViewFromSearch(search: string): WorkbenchView {
  return normalizeWorkbenchView(new URLSearchParams(search).get(WORKBENCH_VIEW_QUERY_PARAM));
}

/** Build a same-document URL while preserving unrelated query parameters and the hash. */
export function buildWorkbenchViewUrl(view: WorkbenchView, href: string): string {
  const url = new URL(href, "http://fyadr.local");
  if (view === "home") {
    url.searchParams.delete(WORKBENCH_VIEW_QUERY_PARAM);
  } else {
    url.searchParams.set(WORKBENCH_VIEW_QUERY_PARAM, view);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export const WORKBENCH_HISTORY_STATE_KEY = "__fyadrWorkbenchNavigation";

export type WorkbenchHistoryMarker = {
  index: number;
  view: WorkbenchView;
};

export function readWorkbenchHistoryMarker(value: unknown): WorkbenchHistoryMarker | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const marker = (value as Record<string, unknown>)[WORKBENCH_HISTORY_STATE_KEY];
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) return null;
  const index = (marker as Record<string, unknown>).index;
  const view = (marker as Record<string, unknown>).view;
  if (!Number.isInteger(index) || (index as number) < 0 || typeof view !== "string" || !WORKBENCH_VIEW_VALUES.has(view as WorkbenchView)) {
    return null;
  }
  return { index: index as number, view: view as WorkbenchView };
}

export function withWorkbenchHistoryMarker(state: unknown, marker: WorkbenchHistoryMarker): Record<string, unknown> {
  const base = state && typeof state === "object" && !Array.isArray(state)
    ? state as Record<string, unknown>
    : {};
  return {
    ...base,
    [WORKBENCH_HISTORY_STATE_KEY]: marker,
  };
}
