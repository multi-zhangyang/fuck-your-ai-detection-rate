import type { ComponentType } from "react";

import type {
  DeleteHistoryOptions,
  HistoryDeleteImpact,
} from "@/types/app";

export type HistoryImpactPreviewState = {
  key: string;
  impact: HistoryDeleteImpact;
} | null;

export type HistoryDeleteActionComponent = ComponentType<{
  title: string;
  options: DeleteHistoryOptions;
  docId: string;
  busy: boolean;
  loading: boolean;
  destructive?: boolean;
  onPreview: (docId: string, options: DeleteHistoryOptions) => void;
  onDelete: (docId: string, options: DeleteHistoryOptions) => void;
}>;
