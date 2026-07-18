import { useState } from "react";

import { buildHistoryDeleteActionKey } from "@/lib/historyDeleteActionKey";
import { deriveHistoryCardSummaryState } from "@/lib/historyCardSummaryViewModel";
import type {
  DeleteHistoryOptions,
  HistoryArtifactQueryResponse,
  HistoryDeleteImpact,
  HistoryDocumentSummary,
  HistoryOrphanScanResult,
  ModelConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export type HistoryImpactPreviewState = {
  key: string;
  impact: HistoryDeleteImpact;
};

export function useHistoryCardState(input: {
  items: HistoryDocumentSummary[];
  promptProfile: ModelConfig["promptProfile"];
  promptSequence: PromptId[];
  promptOptions: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
  orphanScan: HistoryOrphanScanResult | null;
  artifactQuery: HistoryArtifactQueryResponse | null;
  artifactLoading: boolean;
  currentDocId: string | null;
  onPreviewDelete: (docId: string, options?: DeleteHistoryOptions) => Promise<HistoryDeleteImpact | null>;
}) {
  const [impactPreview, setImpactPreview] = useState<HistoryImpactPreviewState | null>(null);
  const [impactLoadingKey, setImpactLoadingKey] = useState("");
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [cleanupDocId, setCleanupDocId] = useState<string | null>(null);

  const summary = deriveHistoryCardSummaryState({
    items: input.items,
    promptProfile: input.promptProfile,
    promptSequence: input.promptSequence,
    promptOptions: input.promptOptions,
    promptWorkflows: input.promptWorkflows,
    orphanScan: input.orphanScan,
    artifactQuery: input.artifactQuery,
    artifactLoading: input.artifactLoading,
  });

  const currentCleanupOptions: DeleteHistoryOptions = { mode: "records_and_artifacts" };
  const currentCleanupKey = input.currentDocId
    ? buildHistoryDeleteActionKey(input.currentDocId, currentCleanupOptions)
    : "";
  const governanceImpactPreview = impactPreview?.key === currentCleanupKey ? impactPreview.impact : null;

  const handlePreviewDelete = async (docId: string, options: DeleteHistoryOptions) => {
    const key = buildHistoryDeleteActionKey(docId, options);
    setImpactLoadingKey(key);
    try {
      const impact = await input.onPreviewDelete(docId, options);
      if (impact) {
        setImpactPreview({ key, impact });
      }
    } finally {
      setImpactLoadingKey("");
    }
  };

  return {
    impactPreview,
    impactLoadingKey,
    maintenanceOpen,
    setMaintenanceOpen,
    cleanupDocId,
    setCleanupDocId,
    ...summary,
    currentCleanupOptions,
    currentCleanupKey,
    governanceImpactPreview,
    handlePreviewDelete,
  };
}
