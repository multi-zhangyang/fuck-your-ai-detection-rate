import type { AppService } from "@/lib/appService";
import { stringifyError } from "@/lib/errorText";
import type {
  HistoryArtifactQueryResponse,
  HistoryDocumentSummary,
} from "@/types/app";

export async function bootstrapAppHistories(input: {
  service: AppService;
  cancelled: () => boolean;
  setError: (message: string) => void;
  setHistoryItems: (items: HistoryDocumentSummary[]) => void;
  setHistoryArtifactQuery: (query: HistoryArtifactQueryResponse | null) => void;
  setHistoryListReady: (ready: boolean) => void;
}): Promise<void> {
  try {
    const result = await input.service.listDocumentHistories();
    if (!input.cancelled()) {
      input.setHistoryItems(result.items);
    }
    try {
      const artifactResult = await input.service.queryHistoryArtifacts({ exists: "missing", limit: 8 });
      if (!input.cancelled()) {
        input.setHistoryArtifactQuery(artifactResult);
      }
    } catch {
      if (!input.cancelled()) {
        input.setHistoryArtifactQuery(null);
      }
    }
  } catch (appError) {
    if (!input.cancelled()) {
      input.setError(stringifyError(appError));
    }
  } finally {
    if (!input.cancelled()) {
      input.setHistoryListReady(true);
    }
  }
}
